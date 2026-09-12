"""BizHub——CoStage 业务接入演示系统（一家大型超市：顾客商城 + 员工后台）的 Django 配置。

Phase 1 = 超市电商本体（独立完整运行，不依赖 CoStage）；
Phase 2 = 接入 CoStage 商品直播（店员开播/顾客观看），集成常量见 COSTAGE_* 区块。
"""
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = "demo-only-secret-key-change-me-in-production"
DEBUG = True
# 192.168.31.2 = Windows nginx 7443 反代（mall.conf，HTTPS 终结后回环到 7990）
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "192.168.31.2"]
CSRF_TRUSTED_ORIGINS = ["https://192.168.31.2:7443"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "supermarket",
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
                "supermarket.context_processors.cart_count",
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

# ---- CoStage 集成（Phase 2 生效；Phase 1 阶段可全部留默认）----
COSTAGE_AUTHZ_SECRET = "demo-bizhub-authz-secret"   # = CoStage COSTAGE_AUTHZ_SECRET
COSTAGE_SERVICE_TOKEN = "demo-bizhub-service-token" # = CoStage COSTAGE_SERVICE_TOKEN
COSTAGE_BASE_URL = "http://127.0.0.1:7860"          # CoStage 业务入口（服务端调用）
COSTAGE_ENTRY_URL = "https://192.168.31.2"          # CoStage 浏览器入口（店员换票跳转）
COSTAGE_TRUSTED_SECRET = "demo-bizhub-trusted-secret"  # = CoStage COSTAGE_TRUSTED_SECRET（换票 HMAC）
COSTAGE_TS_TOLERANCE = 300                          # 决策时间戳容忍窗（秒）
