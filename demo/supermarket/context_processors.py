"""全局上下文：购物车角标（登录顾客）。"""
from .models import CartItem


def cart_count(request):
    if request.user.is_authenticated:
        return {"cart_count": CartItem.objects.filter(user=request.user).count()}
    return {"cart_count": 0}
