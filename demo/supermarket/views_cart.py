"""购物车：登录顾客专用（增/改数量/删）。"""
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect, render

from .models import CartItem, Product


@login_required
def cart(request):
    items = request.user.cart_items.select_related("product")
    total = sum(i.subtotal for i in items)
    return render(request, "supermarket/cart.html", {"items": items, "total": total})


@login_required
def add_to_cart(request, pk):
    product = get_object_or_404(Product, pk=pk, on_shelf=True)
    qty = max(1, int(request.POST.get("qty") or 1))
    if product.stock < 1:
        messages.error(request, f"「{product.name}」已售罄")
    else:
        item, created = CartItem.objects.get_or_create(
            user=request.user, product=product, defaults={"qty": min(qty, product.stock)})
        if not created:
            item.qty = min(item.qty + qty, product.stock)
            item.save()
        messages.success(request, f"已加入购物车：{product.name} ×{qty}")
    return redirect("product_detail", pk=pk)


@login_required
def update_cart(request, pk):
    item = get_object_or_404(CartItem, pk=pk, user=request.user)
    if request.POST.get("op") == "remove":
        item.delete()
        return redirect("cart")
    try:
        qty = int(request.POST.get("qty") or 1)
    except ValueError:
        qty = 1
    item.qty = max(1, min(qty, item.product.stock))
    item.save()
    return redirect("cart")
