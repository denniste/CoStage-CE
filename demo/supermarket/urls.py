"""惠民超市路由：商城（顾客）+ 后台（店员/经理）+ CoStage 决策端点。"""
from django.urls import path

from . import livegate, views_auth, views_cart, views_order, views_store, views_staff

urlpatterns = [
    # 顾客商城（匿名可浏览）
    path("", views_store.home, name="home"),
    path("live/", views_store.live_list, name="live_list"),
    path("product/<int:pk>/", views_store.product_detail, name="product_detail"),
    path("register/", views_auth.register, name="register"),
    path("login/", views_auth.user_login, name="login"),
    path("logout/", views_auth.user_logout, name="logout"),
    # 购物车与订单（登录顾客）
    path("cart/", views_cart.cart, name="cart"),
    path("cart/add/<int:pk>/", views_cart.add_to_cart, name="add_to_cart"),
    path("cart/update/<int:pk>/", views_cart.update_cart, name="update_cart"),
    path("order/checkout/", views_order.checkout, name="checkout"),
    path("order/pay/<str:sn>/", views_order.pay, name="order_pay"),
    path("order/cancel/<str:sn>/", views_order.cancel, name="order_cancel"),
    path("order/receive/<str:sn>/", views_order.receive, name="order_receive"),
    path("orders/", views_order.my_orders, name="my_orders"),
    path("orders/<str:sn>/", views_order.order_detail, name="order_detail"),
    # CoStage 决策端点（Phase 2）
    path("biz/v1/decide", livegate.decide_endpoint, name="decide"),
    # 员工后台
    path("staff/", views_staff.dashboard, name="staff_dashboard"),
    path("staff/live/start/", views_staff.live_start, name="live_start"),
    path("staff/products/", views_staff.products, name="staff_products"),
    path("staff/products/new/", views_staff.product_new, name="product_new"),
    path("staff/products/<int:pk>/edit/", views_staff.product_edit, name="product_edit"),
    path("staff/products/<int:pk>/toggle/", views_staff.product_toggle, name="product_toggle"),
    path("staff/products/<int:pk>/stock/", views_staff.product_stock, name="product_stock"),
    path("staff/orders/", views_staff.orders, name="staff_orders"),
    path("staff/orders/<int:pk>/ship/", views_staff.order_ship, name="order_ship"),
    path("staff/categories/", views_staff.categories, name="staff_categories"),
    path("staff/categories/<int:pk>/delete/", views_staff.category_delete, name="category_delete"),
    path("staff/team/", views_staff.staff_list, name="staff_list"),
    path("staff/team/<int:pk>/toggle/", views_staff.staff_toggle, name="staff_toggle"),
]
