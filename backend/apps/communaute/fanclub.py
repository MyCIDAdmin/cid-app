"""
Fan-Club-Umbau (Release 2026.11, Konzept „Konzept_FanClub_Modernisierung“) : Logik hinter den
neuen Ansichten, getrennt von der Synchronisierung in `services.py`.

- Tippspiel-Matrix : alle Tipps aller bestätigten Teilnehmer, aber erst ab der Sperre
  (1 Tag vor Anpfiff, Server entscheidet, nie der Client) ; liefert zugleich die Rangliste mit
  Trend und exakten Treffern.
- Spieler des Spiels : eine Stimme je Mitglied für einen Spieler des Kaders, 26 Stunden nach
  Anpfiff (≈ 24 Stunden nach dem Abpfiff).
- Wettbewerbsart (Liga, kontinental, Pokal, sonstige) für die Filter im Spielplan.
- Kalender-Abo (.ics) für den Spielplan.
"""

from datetime import timedelta
from datetime import timezone as dt_timezone

from django.db.models import Count
from django.utils import timezone

from apps.accounts.models import ROLE_LEVELS, Role

from . import services
from .models import (
    RencontreCalendrier,
    SpielerStimme,
    StatistiqueJoueur,
    StatutPaiementTeilnahme,
    StatutRencontre,
    TippspielTeilnahme,
    TippspielTip,
)

EQUIPE_SUIVIE = "Club Africain"
SPERRE_VOR_ANPFIFF = timedelta(days=1)
SPIELER_STIMME_FRIST = timedelta(hours=26)
DAUER_SPIEL = timedelta(hours=2)
BESTAETIGT = (StatutPaiementTeilnahme.SANS_FRAIS, StatutPaiementTeilnahme.CONFIRMEE)


# ---------------------------------------------------------------------------
# Sperre und Wettbewerbsart
# ---------------------------------------------------------------------------


def tipps_gesperrt(rencontre: RencontreCalendrier, jetzt=None) -> bool:
    """Ab diesem Zeitpunkt darf niemand mehr tippen, und die Tipps der anderen werden sichtbar.
    Gleiche Regel wie `TippspielTipSerializer.validate` : 1 Tag vor Anpfiff, oder das Spiel ist
    nicht mehr „angesetzt“ (beendet, verschoben, abgesagt)."""
    jetzt = jetzt or timezone.now()
    if rencontre.statut != StatutRencontre.PROGRAMMEE:
        return True
    return jetzt >= rencontre.date_heure - SPERRE_VOR_ANPFIFF


def wettbewerb_art(competition: str) -> str:
    """„liga“, „kontinental“ (African Champions League, Confederation Cup …), „pokal“ oder
    „sonstige“ (Freundschaftsspiele u. Ä.). Die Namen liefert GOAL API oder sie sind von Hand
    gepflegt, deshalb wird nach Wortteilen gesucht."""
    from .serializers import est_ligue_1  # lokal, um einen Importzyklus zu vermeiden

    nom = " ".join((competition or "").lower().split())
    if est_ligue_1(competition):
        return "liga"
    if (
        "caf" in nom.replace("-", " ").split()
        or "champions league" in nom
        or "ligue des champions" in nom
        or "confederation" in nom
        or "confédération" in nom
        or "supercup" in nom
        or "super cup" in nom
        or "afrika" in nom
        or "africa" in nom
    ):
        return "kontinental"
    if any(marke in nom for marke in ("coupe", "cup", "pokal")) or "كأس" in nom:
        return "pokal"
    return "sonstige"


# ---------------------------------------------------------------------------
# Tippspiel-Matrix
# ---------------------------------------------------------------------------


def _kurzname(membre) -> str:
    nom = (membre.nom or "").strip()
    return f"{membre.prenom} {nom[:1]}.".strip() if nom else membre.prenom


def tippspiel_matrix(tippspiel, user, spalten: int = 8) -> dict:
    """Rangliste mit Trend, exakten Treffern und den Tipps der letzten `spalten` gesperrten
    Spiele.

    Datenschutz und Fairness :
      - Tipps stehen nur in Spalten für Spiele, deren Sperre vorbei ist (`tipps_gesperrt`) ;
        offene Spiele erscheinen hier nie, auch nicht für Vorstand oder Administrator.
      - Sehen darf sie, wer selbst bestätigter Teilnehmer ist, oder der Administrator App.
        Alle anderen bekommen nur die Rangliste (`tipps_sichtbar = False`).
      - Namen nur als Vorname und Initial.
    """
    jetzt = timezone.now()
    membre = getattr(user, "membre", None)
    teilnahmen = list(
        TippspielTeilnahme.objects.filter(tippspiel=tippspiel, statut_paiement__in=BESTAETIGT)
        .select_related("membre")
        .order_by("created_at")
    )
    ist_teilnehmer = membre is not None and any(t.membre_id == membre.id for t in teilnahmen)
    ist_admin = ROLE_LEVELS.get(getattr(user, "role", None), 0) >= ROLE_LEVELS[Role.SUPER_ADMIN]
    sichtbar = ist_teilnehmer or ist_admin

    tipps = list(
        TippspielTip.objects.filter(teilnahme__in=teilnahmen)
        .select_related("rencontre")
        .order_by("rencontre__date_heure")
    )
    # Letztes beendetes Spiel mit Wertung : Bezugspunkt für Trend und „Letzter Spieltag“.
    beendete = [
        t.rencontre
        for t in tipps
        if t.points is not None and t.rencontre.statut == StatutRencontre.TERMINEE
    ]
    letztes = max(beendete, key=lambda r: r.date_heure) if beendete else None

    gesperrte = {t.rencontre_id: t.rencontre for t in tipps if tipps_gesperrt(t.rencontre, jetzt)}
    spalten_rencontres = sorted(gesperrte.values(), key=lambda r: r.date_heure)[-spalten:]
    spalten_ids = {r.id for r in spalten_rencontres}

    summen: dict = {}
    for tip in tipps:
        zeile = summen.setdefault(
            tip.teilnahme_id, {"punkte": 0, "vorher": 0, "exakt": 0, "letzte": None}
        )
        if tip.points is None:
            continue
        zeile["punkte"] += tip.points
        if tip.points == 4:
            zeile["exakt"] += 1
        if letztes is not None and tip.rencontre_id == letztes.id:
            zeile["letzte"] = tip.points
        else:
            zeile["vorher"] += tip.points

    def rang_nach(schluessel: str) -> dict:
        # Gleiche Reihenfolge wie die bisherige Rangliste : Punkte absteigend, dann Beitritt.
        geordnet = sorted(
            teilnahmen,
            key=lambda t: (-summen.get(t.id, {}).get(schluessel, 0), t.created_at),
        )
        return {t.id: i + 1 for i, t in enumerate(geordnet)}

    rang = rang_nach("punkte")
    rang_vorher = rang_nach("vorher") if letztes is not None else {}

    tipps_je_teilnahme: dict = {}
    if sichtbar:
        for tip in tipps:
            if tip.rencontre_id in spalten_ids:
                tipps_je_teilnahme.setdefault(tip.teilnahme_id, {})[str(tip.rencontre_id)] = {
                    "d": tip.score_domicile,
                    "e": tip.score_exterieur,
                    "p": tip.points,
                }

    zeilen = []
    for t in sorted(teilnahmen, key=lambda x: rang[x.id]):
        s = summen.get(t.id, {"punkte": 0, "exakt": 0, "letzte": None})
        zeilen.append(
            {
                "rang": rang[t.id],
                "rang_vorher": rang_vorher.get(t.id),
                "name": _kurzname(t.membre),
                "ist_ich": membre is not None and t.membre_id == membre.id,
                "punkte": s["punkte"],
                "exakt": s["exakt"],
                "letzte_punkte": s["letzte"],
                "tipps": tipps_je_teilnahme.get(t.id, {}),
            }
        )

    return {
        "tippspiel": str(tippspiel.id),
        "tipps_sichtbar": sichtbar,
        "teilnehmer": len(teilnahmen),
        "letztes_spiel": str(letztes.id) if letztes else None,
        "spalten": [
            {
                "id": str(r.id),
                "competition": r.competition,
                "equipe_domicile": r.equipe_domicile,
                "equipe_exterieur": r.equipe_exterieur,
                "date_heure": r.date_heure,
                "score_domicile": r.score_domicile,
                "score_exterieur": r.score_exterieur,
                "statut": r.statut,
            }
            for r in spalten_rencontres
        ],
        "zeilen": zeilen,
    }


# ---------------------------------------------------------------------------
# Spieler des Spiels
# ---------------------------------------------------------------------------


def ist_spiel_des_vereins(rencontre: RencontreCalendrier) -> bool:
    return EQUIPE_SUIVIE in (rencontre.equipe_domicile, rencontre.equipe_exterieur)


def abstimmung_offen(rencontre: RencontreCalendrier, jetzt=None) -> bool:
    jetzt = jetzt or timezone.now()
    return (
        ist_spiel_des_vereins(rencontre)
        and rencontre.statut == StatutRencontre.TERMINEE
        and jetzt <= rencontre.date_heure + SPIELER_STIMME_FRIST
    )


def kandidaten():
    """Alle Spieler des aktuellen Kaders mit mindestens einem Einsatz in dieser Saison."""
    return StatistiqueJoueur.objects.filter(
        saison=services._saison_actuelle(), equipe=EQUIPE_SUIVIE, matchs_joues__gte=1
    ).order_by("numero", "nom")


def spieler_des_spiels(rencontre: RencontreCalendrier, membre) -> dict:
    """Stand der Abstimmung für ein Spiel. Das Ergebnis ist erst sichtbar, wenn das Mitglied
    abgestimmt hat oder die Abstimmung zu Ende ist, damit die Stimmen sich nicht gegenseitig
    beeinflussen."""
    offen = abstimmung_offen(rencontre)
    eigene = (
        SpielerStimme.objects.filter(rencontre=rencontre, membre=membre).first()
        if membre is not None
        else None
    )
    ergebnis = None
    gesamt = None
    if eigene is not None or not offen:
        zeilen = (
            SpielerStimme.objects.filter(rencontre=rencontre)
            .values("spieler_name")
            .annotate(stimmen=Count("id"))
            .order_by("-stimmen", "spieler_name")
        )
        ergebnis = [{"name": z["spieler_name"], "stimmen": z["stimmen"]} for z in zeilen]
        gesamt = sum(z["stimmen"] for z in ergebnis)
    return {
        "rencontre": str(rencontre.id),
        "spiel": {
            "equipe_domicile": rencontre.equipe_domicile,
            "equipe_exterieur": rencontre.equipe_exterieur,
            "date_heure": rencontre.date_heure,
            "competition": rencontre.competition,
            "score_domicile": rencontre.score_domicile,
            "score_exterieur": rencontre.score_exterieur,
        },
        "offen": offen,
        "bis": rencontre.date_heure + SPIELER_STIMME_FRIST,
        "kandidaten": [
            {"id": str(k.id), "name": k.nom, "numero": k.numero, "poste": k.poste}
            for k in (kandidaten() if offen else [])
        ],
        "meine_stimme": (
            str(eigene.spieler_id) if eigene is not None and eigene.spieler_id else None
        ),
        "ergebnis": ergebnis,
        "stimmen_gesamt": gesamt,
    }


class StimmeFehler(Exception):
    """Abgabe nicht möglich (Meldung ist für Mitglieder bestimmt)."""


def spieler_stimme_abgeben(rencontre: RencontreCalendrier, membre, spieler_id) -> SpielerStimme:
    if membre is None:
        raise StimmeFehler("Aucune fiche membre associée à ce compte.")
    if not abstimmung_offen(rencontre):
        raise StimmeFehler("Die Abstimmung für dieses Spiel ist nicht offen.")
    spieler = kandidaten().filter(pk=spieler_id).first()
    if spieler is None:
        raise StimmeFehler("Dieser Spieler steht nicht zur Wahl.")
    if SpielerStimme.objects.filter(rencontre=rencontre, membre=membre).exists():
        raise StimmeFehler("Du hast für dieses Spiel schon abgestimmt.")
    return SpielerStimme.objects.create(
        rencontre=rencontre, membre=membre, spieler=spieler, spieler_name=spieler.nom
    )


# ---------------------------------------------------------------------------
# Kalender-Abo
# ---------------------------------------------------------------------------


def _ics_text(wert: str) -> str:
    return (
        (wert or "")
        .replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r", "")
        .replace("\n", "\\n")
    )


def _ics_falten(zeile: str) -> list:
    """Zeilen über 75 Byte werden nach RFC 5545 umbrochen (Folgezeilen beginnen mit Leerzeichen)."""
    daten = zeile.encode("utf-8")
    if len(daten) <= 75:
        return [zeile]
    teile, aktuell, grenze = [], b"", 75
    for zeichen in zeile:
        b = zeichen.encode("utf-8")
        if len(aktuell) + len(b) > grenze:
            teile.append(aktuell.decode("utf-8"))
            aktuell, grenze = b"", 74
        aktuell += b
    teile.append(aktuell.decode("utf-8"))
    return [teile[0]] + [" " + t for t in teile[1:]]


def _ics_zeit(zeitpunkt) -> str:
    return zeitpunkt.astimezone(dt_timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def spielplan_ics(rencontres) -> str:
    jetzt = _ics_zeit(timezone.now())
    zeilen = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//CID//Fan-Club Spielplan//DE",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Club Africain Spielplan",
    ]
    for r in rencontres:
        titel = f"{r.equipe_domicile} – {r.equipe_exterieur}"
        if r.statut == StatutRencontre.REPORTEE:
            titel += " (verschoben)"
        beschreibung = r.competition or ""
        if r.score_domicile is not None and r.score_exterieur is not None:
            beschreibung += f" · Endstand {r.score_domicile}:{r.score_exterieur}"
        zeilen += [
            "BEGIN:VEVENT",
            f"UID:{r.id}@cid-fanclub",
            f"DTSTAMP:{jetzt}",
            f"DTSTART:{_ics_zeit(r.date_heure)}",
            f"DTEND:{_ics_zeit(r.date_heure + DAUER_SPIEL)}",
            f"SUMMARY:{_ics_text(titel)}",
            f"DESCRIPTION:{_ics_text(beschreibung.strip(' ·'))}",
        ]
        if r.statut == StatutRencontre.ANNULEE:
            zeilen.append("STATUS:CANCELLED")
        zeilen.append("END:VEVENT")
    zeilen.append("END:VCALENDAR")
    gefaltet = []
    for z in zeilen:
        gefaltet.extend(_ics_falten(z))
    return "\r\n".join(gefaltet) + "\r\n"
