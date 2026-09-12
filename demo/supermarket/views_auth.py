"""顾客注册/登录/登出。登录后按角色分流：员工→后台，顾客→商城。"""
from django.contrib import messages
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.shortcuts import redirect, render

from . import live
from .models import Profile


def _post_login_redirect(user):
    profile = getattr(user, "profile", None)
    if profile is not None and profile.is_staff_member:
        return redirect("staff_dashboard")
    return redirect("home")


def register(request):
    if request.method == "POST":
        username = (request.POST.get("username") or "").strip()
        password = request.POST.get("password") or ""
        password2 = request.POST.get("password2") or ""
        phone = (request.POST.get("phone") or "").strip()
        if len(username) < 3 or len(username) > 20:
            messages.error(request, "用户名需 3-20 个字符")
        elif password != password2:
            messages.error(request, "两次输入的口令不一致")
        elif User.objects.filter(username=username).exists():
            messages.error(request, "用户名已被注册")
        else:
            user = User.objects.create_user(username=username, password=password)
            Profile.objects.create(user=user, role=Profile.Role.CUSTOMER, phone=phone)
            live.sync_user(user, username, "guest", False)  # Mode 1：同步 CoStage（无直播权限；失败容忍）
            login(request, user)
            messages.success(request, f"欢迎加入惠民超市，{username}！")
            return redirect("home")
    return render(request, "supermarket/register.html")


def user_login(request):
    if request.method == "POST":
        user = authenticate(request, username=request.POST.get("username", ""),
                            password=request.POST.get("password", ""))
        if user is None:
            messages.error(request, "账号或口令错误")
        else:
            login(request, user)
            return _post_login_redirect(user)
    return render(request, "supermarket/login.html")


def user_logout(request):
    logout(request)
    return redirect("home")
