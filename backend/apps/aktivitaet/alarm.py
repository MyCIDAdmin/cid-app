"""Auffälligkeiten speichern und App-Admins benachrichtigen (Release 22).

Pro Lauf höchstens eine Meldung je App-Admin (Glocke, Sprache des Empfängers) mit allen neuen
Funden ; E-Mail nur, wenn der App-Admin sie für das Modul „Aktivität“ nicht abgeschaltet hat
(`email_module_actif("aktivitaet")`) — die Glocke bleibt davon unberührt.
"""

import logging

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.accounts.models import Role, User
from apps.notifications.email_cid import Texte, envoyer_email_cid
from apps.notifications.models import TypeNotification
from apps.notifications.services import email_module_actif, notifier

from . import regeln
from .models import Auffaelligkeit

logger = logging.getLogger("apps.aktivitaet")

LINK = "/admin/roles?tab=aktivitaet&ansicht=auffaelligkeiten"
MAX_ZEILEN = 5


def speichern(funde) -> list[Auffaelligkeit]:
    """Neue Funde anlegen (bekannte `(regel, schluessel)` werden übersprungen)."""
    neu = []
    for f in funde:
        try:
            with transaction.atomic():
                neu.append(
                    Auffaelligkeit.objects.create(
                        regel=f["regel"],
                        schluessel=f["schluessel"],
                        gewicht=f["gewicht"],
                        user=f["user"],
                        ip_address=f["ip"],
                        details=f["details"],
                    )
                )
        except IntegrityError:
            continue
    return neu


def _sprache(user) -> str:
    return "fr" if getattr(user, "langue_preferee", "") == "fr" else "de"


def _zeilen(neu, sprache) -> list[str]:
    zeilen = [regeln.text_von(a.regel, a.details)[sprache] for a in neu[:MAX_ZEILEN]]
    rest = len(neu) - MAX_ZEILEN
    if rest > 0:
        zeilen.append(f"+ {rest} weitere" if sprache == "de" else f"+ {rest} autres")
    return zeilen


def melden(neu: list[Auffaelligkeit]) -> int:
    """Benachrichtigt alle aktiven App-Admins ; gibt die Zahl der Empfänger zurück."""
    if not neu:
        return 0
    empfaenger = list(User.objects.filter(role=Role.SUPER_ADMIN, is_active=True))
    wichtig = any(a.gewicht == "wichtig" for a in neu)
    mail_an = email_module_actif("aktivitaet")
    for user in empfaenger:
        sprache = _sprache(user)
        zeilen = _zeilen(neu, sprache)
        if sprache == "fr":
            titel = f"{len(neu)} anomalie(s) dans le journal d'activité"
        else:
            titel = f"{len(neu)} Auffälligkeit(en) im Aktivitätsprotokoll"
        notifier(
            user,
            TypeNotification.AKTIVITAET_AUFFAELLIGKEIT,
            titre=titel,
            message="\n".join(zeilen),
            lien=LINK,
        )
        if mail_an and user.email:
            _mail(user, neu, wichtig)
    return len(empfaenger)


def _mail(user, neu, wichtig) -> None:
    de = _zeilen(neu, "de")
    fr = _zeilen(neu, "fr")
    textes = {
        "de": Texte(
            titre=f"{len(neu)} Auffälligkeit(en) im Aktivitätsprotokoll",
            paragraphes=de,
            cta="Protokoll öffnen",
        )
    }
    if _sprache(user) == "fr":
        textes["fr"] = Texte(
            titre=f"{len(neu)} anomalie(s) dans le journal d'activité",
            paragraphes=fr,
            cta="Ouvrir le journal",
        )
    prefix = "[CID] Wichtig: " if wichtig else "[CID] "
    envoyer_email_cid(
        sujet=f"{prefix}{len(neu)} Auffälligkeit(en) im Aktivitätsprotokoll",
        destinataire=user.email,
        textes=textes,
        lien=LINK,
        fail_silently=True,
    )


def lauf(jetzt=None) -> dict:
    """Regeln prüfen, neue Funde speichern, App-Admins melden."""
    jetzt = jetzt or timezone.now()
    neu = speichern(regeln.pruefen(jetzt))
    empfaenger = melden(neu)
    return {"neu": len(neu), "empfaenger": empfaenger}
