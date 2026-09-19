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
    "anymail",  # ajouté le 2026-09-19 — voir EMAIL_BACKEND plus bas
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
        # DRF's rate-string parser (SimpleRateThrottle.parse_rate) only reads
        # the FIRST CHARACTER of the period ("s"/"m"/"h"/"d") — "10min" isn't
        # a valid period, its first char "1" isn't in that lookup table, and
        # every request crashes with KeyError: '1'. DRF has no native syntax
        # for "N per 10 minutes"; "5/min" approximates the originally
        # intended "3 per 10 min" while staying valid. The precise 3-per-
        # 10-minutes business rule (SCD §3.3) is enforced separately and
        # correctly in apps.accounts.services.generate_email_otp via a
        # Redis-backed counter (OTP_EMAIL_MAX_PER_10MIN) — this scope is
        # just a coarser API-abuse safety net on top of that.
        "otp": "5/min",
        "password_reset": "5/min",
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
# Bucket "défaut" du STORAGES["default"] ci-dessous. Les modules avec des
# exigences de rétention/accès distinctes (Adhésions → justificatifs, Boutique
# → produits, Stats → exports) définiront leurs propres classes de storage
# (sous-classes de S3Boto3Storage avec bucket_name=MINIO_BUCKET_*) en Phase 1B/2B
# plutôt que d'utiliser ce bucket par défaut.
AWS_STORAGE_BUCKET_NAME = os.environ.get("MINIO_BUCKET_DEFAULT", "cid-media")

MINIO_BUCKET_JUSTIFICATIFS = os.environ.get("MINIO_BUCKET_JUSTIFICATIFS", "justificatifs")
MINIO_BUCKET_PRODUITS = os.environ.get("MINIO_BUCKET_PRODUITS", "produits")
MINIO_BUCKET_EXPORTS = os.environ.get("MINIO_BUCKET_EXPORTS", "exports")

# Endpoint PUBLIC (navigateur) du bucket produits — distinct de MINIO_ENDPOINT ci-dessus,
# qui reste l'endpoint INTERNE utilisé par le backend pour parler à MinIO (ex. déploiement
# Railway : MINIO_ENDPOINT=<service>.railway.internal:9000, jamais résolvable hors du
# réseau privé Railway — voir docs/RAILWAY.md §7). Sans cette variable, les URLs générées
# pour Produit.image utilisent l'endpoint interne et sont cassées dans le navigateur
# (icône d'image manquante) même quand le fichier existe bien sur MinIO. Voir
# apps.boutique.storage.ProduitsStorage pour l'utilisation (custom_domain).
MINIO_PUBLIC_ENDPOINT = os.environ.get("MINIO_PUBLIC_ENDPOINT", "")
MINIO_PUBLIC_USE_SSL = (
    os.environ.get("MINIO_PUBLIC_USE_SSL", os.environ.get("MINIO_USE_SSL", "False")) == "True"
)

# STORAGES["default"] pointe vers MinIO (dev, via docker-compose) ou n'importe
# quel endpoint S3-compatible (prod) grâce aux variables d'env AWS_*/MINIO_*
# ci-dessus — aucune modification de code nécessaire pour changer de fournisseur
# de stockage (portabilité). staticfiles est redéfini par prod.py (whitenoise).
STORAGES = {
    "default": {"BACKEND": "storages.backends.s3boto3.S3Boto3Storage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}

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
# Email — MailHog (dev) / Brevo API HTTP (prod, recommandé) / SMTP (prod,
# alternative) — voir settings/dev.py et settings/prod.py pour le choix du
# backend selon les variables définies.
# =============================================================================
EMAIL_HOST = os.environ.get("EMAIL_HOST", "mailhog")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", 1025))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "False") == "True"
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "noreply@clubistes.de")

# Ajouté le 2026-09-19 — Railway bloque intégralement le SMTP sortant (ports 25/465/587/2525) sur
# les plans Free/Trial/Hobby, débloqué uniquement sur le plan Pro (voir
# Hosting_Migration_Vorschlag, doc projet). Pour pouvoir tester l'envoi d'email (confirmation
# d'inscription, relances, etc.) sur un environnement Railway privé/gratuit AVANT la migration
# Pro, BREVO_API_KEY fait basculer settings/prod.py sur l'API HTTPS de Brevo via django-anymail
# au lieu du SMTP — fonctionne quel que soit le plan Railway, aucun port SMTP requis. Le SMTP
# (EMAIL_HOST_USER, déjà configuré et domaine authentifié pour my-cid.de) reste utilisable tel
# quel une fois sur le plan Pro, en laissant simplement BREVO_API_KEY non défini.
BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "")
ANYMAIL = {"BREVO_API_KEY": BREVO_API_KEY}

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")

# =============================================================================
# Passerelles de paiement (AHM-46) — Stripe Checkout et PayPal Checkout, tous deux hébergés
# (voir apps.cotisations.gateways). Aucune valeur par défaut utilisable en production : tant que
# ces variables ne sont pas positionnées, GatewayError est levée à l'initiation d'un paiement en
# ligne (voir CotisationViewSet.initier_paiement_en_ligne) — le virement SEPA (confirmation
# manuelle DF/Admin, AHM-53) continue de fonctionner sans elles. Ne jamais committer de vraie
# valeur ici (CLAUDE.md §5) : à définir dans .env (dev) ou les Settings Railway (prod).
# =============================================================================
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_PUBLISHABLE_KEY = os.environ.get("STRIPE_PUBLISHABLE_KEY", "")
# Peut contenir plusieurs signing secrets séparés par des virgules : un par endpoint Stripe
# enregistré (apps.cotisations.webhooks et apps.boutique.webhooks ont chacun leur propre URL,
# donc leur propre endpoint/secret côté Stripe, bien qu'ils partagent ce même compte marchand) —
# voir apps.cotisations.gateways.construire_evenement_stripe.
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

PAYPAL_MODE = os.environ.get("PAYPAL_MODE", "sandbox")  # "sandbox" ou "live"
PAYPAL_CLIENT_ID = os.environ.get("PAYPAL_CLIENT_ID", "")
PAYPAL_CLIENT_SECRET = os.environ.get("PAYPAL_CLIENT_SECRET", "")
PAYPAL_WEBHOOK_ID = os.environ.get("PAYPAL_WEBHOOK_ID", "")

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
