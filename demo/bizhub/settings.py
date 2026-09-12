"""BizHub——CoStage 业务接入演示系统的 Django 配置。

演示定位：业务系统是「谁可直播 / 谁只能看 / 谁可连麦」的唯一真相源（评估文档 §0）。
集成常量集中在 COSTAGE_* 区块，与 docs/costage-biz-integration.md 一一对应。
"""
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = "demo-only-secret-key-change-me-in-production"
DEBUG = True
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "liveops",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
]

ROOT_URLCONF = "bizhub.urls"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]
WSGI_APPLICATION = "bizhub.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

AUTH_PASSWORD_VALIDATORS = []  # 演示：弱口令放行
LANGUAGE_CODE = "zh-hans"
TIME_ZONE = "Asia/Shanghai"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---- CoStage 集成常量（docs/costage-biz-integration.md §2/§3）----
# 决策签名密钥：与 CoStage COSTAGE_AUTHZ_SECRET 同值（演示定值，生产走密钥管理）。
COSTAGE_AUTHZ_SECRET = "demo-bizhub-authz-secret"
# CoStage 服务间令牌：与 CoStage COSTAGE_SERVICE_TOKEN 同值（撤权端点鉴权）。
COSTAGE_SERVICE_TOKEN = "demo-bizhub-service-token"
# CoStage 业务入口（决策无关；撤权/回跳用）。
COSTAGE_BASE_URL = "http://127.0.0.1:7860"
# 决策请求时间戳容忍窗（秒）：防重放。
COSTAGE_TS_TOLERANCE = 300
