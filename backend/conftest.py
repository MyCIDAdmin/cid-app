"""
Configuration pytest globale. Le cache Redis (utilisé par le throttling DRF
et django-axes) n'est pas réinitialisé automatiquement entre les tests comme
l'est la base de données — on le vide explicitement pour éviter les faux
positifs/négatifs liés au rate limiting d'un test à l'autre.
"""
import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()
