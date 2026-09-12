"""
Modèles — app stats.

Ce module n'a délibérément aucun modèle : les 3 onglets R1 (Financier/Membres/Événements,
FDD §5.3) sont des agrégations en lecture seule sur les modèles d'autres apps (cotisations,
adhesions, boutique, evenements, membres) — voir services.py. Rien à persister ici tant qu'aucun
export planifié (R-001, Celery Beat) ni cache de KPI n'est introduit.
"""

from django.db import models  # noqa: F401
