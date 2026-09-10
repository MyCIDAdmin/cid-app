"""
Modèles — app vote.

R1 P1 — Sessions temps réel, WebSocket Django Channels, anonymat HMAC-SHA256 (FDD §3.5, SCD §7.5).

Ce module sera implémenté dans une phase ultérieure du planning (voir
CID-PTL-001 v1.2 et CID-RPL-001 v1.1). Le squelette d'app est en place dès
la Phase 0 pour que les migrations et INSTALLED_APPS soient stables dès le
départ.
"""

from django.db import models  # noqa: F401
