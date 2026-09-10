"""
Modèles — app notifications.

R1 P0 — Modèle notification in-app + tâches Celery email (11 types R1) (RICEFW W-001 à W-010).

Ce module sera implémenté dans une phase ultérieure du planning (voir
CID-PTL-001 v1.2 et CID-RPL-001 v1.1). Le squelette d'app est en place dès
la Phase 0 pour que les migrations et INSTALLED_APPS soient stables dès le
départ.
"""

from django.db import models  # noqa: F401
