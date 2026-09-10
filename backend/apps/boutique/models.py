"""
Modèles — app boutique.

R1 P1 — Catalogue, panier, commandes 7 statuts, stock atomique SELECT FOR UPDATE (FDD §3.4).

Ce module sera implémenté dans une phase ultérieure du planning (voir
CID-PTL-001 v1.2 et CID-RPL-001 v1.1). Le squelette d'app est en place dès
la Phase 0 pour que les migrations et INSTALLED_APPS soient stables dès le
départ.
"""

from django.db import models  # noqa: F401
