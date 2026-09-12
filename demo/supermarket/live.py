"""CoStage 商品直播接入（Phase 2，方案 A：trusted 换票）。

- staff_start_live(): 超市代店员向 CoStage 换票（HMAC "v1|uid|role|ts|nonce"，
  角色 teacher，CoStage 侧钳制白名单），返回带 #sso 票证的跳转 URL——
  店员浏览器打开即已登录 CoStage（SPA ssoIntake 写票）。
- list_live_rooms(): 拉目录过滤员工房（hostId 以 x-trusted- 开头），供商城「直播中」条。
"""
import base64
import hashlib
import hmac
import json
import logging
import time
import uuid

import requests
from django.conf import settings

log = logging.getLogger(__name__)


class CoStageError(Exception):
    pass


def _sign(user_id: str, role: str, ts: str, nonce: str) -> str:
    m = hmac.new(settings.COSTAGE_TRUSTED_SECRET.encode(), digestmod=hashlib.sha256)
    m.update(f"v1|{user_id}|{role}|{ts}|{nonce}".encode())
    return m.hexdigest()


def staff_start_live(staff_user, display_name: str) -> str:
    """为店员换 CoStage 会话，返回落地 URL（含 #sso 票证交接段）。"""
    user_id = f"mall-{staff_user.id}"
    ts = str(int(time.time()))
    nonce = uuid.uuid4().hex
    body = {
        "userId": user_id,
        "displayName": display_name or staff_user.username,
        "role": "teacher",  # CoStage COSTAGE_TRUSTED_ROLES 钳制白名单内
        "ts": ts,
        "nonce": nonce,
        "sig": _sign(user_id, "teacher", ts, nonce),
    }
    try:
        resp = requests.post(settings.COSTAGE_BASE_URL + "/api/v1/auth/exchange",
                             json=body, timeout=5)
    except requests.RequestException as e:
        raise CoStageError(f"CoStage 不可达：{e}")
    if resp.status_code != 200:
        raise CoStageError(f"换票失败 {resp.status_code}: {resp.text[:200]}")
    data = resp.json()
    tokens = data["tokens"] if "tokens" in data else data
    access = tokens.get("accessToken") or ""
    refresh = tokens.get("refreshToken") or ""
    user = data.get("user") or {}
    if not access:
        raise CoStageError("换票响应缺 accessToken")
    u_b64 = base64.urlsafe_b64encode(json.dumps(user, ensure_ascii=False).encode()).decode().rstrip("=")
    # 回填 CoStage 数字 uid → Profile（此后决策请求带 uid，livegate 靠它还原超市身份）
    if user.get("id") and not staff_user.profile.co_stage_uid:
        staff_user.profile.co_stage_uid = str(user["id"])
        staff_user.profile.save(update_fields=["co_stage_uid"])
    entry = getattr(settings, "COSTAGE_ENTRY_URL", settings.COSTAGE_BASE_URL)
    frag = f"#sso={access}&rst={refresh}&u={u_b64}"
    return entry + "/" + frag


def sync_user(biz_user, display_name: str, role: str, can_live: bool) -> None:
    """业务用户 → CoStage 同步（Mode 1：api_key 管理面，PUT users/{externalID}）。

    顾客注册/员工建档时调用；CoStage 不可达只记日志不阻塞业务主流程。
    external_id 统一前缀 mall-<业务用户id>（与换票 userId 同源，避免两套并存）。
    """
    body = {
        "username": biz_user.username,
        "displayName": display_name,
        "role": "teacher" if can_live else "guest",
        "canLive": can_live,
    }
    try:
        resp = requests.put(
            f"{settings.COSTAGE_BASE_URL}/api/v1/service/users/mall-{biz_user.id}",
            json=body,
            headers={"X-CoStage-Service-Token": settings.COSTAGE_SERVICE_TOKEN},
            timeout=5,
        )
    except requests.RequestException as e:
        log.warning("[sync] CoStage 不可达，用户 %s 未同步（容忍）: %s", biz_user.username, e)
        return
    if resp.status_code != 200:
        log.warning("[sync] 同步 %s 失败 %d: %s", biz_user.username, resp.status_code, resp.text[:200])
        return
    log.info("[sync] 用户 %s 已同步（canLive=%s）", biz_user.username, can_live)


def list_live_rooms():
    """直播中的本店员工房。CoStage 不可达返回空（条隐藏）。

    hostId 是 CoStage 数字 uid（与决策请求同源），须经 Profile.co_stage_uid
    映射识别本店员工——不能按 mall- 前缀过滤（目录里没有 external_id）。
    """
    try:
        resp = requests.get(settings.COSTAGE_BASE_URL + "/api/rooms", timeout=3)
    except requests.RequestException:
        return []
    if resp.status_code != 200:
        return []
    rooms = resp.json().get("rooms", [])
    from .models import Profile  # 局部导入避免循环
    uids = set(Profile.objects.exclude(co_stage_uid="").values_list("co_stage_uid", flat=True))
    return [r for r in rooms
            if str(r.get("hostId", "")) in uids and r.get("state") == "live"]
