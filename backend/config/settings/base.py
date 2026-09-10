"""
Settings communs à tous les environnements (dev/prod).
Voir CID-TDD-001 §1 (stack), §3 (sécurité) et CID-SCD-001 pour le détail
des décisions de configuration.
"""

import os
from datetime import timedelta
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = os.environ.get("SECRET_KEY", "insecure-fallback-do-not-use-in-prod")
DEBUG = False
ALLOWED_HOSTS = [h.strip() for h in os.environ.get("ALLOWED_HOSTS", "").split(",") if h.strip()]

# =============================================================================
# Applications
# =============================================================================
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "channels",
    "django_celery_beat",
    "django_otp",
    "django_otp.plugins.otp_totp",
    "axes",
    "encrypted_model_fields",
]

LOCAL_APPS = [
    "apps.accounts",
    "apps.membres",
    "apps.cotisations",
    "apps.adhesions",
    "apps.evenements",
    "apps.boutique",
    "apps.vote",
    "apps.communaute",
    "apps.stats",
    "apps.notifications",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

AUTH_USER_MODEL = "accounts.User"

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django_otp.middleware.OTPMiddleware",
    "axes.middleware.AxesMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.accounts.middleware.AuditLogMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# =============================================================================
# Base de données — Railway fournit DATABASE_URL automatiquement si un plugin
# PostgreSQL est attaché au service ; sinon on construit l'URL depuis les
# variables POSTGRES_* (dev / docker-compose).
# =============================================================================
_default_db_url = (
    f"postgres://{os.environ.get('POSTGRES_USER', 'cid_user')}:"
    f"{os.environ.get('POSTGRES_PASSWORD', 'changeme_dev')}@"
    f"{os.environ.get('POSTGRES_HOST', 'postgres')}:"
    f"{os.environ.get('POSTGRES_PORT', '5432')}/"
    f"{os.environ.get('POSTGRES_DB', 'cid_db')}"
)

DATABASES = {
    "default": dj_database_url.config(
        default=os.environ.get("DATABASE_URL") or _default_db_url,
        conn_max_age=600,
    )
}

# =============================================================================
# Cache / Redis — idem : REDIS_URL prioritaire (Railway plugin)
# =============================================================================
_redis_url = os.environ.get("REDIS_URL") or (
    f"redis://:{os.environ.get('REDIS_PASSWORD', 'changeme_dev')}@"
    f"{os.environ.get('REDIS_HOST', 'redis')}:{os.environ.get('REDIS_PORT', '6379')}/0"
)

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": _redis_url,
    }
}

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {"hosts": [_redis_url]},
    }
}

# =============================================================================
# Celery
# =============================================================================
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", _redis_url)
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", _redis_url)
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = "Europe/Berlin"
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"

# =============================================================================
# Mots de passe — Argon2id (SCD §3.1) + liste noire + longueur min 10
# =============================================================================
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 10},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

AUTHENTICATION_BACKENDS = [
    "axes.backends.AxesBackend",
    "apps.accounts.backends.EmailBackend",
]

# --- django-axes : protection brute force (SCD §3.5) ---
AXES_FAILURE_LIMIT = 10
AXES_COOLOFF_TIME = 1  # heure
AXES_LOCKOUT_PARAMETERS = ["ip_address", "username"]
AXES_RESET_ON_SUCCESS = True

# =============================================================================
# Chiffrement des champs sensibles (CIN, passeport, TOTP, messages) — AES-256
# =============================================================================
FIELD_ENCRYPTION_KEY = os.environ.get(
    "SECRET_FIELD_KEY", "changeme-32-bytes-base64-urlsafe-dev-key-only"
)

# =============================================================================
# DRF + JWT (SCD §3.4)
# =============================================================================
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_FILTER_BACKENDS": ("django_filters.rest_framework.DjangoFilterBackend",),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.CursorPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.AnonRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "user": "100/min",
        "anon": "20/min",
        "login": "5/min",
        "otp": "3/10min",
        "justificatif_upload": "10/hour",
    },
    "EXCEPTION_HANDLER": "apps.accounts.exceptions.cid_exception_handler",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=int(os.environ.get("JWT_ACCESS_TOKEN_LIFETIME_MIN", 15))
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(
        days=int(os.environ.get("JWT_REFRESH_TOKEN_LIFETIME_DAYS", 7))
    ),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
    # Ne JAMAIS inclure de données sensibles dans les claims JWT (SCD §3.4)
}

# =============================================================================
# CORS
# =============================================================================
CORS_ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",") if o.strip()
]
CORS_ALLOW_CREDENTIALS = True

# =============================================================================
# Stockage fichiers — MinIO (S3-compatible) via django-storages
# =============================================================================
AWS_ACCESS_KEY_ID = os.environ.get("MINIO_ACCESS_KEY", "minioadmin")
AWS_SECRET_ACCESS_KEY = os.environ.get("MINIO_SECRET_KEY", "changeme_dev")
AWS_S3_ENDPOINT_URL = (
    f"{'https' if os.environ.get('MINIO_USE_SSL', 'False') == 'True' else 'http'}"
    f"://{os.environ.get('MINIO_ENDPOINT', 'minio:9000')}"
)
AWS_S3_ADDRESSING_STYLE = "path"
AWS_DEFAULT_ACL = None
AWS_QUERYSTRING_AUTH = True  # nécessaire pour les URLs pré-signées (justificatifs)

MINIO_BUCKET_JUSTIFICATIFS = os.environ.get("MINIO_BUCKET_JUSTIFICATIFS", "justificatifs")
MINIO_BUCKET_PRODUITS = os.environ.get("MINIO_BUCKET_PRODUITS", "produits")
MINIO_BUCKET_EXPORTS = os.environ.get("MINIO_BUCKET_EXPORTS", "exports")

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# =============================================================================
# Internationalisation — FR (défaut) / DE / AR (R2)
# =============================================================================
LANGUAGE_CODE = "fr"
TIME_ZONE = "Europe/Berlin"
USE_I18N = True
USE_TZ = True

LANGUAGES = [
    ("fr", "Français"),
    ("de", "Deutsch"),
    ("ar", "العربية"),
]
LOCALE_PATHS = [BASE_DIR / "locale"]

# =============================================================================
# Email — MailHog (dev) / SMTP (prod), voir settings/dev.py et prod.py
# =============================================================================
EMAIL_HOST = os.environ.get("EMAIL_HOST", "mailhog")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", 1025))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "False") == "True"
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "noreply@clubistes.de")

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")

# =============================================================================
# Upload — taille max (SCD §7.4)
# =============================================================================
DATA_UPLOAD_MAX_MEMORY_SIZE = 50 * 1024 * 1024  # 50 Mo
FILE_UPLOAD_MAX_MEMORY_SIZE = 50 * 1024 * 1024

# =============================================================================
# Logging — jamais de données sensibles dans les logs (SCD §8.1)
# =============================================================================
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "[{asctime}] {levelname} {name} — {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "verbose"},
    },
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "apps": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Objets 2FA conditionnel — cf apps.accounts.services.TwoFactorPolicy (SCD §3.3)
OTP_EMAIL_TTL_MIN = int(os.environ.get("OTP_EMAIL_TTL_MIN", 10))
OTP_EMAIL_MAX_PER_10MIN = int(os.environ.get("OTP_EMAIL_MAX_PER_10MIN", 3))

SENTRY_DSN = os.environ.get("SENTRY_DSN", "")
