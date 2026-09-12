"""BizHub 业务模型：业务身份/规则的数据面。

BizUser 把 CoStage 本地 uid（纯数字字符串，如 "2"=user01）映射为业务身份与状态——
业务系统是规则真相源，CoStage 决策请求携带的 userId 由此表裁决。
"""
from django.db import models


class BizUser(models.Model):
    class Role(models.TextChoices):
        TEACHER = "teacher", "教师"
        STUDENT = "student", "学生"
        GUEST = "guest", "访客"

    class Status(models.TextChoices):
        ACTIVE = "active", "正常"
        SUSPENDED = "suspended", "暂停"
        BANNED = "banned", "禁播封禁"

    cstg_uid = models.CharField("CoStage uid", max_length=64, unique=True,
                                help_text='CoStage 本地用户 id（纯数字串，如 "2"）；trusted 模式下为 x-trusted-<业务userId>')
    username = models.CharField("业务用户名", max_length=64)
    role = models.CharField("业务角色", max_length=16, choices=Role.choices, default=Role.STUDENT)
    status = models.CharField("账号状态", max_length=16, choices=Status.choices, default=Status.ACTIVE)
    note = models.CharField("备注", max_length=200, blank=True)
    updated_at = models.DateTimeField("更新时间", auto_now=True)

    class Meta:
        verbose_name = "业务用户"
        verbose_name_plural = "业务用户"

    def __str__(self):
        return f"{self.username}(uid={self.cstg_uid},{self.role}/{self.status})"


class DecisionLog(models.Model):
    """每一次 CoStage 决策询问的落痕（验收与对账用）。"""

    ts = models.DateTimeField("时间", auto_now_add=True)
    action = models.CharField("动作", max_length=32)
    user_id = models.CharField("userId", max_length=64)
    room_id = models.CharField("roomId", max_length=64, blank=True)
    allow = models.BooleanField("放行")
    reason = models.CharField("拒绝理由", max_length=200, blank=True)
    request_id = models.CharField("幂等键", max_length=64, blank=True)

    class Meta:
        verbose_name = "决策日志"
        verbose_name_plural = "决策日志"
        ordering = ["-ts"]

    def __str__(self):
        return f"{self.ts:%H:%M:%S} {self.action} {self.user_id} → {'✓' if self.allow else '✗ ' + self.reason}"
