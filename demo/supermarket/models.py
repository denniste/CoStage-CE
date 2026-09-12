"""惠民超市数据模型：角色档案、商品目录、购物车、订单。

一家单店超市（非多租户）：User.role 区分 顾客(customer)/店员(staff)/经理(manager)；
店员与经理统称"员工"（可进后台），经理额外可管员工与分类。
"""
from django.conf import settings
from django.db import models
from django.utils import timezone


class Profile(models.Model):
    """用户角色档案（1:1 Django User）。"""

    class Role(models.TextChoices):
        CUSTOMER = "customer", "顾客"
        STAFF = "staff", "店员"
        MANAGER = "manager", "经理"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                related_name="profile")
    # CoStage 数字 uid（首次换票时由 exchange 响应回填）。CoStage 的决策请求带的是
    # 这个 uid 而非 external_id（mall-<id>）——两个 id 空间不同，必须显式映射，
    # 禁止用裸数字猜（会撞进超市自身用户表的另一个 id 空间，张冠李戴）。
    co_stage_uid = models.CharField("CoStage uid", max_length=64, blank=True, db_index=True)
    role = models.CharField("角色", max_length=16, choices=Role.choices, default=Role.CUSTOMER)
    phone = models.CharField("手机号", max_length=20, blank=True)
    created_at = models.DateTimeField("注册时间", auto_now_add=True)

    class Meta:
        verbose_name = "用户档案"
        verbose_name_plural = "用户档案"

    def __str__(self):
        return f"{self.user.username}({self.get_role_display()})"

    @property
    def is_staff_member(self):
        """店员或经理：可进后台（与 Django User.is_staff 区分，后者只控 admin 站）。"""
        return self.role in (self.Role.STAFF, self.Role.MANAGER)


class Category(models.Model):
    name = models.CharField("分类名", max_length=32, unique=True)
    sort = models.IntegerField("排序", default=0)

    class Meta:
        verbose_name = "商品分类"
        verbose_name_plural = "商品分类"
        ordering = ["sort", "id"]

    def __str__(self):
        return self.name


class Product(models.Model):
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products",
                                 verbose_name="分类")
    name = models.CharField("商品名", max_length=64)
    price = models.DecimalField("售价", max_digits=10, decimal_places=2)
    stock = models.IntegerField("库存", default=0)
    unit = models.CharField("单位", max_length=8, default="件")
    barcode = models.CharField("条码", max_length=32, blank=True)
    desc = models.CharField("商品描述", max_length=200, blank=True)
    on_shelf = models.BooleanField("上架中", default=True)
    created_at = models.DateTimeField("建档时间", auto_now_add=True)
    updated_at = models.DateTimeField("更新时间", auto_now=True)

    class Meta:
        verbose_name = "商品"
        verbose_name_plural = "商品"
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.name} ¥{self.price}/{self.unit} 库存{self.stock}"

    @property
    def low_stock(self):
        return self.stock < 10


class CartItem(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="cart_items", verbose_name="顾客")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, verbose_name="商品")
    qty = models.PositiveIntegerField("数量", default=1)

    class Meta:
        verbose_name = "购物车项"
        verbose_name_plural = "购物车项"
        unique_together = [("user", "product")]

    @property
    def subtotal(self):
        return self.product.price * self.qty


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING_PAYMENT = "pending_payment", "待支付"
        PAID = "paid", "已支付/待发货"
        SHIPPED = "shipped", "已发货"
        COMPLETED = "completed", "已完成"
        CANCELLED = "cancelled", "已取消"

    sn = models.CharField("订单号", max_length=32, unique=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                             related_name="orders", verbose_name="顾客")
    status = models.CharField("状态", max_length=16, choices=Status.choices,
                              default=Status.PENDING_PAYMENT)
    total = models.DecimalField("订单总额", max_digits=10, decimal_places=2)
    receiver = models.CharField("收货人", max_length=32)
    phone = models.CharField("联系电话", max_length=20)
    address = models.CharField("配送地址", max_length=200)
    note = models.CharField("订单备注", max_length=200, blank=True)
    created_at = models.DateTimeField("下单时间", auto_now_add=True)
    paid_at = models.DateTimeField("支付时间", null=True, blank=True)
    shipped_at = models.DateTimeField("发货时间", null=True, blank=True)
    completed_at = models.DateTimeField("完成时间", null=True, blank=True)

    class Meta:
        verbose_name = "订单"
        verbose_name_plural = "订单"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.sn} {self.get_status_display()} ¥{self.total}"


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items",
                              verbose_name="订单")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, verbose_name="商品")
    product_name = models.CharField("商品名快照", max_length=64)
    price = models.DecimalField("成交单价快照", max_digits=10, decimal_places=2)
    qty = models.PositiveIntegerField("数量")

    @property
    def subtotal(self):
        return self.price * self.qty

    def __str__(self):
        return f"{self.product_name}×{self.qty}"


class DecisionLog(models.Model):
    """CoStage 决策询问落痕（Phase 2 接入用；Phase 1 静默存在）。"""

    ts = models.DateTimeField("时间", auto_now_add=True)
    action = models.CharField("动作", max_length=32)
    user_id = models.CharField("CoStage userId", max_length=64)
    room_id = models.CharField("房间", max_length=64, blank=True)
    allow = models.BooleanField("放行")
    reason = models.CharField("拒绝理由", max_length=200, blank=True)
    request_id = models.CharField("幂等键", max_length=64, blank=True)

    class Meta:
        verbose_name = "决策日志"
        verbose_name_plural = "决策日志"
        ordering = ["-ts"]

    def __str__(self):
        return f"{self.ts:%H:%M:%S} {self.action} {self.user_id} → {'✓' if self.allow else '✗ ' + self.reason}"


def today_sales():
    """今日已完成交易额（员工看板用）。"""
    start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    return (Order.objects.filter(status__in=(Order.Status.PAID, Order.Status.SHIPPED,
                                                   Order.Status.COMPLETED),
                                 created_at__gte=start)
            .aggregate(t=models.Sum("total"))["t"] or 0)
