"""Erinnerungen an Termine (alle 30 Minuten per Celery Beat)."""

from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from .models import Antwort, Dienst, Kreis, Termin, TerminStatus
from .services import naechster_start, team_nutzer


@shared_task
def termin_erinnerungen() -> int:
    """Benachrichtigt Eingeladene (außer Absagen) und Ersteller `erinnerung_stunden` vor dem
    nächsten Beginn — je Vorkommen genau einmal. Gibt die Zahl der Termine zurück."""
    from apps.notifications.models import TypeNotification
    from apps.notifications.services import notifier

    jetzt = timezone.now()
    anzahl = 0
    kandidaten = Termin.objects.filter(
        status=TerminStatus.FREIGEGEBEN, erinnerung_stunden__isnull=False
    ).select_related("erstellt_von")
    for t in kandidaten:
        start = naechster_start(t, jetzt)
        if start is None or start - timedelta(hours=t.erinnerung_stunden) > jetzt:
            continue
        if t.letzte_erinnerung and t.letzte_erinnerung >= start - timedelta(
            hours=t.erinnerung_stunden
        ):
            continue
        empfaenger = {t.erstellt_von}
        for e in t.einladungen.exclude(antwort=Antwort.ABSAGE).select_related("user"):
            empfaenger.add(e.user)
        if t.kreis == Kreis.EVENT_TEAM:
            empfaenger |= team_nutzer(t)
        zeit = timezone.localtime(start).strftime("%d.%m.%Y %H:%M")
        for user in empfaenger:
            notifier(
                user,
                TypeNotification.EVENEMENT_RAPPEL,
                titre=f"Erinnerung: {t.titel}",
                message=f"{t.titel} beginnt am {zeit}.",
                lien="/kalender",
            )
        t.letzte_erinnerung = jetzt
        t.save(update_fields=["letzte_erinnerung"])
        anzahl += 1
    return anzahl + _dienst_erinnerungen(jetzt)


def _dienst_erinnerungen(jetzt) -> int:
    """Erinnerung an eingetragene Helfer `erinnerung_stunden` vor dem Dienst (einmalig)."""
    from apps.notifications.models import TypeNotification
    from apps.notifications.services import notifier

    anzahl = 0
    for d in Dienst.objects.filter(
        erinnerung_stunden__isnull=False, letzte_erinnerung__isnull=True, beginn__gt=jetzt
    ):
        if d.beginn - timedelta(hours=d.erinnerung_stunden) > jetzt:
            continue
        zeit = timezone.localtime(d.beginn).strftime("%d.%m.%Y %H:%M")
        for e in d.eintraege.select_related("user"):
            notifier(
                e.user,
                TypeNotification.EVENEMENT_RAPPEL,
                titre=f"Dienst: {d.titel}",
                message=f"Dein Dienst „{d.titel}“ beginnt am {zeit}.",
                lien="/kalender",
            )
        d.letzte_erinnerung = jetzt
        d.save(update_fields=["letzte_erinnerung"])
        anzahl += 1
    return anzahl


WOCHENTAGE = {
    "de": ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
    "fr": ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"],
}
WOCHENMAIL = {
    "de": {
        "sujet": "Deine Woche im CID",
        "titre": "Deine Woche",
        "intro": "Hallo {prenom}, das steht diese Woche an:",
        "cta": "Kalender öffnen",
        "mehr": "… und {n} weitere im Kalender",
    },
    "fr": {
        "sujet": "Votre semaine au CID",
        "titre": "Votre semaine",
        "intro": "Bonjour {prenom}, voici votre programme de la semaine :",
        "cta": "Ouvrir le calendrier",
        "mehr": "… et {n} autres dans le calendrier",
    },
}
WOCHENMAIL_MAX = 30


def _wochenmail_eintraege(user, von, bis) -> list[dict]:
    from .eintraege import baue_eintraege
    from .services import zugang

    z = zugang(user)
    ansichten = ["meine"]
    if z["verein"]:
        ansichten.append("verein")
    if z["buero"]:
        ansichten.append("buero")
    gesehen, ergebnis = set(), []
    for ansicht in ansichten:
        for e in baue_eintraege(user, ansicht, von, bis):
            if e["id"] in gesehen or not von <= e["beginn"] < bis:
                continue
            gesehen.add(e["id"])
            ergebnis.append(e)
    ergebnis.sort(key=lambda e: e["beginn"])
    return ergebnis


def _zeile(e, langue) -> tuple[str, str]:
    beginn = timezone.localtime(e["beginn"])
    tag = WOCHENTAGE[langue][beginn.weekday()] + beginn.strftime(" %d.%m.")
    if not e.get("ganztaegig"):
        tag += beginn.strftime(" %H:%M")
    titel = e["titel"]
    if e.get("ort"):
        titel += f" ({e['ort']})"
    return tag, titel


@shared_task
def wochenuebersicht() -> int:
    """Montags : Termine, Aufgaben und Dienste der Woche per E-Mail an alle, die es in ihren
    Einstellungen eingeschaltet haben. Wochen ohne Einträge werden übersprungen. Gibt die Zahl
    der gesendeten Mails zurück."""
    from django.conf import settings

    from apps.accounts.models import User
    from apps.notifications.email_cid import Texte, envoyer_email_cid

    heute = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
    von, bis = heute, heute + timedelta(days=7)
    gesendet = 0
    empfaenger = User.objects.filter(
        is_active=True, ui_praeferenzen__kalender_wochenmail=True
    ).exclude(email="")
    for user in empfaenger:
        eintraege = _wochenmail_eintraege(user, von, bis)
        if not eintraege:
            continue
        langue = user.langue_preferee if user.langue_preferee in WOCHENMAIL else "de"
        prenom = getattr(getattr(user, "membre", None), "prenom", "")
        textes = {}
        for sprache in dict.fromkeys(["de", langue]):  # Deutsch ist Pflicht
            t = WOCHENMAIL[sprache]
            absaetze = [t["intro"].format(prenom=prenom)]
            if len(eintraege) > WOCHENMAIL_MAX:
                absaetze.append(t["mehr"].format(n=len(eintraege) - WOCHENMAIL_MAX))
            textes[sprache] = Texte(
                titre=t["titre"],
                paragraphes=absaetze,
                details=[_zeile(e, sprache) for e in eintraege[:WOCHENMAIL_MAX]],
                cta=t["cta"],
            )
        envoyer_email_cid(
            sujet=WOCHENMAIL[langue]["sujet"],
            destinataire=user.email,
            textes=textes,
            lien=f"{settings.FRONTEND_URL}/kalender",
            fail_silently=True,
        )
        gesendet += 1
    return gesendet
