"""
Configuration pytest globale. Le cache Redis (utilisé par le throttling DRF
et django-axes) n'est pas réinitialisé automatiquement entre les tests comme
l'est la base de données — on le vide explicitement pour éviter les faux
positifs/négatifs liés au rate limiting d'un test à l'autre.
"""

import pytest
from channels.layers import channel_layers
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def _reset_channel_layers():
    """
    channels.layers.channel_layers (apps.communaute.tests.test_consumers,
    apps.vote.tests.test_consumer, ...) est un singleton process-wide qui met en cache la
    première instance de RedisChannelLayer créée (CHANNEL_LAYERS, config/settings/base.py).
    Cette instance crée paresseusement des asyncio.Lock (channels_redis/core.py) liés à la
    boucle d'événements active au moment de leur création. Or chaque test WebSocket de ce
    projet appelle asyncio.run(...), qui crée une NOUVELLE boucle à chaque fois — dès qu'un
    test réutilise l'instance mise en cache depuis une boucle différente de celle où elle a
    été créée, on obtient "RuntimeError: <asyncio.locks.Lock ...> is bound to a different
    event loop", de façon non déterministe selon l'ordre d'exécution (constaté en CI sur
    apps/vote/tests/test_consumer.py::test_double_vote_refuse puis, au run suivant, sur deux
    tests différents d'apps/communaute/tests/test_consumers.py — jamais reproduit en local en
    isolant les fichiers, seulement lors de la suite complète, ce qui pointait déjà vers un
    état partagé entre tests plutôt qu'un bug propre à un test précis).

    Fix : vider le cache après chaque test, pour forcer la recréation d'une instance (et donc
    de nouveaux locks) dans la boucle d'événements du prochain test qui y accède.
    """
    yield
    channel_layers.backends.clear()
