"""订单流：结算下单（事务+库存扣减）→ 模拟支付 → 取消（回补库存）→ 确认收货。"""
import uuid

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone

from .models import Order, OrderItem, Product


@login_required
def checkout(request):
    items = list(request.user.cart_items.select_related("product"))
    if not items:
        messages.error(request, "购物车是空的")
        return redirect("cart")
    if request.method == "POST":
        receiver = (request.POST.get("receiver") or "").strip()
        phone = (request.POST.get("phone") or "").strip()
        address = (request.POST.get("address") or "").strip()
        if not (receiver and phone and address):
            messages.error(request, "收货人、电话、地址均必填")
        else:
            with transaction.atomic():
                locked = []
                for item in items:
                    p = Product.objects.select_for_update().get(pk=item.product.pk)
                    if not p.on_shelf or p.stock < item.qty:
                        messages.error(request, f"「{p.name}」库存不足（剩 {p.stock}），请调整购物车")
                        return redirect("cart")
                    locked.append((p, item))
                total = sum(p.price * item.qty for p, item in locked)
                order = Order.objects.create(
                    sn="S" + timezone.now().strftime("%Y%m%d%H%M%S") + uuid.uuid4().hex[:4].upper(),
                    user=request.user, total=total, receiver=receiver, phone=phone,
                    address=address, note=(request.POST.get("note") or "").strip(),
                )
                for p, item in locked:
                    p.stock -= item.qty
                    p.save(update_fields=["stock"])
                    OrderItem.objects.create(order=order, product=p, product_name=p.name,
                                             price=p.price, qty=item.qty)
                request.user.cart_items.all().delete()
            return redirect("order_detail", sn=order.sn)
    profile = getattr(request.user, "profile", None)
    return render(request, "supermarket/checkout.html", {
        "items": items,
        "total": sum(i.subtotal for i in items),
        "phone": profile.phone if profile else "",
    })


@login_required
def pay(request, sn):
    """模拟支付（演示系统无真实支付通道）。"""
    order = get_object_or_404(Order, sn=sn, user=request.user)
    if order.status == Order.Status.PENDING_PAYMENT:
        order.status = Order.Status.PAID
        order.paid_at = timezone.now()
        order.save(update_fields=["status", "paid_at"])
        messages.success(request, f"订单 {order.sn} 支付成功（演示模拟支付）")
    return redirect("order_detail", sn=sn)


@login_required
def cancel(request, sn):
    """未支付可取消：整单回补库存。"""
    order = get_object_or_404(Order, sn=sn, user=request.user)
    if order.status == Order.Status.PENDING_PAYMENT:
        with transaction.atomic():
            order.status = Order.Status.CANCELLED
            order.save(update_fields=["status"])
            for it in order.items.select_related("product"):
                it.product.stock += it.qty
                it.product.save(update_fields=["stock"])
        messages.success(request, f"订单 {order.sn} 已取消，库存已回补")
    return redirect("order_detail", sn=sn)


@login_required
def receive(request, sn):
    order = get_object_or_404(Order, sn=sn, user=request.user)
    if order.status == Order.Status.SHIPPED:
        order.status = Order.Status.COMPLETED
        order.completed_at = timezone.now()
        order.save(update_fields=["status", "completed_at"])
        messages.success(request, "已确认收货，感谢惠顾！")
    return redirect("order_detail", sn=sn)


@login_required
def my_orders(request):
    return render(request, "supermarket/my_orders.html", {
        "orders": request.user.orders.prefetch_related("items"),
    })


@login_required
def order_detail(request, sn):
    return render(request, "supermarket/order_detail.html", {
        "order": get_object_or_404(Order, sn=sn, user=request.user),
    })
