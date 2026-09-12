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
    return render(request, "supermarket/home.html", {
        "categories": categories, "current": current, "q": q,
        "page": page, "cart_count": _cart_count(request),
        "live_rooms": live.list_live_rooms(),
        "live_entry": getattr(settings, "COSTAGE_ENTRY_URL", ""),
    })


def product_detail(request, pk):
    product = get_object_or_404(Product, pk=pk, on_shelf=True)
    return render(request, "supermarket/product.html", {
        "p": product, "cart_count": _cart_count(request),
    })
