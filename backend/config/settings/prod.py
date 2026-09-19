from .base import *  # noqa: F401,F403

DEBUG = False

if not ALLOWED_HOSTS:  # noqa: F405
    raise RuntimeError("ALLOWED_HOSTS doit être défini en production")

SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 63072000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = "Strict"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = "DENY"

# Railway place l'app derrière un proxy TLS-terminating
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True

# Le probe de healthcheck de Railway atteint le conteneur directement via son
# réseau privé (IP source dans 100.64.0.0/10), sans passer par le proxy
# TLS-terminating public : la requête n'a donc pas d'en-tête
# X-Forwarded-Proto. Avec SECURE_SSL_REDIRECT=True ci-dessus, Django
# répondrait par un 301 vers https:// sur /health/, ce que le probe (qui ne
# suit pas les redirections) interprète comme un échec — alors même que
# l'app tourne correctement. On exempte donc explicitement ce endpoint de la
# redirection HTTPS (tout le reste du trafic continue d'être redirigé).
SECURE_REDIRECT_EXEMPT = [r"^health/$"]

# "default" (S3-compatible, MinIO ou tout autre fournisseur S3) est hérité de
# base.py tel quel — c'est la base de la portabilité du stockage fichiers :
# migrer de MinIO à un autre fournisseur S3-compatible (ou à un autre hébergeur
# que Railway) ne nécessite qu'un changement de variables d'environnement.
STORAGES["staticfiles"] = {  # noqa: F405
    "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
}

MIDDLEWARE.insert(  # noqa: F405
    MIDDLEWARE.index("django.middleware.security.SecurityMiddleware") + 1,  # noqa: F405
    "whitenoise.middleware.WhiteNoiseMiddleware",
)

# Priorité (ajouté le 2026-09-19, voir BREVO_API_KEY/ANYMAIL dans settings/base.py) :
#   1. BREVO_API_KEY défini -> API HTTPS Brevo via django-anymail — fonctionne quel que soit le
#      plan Railway (SMTP y est bloqué sur Free/Trial/Hobby). C'est l'option recommandée tant que
#      le compte Railway n'est pas passé au plan Pro.
#   2. sinon EMAIL_HOST_USER défini -> SMTP classique (ne fonctionnera qu'une fois sur le plan Pro).
#   3. sinon -> les emails sont écrits dans les logs du service au lieu d'échouer silencieusement
#      à chaque tentative d'envoi (OTP, bienvenue, etc.) — utile pour un premier déploiement de
#      test sans aucun fournisseur email branché. À retirer dès qu'un vrai fournisseur est
#      configuré (voir docs/RAILWAY.md §4 et la checklist §9 avant l'ouverture aux membres).
if BREVO_API_KEY:  # noqa: F405
    EMAIL_BACKEND = "anymail.backends.brevo.EmailBackend"
elif EMAIL_HOST_USER:  # noqa: F405
    EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
else:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

if SENTRY_DSN:  # noqa: F405
    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration

    sentry_sdk.init(
        dsn=SENTRY_DSN,  # noqa: F405
        integrations=[DjangoIntegration()],
        traces_sample_rate=0.1,
        send_default_pii=False,
    )

INSTALLED_APPS += ["django_prometheus"]  # noqa: F405
