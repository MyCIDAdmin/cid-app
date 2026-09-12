"""
Anonymat cryptographique du vote — HMAC-SHA256 (SCD §7.5, FDD §3.5/§5.2, RICEFW E-002).

Le token votant est calculé, jamais stocké en clair, et sert lui-même de "hash" stocké en
base (`VoteExprime.voter_token_hash`) : un HMAC gardé secret (la clé `sel` n'est jamais
exposée hors de ce module et de VoteSession.anonymat_sel, stocké chiffré en base) est déjà
irréversible sans cette clé — SCD §7.5 "Seul le hash du token est stocké en base — pas le
token lui-même" est donc respecté : ce que nous appelons `voter_token_hash` ici EST déjà ce
hash irréversible, obtenu en une seule opération HMAC-SHA256 plutôt qu'en calculant un
token puis en le hashant une seconde fois (étape redondante : HMAC-SHA256 avec une clé
secrète offre déjà cette garantie d'irréversibilité).

Générer secrets.token_hex(32) donne une chaîne hexadécimale de 64 caractères — la longueur
exacte exigée par SCD §7.5 ("chaîne aléatoire 64 chars") pour `anonymat_sel`.
"""

import hashlib
import hmac
import secrets


def generer_anonymat_sel() -> str:
    """Sel cryptographique aléatoire, unique par session (SCD §7.5) — 64 caractères hex."""
    return secrets.token_hex(32)


def compute_voter_token(membre_id, session_id, sel: str) -> str:
    """voter_token = HMAC-SHA256(clé=sel, msg="{membre_id}:{session_id}") (SCD §7.5).

    Déterministe pour un (membre, session) donné — permet de détecter un double vote sans
    jamais stocker ni exposer membre_id. Deux sessions différentes utilisant des sels
    différents produisent des tokens sans aucune corrélation possible entre elles, même
    pour un même membre (chaque session a son propre espace cryptographique)."""
    message = f"{membre_id}:{session_id}".encode("utf-8")
    return hmac.new(sel.encode("utf-8"), message, hashlib.sha256).hexdigest()
