#!/usr/bin/env python
"""种子数据：员工账号 + 超市分类与商品（幂等；演示数据非真实商品库）。

用法：.venv/bin/python seed_demo.py
账号：manager/manager123  staff01..03/staff123456  （顾客自助注册）
"""
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "bizhub.settings")
import django  # noqa: E402

django.setup()

from django.contrib.auth.models import User  # noqa: E402

from supermarket.models import Category, Product, Profile  # noqa: E402

EMPLOYEES = [
    ("manager", "manager123", Profile.Role.MANAGER),
    ("staff01", "staff123456", Profile.Role.STAFF),
    ("staff02", "staff123456", Profile.Role.STAFF),
    ("staff03", "staff123456", Profile.Role.STAFF),
]

CATEGORIES = ["水果蔬菜", "肉禽蛋奶", "粮油副食", "零食饮料", "日用百货", "清洁洗护"]

PRODUCTS = [  # (分类, 名称, 价格, 单位, 库存, 描述)
    ("水果蔬菜", "红富士苹果", 6.9, "斤", 200, "山东烟台产，脆甜多汁"),
    ("水果蔬菜", "香蕉", 4.5, "斤", 150, "菲律宾进口，软糯香甜"),
    ("水果蔬菜", "西红柿", 3.8, "斤", 120, "本地大棚，沙瓤多汁"),
    ("水果蔬菜", "黄瓜", 2.9, "斤", 180, "新鲜带花，清脆爽口"),
    ("水果蔬菜", "黄心土豆", 2.5, "斤", 300, "粉糯适合炖煮"),
    ("肉禽蛋奶", "猪后腿肉", 15.8, "斤", 80, "当日冷鲜，可代客绞馅"),
    ("肉禽蛋奶", "三黄鸡", 12.9, "只", 60, "散养三黄鸡，适合白切"),
    ("肉禽蛋奶", "鸡蛋", 5.6, "斤", 260, "土鸡蛋，个大黄多"),
    ("肉禽蛋奶", "纯牛奶", 3.5, "盒", 400, "250ml 常温纯牛奶"),
    ("粮油副食", "东北大米", 39.9, "袋", 100, "10kg 装珍珠米，粒粒晶莹"),
    ("粮油副食", "大豆油", 62.0, "桶", 90, "5L 压榨一级"),
    ("粮油副食", "中筋面粉", 25.5, "袋", 110, "5kg 装，包子馒头通用"),
    ("粮油副食", "生抽酱油", 8.8, "瓶", 150, "500ml 酿造酱油"),
    ("零食饮料", "薯片原味", 6.5, "袋", 220, "104g 经典装"),
    ("零食饮料", "可乐", 3.0, "瓶", 500, "500ml 冰镇更好喝"),
    ("零食饮料", "每日坚果", 15.9, "袋", 130, "25g×7 混合坚果"),
    ("零食饮料", "夹心饼干", 7.9, "盒", 160, "97g 原味"),
    ("日用百货", "抽纸", 2.9, "包", 350, "3 层 100 抽柔软亲肤"),
    ("日用百货", "垃圾袋", 4.9, "卷", 280, "45×50cm 加厚点断式"),
    ("日用百货", "5号电池", 9.9, "板", 140, "8 粒装碱性电池"),
    ("清洁洗护", "洗衣液", 29.9, "瓶", 120, "2kg 薰衣草香氛"),
    ("清洁洗护", "洗洁精", 9.9, "瓶", 180, "1.1kg 食品级配方"),
    ("清洁洗护", "马桶清洁剂", 6.9, "瓶", 90, "蓝泡泡 200g"),
    ("清洁洗护", "洗手液", 7.5, "瓶", 200, "500ml 抑菌温和"),
]


def main():
    for username, password, role in EMPLOYEES:
        if not User.objects.filter(username=username).exists():
            u = User.objects.create_user(username=username, password=password)
            Profile.objects.create(user=u, role=role)
            print(f"[seed] 员工 {username}（{role}）口令 {password}")
    cats = {}
    for name in CATEGORIES:
        cats[name], _ = Category.objects.get_or_create(name=name)
    n = 0
    for cat, name, price, unit, stock, desc in PRODUCTS:
        if not Product.objects.filter(name=name).exists():
            Product.objects.create(category=cats[cat], name=name,
                                   price=price, unit=unit, stock=stock, desc=desc)
            n += 1
    print(f"[seed] 商品新增 {n} 个（现共 {Product.objects.count()}）")
    print(f"[seed] 分类 {Category.objects.count()} 个；顾客请用商城注册页自助注册")


if __name__ == "__main__":
    main()
