"""业务规则裁决 + CoStage 出站调用（撤权）。

决策规则（docs/costage-biz-integration.md §3 演示规则集）：
- live.create：status=active 且 role=teacher（教师才可开播）
- room.join：status != banned（封禁者不得观看）
- mic.apply / mic.ready / mic.accept：status=active 且 role ∈ {teacher, student}
"""
import hmac
import hashlib
import time
import logging

import requests
from django.conf import settings

from .models import BizUser

log = logging.getLogger(__name__)

MIC_ROLES = {BizUser.Role.TEACHER, BizUser.Role.STUDENT}
JOIN_CACHE_SECONDS = 60  # room.join 决策缓存（CoStage 侧也受其默认 60s 上限约束）


class SignatureError(Exception):
    """决策请求签名/时间戳校验失败。"""


def verify_signature(timestamp: str, body: bytes, signature: str) -> None:
    """校验 X-CoStage-Signature: sha256=<hex(HMAC-SHA256(secret, "<ts>.<body>"))>。

    与 CoStage internal/authz sign() 逐字对齐；时间戳超出容忍窗即拒（防重放）。
    """
    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        raise SignatureError("时间戳缺失或非法")
    if abs(time.time() - ts) > settings.COSTAGE_TS_TOLERANCE:
        raise SignatureError("时间戳超出容忍窗")
    m = hmac.new(settings.COSTAGE_AUTHZ_SECRET.encode(), digestmod=hashlib.sha256)
    m.update(f"{ts}.".encode())
    m.update(body)
    want = "sha256=" + m.hexdigest()
    if not hmac.compare_digest(want, signature or ""):
        raise SignatureError("签名不匹配")


def decide(action: str, user_id: str, room_id: str, target_user_id: str) -> tuple[bool, str, int]:
    """业务规则裁决：返回 (allow, reason, expires_in)。user 不在映射表按封禁处理（白名单语义）。"""
    u = BizUser.objects.filter(cstg_uid=user_id).first()
    if u is None:
        return False, "业务系统无此用户档案", 0
    if u.status == BizUser.Status.BANNED:
        return False, "该账号已被封禁，禁止观看与连麦", 0
    if u.status == BizUser.Status.SUSPENDED:
        return False, "该账号已被暂停使用", 0

    if action == "live.create":
        if u.role != BizUser.Role.TEACHER:
            return False, "仅教师身份可开播（当前身份：%s）" % u.get_role_display(), 0
        return True, "", 0
    if action == "room.join":
        return True, "", JOIN_CACHE_SECONDS
    if action in ("mic.apply", "mic.ready", "mic.accept"):
        target = user_id
        if action == "mic.accept":
            target = target_user_id
        tu = BizUser.objects.filter(cstg_uid=target).first()
        if tu is None or tu.role not in MIC_ROLES or tu.status != BizUser.Status.ACTIVE:
            return False, "目标用户当前身份不可连麦", 0
        return True, "", 0
    # 未知动作按放行兜底（演示从宽；生产建议从严禁默）
    return True, "", 0


def revoke(cstg_uid: str, scope: str, room_id: str = "", reason: str = "") -> tuple[bool, str]:
    """业务处罚 → CoStage 撤权（docs/costage-biz-integration.md §4）。

    禁播语义 = 置 status=banned（挡后续决策）+ 调 CoStage scope=all
    （结束直播/强制下麦/踢断观看 + 撤权戳令未过期 access token 立即失效）。
    """
    payload = {"userId": cstg_uid, "scope": scope, "roomId": room_id, "reason": reason}
    try:
        resp = requests.post(
            settings.COSTAGE_BASE_URL + "/api/v1/service/revoke",
            json=payload,
            headers={"X-CoStage-Service-Token": settings.COSTAGE_SERVICE_TOKEN},
            timeout=5,
        )
    except requests.RequestException as e:
        log.warning("撤权调用失败 uid=%s: %s", cstg_uid, e)
        return False, f"CoStage 不可达：{e}"
    if resp.status_code != 200:
        return False, f"CoStage 返回 {resp.status_code}: {resp.text[:200]}"
    data = resp.json()
    result = data.get("result", {})
    parts = []
    if result.get("roomClosed"):
        parts.append("直播已结束")
    if result.get("micReleased"):
        parts.append("已强制下麦")
    if result.get("kickedWs"):
        parts.append(f"踢断 {result['kickedWs']} 条观看连接")
    return True, "；".join(parts) or "已落撤权戳"
