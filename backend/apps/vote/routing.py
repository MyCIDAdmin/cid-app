"""Routes WebSocket — app vote (branchées dans config/ws_urls.py, SDD §2.3)."""

from django.urls import re_path

from .consumers import VoteConsumer

websocket_urlpatterns = [
    re_path(r"^ws/votes/(?P<session_id>[0-9a-f-]+)/$", VoteConsumer.as_asgi()),
]
