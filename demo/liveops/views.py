"""BizHub 视图：决策端点（CoStage → 业务）+ 控制台（规则运营 + 撤权触发）。"""
import json
import logging

from django.contrib import messages
from django.contrib.admin.views.decorators import staff_member_required
from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from . import services
from .models import BizUser, DecisionLog

log = logging.getLogger(__name__)


@csrf_exempt  # 服务间调用无会话，鉴权靠 HMAC 签名（settings.COSTAGE_AUTHZ_SECRET）
@require_POST
def decide(request):
    """CoStage 决策点（P0 §4.1 契约的业务侧实现）。

    请求头：X-CoStage-Signature / X-CoStage-Timestamp
    请求体：{action, userId, roomId?, hostId?, category?, targetUserId?, requestId, ts}
    响应：{allow, reason?, expiresIn?}
    """
    body = request.body
    try:
        services.verify_signature(
            request.headers.get("X-CoStage-Timestamp", ""),
            body,
            request.headers.get("X-CoStage-Signature", ""),
        )
    except services.SignatureError as e:
        log.warning("[decide] 签名校验失败: %s", e)
        return JsonResponse({"allow": False, "reason": f"签名校验失败：{e}"}, status=401)

    try:
        req = json.loads(body or b"{}")
    except json.JSONDecodeError:
        return JsonResponse({"allow": False, "reason": "请求体非法 JSON"}, status=400)

    action = str(req.get("action", ""))
    user_id = str(req.get("userId", ""))
    allow, reason, expires_in = services.decide(action, user_id,
                                                str(req.get("roomId", "")),
                                                str(req.get("targetUserId", "")))
    DecisionLog.objects.create(action=action, user_id=user_id,
                               room_id=str(req.get("roomId", "")),
                               allow=allow, reason=reason,
                               request_id=str(req.get("requestId", "")))
    resp = {"allow": allow}
    if reason:
        resp["reason"] = reason
    if expires_in and allow:
        resp["expiresIn"] = expires_in
    return JsonResponse(resp)


def user_login(request):
    if request.method == "POST":
        user = authenticate(request, username=request.POST.get("username", ""),
                            password=request.POST.get("password", ""))
        if user is not None and user.is_staff:
            login(request, user)
            return redirect("dashboard")
        messages.error(request, "账号或口令错误，或非运营人员")
    return render(request, "liveops/login.html")


@staff_member_required
def user_logout(request):
    logout(request)
    return redirect("login")


@staff_member_required
def dashboard(request):
    if request.method == "POST":
        _handle_action(request)
        return redirect("dashboard")
    return render(request, "liveops/dashboard.html", {
        "users": BizUser.objects.all(),
        "logs": DecisionLog.objects.all()[:20],
    })


def _handle_action(request):
    """控制台操作：改角色/状态；禁播联动 CoStage 撤权。"""
    uid = request.POST.get("uid", "")
    u = BizUser.objects.filter(cstg_uid=uid).first()
    if u is None:
        messages.error(request, f"无此用户 {uid}")
        return
    op = request.POST.get("op", "")
    if op == "promote":
        u.role = BizUser.Role.TEACHER
        u.status = BizUser.Status.ACTIVE
        u.save()
        messages.success(request, f"{u.username} 已升为教师（下一动作即按新规则裁决）")
    elif op == "demote":
        u.role = BizUser.Role.STUDENT
        u.save()
        messages.success(request, f"{u.username} 已降为学生")
    elif op == "ban":
        u.status = BizUser.Status.BANNED
        u.save()
        ok, detail = services.revoke(u.cstg_uid, "all", reason="业务禁播（BizHub 控制台）")
        if ok:
            messages.success(request, f"{u.username} 已禁播并撤权：{detail}")
        else:
            messages.warning(request, f"{u.username} 已禁播（本地生效），但 CoStage 撤权失败：{detail}")
    elif op == "unban":
        u.status = BizUser.Status.ACTIVE
        u.save()
        messages.success(request, f"{u.username} 已恢复（注意：撤权戳仍在其 TTL 内，登出重登后完全恢复）")
    elif op == "revoke_watch":
        ok, detail = services.revoke(u.cstg_uid, "watch", reason="业务踢出观看")
        messages.success(request, f"{u.username} watch 撤权：{detail}") if ok else messages.error(
            request, f"{u.username} watch 撤权失败：{detail}")
