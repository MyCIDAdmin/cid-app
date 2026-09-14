"""Routes WebSocket — app communaute : Messagerie privée + Groupes de chat, puis Live Match
(Phase 4B) — branchées dans config/ws_urls.py, même convention que apps.vote.routing."""

from django.urls import re_path

from .consumers import GroupeChatConsumer, LiveMatchConsumer, MessagerieConsumer

websocket_urlpatterns = [
    re_path(r"^ws/messagerie/(?P<conversation_id>[0-9a-f-]+)/$", MessagerieConsumer.as_asgi()),
    re_path(r"^ws/groupes/(?P<groupe_id>[0-9a-f-]+)/$", GroupeChatConsumer.as_asgi()),
    re_path(r"^ws/live/(?P<match_id>[0-9a-f-]+)/$", LiveMatchConsumer.as_asgi()),
]
