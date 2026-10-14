"""Erinnerungen an Termine (alle 30 Minuten per Celery Beat)."""

from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from .benachrichtigung import T, datum, mail_aktiv, melden, wann
from .models import Antwort, Dienst, Kreis, Termin, TerminStatus
from .models_sitzung import Terminstimme, Terminumfrage, UmfrageStatus
from .services import naechster_start, team_nutzer


@shared_task
def termin_erinnerungen() -> int:
    """Benachrichtigt Eingeladene (außer Absagen) und Ersteller `erinnerung_stunden` vor dem
    nächsten Beginn — je Vorkommen genau einmal. Gibt die Zahl der Termine zurück."""
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
        zeit = wann(start)
        for user in empfaenger:
            melden(
                user,
                T.EVENEMENT_RAPPEL,
                de=(f"Erinnerung: {t.titel}", f"{t.titel} beginnt am {zeit}."),
                fr=(f"Rappel : {t.titel}", f"{t.titel} commence le {zeit}."),
            )
        t.letzte_erinnerung = jetzt
        t.save(update_fields=["letzte_erinnerung"])
        anzahl += 1
    return anzahl + _dienst_erinnerungen(jetzt)


def _dienst_erinnerungen(jetzt) -> int:
    """Erinnerung an eingetragene Helfer `erinnerung_stunden` vor dem Dienst (einmalig)."""
    anzahl = 0
    for d in Dienst.objects.filter(
        erinnerung_stunden__isnull=False, letzte_erinnerung__isnull=True, beginn__gt=jetzt
    ):
        if d.beginn - timedelta(hours=d.erinnerung_stunden) > jetzt:
            continue
        zeit = wann(d.beginn)
        for e in d.eintraege.select_related("user"):
            melden(
                e.user,
                T.EVENEMENT_RAPPEL,
                de=(f"Dienst: {d.titel}", f"Dein Dienst „{d.titel}“ beginnt am {zeit}."),
                fr=(
                    f"Permanence : {d.titel}",
                    f"Ta permanence « {d.titel} » commence le {zeit}.",
                ),
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
            if e["id"] in gesehen or e.get("ausgeblendet") or not von <= e["beginn"] < bis:
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

    if not mail_aktiv():  # Modulschalter „Kalender“ (App-Admin)
        return 0
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


@shared_task
def umfrage_erinnerungen() -> int:
    """Täglich : (1) Wer in einer offenen Terminfindung noch nicht geantwortet hat, wird am Tag
    vor und am Tag der Antwortfrist erinnert ; (2) nach Ablauf der Frist erfährt der Ersteller
    einmalig, dass er entscheiden kann. Gibt die Zahl der Meldungen zurück."""
    heute = timezone.localdate()
    anzahl = 0
    offene = Terminumfrage.objects.filter(
        status=UmfrageStatus.OFFEN, antwort_bis__isnull=False
    ).select_related("erstellt_von")
    for u in offene:
        stimmten = set(
            Terminstimme.objects.filter(option__umfrage=u).values_list("user_id", flat=True)
        )
        if u.antwort_bis >= heute:
            if u.antwort_bis - heute > timedelta(days=1) or u.erinnert_am == heute:
                continue
            for user in u.teilnehmer.filter(is_active=True).exclude(pk__in=stimmten):
                wer = "heute" if u.antwort_bis == heute else "morgen"
                wer_fr = "aujourd'hui" if u.antwort_bis == heute else "demain"
                melden(
                    user,
                    T.KALENDER_UMFRAGE,
                    de=(
                        f"Bitte antworten: {u.titel}",
                        f"Die Terminfindung endet {wer} ({datum(u.antwort_bis)}). Bitte gib an, "
                        "wann du kannst.",
                    ),
                    fr=(
                        f"Merci de répondre : {u.titel}",
                        f"Le sondage de date se termine {wer_fr} ({datum(u.antwort_bis)}). "
                        "Indique quand tu es disponible.",
                    ),
                    mail=True,
                )
                anzahl += 1
            u.erinnert_am = heute
            u.save(update_fields=["erinnert_am"])
        elif not u.frist_gemeldet:
            fehlen = u.teilnehmer.count() - len(stimmten)
            melden(
                u.erstellt_von,
                T.KALENDER_UMFRAGE,
                de=(
                    f"Frist abgelaufen: {u.titel}",
                    f"Die Antwortfrist ist vorbei ({len(stimmten)} Antworten, {fehlen} offen). "
                    "Du kannst jetzt den Termin festlegen.",
                ),
                fr=(
                    f"Délai écoulé : {u.titel}",
                    f"Le délai de réponse est écoulé ({len(stimmten)} réponses, {fehlen} en "
                    "attente). Tu peux maintenant fixer la date.",
                ),
            )
            u.frist_gemeldet = True
            u.save(update_fields=["frist_gemeldet"])
            anzahl += 1
    return anzahl
