#!/usr/bin/env python
"""种子数据：CoStage 本地 users 表 (id 1-5) → BizHub 业务身份映射 + 运营账号。

用法：.venv/bin/python seed_demo.py [--password bizadmin1234]
幂等：已存在的映射只补缺，不覆盖运营者在控制台做过的修改。
"""
import os
import sys

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "bizhub.settings")
import django

django.setup()

from django.contrib.auth.models import User  # noqa: E402

from liveops.models import BizUser  # noqa: E402

# (cstg_uid, username, role, status)——与 CoStage costage.db users 表对齐（09-12 实测）
SEED = [
    ("1", "admin", "teacher", "active"),
    ("2", "user01", "student", "active"),
    ("3", "user02", "student", "active"),
    ("4", "user03", "student", "active"),
    ("5", "user04", "student", "active"),
]


def main():
    pw = "bizadmin1234"
    if "--password" in sys.argv:
        pw = sys.argv[sys.argv.index("--password") + 1]
    if not User.objects.filter(username="bizadmin").exists():
        User.objects.create_superuser("bizadmin", "biz@demo.local", pw)
        print(f"[seed] 运营账号 bizadmin / {pw}")
    else:
        print("[seed] bizadmin 已存在，跳过")
    for uid, name, role, status in SEED:
        obj, created = BizUser.objects.get_or_create(
            cstg_uid=uid, defaults={"username": name, "role": role, "status": status})
        if created:
            print(f"[seed] 映射 {name}(uid={uid}) → {role}/{status}")
        else:
            print(f"[seed] 映射已存在 {obj}（保留运营修改）")


if __name__ == "__main__":
    main()
