"""员工后台：看板/商品/订单/分类/员工管理。staff_required 控准入，manager_required 管员工与分类。"""
from decimal import Decimal, InvalidOperation

from django.contrib import messages
from django.contrib.auth.decorators import user_passes_test
from django.contrib.auth.models import User
from django.db import transaction
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone

from . import live
from .models import Category, Order, Product, Profile, today_sales


def staff_required(view):
    return user_passes_test(lambda u: u.is_authenticated
                            and getattr(u, "profile", None) is not None
                            and u.profile.is_staff_member,
                            login_url="login")(view)


def manager_required(view):
    return user_passes_test(lambda u: u.is_authenticated
                            and getattr(u, "profile", None) is not None
                            and u.profile.role == Profile.Role.MANAGER,
                            login_url="login")(view)


@staff_required
def dashboard(request):
    pending_ship = Order.objects.filter(status=Order.Status.PAID).count()
    return render(request, "supermarket/staff/dashboard.html", {
        "today_sales": today_sales(),
        "today_orders": Order.objects.filter(
            created_at__gte=timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)).count(),
        "pending_ship": pending_ship,
        "on_shelf": Product.objects.filter(on_shelf=True).count(),
        "low_stock": Product.objects.filter(on_shelf=True, stock__lt=10).order_by("stock")[:8],
        "recent_orders": Order.objects.order_by("-created_at")[:8],
    })


@staff_required
def live_start(request):
    """开播卖货：为当前员工向 CoStage 换票并跳转（方案 A trusted 换票）。"""
    try:
        url = live.staff_start_live(request.user,
                                    request.user.profile.get_role_display() + "·" + request.user.username)
        return redirect(url)
    except live.CoStageError as e:
        messages.error(request, f"开播失败：{e}")
        return redirect("staff_dashboard")


@staff_required
def products(request):
    q = (request.GET.get("q") or "").strip()
    qs = Product.objects.select_related("category").all()
    if q:
        qs = qs.filter(name__icontains=q)
    return render(request, "supermarket/staff/products.html", {"products": qs, "q": q})


@manager_required
def product_new(request):
    return _product_form(request, None)


@manager_required
def product_edit(request, pk):
    return _product_form(request, get_object_or_404(Product, pk=pk))


def _product_form(request, product):
    """新建/编辑共用表单；category/barcode 可空位用默认。"""
    if request.method == "POST":
        name = (request.POST.get("name") or "").strip()
        category = Category.objects.filter(pk=request.POST.get("category")).first()
        try:
            price = Decimal(request.POST.get("price") or "")
            stock = int(request.POST.get("stock") or 0)
        except (InvalidOperation, ValueError):
            price, stock = None, -1
        if not (name and category) or price is None or price < 0 or stock < 0:
            messages.error(request, "表单不合法：名称/分类/价格/库存均必填且合法")
        else:
            with transaction.atomic():
                if product is None:
                    product = Product()
                product.name, product.category = name, category
                product.price, product.stock = price, stock
                product.unit = (request.POST.get("unit") or "件").strip() or "件"
                product.barcode = (request.POST.get("barcode") or "").strip()
                product.desc = (request.POST.get("desc") or "").strip()
                product.on_shelf = request.POST.get("on_shelf") == "on"
                product.save()
            messages.success(request, f"商品已保存：{product.name}")
            return redirect("staff_products")
    return render(request, "supermarket/staff/product_form.html", {
        "p": product, "categories": Category.objects.all(),
    })


@staff_required
def product_toggle(request, pk):
    """上架/下架（店员可操作）。"""
    p = get_object_or_404(Product, pk=pk)
    p.on_shelf = not p.on_shelf
    p.save(update_fields=["on_shelf", "updated_at"])
    messages.success(request, f"「{p.name}」已{'上架' if p.on_shelf else '下架'}")
    return redirect("staff_products")


@staff_required
def product_stock(request, pk):
    """库存调整（盘点/补货）。"""
    p = get_object_or_404(Product, pk=pk)
    try:
        delta = int(request.POST.get("delta") or 0)
    except ValueError:
        delta = 0
    if delta:
        p.stock = max(0, p.stock + delta)
        p.save(update_fields=["stock", "updated_at"])
        messages.success(request, f"「{p.name}」库存调整 {delta:+d}，现为 {p.stock}")
    return redirect("staff_products")


@staff_required
def orders(request):
    status = request.GET.get("status") or ""
    qs = Order.objects.prefetch_related("items").order_by("-created_at")
    if status:
        qs = qs.filter(status=status)
    return render(request, "supermarket/staff/orders.html", {
        "orders": qs, "status": status, "statuses": Order.Status.choices,
    })


@staff_required
def order_ship(request, pk):
    order = get_object_or_404(Order, pk=pk)
    if order.status == Order.Status.PAID:
        order.status = Order.Status.SHIPPED
        order.shipped_at = timezone.now()
        order.save(update_fields=["status", "shipped_at"])
        messages.success(request, f"订单 {order.sn} 已发货")
    return redirect("staff_orders")


@manager_required
def categories(request):
    if request.method == "POST":
        name = (request.POST.get("name") or "").strip()
        sort = int(request.POST.get("sort") or 0)
        if name:
            Category.objects.get_or_create(name=name, defaults={"sort": sort})
            messages.success(request, f"分类已保存：{name}")
        return redirect("staff_categories")
    return render(request, "supermarket/staff/categories.html", {"categories": Category.objects.all()})


@manager_required
def category_delete(request, pk):
    """空分类才可删（PROTECT 兜底）。"""
    cat = get_object_or_404(Category, pk=pk)
    if cat.products.exists():
        messages.error(request, f"分类「{cat.name}」下仍有商品，不可删除")
    else:
        cat.delete()
        messages.success(request, f"分类「{cat.name}」已删除")
    return redirect("staff_categories")


@manager_required
def staff_list(request):
    if request.method == "POST":
        username = (request.POST.get("username") or "").strip()
        role = request.POST.get("role")
        password = request.POST.get("password") or ""
        if role not in (Profile.Role.STAFF, Profile.Role.MANAGER) or len(username) < 3:
            messages.error(request, "表单不合法：用户名 ≥3 字符、角色须为店员/经理")
        elif User.objects.filter(username=username).exists():
            messages.error(request, "用户名已存在")
        else:
            with transaction.atomic():
                u = User.objects.create_user(username=username, password=password)
                Profile.objects.create(user=u, role=role)
            messages.success(request, f"员工已建档：{username}（{role}）")
        return redirect("staff_list")
    staff = Profile.objects.filter(role__in=(Profile.Role.STAFF, Profile.Role.MANAGER)) \
        .select_related("user").order_by("role", "user__username")
    return render(request, "supermarket/staff/staff.html", {"staff": staff})


@manager_required
def staff_toggle(request, pk):
    """启用/停用员工账号（停用=is_active=False，无法登录）。"""
    profile = get_object_or_404(Profile, pk=pk, role__in=(Profile.Role.STAFF, Profile.Role.MANAGER))
    if profile.user == request.user:
        messages.error(request, "不能停用自己")
    else:
        profile.user.is_active = not profile.user.is_active
        profile.user.save(update_fields=["is_active"])
        messages.success(request, f"{profile.user.username} 已{'启用' if profile.user.is_active else '停用'}")
    return redirect("staff_list")
