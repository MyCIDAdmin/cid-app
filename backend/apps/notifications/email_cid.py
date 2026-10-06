"""
E-Mail im CID-Layout — Demande utilisateur du 2026-10-06 (point 5) : "Die Email Benachrichtigung
schöner gestalten mit CID Logo und auf Deutsch, Französisch und Arabisch in einer Mail
schreiben. Die Hauptsprache ist aber Deutsch".

Une seule mail multipart (texte brut + HTML), trois blocs de langue dans l'ordre fixe
DE (principal, mis en avant) → FR → AR (rtl). Logo = image déjà servie par le frontend
(`/brand/logo-cid-couleur.png`) avec `alt=""` : si un client de messagerie ou Brevo ne la charge
pas (voir apps.boutique.emails pour l'historique des échecs de logo en production), l'en-tête reste
net grâce au nom en texte à côté — jamais d'icône d'image cassée avec texte alternatif.

Usage :
    envoyer_email_cid(
        sujet="Neues Event: …",             # sujet (langue principale, FR en suffixe auto)
        destinataire=user.email,
        textes={"de": Texte(titre=…, paragraphes=[…], details=[(label, valeur)], cta="Öffnen"),
                "fr": Texte(…), "ar": Texte(…)},
        lien="/evenements?evenement=…",     # chemin relatif au frontend, optionnel
    )
Les langues manquantes sont simplement omises (DE est obligatoire).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from urllib.parse import urlparse

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.html import strip_tags

ORDRE = ("de", "fr", "ar")
LANGUE_LABEL = {"de": "Deutsch", "fr": "Français", "ar": "العربية"}


@dataclass
class Texte:
    titre: str
    paragraphes: list[str] = field(default_factory=list)
    details: list[tuple[str, str]] = field(default_factory=list)
    cta: str = ""


def _bloc(langue: str, texte: Texte) -> dict:
    rtl = langue == "ar"
    return {
        "langue_label": LANGUE_LABEL[langue],
        "dir": "rtl" if rtl else "ltr",
        "align": "right" if rtl else "left",
        "titre": texte.titre,
        "paragraphes": texte.paragraphes,
        "details": texte.details,
        "cta_label": texte.cta,
    }


def construire_email_cid(
    *, sujet: str, textes: dict[str, Texte], lien: str = ""
) -> tuple[str, str]:
    """Retourne (corps texte brut, corps HTML)."""
    if "de" not in textes:
        raise ValueError("Le texte allemand (langue principale) est obligatoire.")
    base = settings.FRONTEND_URL.rstrip("/")
    cta_url = f"{base}{lien}" if lien else ""
    blocs = [_bloc(lg, textes[lg]) for lg in ORDRE if lg in textes]
    html = render_to_string(
        "notifications/email_cid.html",
        {
            "sujet": sujet,
            "preheader": textes["de"].titre,
            "blocs": blocs,
            "cta_url": cta_url,
            "logo_url": f"{base}/brand/logo-cid-couleur.png",
            "site_url": base,
            "site_host": urlparse(base).netloc or base,
        },
    )
    parties = []
    for lg in ORDRE:
        if lg not in textes:
            continue
        t = textes[lg]
        lignes = [t.titre, "", *t.paragraphes]
        lignes += [f"{a}: {b}" for a, b in t.details]
        if t.cta and cta_url:
            lignes.append(f"{t.cta}: {cta_url}")
        parties.append(strip_tags("\n".join(lignes)))
    return "\n\n———\n\n".join(parties), html


def envoyer_email_cid(
    *,
    sujet: str,
    destinataire: str,
    textes: dict[str, Texte],
    lien: str = "",
    fail_silently: bool = False,
) -> int:
    corps_texte, corps_html = construire_email_cid(sujet=sujet, textes=textes, lien=lien)
    message = EmailMultiAlternatives(
        subject=sujet,
        body=corps_texte,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[destinataire],
    )
    message.attach_alternative(corps_html, "text/html")
    return message.send(fail_silently=fail_silently)
