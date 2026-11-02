# flake8: noqa: E501
"""Automatische Erinnerungen entlang des Ablaufs (Konzept 3.6, die übrigen Auslöser sind die
Bekanntmachungen und die Mitteilung zur Prüfentscheidung).

Der Plan entsteht aus den Terminen der Wahl und wird bei jeder Änderung nachgezogen, solange eine
Erinnerung noch nicht gesendet wurde. Gesendet wird per Celery-Beat alle 10 Minuten. Der Ausschuss
kann die Kanäle je Erinnerung abschalten (leer = nicht senden). Kanal „app“ ist die Mitteilung in
der App und folgt den persönlichen Einstellungen für Push und Telegram.

Datenschutz: Die Erinnerung an Nichtwähler nutzt nur, ob jemand abgestimmt hat (Teilnahme), nie die
Wahl selbst und nie den Zeitpunkt. Der Text ist für alle gleich."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

from django.conf import settings
from django.utils import timezone

from . import services
from .models import (
    Kandidatur,
    KandidaturStatus,
    Mitteilung,
    MitteilungArt,
    MitteilungStatus,
    Wahl,
    WahlStatus,
)

KANAELE_ERLAUBT = ("app", "mail")
VERSPAETET_NACH = timedelta(hours=6)  # später als das ist die Erinnerung überholt

STANDARD_KANAELE = {
    MitteilungArt.KANDIDATUR_ENDET: ["app"],
    MitteilungArt.RUECKFRAGE_FRIST: ["app", "mail"],
    MitteilungArt.EINSPRUCH_LISTEN: ["app"],
    MitteilungArt.NICHTWAEHLER: ["app"],
    MitteilungArt.WAHL_ENDET: ["app"],
    MitteilungArt.EINSPRUCH_ERGEBNIS: ["app"],
}

ZIELGRUPPE = {
    MitteilungArt.KANDIDATUR_ENDET: "alle",
    MitteilungArt.RUECKFRAGE_FRIST: "kandidat",
    MitteilungArt.EINSPRUCH_LISTEN: "alle",
    MitteilungArt.NICHTWAEHLER: "nichtwaehler",
    MitteilungArt.WAHL_ENDET: "wahlberechtigte",
    MitteilungArt.EINSPRUCH_ERGEBNIS: "alle",
}

# (Titel, Text) je Sprache. Platzhalter: {wahl}, {datum}
TEXTE = {
    MitteilungArt.KANDIDATUR_ENDET: {
        "de": (
            "Kandidatur endet in 3 Tagen",
            "Bei „{wahl}“ kannst du dich noch bis {datum} bewerben.",
        ),
        "fr": (
            "Candidatures : plus que 3 jours",
            "Pour « {wahl} », vous pouvez encore déposer votre candidature jusqu’au {datum}.",
        ),
        "ar": ("ينتهي الترشّح خلال 3 أيام", "يمكنك الترشّح في «{wahl}» حتى {datum}."),
    },
    MitteilungArt.RUECKFRAGE_FRIST: {
        "de": (
            "Rückfrage zu deiner Kandidatur: noch 24 Stunden",
            "Zu „{wahl}“ wartet der Wahlausschuss auf deine Nachbesserung. Frist: {datum}. Danach entscheidet er nach Aktenlage.",
        ),
        "fr": (
            "Question sur votre candidature : encore 24 heures",
            "Pour « {wahl} », la commission attend votre correction. Délai : {datum}. Ensuite elle statue sur dossier.",
        ),
        "ar": (
            "استفسار عن ترشّحك: بقيت 24 ساعة",
            "تنتظر لجنة الانتخابات تعديلك في «{wahl}». المهلة: {datum}. بعدها تبتّ بحسب الملف.",
        ),
    },
    MitteilungArt.EINSPRUCH_LISTEN: {
        "de": (
            "Einspruchsfrist endet morgen",
            "Bei „{wahl}“ läuft die Frist für Einsprüche gegen die Zulassung der Kandidaturen bald ab.",
        ),
        "fr": (
            "Le délai de recours se termine demain",
            "Pour « {wahl} », le délai de recours contre l’admission des candidatures expire bientôt.",
        ),
        "ar": ("تنتهي مهلة الطعن غدًا", "تنتهي قريبًا مهلة الطعن في قبول الترشّحات في «{wahl}»."),
    },
    MitteilungArt.NICHTWAEHLER: {
        "de": (
            "Erinnerung: du hast noch nicht abgestimmt",
            "Die Wahl „{wahl}“ endet am {datum}. Deine Stimme ist geheim und zählt.",
        ),
        "fr": (
            "Rappel : vous n’avez pas encore voté",
            "Le vote « {wahl} » se termine le {datum}. Votre vote est secret et compte.",
        ),
        "ar": (
            "تذكير: لم تصوّت بعد",
            "ينتهي التصويت في «{wahl}» بتاريخ {datum}. صوتك سرّي وله قيمته.",
        ),
    },
    MitteilungArt.WAHL_ENDET: {
        "de": ("Die Wahl endet in 2 Stunden", "Die Wahl „{wahl}“ endet am {datum}."),
        "fr": ("Le vote se termine dans 2 heures", "Le vote « {wahl} » se termine le {datum}."),
        "ar": ("ينتهي التصويت بعد ساعتين", "ينتهي التصويت في «{wahl}» بتاريخ {datum}."),
    },
    MitteilungArt.EINSPRUCH_ERGEBNIS: {
        "de": (
            "Einspruchsfrist gegen das Ergebnis endet in 2 Tagen",
            "Bei „{wahl}“ kannst du noch bis {datum} Einspruch gegen das Ergebnis einlegen.",
        ),
        "fr": (
            "Recours contre le résultat : plus que 2 jours",
            "Pour « {wahl} », vous pouvez former un recours contre le résultat jusqu’au {datum}.",
        ),
        "ar": (
            "تنتهي مهلة الطعن في النتيجة خلال يومين",
            "يمكنك الطعن في نتيجة «{wahl}» حتى {datum}.",
        ),
    },
}


def _zeit(tag: date, stunde: int = 9) -> datetime:
    return timezone.make_aware(datetime.combine(tag, time(stunde, 0)))


def _datum(zeitpunkt: datetime | date, sprache: str) -> str:
    z = timezone.localtime(zeitpunkt) if isinstance(zeitpunkt, datetime) else zeitpunkt
    muster = "%d.%m.%Y %H:%M" if isinstance(z, datetime) else "%d.%m.%Y"
    return z.strftime(muster)


def planen(wahl: Wahl) -> int:
    """Legt die Erinnerungen der Wahl an oder zieht ihre Zeitpunkte nach (nur bei „geplant“).
    Gibt die Zahl der Einträge zurück. Rückfrage und Ergebnis-Einspruch kommen später dazu."""
    termine = {
        MitteilungArt.EINSPRUCH_LISTEN: _zeit(
            wahl.pruefung_bis + timedelta(days=1 + services.EINSPRUCH_TAGE - 1)
        ),
    }
    if (wahl.kandidatur_bis - wahl.kandidatur_von).days >= 3:
        termine[MitteilungArt.KANDIDATUR_ENDET] = _zeit(wahl.kandidatur_bis - timedelta(days=3))
    if wahl.wahl_bis - wahl.wahl_von > timedelta(hours=24):
        termine[MitteilungArt.NICHTWAEHLER] = wahl.wahl_bis - timedelta(hours=24)
    termine[MitteilungArt.WAHL_ENDET] = wahl.wahl_bis - timedelta(hours=2)
    for art, wann in termine.items():
        _eintragen(wahl, art, wann)
    return wahl.mitteilungen.count()


def _eintragen(wahl: Wahl, art: str, wann: datetime, bezug: str = "") -> Mitteilung:
    m, neu = Mitteilung.objects.get_or_create(
        wahl=wahl,
        art=art,
        bezug=bezug,
        defaults={"versand_am": wann, "kanaele": list(STANDARD_KANAELE[art])},
    )
    if not neu and m.status == MitteilungStatus.GEPLANT and m.versand_am != wann:
        m.versand_am = wann
        m.save(update_fields=["versand_am"])
    return m


def rueckfrage_planen(kandidatur: Kandidatur) -> None:
    """24 Stunden vor Ablauf der Nachbesserungsfrist (72 Stunden) erinnern."""
    if kandidatur.nachbesserung_bis:
        _eintragen(
            kandidatur.wahl,
            MitteilungArt.RUECKFRAGE_FRIST,
            kandidatur.nachbesserung_bis - timedelta(hours=24),
            str(kandidatur.id),
        )


def ergebnis_einspruch_planen(wahl: Wahl) -> None:
    ende = services.einspruch_fenster_ende(wahl, "ergebnis", None)
    if ende:
        _eintragen(wahl, MitteilungArt.EINSPRUCH_ERGEBNIS, ende - timedelta(days=2))


def kanaele_setzen(m: Mitteilung, kanaele) -> Mitteilung:
    from rest_framework.exceptions import ValidationError

    if m.status != MitteilungStatus.GEPLANT:
        raise ValidationError({"kanaele": "Diese Erinnerung wurde schon behandelt."})
    if not isinstance(kanaele, list) or not set(kanaele) <= set(KANAELE_ERLAUBT):
        raise ValidationError({"kanaele": "Unbekannter Kanal."})
    m.kanaele = [k for k in KANAELE_ERLAUBT if k in kanaele]
    m.save(update_fields=["kanaele"])
    return m


# --------------------------------------------------------------------------- Versand


def _empfaenger(m: Mitteilung):
    """Konten, die diese Erinnerung bekommen. Nichtwähler: nur ob abgestimmt wurde."""
    from apps.membres.models import Membre
    from apps.vote.models import ParticipationVote

    wahl = m.wahl
    gruppe = ZIELGRUPPE[m.art]
    if gruppe == "alle":
        return services.empfaenger_user(wahl)
    if gruppe == "kandidat":
        k = Kandidatur.objects.filter(pk=m.bezug).select_related("einreicher__user").first()
        if k is None:
            return []
        membres = {k.einreicher_id: k.einreicher}
        for p in k.personen.select_related("membre__user"):
            membres[p.membre_id] = p.membre
        return [x.user for x in membres.values() if x.user]
    session = wahl.vote_session
    if session is None:
        return []
    ids = services._eligible_ids(session)
    if gruppe == "nichtwaehler":
        ids -= set(
            ParticipationVote.objects.filter(session=session).values_list("membre_id", flat=True)
        )
    return [
        x.user for x in Membre.objects.filter(id__in=ids, user__isnull=False).select_related("user")
    ]


def _noch_sinnvoll(m: Mitteilung, jetzt: datetime) -> bool:
    wahl = m.wahl
    if m.art in (MitteilungArt.NICHTWAEHLER, MitteilungArt.WAHL_ENDET):
        s = wahl.vote_session
        return bool(s and s.statut == "ouverte" and jetzt < wahl.wahl_bis)
    if m.art == MitteilungArt.RUECKFRAGE_FRIST:
        k = Kandidatur.objects.filter(pk=m.bezug).first()
        return bool(
            k
            and k.status == KandidaturStatus.RUECKFRAGE
            and k.nachbesserung_bis
            and k.nachbesserung_bis > jetzt
        )
    if m.art == MitteilungArt.EINSPRUCH_ERGEBNIS:
        return wahl.ergebnis_freigegeben_am is not None
    return True


def _frist_text(m: Mitteilung) -> datetime | date:
    wahl = m.wahl
    if m.art == MitteilungArt.KANDIDATUR_ENDET:
        return wahl.kandidatur_bis
    if m.art == MitteilungArt.RUECKFRAGE_FRIST:
        k = Kandidatur.objects.get(pk=m.bezug)
        return k.nachbesserung_bis
    if m.art == MitteilungArt.EINSPRUCH_ERGEBNIS:
        return services.einspruch_fenster_ende(wahl, "ergebnis", None) or wahl.einspruch_bis
    return wahl.wahl_bis


def senden(m: Mitteilung) -> int:
    from apps.notifications.email_cid import Texte, envoyer_email_cid
    from apps.notifications.models import TypeNotification
    from apps.notifications.services import email_module_actif, notifier

    wahl = m.wahl
    frist = _frist_text(m)

    def text(sprache: str) -> tuple[str, str]:
        titel, koerper = TEXTE[m.art][sprache]
        return titel, koerper.format(wahl=wahl.titel, datum=_datum(frist, sprache))

    mail_texte = {s: Texte(titre=text(s)[0], paragraphes=[text(s)[1]]) for s in ("de", "fr", "ar")}
    anzahl = 0
    for user in _empfaenger(m):
        sprache = user.langue_preferee if user.langue_preferee in ("de", "fr", "ar") else "de"
        titel, koerper = text(sprache)
        if "app" in m.kanaele:
            notifier(
                user,
                TypeNotification.COMMUNAUTE_PUBLICATION_IMPORTANTE,
                titre=titel,
                message=koerper,
                lien=f"/wahlen/{wahl.id}",
            )
        if "mail" in m.kanaele and user.email and email_module_actif("vote"):
            envoyer_email_cid(
                sujet=text("de")[0],
                destinataire=user.email,
                textes=mail_texte,
                lien=f"/wahlen/{wahl.id}",
                fusszeile=settings.VEREIN_ANSCHRIFT,
                fail_silently=True,
            )
        anzahl += 1
    return anzahl


def faellige_senden(jetzt: datetime | None = None) -> dict:
    """Beat-Aufgabe: Plan aktualisieren, dann alles Fällige versenden oder als überholt markieren."""
    jetzt = jetzt or timezone.now()
    for wahl in Wahl.objects.exclude(status=WahlStatus.ABGESCHLOSSEN):
        planen(wahl)
    gesendet = uebersprungen = 0
    faellig = Mitteilung.objects.filter(
        status=MitteilungStatus.GEPLANT, versand_am__lte=jetzt
    ).select_related("wahl")
    for m in faellig:
        if m.wahl.status == WahlStatus.ENTWURF and jetzt - m.versand_am <= VERSPAETET_NACH:
            continue  # noch nicht veröffentlicht: bis zur Überholung warten
        sinnvoll = (
            jetzt - m.versand_am <= VERSPAETET_NACH
            and m.wahl.status != WahlStatus.ENTWURF
            and bool(m.kanaele)
            and _noch_sinnvoll(m, jetzt)
        )
        if sinnvoll:
            m.anzahl = senden(m)
            m.status = MitteilungStatus.GESENDET
            m.gesendet_am = jetzt
            gesendet += 1
        else:
            m.status = MitteilungStatus.UEBERSPRUNGEN
            uebersprungen += 1
        m.save(update_fields=["anzahl", "status", "gesendet_am"])
    return {"gesendet": gesendet, "uebersprungen": uebersprungen}


# --------------------------------------------------------------------------- Plan für den Ausschuss

BEKANNTMACHUNG_ZIELGRUPPE = {
    "ankuendigung": "alle",
    "aufruf": "alle",
    "zugelassen": "alle",
    "wahlbeginn": "alle",
    "ergebnis": "alle",
}


def plan(wahl: Wahl) -> list[dict]:
    """Alle Auslöser der Wahl in zeitlicher Reihenfolge: Bekanntmachungen (Text vom Ausschuss),
    automatische Erinnerungen und die Mitteilung zur Prüfentscheidung."""
    planen(wahl)
    zeilen: list[dict] = []
    for bk in wahl.bekanntmachungen.all():
        zeilen.append(
            {
                "typ": "bekanntmachung",
                "id": str(bk.id),
                "art": bk.schluessel,
                "bezug_name": "",
                "versand_am": bk.versand_am,
                "zielgruppe": BEKANNTMACHUNG_ZIELGRUPPE.get(bk.schluessel, "alle"),
                "kanaele": [k for k in bk.kanaele if k in KANAELE_ERLAUBT],
                "status": "gesendet" if bk.status == "gesendet" else "geplant",
                "anzahl": None,
                "kanaele_aenderbar": False,
            }
        )
    namen = {
        str(k.id): k.name for k in wahl.kandidaturen.filter(status=KandidaturStatus.RUECKFRAGE)
    }
    for m in wahl.mitteilungen.all():
        zeilen.append(
            {
                "typ": "erinnerung",
                "id": str(m.id),
                "art": m.art,
                "bezug_name": namen.get(m.bezug, "") if m.bezug else "",
                "versand_am": m.versand_am,
                "zielgruppe": ZIELGRUPPE[m.art],
                "kanaele": m.kanaele,
                "status": m.status,
                "anzahl": m.anzahl if m.status == MitteilungStatus.GESENDET else None,
                "kanaele_aenderbar": m.status == MitteilungStatus.GEPLANT,
            }
        )
    zeilen.append(
        {
            "typ": "ereignis",
            "id": "",
            "art": "pruef_entscheidung",
            "bezug_name": "",
            "versand_am": None,
            "zielgruppe": "kandidat",
            "kanaele": ["app"],
            "status": "ereignis",
            "anzahl": None,
            "kanaele_aenderbar": False,
        }
    )
    zeilen.sort(key=lambda z: (z["versand_am"] is None, z["versand_am"]))
    return zeilen
