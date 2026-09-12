#!/usr/bin/env bash
# BizHub 演示启动：venv → 依赖 → 迁移 → 种子 → runserver 127.0.0.1:7990
set -e
cd "$(dirname "$0")"
[ -x .venv/bin/python ] || python3 -m venv .venv
PIP="$PWD/.venv/bin/pip"
$PIP install --quiet -r requirements.txt || {
  echo "[run] 直连 pypi 失败，走代理 127.0.0.1:7890 重试"
  $PIP install --quiet --proxy http://127.0.0.1:7890 -r requirements.txt
}
.venv/bin/python manage.py migrate --noinput
.venv/bin/python seed_demo.py
exec .venv/bin/python manage.py runserver 127.0.0.1:7990
