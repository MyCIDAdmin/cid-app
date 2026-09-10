from .base import *  # noqa: F401,F403

DEBUG = True

if not ALLOWED_HOSTS:  # noqa: F405
    ALLOWED_HOSTS = ["*"]

INSTALLED_APPS += ["debug_toolbar"]  # noqa: F405
MIDDLEWARE = ["debug_toolbar.middleware.DebugToolbarMiddleware"] + MIDDLEWARE  # noqa: F405
INTERNAL_IPS = ["127.0.0.1"]

# django-axes bloque vite en dev — on garde le comportement standard mais
# avec un seuil confortable pour ne pas gêner le développement
AXES_FAILURE_LIMIT = 50

EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"  # -> MailHog

CORS_ALLOW_ALL_ORIGINS = True
