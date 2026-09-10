"""
Modèles — app cotisations.

R1 P0 — Stepper paiement, reçus PDF, relances Celery J-30/7/1 (FDD §3.2, RICEFW W-001/W-002).

Ce module sera implémenté dans une phase ultérieure du planning (voir
CID-PTL-001 v1.2 et CID-RPL-001 v1.1). Le squelette d'app est en place dès
la Phase 0 pour que les migrations et INSTALLED_APPS soient stables dès le
départ.
"""

from django.db import models  # noqa: F401
