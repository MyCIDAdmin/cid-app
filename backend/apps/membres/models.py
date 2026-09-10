"""
Modèles — app membres.

R1 P0 — CRUD membres, 5 rôles RBAC, chiffrement CIN/passeport AES-256, import Excel (FDD §3.1,
RICEFW C-001/W-008).

Ce module sera implémenté dans une phase ultérieure du planning (voir
CID-PTL-001 v1.2 et CID-RPL-001 v1.1). Le squelette d'app est en place dès
la Phase 0 pour que les migrations et INSTALLED_APPS soient stables dès le
départ.
"""

from django.db import models  # noqa: F401
