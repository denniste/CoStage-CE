"""BizHub 根路由：惠民超市（商城+后台）+ Django admin。"""
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("supermarket.urls")),
]
