"""
Routes WebSocket globales. Chaque app ajoute ses propres routes ici au fur
et à mesure de son implémentation (Phase 3 : vote, Phase R2 : communaute).
"""

from apps.communaute.routing import websocket_urlpatterns as communaute_ws
from apps.vote.routing import websocket_urlpatterns as vote_ws

websocket_urlpatterns = [*vote_ws, *communaute_ws]
