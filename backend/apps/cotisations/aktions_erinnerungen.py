"""Erinnerungen an Beitragsaktionen (Wunsch Ghazi, 2026-10-25).

Zwei Regeln, je Aktion mit eingeschalteten Erinnerungen (`ArticleCatalogue.erinnerungen`) :

  FRIST_BALD  höchstens 3 Tage vor Fristende (und noch nicht abgelaufen),
  ZIEL_FAST   ab 80 % des Zielbetrags (und noch nicht erreicht, Frist noch nicht abgelaufen).

Empfänger sind aktive Mitglieder mit Konto, die zu dieser Aktion noch nichts beigetragen haben
(weder bezahlt noch als offene Überweisung). Kanäle : E-Mail (nur wenn das Modul „Cotisations“
E-Mails sendet), Glocke in der App und, bei verbundenem Konto, Telegram (beides über `notifier`).
Je Aktion, Person und Regel wird nur einmal erinnert (Protokoll `AktionsErinnerung`)."""

import logging
from datetime import date
from decimal import Decimal

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from apps.membres.models import Membre, StatutMembre
from apps.notifications.models import TypeNotification
from apps.notifications.services import email_module_actif, notifier

from .models import AktionsErinnerung, AktionsRegel, ArticleCatalogue, StatutCotisation

logger = logging.getLogger(__name__)

TAGE_VOR_FRIST = 3
ZIEL_SCHWELLE = Decimal("0.8")

TEXTE = {
    "de": {
        AktionsRegel.FRIST_BALD: {
            "sujet": "Noch {tage} — Beitrag „{titel}“",
            "corps": (
                "Hallo {prenom},\n\n"
                "die Aktion „{titel}“ endet am {frist}. "
                "Bisher wurden {gesammelt} € gesammelt{ziel}."
                "\n\nDu kannst in der App unter „Beitrag“ mitmachen: {link}\n\n"
                "Danke für deine Unterstützung!\n\nDas Team von Clubistes in Deutschland"
            ),
            "titel": "Bald Fristende: {titel}",
            "meldung": "Die Aktion endet am {frist}. Mach mit!",
        },
        AktionsRegel.ZIEL_FAST: {
            "sujet": "Fast geschafft — „{titel}“",
            "corps": (
                "Hallo {prenom},\n\n"
                "bei der Aktion „{titel}“ sind schon {gesammelt} € von {zielbetrag} € erreicht. "
                "Es fehlen nur noch {fehlt} €.\n\n"
                "Mit deinem Beitrag helfen wir, das Ziel zu erreichen: {link}\n\n"
                "Danke für deine Unterstützung!\n\nDas Team von Clubistes in Deutschland"
            ),
            "titel": "Fast geschafft: {titel}",
            "meldung": "Es fehlen nur noch {fehlt} €. Mach mit!",
        },
    },
    "fr": {
        AktionsRegel.FRIST_BALD: {
            "sujet": "Plus que {tage} — contribution « {titel} »",
            "corps": (
                "Bonjour {prenom},\n\n"
                "l'action « {titel} » se termine le {frist}. {gesammelt} € ont déjà été "
                "collectés{ziel}.\n\n"
                "Vous pouvez participer dans l'application, rubrique « Contribution » : {link}"
                "\n\nMerci de votre soutien !\n\nL'équipe Clubistes in Deutschland"
            ),
            "titel": "Bientôt la date limite : {titel}",
            "meldung": "L'action se termine le {frist}. Participez !",
        },
        AktionsRegel.ZIEL_FAST: {
            "sujet": "Presque atteint — « {titel} »",
            "corps": (
                "Bonjour {prenom},\n\n"
                "pour l'action « {titel} », {gesammelt} € sur {zielbetrag} € sont déjà atteints. "
                "Il ne manque plus que {fehlt} €.\n\n"
                "Votre contribution nous aide à atteindre l'objectif : {link}\n\n"
                "Merci de votre soutien !\n\nL'équipe Clubistes in Deutschland"
            ),
            "titel": "Presque atteint : {titel}",
            "meldung": "Il ne manque plus que {fehlt} €. Participez !",
        },
    },
}


def _euro(wert: Decimal, sprache: str) -> str:
    """Betrag mit Dezimalkomma (de und fr)."""
    return f"{wert:.2f}".replace(".", ",")


def _datum(tag: date, sprache: str) -> str:
    return tag.strftime("%d.%m.%Y")


def faellige_regeln(artikel: ArticleCatalogue, heute: date) -> list[str]:
    """Welche Regeln gelten für diese Aktion heute ? (Ohne Rücksicht auf bereits Erinnerte.)"""
    regeln = []
    if artikel.frist is not None and 0 <= (artikel.frist - heute).days <= TAGE_VOR_FRIST:
        regeln.append(AktionsRegel.FRIST_BALD)
    if artikel.zielbetrag and not (artikel.frist is not None and artikel.frist < heute):
        summe, _anzahl = artikel.fortschritt()
        if ZIEL_SCHWELLE * artikel.zielbetrag <= summe < artikel.zielbetrag:
            regeln.append(AktionsRegel.ZIEL_FAST)
    return regeln


def _empfaenger(artikel: ArticleCatalogue):
    """Aktive Mitglieder mit Konto, die noch keinen bezahlten oder offenen Beitrag leisteten."""
    beteiligt = artikel.cotisations.filter(
        statut__in=[StatutCotisation.PAYEE, StatutCotisation.EN_ATTENTE]
    ).values("membre_id")
    return (
        Membre.objects.filter(statut=StatutMembre.ACTIF, user__isnull=False)
        .exclude(id__in=beteiligt)
        .select_related("user")
    )


def _kontext(artikel: ArticleCatalogue, membre, sprache: str, heute: date) -> dict:
    summe, _anzahl = artikel.fortschritt()
    fehlt = max(Decimal(0), (artikel.zielbetrag or Decimal(0)) - summe)
    ziel = ""
    if artikel.zielbetrag:
        satz = " von {z} € Ziel" if sprache == "de" else " sur {z} € d'objectif"
        ziel = satz.format(z=_euro(artikel.zielbetrag, sprache))
    tage = (artikel.frist - heute).days if artikel.frist else 0
    if sprache == "de":
        tage_text = "heute" if tage == 0 else f"{tage} Tag{'e' if tage != 1 else ''}"
    else:
        tage_text = "aujourd'hui" if tage == 0 else f"{tage} jour{'s' if tage != 1 else ''}"
    return {
        "prenom": membre.prenom,
        "titel": artikel.libelle,
        "frist": _datum(artikel.frist, sprache) if artikel.frist else "",
        "tage": tage_text,
        "gesammelt": _euro(summe, sprache),
        "zielbetrag": _euro(artikel.zielbetrag, sprache) if artikel.zielbetrag else "",
        "fehlt": _euro(fehlt, sprache),
        "ziel": ziel,
        "link": f"{settings.FRONTEND_URL.rstrip('/')}/cotisation?aktion={artikel.id}",
    }


def _erinnere(artikel: ArticleCatalogue, regel: str, heute: date) -> int:
    gesendet = 0
    bereits = set(
        AktionsErinnerung.objects.filter(artikel=artikel, regel=regel).values_list(
            "membre_id", flat=True
        )
    )
    for membre in _empfaenger(artikel):
        if membre.id in bereits:
            continue
        user = membre.user
        sprache = "fr" if getattr(user, "langue_preferee", "") == "fr" else "de"
        texte = TEXTE[sprache][regel]
        kontext = _kontext(artikel, membre, sprache, heute)

        mail_ok = True
        if user.email and email_module_actif("cotisations"):
            mail_ok = bool(
                send_mail(
                    subject=texte["sujet"].format(**kontext),
                    message=texte["corps"].format(**kontext),
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[user.email],
                    fail_silently=True,
                )
            )
        if not mail_ok:
            logger.warning(
                "erinnere_beitragsaktionen: Mail fehlgeschlagen artikel=%s membre=%s",
                artikel.id,
                membre.id,
            )
            continue  # nicht protokollieren : beim nächsten Lauf erneut versuchen
        AktionsErinnerung.objects.create(artikel=artikel, membre=membre, regel=regel)
        notifier(
            user,
            (
                TypeNotification.AKTION_FRIST
                if regel == AktionsRegel.FRIST_BALD
                else TypeNotification.AKTION_ZIEL
            ),
            titre=texte["titel"].format(**kontext),
            message=texte["meldung"].format(**kontext),
            lien=f"/cotisation?aktion={artikel.id}",
        )
        gesendet += 1
    return gesendet


def erinnere_beitragsaktionen(heute: date | None = None) -> dict:
    """Läuft täglich (Celery Beat). `heute` nur für Tests."""
    heute = heute or timezone.localdate()
    details = []
    aktionen = ArticleCatalogue.objects.filter(
        actif=True, erinnerungen=True, type_fixe__isnull=True
    )
    for artikel in aktionen:
        for regel in faellige_regeln(artikel, heute):
            anzahl = _erinnere(artikel, regel, heute)
            details.append({"artikel": str(artikel.id), "regel": regel, "gesendet": anzahl})
            logger.info(
                "erinnere_beitragsaktionen: artikel=%s regel=%s gesendet=%s",
                artikel.id,
                regel,
                anzahl,
            )
    return {"details": details, "gesendet": sum(d["gesendet"] for d in details)}
