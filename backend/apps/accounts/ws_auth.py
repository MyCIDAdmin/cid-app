"""
Authentification JWT pour les connexions WebSocket (Django Channels).
Utilisé dès la Phase 3 (Vote temps réel) — ws://app/ws/votes/{id}/?token=JWT
(SDD §2.3, TDD Phase 3). Mis en place dès la Phase 0 pour que l'ASGI app
soit stable.
"""

from urllib.parse import parse_qs

from channels.auth import AuthMiddlewareStack
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken


@database_sync_to_async
def get_user_from_token(token: str):
    from django.contrib.auth import get_user_model

    User = get_user_model()
    try:
        validated = AccessToken(token)
        user = User.objects.get(id=validated["user_id"], is_active=True)
        return user
    except Exception:
        return AnonymousUser()


class JWTAuthMiddleware:
    """Authentifie la connexion WebSocket via ?token=<JWT access token>."""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        query_string = scope.get("query_string", b"").decode()
        token = parse_qs(query_string).get("token", [None])[0]
        scope["user"] = await get_user_from_token(token) if token else AnonymousUser()
        return await self.inner(scope, receive, send)


def JWTAuthMiddlewareStack(inner):
    return JWTAuthMiddleware(AuthMiddlewareStack(inner))
