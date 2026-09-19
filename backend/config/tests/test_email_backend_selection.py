"""
Tests de sélection du backend email en production (ajouté le 2026-09-19) — voir
config.settings.prod : EMAIL_BACKEND. Railway bloque le SMTP sortant sur les plans Free/Trial/
Hobby (débloqué uniquement sur le plan Pro) ; BREVO_API_KEY fait basculer sur l'API HTTPS de
Brevo (django-anymail), qui fonctionne quel que soit le plan Railway, au lieu d'attendre la
migration Pro ou d'échouer silencieusement en SMTP.

Recharge config.settings.base et config.settings.prod dans des modules frais à chaque cas — les
settings qui font réellement tourner cette suite de tests (config.settings.dev, chargées une
seule fois par Django au démarrage de pytest) ne sont jamais touchées : LazySettings en a copié
les attributs à l'import initial, un rechargement de config.settings.base ailleurs dans
sys.modules ne les affecte pas rétroactivement.
"""

import importlib
import sys

import pytest

# Variables lues par config.settings.base/prod dont la valeur ne doit pas fuiter d'un cas de ce
# module à l'autre, ni vers le reste de la suite.
_VARS_A_ISOLER = ["BREVO_API_KEY", "EMAIL_HOST_USER"]


@pytest.fixture(autouse=True)
def _env_isole(monkeypatch):
    yield
    # Un cas de ce module peut avoir laissé une version rechargée de config.settings.base/prod
    # dans le cache des modules — on force le rechargement au prochain accès (par un futur test)
    # pour ne rien laisser fuiter. config.settings.dev n'est jamais dans ce cache : voir
    # docstring du module.
    sys.modules.pop("config.settings.base", None)
    sys.modules.pop("config.settings.prod", None)


def _email_backend_pour(monkeypatch, **env) -> str:
    """Recharge config.settings.prod avec les variables d'environnement données (les autres
    variables lues par config.settings.base/prod, ex. ALLOWED_HOSTS, restent celles déjà présentes
    dans l'environnement du process, chargées depuis .env au tout premier import) et renvoie
    EMAIL_BACKEND."""
    for var in _VARS_A_ISOLER:
        if var in env:
            monkeypatch.setenv(var, env[var])
        else:
            monkeypatch.delenv(var, raising=False)
    sys.modules.pop("config.settings.base", None)
    sys.modules.pop("config.settings.prod", None)
    module = importlib.import_module("config.settings.prod")
    return module.EMAIL_BACKEND


def test_brevo_api_key_prioritaire_meme_si_smtp_configure(monkeypatch):
    backend = _email_backend_pour(
        monkeypatch, BREVO_API_KEY="clef-test", EMAIL_HOST_USER="smtp-user"
    )
    assert backend == "anymail.backends.brevo.EmailBackend"


def test_brevo_api_key_seule_suffit(monkeypatch):
    backend = _email_backend_pour(monkeypatch, BREVO_API_KEY="clef-test")
    assert backend == "anymail.backends.brevo.EmailBackend"


def test_smtp_utilise_si_seul_email_host_user_configure(monkeypatch):
    backend = _email_backend_pour(monkeypatch, EMAIL_HOST_USER="smtp-user")
    assert backend == "django.core.mail.backends.smtp.EmailBackend"


def test_console_par_defaut_sans_aucune_configuration(monkeypatch):
    backend = _email_backend_pour(monkeypatch)
    assert backend == "django.core.mail.backends.console.EmailBackend"
