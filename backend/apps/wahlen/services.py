"""Geschäftslogik der App wahlen (Konzept v2.3): Prüfpunkte, Einreichung, Entscheidung mit zwei
Freigaben, Öffnen der Wahl, Bekanntmachungen (Bereinigung, Übersetzung, Versand), Löschfristen."""

from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta
from html.parser import HTMLParser

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.accounts.models import Role

from . import texte
from .models import (
    AmtPerson,
    Aufbewahrung,
    Bekanntmachung,
    BekanntmachungFreigabe,
    BekanntmachungStatus,
    Entscheidung,
    EntscheidungArt,
    EntscheidungZustimmung,
    FreigabeArt,
    Kandidatur,
    KandidaturStatus,
    Mehrheit,
    Nachweis,
    NachweisArt,
    PruefErgebnis,
    Pruefpunkt,
    Unterstuetzung,
    Wahl,
    Wahlform,
    WahlFreigabe,
    WahlStatus,
)

ROLLEN_VERWALTUNG = (Role.SUPER_ADMIN, Role.BUREAU_ADMIN)

# (schluessel, automatisch) je Art der Wahl — entspricht den Prüfpunkten im Mockup.
PRUEFPUNKTE = {
    "liste": [
        ("liste_vollstaendig", True),
        ("mitgliedschaft", True),
        ("mitgliedsdauer", True),
        ("kein_ausschuss", True),
        ("unterstuetzungen", False),
        ("abschluss", False),
        ("deutsch_b2", False),
        ("ehrenerklaerung", False),
        ("foto", False),
        ("programm", False),
    ],
    "person": [
        ("mitgliedschaft", True),
        ("mitgliedsdauer", True),
        ("kein_ausschuss", True),
        ("unterstuetzungen", False),
        ("ehrenerklaerung", False),
        ("foto", False),
        ("programm", False),
    ],
    "antrag": [
        ("antragsteller_aktiv", True),
        ("wortlaut", False),
        ("zustaendigkeit", False),
        ("unterstuetzungen", False),
        ("sprachen", False),
    ],
}


# --------------------------------------------------------------------------- Rollen


def verwaltet(user) -> bool:
    return bool(user and user.is_authenticated and user.role in ROLLEN_VERWALTUNG)


def ist_ausschuss(user, wahl: Wahl) -> bool:
    if not user or not user.is_authenticated:
        return False
    return wahl.ausschuss.filter(membre__user=user).exists()


def ausschuss_oder_verwaltung(user, wahl: Wahl) -> bool:
    return verwaltet(user) or ist_ausschuss(user, wahl)


def membre_von(user):
    return getattr(user, "membre", None) if user and user.is_authenticated else None


def pflicht_membre(user):
    membre = membre_von(user)
    if membre is None:
        raise PermissionDenied("Für diese Aktion ist ein Mitgliedsprofil nötig.")
    return membre


# --------------------------------------------------------------------------- Wählbarkeit


def beitrag_bezahlt(membre, jahr: int | None = None) -> bool:
    from apps.cotisations.models import Cotisation, StatutCotisation

    return Cotisation.objects.filter(
        membre=membre, annee=jahr or timezone.localdate().year, statut=StatutCotisation.PAYEE
    ).exists()


def mitgliedsjahre(membre, stichtag: date | None = None) -> int:
    stichtag = stichtag or timezone.localdate()
    beginn = membre.date_adhesion
    jahre = stichtag.year - beginn.year
    if (stichtag.month, stichtag.day) < (beginn.month, beginn.day):
        jahre -= 1
    return max(jahre, 0)


def mindest_jahre(wahl: Wahl, amt: str) -> int:
    if wahl.form == Wahlform.LISTE and amt == AmtPerson.PRAESIDENT:
        return 3
    return 2


def waehlbarkeit(wahl: Wahl, membre, amt: str) -> dict:
    """Sofortige Anzeige beim Ausfüllen (Mockup: Chips unter dem Namen)."""
    from apps.membres.models import StatutMembre

    aktiv = membre.statut == StatutMembre.ACTIF and beitrag_bezahlt(membre)
    jahre_noetig = mindest_jahre(wahl, amt)
    return {
        "aktiv_beitrag": aktiv,
        "jahre": mitgliedsjahre(membre),
        "jahre_noetig": jahre_noetig,
        "dauer_ok": mitgliedsjahre(membre) >= jahre_noetig,
        "kein_ausschuss": not wahl.ausschuss.filter(membre=membre).exists(),
    }


# --------------------------------------------------------------------------- Bereinigung


class _Reiniger(HTMLParser):
    ERLAUBT = {"p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li", "h2", "h3", "a"}

    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.teile: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag not in self.ERLAUBT:
            return
        if tag == "a":
            href = dict(attrs).get("href") or ""
            if re.match(r"^(https?://|mailto:)", href, re.I):
                href = href.replace('"', "&quot;")
                self.teile.append(f'<a href="{href}" rel="noopener noreferrer">')
            else:
                self.teile.append("<a>")
        elif tag == "br":
            self.teile.append("<br>")
        else:
            self.teile.append(f"<{tag}>")

    def handle_endtag(self, tag):
        if tag in self.ERLAUBT and tag != "br":
            self.teile.append(f"</{tag}>")

    def handle_data(self, data):
        self.teile.append(data.replace("<", "&lt;").replace(">", "&gt;"))

    def handle_entityref(self, name):
        self.teile.append(f"&{name};")

    def handle_charref(self, name):
        self.teile.append(f"&#{name};")


def reinige_html(html: str) -> str:
    """Erlaubt nur einfache Formatierung (Absatz, fett, kursiv, unterstrichen, Überschrift,
    Aufzählung, Link). Skripte, Stile und Attribute werden entfernt."""
    html = re.sub(r"<(script|style)\b.*?</\1>", "", html or "", flags=re.I | re.S)
    reiniger = _Reiniger()
    reiniger.feed(html)
    reiniger.close()
    return "".join(reiniger.teile)[:20000]


def html_zu_text(html: str) -> str:
    text = re.sub(r"</(p|li|h2|h3)>|<br\s*/?>", "\n", html)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


# --------------------------------------------------------------------------- Kandidaturen


def prueflisten(kandidatur: Kandidatur):
    return PRUEFPUNKTE[kandidatur.wahl.art]


def pruefpunkte_sicherstellen(kandidatur: Kandidatur) -> None:
    for schluessel, automatisch in prueflisten(kandidatur):
        Pruefpunkt.objects.get_or_create(
            kandidatur=kandidatur, schluessel=schluessel, defaults={"automatisch": automatisch}
        )


def personen_pruefen(kandidatur: Kandidatur) -> list[str]:
    """Namen der Personen, die nicht antreten dürfen (für Fehlermeldungen)."""
    fehler = []
    for p in kandidatur.personen.select_related("membre"):
        w = waehlbarkeit(kandidatur.wahl, p.membre, p.amt)
        if not (w["aktiv_beitrag"] and w["dauer_ok"] and w["kein_ausschuss"]):
            fehler.append(f"{p.membre.prenom} {p.membre.nom}")
    return fehler


def fehlende_angaben(kandidatur: Kandidatur) -> list[str]:
    """Pflichtangaben, ohne die nicht eingereicht werden kann (Mockup: „Noch offen: n“)."""
    wahl, fehlt = kandidatur.wahl, []
    art = wahl.art
    if art != "person" and not kandidatur.name.strip():
        fehlt.append("name")
    personen = list(kandidatur.personen.all())
    if art == "liste" and len(personen) != wahl.listen_groesse:
        fehlt.append("personen")
    if art == "person" and len(personen) != 1:
        fehlt.append("personen")
    if art != "antrag":
        if any(not p.foto for p in personen):
            fehlt.append("foto")
        if not kandidatur.rechte_foto:
            fehlt.append("rechte_foto")
    if art != "antrag" and (
        not kandidatur.leitsatz.strip()
        or not kandidatur.vorstellung.strip()
        or len([x for x in kandidatur.programm if str(x).strip()]) < 3
    ):
        fehlt.append("programm")
    if kandidatur.unterstuetzungen.count() < wahl.unterstuetzungen_noetig:
        fehlt.append("unterstuetzungen")
    if art == "liste":
        for nachweisart in (NachweisArt.ABSCHLUSS, NachweisArt.EHRENERKLAERUNG):
            for p in personen:
                if not p.nachweise.filter(art=nachweisart).exists():
                    fehlt.append(nachweisart)
                    break
        praesident = next((p for p in personen if p.amt == AmtPerson.PRAESIDENT), None)
        if praesident and not praesident.nachweise.filter(art=NachweisArt.DEUTSCH_B2).exists():
            fehlt.append(NachweisArt.DEUTSCH_B2)
        if not kandidatur.nachweise.filter(
            art=NachweisArt.KEINE_VERWANDTSCHAFT, person__isnull=True
        ).exists():
            fehlt.append(NachweisArt.KEINE_VERWANDTSCHAFT)
    elif art == "person":
        if personen and not personen[0].nachweise.filter(art=NachweisArt.EHRENERKLAERUNG).exists():
            fehlt.append(NachweisArt.EHRENERKLAERUNG)
    elif not kandidatur.vorstellung.strip():
        fehlt.append("wortlaut")
    if not (
        kandidatur.bestaetigt_wahlordnung
        and kandidatur.bestaetigt_fairness
        and kandidatur.bestaetigt_datenschutz
    ):
        fehlt.append("bestaetigungen")
    return list(dict.fromkeys(fehlt))


def eingangspruefung(kandidatur: Kandidatur) -> bool:
    """Automatische Prüfpunkte setzen; True, wenn alle in Ordnung sind."""
    from apps.membres.models import StatutMembre

    pruefpunkte_sicherstellen(kandidatur)
    wahl, art = kandidatur.wahl, kandidatur.wahl.art
    personen = list(kandidatur.personen.select_related("membre"))
    ergebnisse: dict[str, tuple[bool, str]] = {}
    if art == "antrag":
        m = kandidatur.einreicher
        ergebnisse["antragsteller_aktiv"] = (
            m.statut == StatutMembre.ACTIF and beitrag_bezahlt(m),
            "",
        )
    else:
        if art == "liste":
            ergebnisse["liste_vollstaendig"] = (len(personen) == wahl.listen_groesse, "")
        schlecht_aktiv = [
            p for p in personen if not waehlbarkeit(wahl, p.membre, p.amt)["aktiv_beitrag"]
        ]
        schlecht_dauer = [
            p for p in personen if not waehlbarkeit(wahl, p.membre, p.amt)["dauer_ok"]
        ]
        schlecht_ausschuss = [
            p for p in personen if not waehlbarkeit(wahl, p.membre, p.amt)["kein_ausschuss"]
        ]
        ergebnisse["mitgliedschaft"] = (not schlecht_aktiv, _namen(schlecht_aktiv))
        ergebnisse["mitgliedsdauer"] = (not schlecht_dauer, _namen(schlecht_dauer))
        ergebnisse["kein_ausschuss"] = (not schlecht_ausschuss, _namen(schlecht_ausschuss))
    alle_ok = True
    for schluessel, (ok, notiz) in ergebnisse.items():
        Pruefpunkt.objects.filter(kandidatur=kandidatur, schluessel=schluessel).update(
            ergebnis=PruefErgebnis.OK if ok else PruefErgebnis.NEIN,
            notiz=notiz[:300],
            geprueft_am=timezone.now(),
            automatisch=True,
        )
        alle_ok &= ok
    return alle_ok


def _namen(personen) -> str:
    return ", ".join(f"{p.membre.prenom} {p.membre.nom}" for p in personen)


@transaction.atomic
def einreichen(kandidatur: Kandidatur) -> Kandidatur:
    wahl = kandidatur.wahl
    erlaubt = (KandidaturStatus.ENTWURF, KandidaturStatus.RUECKFRAGE)
    if kandidatur.status not in erlaubt:
        raise ValidationError({"status": "Diese Kandidatur ist bereits eingereicht."})
    heute = timezone.localdate()
    nachbessern = kandidatur.status == KandidaturStatus.RUECKFRAGE
    if nachbessern:
        if not kandidatur.nachbesserung_bis or timezone.now() > kandidatur.nachbesserung_bis:
            raise ValidationError({"status": "Die Frist zur Nachbesserung ist abgelaufen."})
    elif not (wahl.kandidatur_von <= heute <= wahl.kandidatur_bis):
        raise ValidationError({"status": "Außerhalb der Kandidaturfrist."})
    fehlt = fehlende_angaben(kandidatur)
    if fehlt:
        raise ValidationError({"fehlend": fehlt})
    if not eingangspruefung(kandidatur):
        raise ValidationError({"eingangspruefung": "Die automatische Prüfung ist nicht bestanden."})
    if nachbessern:
        kandidatur.pruefpunkte.filter(automatisch=False, ergebnis=PruefErgebnis.NEIN).update(
            ergebnis=PruefErgebnis.OFFEN
        )
    kandidatur.status = KandidaturStatus.EINGEREICHT
    kandidatur.eingereicht_am = timezone.now()
    kandidatur.save(update_fields=["status", "eingereicht_am"])
    return kandidatur


def unterstuetzen(kandidatur: Kandidatur, membre) -> Unterstuetzung:
    from apps.membres.models import StatutMembre

    if kandidatur.status not in (KandidaturStatus.ENTWURF, KandidaturStatus.RUECKFRAGE):
        raise ValidationError({"status": "Unterstützung ist nur vor der Einreichung möglich."})
    if membre.statut != StatutMembre.ACTIF or not beitrag_bezahlt(membre):
        raise ValidationError({"membre": "Nur aktive Mitglieder mit bezahltem Beitrag."})
    if Unterstuetzung.objects.filter(kandidatur__wahl=kandidatur.wahl, membre=membre).exists():
        raise ValidationError({"membre": "Du unterstützt in dieser Wahl schon eine Kandidatur."})
    return Unterstuetzung.objects.create(kandidatur=kandidatur, membre=membre)


# --------------------------------------------------------------------------- Entscheidung


def pruefung_vollstaendig(kandidatur: Kandidatur) -> bool:
    pruefpunkte_sicherstellen(kandidatur)
    return not kandidatur.pruefpunkte.exclude(ergebnis=PruefErgebnis.OK).exists()


@transaction.atomic
def entscheidung_vorschlagen(kandidatur, user, art, begruendung="", artikel="") -> Entscheidung:
    wahl = kandidatur.wahl
    if not ist_ausschuss(user, wahl):
        raise PermissionDenied("Nur Mitglieder des Wahlausschusses.")
    if kandidatur.status != KandidaturStatus.EINGEREICHT:
        raise ValidationError({"status": "Diese Kandidatur wartet nicht auf eine Entscheidung."})
    if kandidatur.entscheidungen.filter(umgesetzt_am__isnull=True, verworfen=False).exists():
        raise ValidationError({"art": "Es liegt schon ein Entscheidungsvorschlag vor."})
    if art == EntscheidungArt.ZULASSEN:
        if not pruefung_vollstaendig(kandidatur):
            raise ValidationError(
                {"art": "Zulassen geht erst, wenn alle Prüfpunkte in Ordnung sind."}
            )
    else:
        if not begruendung.strip():
            raise ValidationError({"begruendung": "Eine Begründung ist nötig."})
        if art == EntscheidungArt.ABLEHNEN and not artikel.strip():
            raise ValidationError({"artikel": "Bitte den Artikel der Wahlordnung nennen."})
        if art == EntscheidungArt.RUECKFRAGE and kandidatur.nachbesserungen >= 1:
            raise ValidationError({"art": "Nachbesserung ist nur einmal je Dossier möglich."})
    entscheidung = Entscheidung.objects.create(
        kandidatur=kandidatur,
        art=art,
        begruendung=begruendung.strip(),
        artikel=artikel.strip(),
        vorgeschlagen_von=user,
    )
    EntscheidungZustimmung.objects.create(entscheidung=entscheidung, user=user)
    _pruefen_umsetzen(entscheidung)
    return entscheidung


@transaction.atomic
def entscheidung_zustimmen(entscheidung: Entscheidung, user) -> Entscheidung:
    wahl = entscheidung.kandidatur.wahl
    if not ist_ausschuss(user, wahl):
        raise PermissionDenied("Nur Mitglieder des Wahlausschusses.")
    if entscheidung.umgesetzt_am or entscheidung.verworfen:
        raise ValidationError({"entscheidung": "Diese Entscheidung ist schon abgeschlossen."})
    if entscheidung.zustimmungen.filter(user=user).exists():
        raise ValidationError({"entscheidung": "Du hast schon zugestimmt."})
    EntscheidungZustimmung.objects.create(entscheidung=entscheidung, user=user)
    _pruefen_umsetzen(entscheidung)
    return entscheidung


def entscheidung_verwerfen(entscheidung: Entscheidung, user) -> None:
    wahl = entscheidung.kandidatur.wahl
    if not ist_ausschuss(user, wahl):
        raise PermissionDenied("Nur Mitglieder des Wahlausschusses.")
    if entscheidung.umgesetzt_am:
        raise ValidationError({"entscheidung": "Schon umgesetzt."})
    entscheidung.verworfen = True
    entscheidung.save(update_fields=["verworfen"])


def _pruefen_umsetzen(entscheidung: Entscheidung) -> None:
    kandidatur = entscheidung.kandidatur
    if entscheidung.zustimmungen.count() < kandidatur.wahl.zustimmungen_noetig:
        return
    jetzt = timezone.now()
    entscheidung.umgesetzt_am = jetzt
    entscheidung.save(update_fields=["umgesetzt_am"])
    kandidatur.entschieden_am = jetzt
    if entscheidung.art == EntscheidungArt.ZULASSEN:
        kandidatur.status = KandidaturStatus.ZUGELASSEN
    elif entscheidung.art == EntscheidungArt.ABLEHNEN:
        kandidatur.status = KandidaturStatus.ABGELEHNT
        kandidatur.begruendung = entscheidung.begruendung
        kandidatur.artikel = entscheidung.artikel
    else:
        kandidatur.status = KandidaturStatus.RUECKFRAGE
        kandidatur.begruendung = entscheidung.begruendung
        kandidatur.nachbesserungen += 1
        kandidatur.nachbesserung_bis = jetzt + timedelta(hours=72)
    kandidatur.save()
    _entscheidung_mitteilen(kandidatur, entscheidung)


def _entscheidung_mitteilen(kandidatur: Kandidatur, entscheidung: Entscheidung) -> None:
    from apps.notifications.models import TypeNotification
    from apps.notifications.services import notifier

    titel = {
        EntscheidungArt.ZULASSEN: "Deine Kandidatur ist zugelassen",
        EntscheidungArt.ABLEHNEN: "Deine Kandidatur wurde abgelehnt",
        EntscheidungArt.RUECKFRAGE: "Rückfrage zu deiner Kandidatur",
    }[entscheidung.art]
    zeilen = [f"{kandidatur.name} ({kandidatur.wahl.titel})"]
    if entscheidung.begruendung:
        zeilen.append(f"Begründung: {entscheidung.begruendung}")
    if entscheidung.art == EntscheidungArt.ABLEHNEN:
        zeilen.append(
            f"Grundlage: {entscheidung.artikel}. Einspruch ist innerhalb von 5 Tagen möglich."
        )
    if entscheidung.art == EntscheidungArt.RUECKFRAGE:
        zeilen.append("Du hast 72 Stunden Zeit zur Nachbesserung.")
    empfaenger = {kandidatur.einreicher_id: kandidatur.einreicher}
    for p in kandidatur.personen.select_related("membre__user"):
        empfaenger[p.membre_id] = p.membre
    for membre in empfaenger.values():
        notifier(
            membre.user,
            TypeNotification.COMMUNAUTE_PUBLICATION_IMPORTANTE,
            titre=titel,
            message="\n".join(zeilen),
            lien=f"/wahlen/{kandidatur.wahl_id}",
        )


# --------------------------------------------------------------------------- Wahl öffnen


def _hat_zugelassene(wahl: Wahl):
    return wahl.kandidaturen.filter(status=KandidaturStatus.ZUGELASSEN)


@transaction.atomic
def freigabe_geben(wahl: Wahl, user, art: str) -> dict:
    """Vier-Augen-Freigabe zum Öffnen oder Schließen; führt aus, sobald genug vorliegen."""
    if not ist_ausschuss(user, wahl):
        raise PermissionDenied("Nur Mitglieder des Wahlausschusses.")
    if art == FreigabeArt.OEFFNEN:
        if wahl.vote_session_id:
            raise ValidationError({"art": "Die Wahl ist schon geöffnet."})
        if wahl.ausschuss.count() < 3:
            raise ValidationError({"art": "Der Ausschuss braucht mindestens drei Mitglieder."})
        zugelassen = _hat_zugelassene(wahl).count()
        minimum = wahl.posten if wahl.form == Wahlform.MEHRFACH else 1
        if zugelassen < minimum:
            raise ValidationError({"art": "Es gibt noch nicht genug zugelassene Kandidaturen."})
    elif art == FreigabeArt.SCHLIESSEN:
        if not wahl.vote_session_id or wahl.vote_session.statut != "ouverte":
            raise ValidationError({"art": "Es läuft keine Wahl, die geschlossen werden könnte."})
    else:
        raise ValidationError({"art": "Unbekannte Freigabe."})
    WahlFreigabe.objects.get_or_create(wahl=wahl, art=art, user=user)
    anzahl = wahl.freigaben.filter(art=art).count()
    ausgefuehrt = False
    if anzahl >= wahl.zustimmungen_noetig:
        if art == FreigabeArt.OEFFNEN:
            oeffnen(wahl, user)
        else:
            schliessen(wahl)
        ausgefuehrt = True
    return {
        "art": art,
        "freigaben": anzahl,
        "noetig": wahl.zustimmungen_noetig,
        "ausgefuehrt": ausgefuehrt,
    }


def optionen_fuer(wahl: Wahl) -> tuple[str, int, list[dict], int | None]:
    """(Abstimmungstyp, Anzahl Stimmen, Optionen, Schwelle %) für die VoteSession."""
    zugelassen = list(_hat_zugelassene(wahl).prefetch_related("personen__membre"))
    schwelle = {Mehrheit.ABSOLUT: 50, Mehrheit.ZWEI_DRITTEL: 66}.get(wahl.mehrheit)
    ja_nein = [{"label": "Oui"}, {"label": "Non"}, {"label": "Abstention"}]
    if wahl.form == Wahlform.JA_NEIN:
        return "oui_non", 1, ja_nein, schwelle
    if wahl.form == Wahlform.LISTE:
        if len(zugelassen) == 1:
            return "oui_non", 1, ja_nein, 50
        optionen = [
            {
                "label": k.name,
                "description": k.leitsatz,
                "candidats": [
                    {"nom": f"{p.membre.prenom} {p.membre.nom}"} for p in k.personen.all()
                ],
            }
            for k in zugelassen
        ]
        return "unique", 1, optionen, schwelle
    if wahl.form == Wahlform.RANG:
        optionen = [{"label": k.name, "description": k.vorstellung} for k in zugelassen]
        return "preferentiel", 1, optionen, None
    optionen = []
    for k in zugelassen:
        person = k.personen.first()
        label = f"{person.membre.prenom} {person.membre.nom}" if person else k.name
        optionen.append({"label": label, "description": k.vorstellung})
    if wahl.form == Wahlform.MEHRFACH:
        return "multiple", wahl.posten, optionen, None
    return "unique", 1, optionen, schwelle


def oeffnen(wahl: Wahl, user) -> None:
    from apps.vote.models import VoteOption, VoteOptionCandidat, VoteSession
    from apps.vote.security import generer_anonymat_sel
    from apps.vote.tasks import envoyer_notification_ouverture

    typ, nb_max, optionen, schwelle = optionen_fuer(wahl)
    jetzt = timezone.now()
    ende = max(wahl.wahl_bis, jetzt + timedelta(minutes=10))
    minuten = max(10, int((ende - jetzt).total_seconds() // 60))
    session = VoteSession.objects.create(
        titre=wahl.titel,
        description=wahl.beschreibung or wahl.titel,
        type_vote=typ,
        mode_anonymat="nominatif",
        nb_choix_max=nb_max,
        eligibilite="cotisants",
        # Das Ende steuert `date_fin`; das Feld hat in `vote` nur eine Obergrenze von 7 Tagen.
        duree_minutes=min(minuten, 10080),
        seuil_victoire_pct=schwelle,
        anonymat_sel=generer_anonymat_sel(),
        statut="ouverte",
        date_fin=ende,
        created_by=user,
    )
    for i, opt in enumerate(optionen):
        kandidaten = opt.pop("candidats", [])
        option = VoteOption.objects.create(session=session, ordre=i, **opt)
        VoteOptionCandidat.objects.bulk_create(
            VoteOptionCandidat(option=option, ordre=j, **c) for j, c in enumerate(kandidaten)
        )
    wahl.vote_session = session
    wahl.geoeffnet_am = jetzt
    wahl.status = WahlStatus.AKTIV
    wahl.save(update_fields=["vote_session", "geoeffnet_am", "status"])
    envoyer_notification_ouverture.delay(str(session.id))


def schliessen(wahl: Wahl) -> None:
    from apps.vote.views import VoteSessionViewSet

    session = wahl.vote_session
    session.statut = "cloturee"
    session.date_cloture = timezone.now()
    session.save(update_fields=["statut", "date_cloture"])
    from apps.vote.tasks import envoyer_notification_resultats

    envoyer_notification_resultats.delay(str(session.id))
    VoteSessionViewSet._broadcast_resultats(session)


# --------------------------------------------------------------------------- Bekanntmachungen


def _zeitpunkt(tag: date, stunde: int = 9) -> datetime:
    return timezone.make_aware(datetime.combine(tag, time(stunde, 0)))


def bekanntmachungen_anlegen(wahl: Wahl) -> None:
    termine = {
        "ankuendigung": _zeitpunkt(wahl.ankuendigung_am),
        "aufruf": _zeitpunkt(wahl.kandidatur_von),
        "zugelassen": _zeitpunkt(wahl.pruefung_bis + timedelta(days=1)),
        "wahlbeginn": wahl.wahl_von,
        "ergebnis": wahl.wahl_bis + timedelta(hours=1),
    }
    for schluessel in texte.SCHLUESSEL:
        betreff, html = texte.MUSTER[schluessel]["de"]
        Bekanntmachung.objects.get_or_create(
            wahl=wahl,
            schluessel=schluessel,
            defaults={
                "versand_am": termine[schluessel],
                "kanaele": list(texte.KANAELE[schluessel]),
                "texte": {"de": {"betreff": betreff, "html": html}},
                "geprueft": {},
            },
        )


def bekanntmachung_bearbeitbar(bk: Bekanntmachung) -> None:
    if bk.status != BekanntmachungStatus.ENTWURF:
        raise ValidationError({"status": "Nur ein Entwurf kann geändert werden."})


def text_setzen(bk: Bekanntmachung, sprache: str, betreff: str, html: str) -> None:
    bekanntmachung_bearbeitbar(bk)
    if sprache not in ("de", "fr", "ar"):
        raise ValidationError({"sprache": "Unbekannte Sprache."})
    bk.texte[sprache] = {"betreff": betreff.strip()[:200], "html": reinige_html(html)}
    veraltet = set(bk.geprueft.get("_veraltet", []))
    if sprache == "de":
        # Übersetzungen passen nicht mehr zum geänderten deutschen Text und gelten als ungeprüft.
        veraltet = {s for s in ("fr", "ar") if s in bk.texte}
        bk.geprueft = {s: False for s in ("fr", "ar") if s in bk.texte}
    else:
        bk.geprueft[sprache] = False
        veraltet.discard(sprache)
    bk.geprueft["_veraltet"] = sorted(veraltet)
    bk.save(update_fields=["texte", "geprueft"])


def uebersetzen(bk: Bekanntmachung, sprache: str) -> None:
    """Maschinelle Übersetzung des deutschen Textes mit DeepL; danach von Hand änderbar."""
    from apps.uebersetzung import deepl

    bekanntmachung_bearbeitbar(bk)
    if sprache not in ("fr", "ar"):
        raise ValidationError({"sprache": "Übersetzt wird nach Französisch oder Arabisch."})
    de = bk.texte.get("de") or {}
    if not de.get("html", "").strip():
        raise ValidationError({"sprache": "Zuerst den deutschen Text schreiben."})
    if not deepl.ist_aktiv():
        raise ValidationError({"sprache": "Die automatische Übersetzung ist nicht eingerichtet."})
    html = deepl.uebersetzen(_schuetze(de["html"]), sprache, html=True)
    betreff = deepl.uebersetzen(_schuetze(de.get("betreff", "")), sprache)
    if html is None or betreff is None:
        raise ValidationError(
            {"sprache": "Die Übersetzung ist fehlgeschlagen. Bitte später erneut."}
        )
    bk.texte[sprache] = {
        "betreff": _entschuetze(betreff[0])[:200],
        "html": reinige_html(_entschuetze(html[0])),
    }
    bk.geprueft[sprache] = False
    bk.geprueft["_veraltet"] = [s for s in bk.geprueft.get("_veraltet", []) if s != sprache]
    bk.save(update_fields=["texte", "geprueft"])


PLATZHALTER = ("{Wahl}", "{Datum}", "{Frist}")


def _schuetze(text: str) -> str:
    """Platzhalter für DeepL unverändert lassen."""
    for p in PLATZHALTER:
        text = text.replace(p, f'<x id="{p[1:-1]}"/>')
    return text


def _entschuetze(text: str) -> str:
    for p in PLATZHALTER:
        name = p[1:-1]
        text = re.sub(rf'<x id="{name}"\s*/>(</x>)?', p, text)
    return text


def geprueft_setzen(bk: Bekanntmachung, sprache: str, wert: bool) -> None:
    bekanntmachung_bearbeitbar(bk)
    if sprache not in ("fr", "ar") or sprache not in bk.texte:
        raise ValidationError({"sprache": "Diese Fassung gibt es noch nicht."})
    bk.geprueft[sprache] = bool(wert)
    bk.save(update_fields=["geprueft"])


def zur_freigabe(bk: Bekanntmachung) -> None:
    bekanntmachung_bearbeitbar(bk)
    de = bk.texte.get("de") or {}
    if not de.get("betreff", "").strip() or not de.get("html", "").strip():
        raise ValidationError({"texte": "Der deutsche Text fehlt."})
    bk.status = BekanntmachungStatus.WARTET
    bk.freigaben.all().delete()
    bk.save(update_fields=["status"])


@transaction.atomic
def bk_freigeben(bk: Bekanntmachung, user) -> Bekanntmachung:
    wahl = bk.wahl
    if not ist_ausschuss(user, wahl):
        raise PermissionDenied("Nur Mitglieder des Wahlausschusses.")
    if bk.status != BekanntmachungStatus.WARTET:
        raise ValidationError({"status": "Dieser Text wartet nicht auf eine Freigabe."})
    BekanntmachungFreigabe.objects.get_or_create(bekanntmachung=bk, user=user)
    if BekanntmachungFreigabe.objects.filter(bekanntmachung=bk).count() >= wahl.zustimmungen_noetig:
        bk.status = BekanntmachungStatus.FREIGEGEBEN
        bk.save(update_fields=["status"])
    return bk


def bk_zurueck(bk: Bekanntmachung) -> None:
    if bk.status in (BekanntmachungStatus.GESENDET, BekanntmachungStatus.ENTWURF):
        raise ValidationError({"status": "Das ist nicht mehr möglich."})
    bk.status = BekanntmachungStatus.ENTWURF
    bk.freigaben.all().delete()
    bk.save(update_fields=["status"])


def ersetze_platzhalter(text: str, wahl: Wahl, sprache: str) -> str:
    namen = {"de": wahl.titel, "fr": wahl.titel, "ar": wahl.titel}
    ende = timezone.localtime(wahl.wahl_bis).strftime("%d.%m.%Y")
    frist = wahl.kandidatur_bis.strftime("%d.%m.%Y")
    return text.replace("{Wahl}", namen[sprache]).replace("{Datum}", ende).replace("{Frist}", frist)


def fassung(bk: Bekanntmachung, sprache: str) -> dict | None:
    """Fassung in `sprache` mit ersetzten Platzhaltern; None, wenn es sie nicht gibt."""
    roh = bk.texte.get(sprache)
    if not isinstance(roh, dict) or not roh.get("html", "").strip():
        return None
    return {
        "betreff": ersetze_platzhalter(roh.get("betreff", ""), bk.wahl, sprache),
        "html": ersetze_platzhalter(roh.get("html", ""), bk.wahl, sprache),
        "maschinell": sprache != "de",
        "geprueft": bool(bk.geprueft.get(sprache)),
    }


def empfaenger_user(wahl: Wahl):
    from apps.membres.models import Membre, StatutMembre

    return [
        m.user
        for m in Membre.objects.filter(
            statut=StatutMembre.ACTIF, user__isnull=False
        ).select_related("user")
    ]


def bekanntmachung_senden(bk: Bekanntmachung) -> int:
    """Verschickt eine freigegebene Bekanntmachung in den gewählten Kanälen (App, E-Mail).
    Der Aushang (PDF) wird nur auf Abruf erzeugt (Tab Bekanntmachungen)."""
    from apps.notifications.email_cid import Texte, envoyer_email_cid
    from apps.notifications.models import TypeNotification
    from apps.notifications.services import email_module_actif, notifier

    fassungen = {s: fassung(bk, s) for s in ("de", "fr", "ar")}
    fassungen = {s: f for s, f in fassungen.items() if f}
    if "de" not in fassungen:
        return 0
    de = fassungen["de"]
    texte_mail = {}
    for s, f in fassungen.items():
        hinweis = [texte.MT_HINWEIS[s]] if f["maschinell"] else []
        texte_mail[s] = Texte(
            titre=f["betreff"],
            paragraphes=[html_zu_text(f["html"]), *hinweis, texte.FOOTER[s]],
            html=f["html"],
        )
    anzahl = 0
    for user in empfaenger_user(bk.wahl):
        if "app" in bk.kanaele:
            notifier(
                user,
                TypeNotification.COMMUNAUTE_PUBLICATION_IMPORTANTE,
                titre=de["betreff"],
                message=html_zu_text(de["html"])[:500],
                lien=f"/wahlen/{bk.wahl_id}",
            )
        if "mail" in bk.kanaele and email_module_actif("vote") and user.email:
            envoyer_email_cid(
                sujet=de["betreff"],
                destinataire=user.email,
                textes=texte_mail,
                lien=f"/wahlen/{bk.wahl_id}",
                fusszeile=settings.VEREIN_ANSCHRIFT,
                fail_silently=True,
            )
        anzahl += 1
    bk.status = BekanntmachungStatus.GESENDET
    bk.gesendet_am = timezone.now()
    bk.save(update_fields=["status", "gesendet_am"])
    return anzahl


# --------------------------------------------------------------------------- Aufbewahrung


def loeschfrist_tage(wahl: Wahl) -> int | None:
    return None if wahl.aufbewahrung == Aufbewahrung.MANUELL else int(wahl.aufbewahrung)


def nachweise_loeschen(jetzt=None) -> int:
    """Löscht Nachweise (Dateien) nach der vom Ausschuss gewählten Frist, gerechnet ab dem Ende
    der Einspruchsfristen. Fotos bleiben, solange die Kandidatur veröffentlicht ist."""
    heute = (jetzt or timezone.now()).date()
    geloescht = 0
    for wahl in Wahl.objects.exclude(aufbewahrung=Aufbewahrung.MANUELL):
        tage = loeschfrist_tage(wahl)
        if heute <= wahl.einspruch_bis + timedelta(days=tage):
            continue
        for nachweis in Nachweis.objects.filter(kandidatur__wahl=wahl):
            nachweis.datei.delete(save=False)
            nachweis.delete()
            geloescht += 1
    return geloescht
