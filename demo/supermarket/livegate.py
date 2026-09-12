"""CoStage 决策端点（Phase 2 接入面，契约见 docs/costage-biz-integration.md §3）。

超市的直播规则：店员/经理可开播卖货；顾客与访客只可观看；连麦仅限员工间操作。
userId 映射：同步/换票统一 external_id 前缀 mall-<超市用户 id>（x-trusted- 存量兼容），
按 Profile.role 裁决。
"""
import hashlib
import hmac
import json
import logging
import time

from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from django.contrib.auth.models import User  # noqa: E402  (放 models 外避免循环)

from .models import DecisionLog, Profile

log = logging.getLogger(__name__)


class SignatureError(Exception):
    pass


def verify_signature(timestamp: str, body: bytes, signature: str) -> None:
    """校验 X-CoStage-Signature: sha256=<hex(HMAC-SHA256(secret, "<ts>.<body>"))>。"""
    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        raise SignatureError("时间戳缺失或非法")
    if abs(time.time() - ts) > settings.COSTAGE_TS_TOLERANCE:
        raise SignatureError("时间戳超出容忍窗")
    m = hmac.new(settings.COSTAGE_AUTHZ_SECRET.encode(), digestmod=hashlib.sha256)
    m.update(f"{ts}.".encode())
    m.update(body)
    if not hmac.compare_digest("sha256=" + m.hexdigest(), signature or ""):
        raise SignatureError("签名不匹配")


def resolve_user(cstg_user_id: str):
    """CoStage userId → 超市用户。

    两个 id 空间：external_id 形态（mall-<id>/x-trusted-<id>，换票请求用）
    与 CoStage 数字 uid（JWT 主体、决策请求实际携带的值，Profile.co_stage_uid 映射）。
    解析不到一律 None——禁止用裸数字去猜超市自身用户表（id 空间不同，必撞错人）。
    """
    for prefix in ("mall-", "x-trusted-"):
        if cstg_user_id.startswith(prefix):
            return User.objects.filter(pk=cstg_user_id[len(prefix):]).first()
    return User.objects.filter(profile__co_stage_uid=cstg_user_id).first()


def decide(action: str, user_id: str, target_user_id: str):
    """返回 (allow, reason, expires_in)。规则：员工可播/可连麦；顾客与档案外用户仅可观看。"""
    if action == "room.join":
        u = resolve_user(user_id)
        if u is not None and getattr(u, "profile", None) is not None \
                and u.profile.role == Profile.Role.CUSTOMER:
            return True, "", 60
        return True, "", 0  # 匿名/未登记的观看不在业务系统管辖（由 CoStage accessMode 管）
    u = resolve_user(user_id)  # live.create / mic.apply / mic.ready / mic.accept
    if u is None or getattr(u, "profile", None) is None:
        return False, "仅超市员工可进行该操作", 0
    if u.profile.role == Profile.Role.CUSTOMER:
        return False, "直播间是员工的工作台，顾客观看就好啦", 0
    if action == "mic.accept" and target_user_id:
        t = resolve_user(target_user_id)
        if t is None or getattr(t, "profile", None) is None \
                or t.profile.role == Profile.Role.CUSTOMER:
            return False, "仅员工可被批准上麦", 0
    return True, "", 0


@csrf_exempt  # 服务间调用无会话，鉴权靠 HMAC 签名
@require_POST
def decide_endpoint(request):
    body = request.body
    try:
        verify_signature(request.headers.get("X-CoStage-Timestamp", ""), body,
                         request.headers.get("X-CoStage-Signature", ""))
    except SignatureError as e:
        log.warning("[decide] 签名校验失败: %s", e)
        return JsonResponse({"allow": False, "reason": f"签名校验失败：{e}"}, status=401)
    try:
        req = json.loads(body or b"{}")
    except json.JSONDecodeError:
        return JsonResponse({"allow": False, "reason": "请求体非法 JSON"}, status=400)
    action = str(req.get("action", ""))
    user_id = str(req.get("userId", ""))
    allow, reason, expires_in = decide(action, user_id, str(req.get("targetUserId", "")))
    DecisionLog.objects.create(action=action, user_id=user_id,
                               room_id=str(req.get("roomId", "")), allow=allow,
                               reason=reason, request_id=str(req.get("requestId", "")))
    resp = {"allow": allow}
    if reason:
        resp["reason"] = reason
    if allow and expires_in:
        resp["expiresIn"] = expires_in
    return JsonResponse(resp)
