"""Treffen zu einem Spiel (Nov. 2026): Datum und Uhrzeit kommen aus dem Spielplan und folgen ihm.

Ablauf:
- Beim Anlegen/Ändern mit `spiel` übernimmt `uebernehme_spiel` Datum und Uhrzeit (Ortszeit) und
  schlägt einen Titel vor, wenn keiner eingegeben wurde.
- Ändert sich das Spiel im Spielplan (Verlegung, Korrektur), zieht `spiel_geaendert` das Treffen
  nach und informiert Verantwortliche, Ersteller·in und – bei veröffentlichten Treffen – die
  angemeldeten Teilnehmer·innen (Glocke, Telegram/Push, Mail).
- Wird das Spiel abgesagt, bleibt das Treffen bestehen: die Verantwortlichen bekommen einen
  Hinweis und entscheiden selbst (absagen oder behalten). Das passiert nur einmal je Absage."""

from __future__ import annotations

import logging

from django.utils import timezone

from apps.communaute.models import StatutRencontre
from apps.notifications.models import TypeNotification

from . import mails
from .models import Veranstaltung, VeranstaltungStatus

logger = logging.getLogger(__name__)

S = VeranstaltungStatus
# Diese Treffen folgen dem Spielplan noch; abgeschlossene und abgesagte bleiben, wie sie waren.
FOLGT_DEM_SPIEL = {S.ENTWURF, S.EINGEREICHT, S.VEROEFFENTLICHT, S.ZURUECKGEWIESEN}


def spiel_titel(spiel) -> str:
    return f"{spiel.equipe_domicile} – {spiel.equipe_exterieur}"


def anstoss(spiel):
    """(Datum, Uhrzeit) des Anstoßes in Ortszeit."""
    lokal = timezone.localtime(spiel.date_heure)
    return lokal.date(), lokal.time().replace(second=0, microsecond=0)


def uebernehme_spiel(v: Veranstaltung, spiel, *, titel_vorschlagen: bool = False) -> None:
    """Verknüpft das Treffen mit dem Spiel und übernimmt Datum und Uhrzeit."""
    v.spiel = spiel
    v.datum, v.uhrzeit = anstoss(spiel)
    v.spiel_stand = spiel.statut
    if titel_vorschlagen and not v.titel:
        v.titel = spiel_titel(spiel)[:150]


def spiel_dict(spiel) -> dict:
    return {
        "id": str(spiel.id),
        "titel": spiel_titel(spiel),
        "wettbewerb": spiel.competition,
        "anstoss": timezone.localtime(spiel.date_heure).isoformat(),
        "statut": spiel.statut,
    }


def _empfaenger_verantwortliche(v: Veranstaltung) -> list:
    users = {}
    if v.erstellt_von is not None:
        users[v.erstellt_von.pk] = v.erstellt_von
    for karte in v.region.verantwortliche.select_related("user"):
        users[karte.user.pk] = karte.user
    return list(users.values())


def _melde(user, de, fr, v) -> None:
    mails.melde(
        user,
        TypeNotification.REGION_VERANSTALTUNG,
        de,
        fr,
        lien=mails.region_link(v),
        details=mails.veranstaltungs_details(v),
    )


def spiel_geaendert(spiel) -> int:
    """Zieht alle verknüpften Treffen nach. Gibt die Zahl der angepassten/gemeldeten Treffen
    zurück. Fehler stören nie die Synchronisation des Spielplans."""
    betroffen = 0
    treffen = (
        Veranstaltung.objects.filter(spiel=spiel, status__in=FOLGT_DEM_SPIEL)
        .select_related("region", "erstellt_von")
        .order_by("created_at")
    )
    for v in treffen:
        try:
            betroffen += int(_nachziehen(v, spiel))
        except Exception:  # noqa: BLE001 — der Spielplan-Abgleich darf daran nie scheitern
            logger.exception("Treffen %s konnte nicht an das Spiel angepasst werden", v.pk)
    return betroffen


def _nachziehen(v: Veranstaltung, spiel) -> bool:
    if spiel.statut == StatutRencontre.ANNULEE:
        if v.spiel_stand == StatutRencontre.ANNULEE:
            return False
        v.spiel_stand = StatutRencontre.ANNULEE
        v.save(update_fields=["spiel_stand", "updated_at"])
        for user in _empfaenger_verantwortliche(v):
            _melde(
                user,
                (
                    "Spiel abgesagt – bitte entscheiden",
                    f"Das Spiel {spiel_titel(spiel)} wurde abgesagt. Soll das Treffen "
                    f"„{v.titel}“ stattfinden oder abgesagt werden?",
                ),
                (
                    "Match annulé – décision requise",
                    f"Le match {spiel_titel(spiel)} est annulé. La réunion « {v.titel} » "
                    "doit-elle avoir lieu ou être annulée ?",
                ),
                v,
            )
        return True

    neu_datum, neu_zeit = anstoss(spiel)
    geaendert = (v.datum, v.uhrzeit) != (neu_datum, neu_zeit)
    wieder_angesetzt = v.spiel_stand == StatutRencontre.ANNULEE
    if not geaendert and not wieder_angesetzt:
        if v.spiel_stand != spiel.statut:
            v.spiel_stand = spiel.statut
            v.save(update_fields=["spiel_stand", "updated_at"])
        return False

    alt = f"{v.datum:%d.%m.%Y}" + (f", {v.uhrzeit:%H:%M}" if v.uhrzeit else "")
    v.datum, v.uhrzeit, v.spiel_stand = neu_datum, neu_zeit, spiel.statut
    v.save(update_fields=["datum", "uhrzeit", "spiel_stand", "updated_at"])
    neu = f"{v.datum:%d.%m.%Y}" + (f", {v.uhrzeit:%H:%M}" if v.uhrzeit else "")
    empfaenger = {u.pk: u for u in _empfaenger_verantwortliche(v)}
    if v.status == S.VEROEFFENTLICHT:
        for teilnahme in v.teilnahmen.select_related("user"):
            empfaenger[teilnahme.user.pk] = teilnahme.user
    for user in empfaenger.values():
        _melde(
            user,
            (
                "Treffen verschoben",
                f"„{v.titel}“ findet jetzt am {neu} statt (vorher: {alt}), weil sich das "
                "Spiel im Spielplan geändert hat.",
            ),
            (
                "Réunion déplacée",
                f"« {v.titel} » a maintenant lieu le {neu} (avant : {alt}), car le match a "
                "changé dans le calendrier.",
            ),
            v,
        )
    return True
