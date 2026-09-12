"""顾客商城：首页（分类+搜索+商品网格）、商品详情。匿名可浏览。"""
from django.conf import settings
from django.core.paginator import Paginator
from django.shortcuts import get_object_or_404, render

from . import live
from .models import Category, Product

PAGE_SIZE = 12


def _cart_count(request):
    if request.user.is_authenticated:
        return request.user.cart_items.count()
    return 0


def home(request):
    categories = Category.objects.all()
    products = Product.objects.filter(on_shelf=True).select_related("category")
    category_id = request.GET.get("category")
    q = (request.GET.get("q") or "").strip()
    current = None
    if category_id:
        current = categories.filter(id=category_id).first()
        if current:
            products = products.filter(category=current)
    if q:
        products = products.filter(name__icontains=q)
    page = Paginator(products, PAGE_SIZE).get_page(request.GET.get("page"))
    live_rooms = live.list_live_rooms()
    # 分类名 → 直播间数（首页分类角标：店员在 CoStage 房间设置里选的分类名 = 超市分类名）
    live_by_cat = {}
    for r in live_rooms:
        c = r.get("category") or ""
        if c:
            live_by_cat[c] = live_by_cat.get(c, 0) + 1
    return render(request, "supermarket/home.html", {
        "categories": categories, "current": current, "q": q,
        "page": page, "cart_count": _cart_count(request),
        "live_rooms": live_rooms, "live_by_cat": live_by_cat,
        "live_entry": getattr(settings, "COSTAGE_ENTRY_URL", ""),
    })


def live_list(request):
    """正在直播页（匿名可看）：全部超市直播间，?category= 按分类过滤。"""
    rooms = live.list_live_rooms()
    cat = (request.GET.get("category") or "").strip()
    if cat:
        rooms = [r for r in rooms if r.get("category") == cat]
    cats = sorted({r.get("category") or "未分类" for r in live.list_live_rooms()})
    return render(request, "supermarket/live.html", {
        "rooms": rooms, "cat": cat, "cats": cats,
        "live_entry": getattr(settings, "COSTAGE_ENTRY_URL", ""),
    })


def product_detail(request, pk):
    product = get_object_or_404(Product, pk=pk, on_shelf=True)
    # 同分类正在直播的房间（商品页直播横幅；匹配规则=CoStage 房间分类名 == 超市分类名）
    same_cat = [r for r in live.list_live_rooms()
                if r.get("category") and r["category"] == product.category.name]
    return render(request, "supermarket/product.html", {
        "p": product, "cart_count": _cart_count(request),
        "live_rooms": same_cat, "live_entry": getattr(settings, "COSTAGE_ENTRY_URL", ""),
    })
