"""Spielplan — manuelle Korrekturen (Datum/Uhrzeit, Ergebnis), manuell hinzugefügte Spiele und
das Überschreiben durch die API (2026-10-20).

Regel: Eine manuelle Korrektur bleibt bestehen, solange GOAL API denselben Stand liefert wie
beim letzten Mal (`api_stand`); sobald die API einen abweichenden Stand liefert, wird die
Korrektur überschrieben."""

from datetime import datetime, timedelta
from datetime import timezone as dt_timezone

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import AuditLogEntry, Role, User
from apps.communaute import services
from apps.communaute.models import RencontreCalendrier
from apps.communaute.tests.factories import TippspielTipFactory

pytestmark = pytest.mark.django_db

LIST_URL = "communaute:calendrier-list"


def _detail(rencontre):
    return reverse("communaute:calendrier-detail", args=[rencontre.id])


def _reset_url(rencontre):
    return reverse("communaute:calendrier-zuruecksetzen", args=[rencontre.id])


def _client(role):
    user = User.objects.create_user(
        email=f"{role}-spielplan@example.de", password="Password123!", role=role, is_active=True
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


def _fixture(**kwargs):
    base = {
        "id": "fix-9",
        "matchStatus": "SCHEDULED",
        "homeTeam": {"name": "Club Africain"},
        "awayTeam": {"name": "ES Tunis"},
        "league": {"name": "Ligue 1"},
        "matchDate": "2030-10-17",
        "matchTime": "16:00",
        "kickoffUtc": "2030-10-17T15:00:00Z",
        "homeTeamScore": None,
        "awayTeamScore": None,
    }
    base.update(kwargs)
    return base


def _sync(**kwargs):
    services._synchroniser_calendrier_depuis([_fixture(**kwargs)])
    return RencontreCalendrier.objects.get(evenement_externe_id="fix-9")


# --------------------------------------------------------------------------- Sync / Override


def test_sync_speichert_api_stand():
    rencontre = _sync()
    assert rencontre.api_stand["equipe_exterieur"] == "ES Tunis"
    assert rencontre.api_stand["date_heure"] == "2030-10-17T15:00:00+00:00"
    assert not rencontre.modifie_manuellement


def test_manuelle_korrektur_bleibt_bei_unveraendertem_api_stand():
    rencontre = _sync()
    client, _ = _client(Role.BUREAU_ADMIN)
    neu = "2030-10-18T17:30:00Z"
    resp = client.patch(_detail(rencontre), {"date_heure": neu}, format="json")
    assert resp.status_code == 200
    assert resp.data["modifie_manuellement"] is True

    _sync()  # API liefert exakt denselben Stand
    rencontre.refresh_from_db()
    assert rencontre.date_heure == datetime(2030, 10, 18, 17, 30, tzinfo=dt_timezone.utc)
    assert rencontre.modifie_manuellement


def test_manuelle_korrektur_wird_bei_geaendertem_api_stand_ueberschrieben():
    rencontre = _sync()
    client, _ = _client(Role.BUREAU_ADMIN)
    client.patch(_detail(rencontre), {"date_heure": "2030-10-18T17:30:00Z"}, format="json")

    # API verschiebt das Spiel selbst → Korrektur wird überschrieben
    _sync(kickoffUtc="2030-10-19T14:00:00Z")
    rencontre.refresh_from_db()
    assert rencontre.date_heure == datetime(2030, 10, 19, 14, 0, tzinfo=dt_timezone.utc)
    assert not rencontre.modifie_manuellement
    assert rencontre.api_stand["date_heure"] == "2030-10-19T14:00:00+00:00"


def test_manuelles_ergebnis_bleibt_und_wird_von_neuem_api_ergebnis_ueberschrieben():
    rencontre = _sync()
    client, _ = _client(Role.BUREAU_ADMIN)
    resp = client.patch(
        _detail(rencontre), {"score_domicile": 2, "score_exterieur": 1}, format="json"
    )
    assert resp.status_code == 200
    assert resp.data["statut"] == "FINISHED"  # Ergebnis ⇒ beendet

    _sync()  # unverändert → bleibt
    rencontre.refresh_from_db()
    assert (rencontre.score_domicile, rencontre.score_exterieur) == (2, 1)

    _sync(matchStatus="FINISHED", homeTeamScore="3", awayTeamScore="0")
    rencontre.refresh_from_db()
    assert (rencontre.score_domicile, rencontre.score_exterieur) == (3, 0)
    assert not rencontre.modifie_manuellement


def test_korrektur_zurueck_auf_api_stand_hebt_markierung_auf():
    rencontre = _sync()
    client, _ = _client(Role.BUREAU_ADMIN)
    client.patch(_detail(rencontre), {"date_heure": "2030-10-18T17:30:00Z"}, format="json")
    resp = client.patch(_detail(rencontre), {"date_heure": "2030-10-17T15:00:00Z"}, format="json")
    assert resp.data["modifie_manuellement"] is False


def test_zuruecksetzen_stellt_api_stand_wieder_her():
    rencontre = _sync()
    client, _ = _client(Role.BUREAU_ADMIN)
    client.patch(
        _detail(rencontre),
        {"date_heure": "2030-10-18T17:30:00Z", "score_domicile": 1, "score_exterieur": 1},
        format="json",
    )
    resp = client.post(_reset_url(rencontre))
    assert resp.status_code == 200
    rencontre.refresh_from_db()
    assert rencontre.date_heure == datetime(2030, 10, 17, 15, 0, tzinfo=dt_timezone.utc)
    assert rencontre.score_domicile is None
    assert rencontre.statut == "SCHEDULED"
    assert not rencontre.modifie_manuellement


def test_api_spiel_erlaubt_nur_datum_ergebnis_status():
    rencontre = _sync()
    client, _ = _client(Role.BUREAU_ADMIN)
    client.patch(
        _detail(rencontre),
        {"equipe_exterieur": "Falsch", "competition": "Falsch"},
        format="json",
    )
    rencontre.refresh_from_db()
    assert rencontre.equipe_exterieur == "ES Tunis"
    assert rencontre.competition == "Ligue 1"


def test_bestandsdaten_ohne_api_stand_werden_normal_aktualisiert():
    # Zeile aus der Zeit vor Migration 0020 (api_stand leer, nicht manuell)
    alt = RencontreCalendrier.objects.create(
        evenement_externe_id="fix-9",
        equipe_domicile="Club Africain",
        equipe_exterieur="Alt",
        date_heure=datetime(2030, 1, 1, tzinfo=dt_timezone.utc),
    )
    rencontre = _sync()
    assert rencontre.id == alt.id
    assert rencontre.equipe_exterieur == "ES Tunis"
    assert rencontre.api_stand


# --------------------------------------------------------------------------- Manuell hinzugefügt


def test_manuell_hinzugefuegtes_spiel_wird_von_sync_nicht_beruehrt():
    client, _ = _client(Role.BUREAU_ADMIN)
    resp = client.post(
        reverse(LIST_URL),
        {
            "competition": "Freundschaftsspiel",
            "equipe_domicile": "Club Africain",
            "equipe_exterieur": "FC Köln",
            "date_heure": "2030-11-01T18:00:00Z",
        },
        format="json",
    )
    assert resp.status_code == 201
    assert resp.data["ajout_manuel"] is True
    assert resp.data["statut"] == "SCHEDULED"

    _sync()
    assert RencontreCalendrier.objects.filter(ajout_manuel=True).count() == 1
    assert RencontreCalendrier.objects.count() == 2


def test_manuell_hinzugefuegtes_spiel_mit_ergebnis_ist_beendet_und_voll_editierbar():
    client, _ = _client(Role.BUREAU_ADMIN)
    resp = client.post(
        reverse(LIST_URL),
        {
            "competition": "Ligue 1",
            "equipe_domicile": "Club Africain",
            "equipe_exterieur": "EST",
            "date_heure": "2026-01-01T18:00:00Z",
            "score_domicile": 2,
            "score_exterieur": 2,
        },
        format="json",
    )
    assert resp.status_code == 201
    assert resp.data["statut"] == "FINISHED"
    rencontre = RencontreCalendrier.objects.get(id=resp.data["id"])
    assert rencontre.evenement_externe_id.startswith("manuel-")

    resp = client.patch(_detail(rencontre), {"equipe_exterieur": "ESS"}, format="json")
    assert resp.status_code == 200
    rencontre.refresh_from_db()
    assert rencontre.equipe_exterieur == "ESS"
    assert not rencontre.modifie_manuellement  # Flag gilt nur für API-Spiele


def test_manuelles_spiel_loeschen_nur_ohne_tipps():
    client, _ = _client(Role.BUREAU_ADMIN)
    rencontre = RencontreCalendrier.objects.create(
        evenement_externe_id="manuel-x",
        ajout_manuel=True,
        equipe_domicile="A",
        equipe_exterieur="B",
        date_heure=datetime(2030, 1, 1, tzinfo=dt_timezone.utc),
    )
    assert client.delete(_detail(rencontre)).status_code == 204
    assert not RencontreCalendrier.objects.filter(id=rencontre.id).exists()


def test_api_spiel_und_spiel_mit_tipps_nicht_loeschbar():
    client, _ = _client(Role.BUREAU_ADMIN)
    api_spiel = _sync()
    assert client.delete(_detail(api_spiel)).status_code == 400

    tip = TippspielTipFactory(rencontre__ajout_manuel=True)
    assert client.delete(_detail(tip.rencontre)).status_code == 400


def test_validierung_ergebnis_nur_komplett_und_verschiedene_teams():
    client, _ = _client(Role.BUREAU_ADMIN)
    rencontre = _sync()
    assert client.patch(_detail(rencontre), {"score_domicile": 1}, format="json").status_code == 400
    resp = client.post(
        reverse(LIST_URL),
        {
            "equipe_domicile": "Club Africain",
            "equipe_exterieur": "club africain",
            "date_heure": "2030-11-01T18:00:00Z",
        },
        format="json",
    )
    assert resp.status_code == 400
    resp = client.post(reverse(LIST_URL), {"equipe_domicile": "A"}, format="json")
    assert resp.status_code == 400


# --------------------------------------------------------------------------- Rechte / Audit


def test_rechte_lesen_offen_schreiben_ab_vorstand():
    rencontre = _sync()
    assert APIClient().get(reverse(LIST_URL)).status_code == 200

    anonym = APIClient()
    assert anonym.patch(_detail(rencontre), {"score_domicile": 1}, format="json").status_code in (
        401,
        403,
    )

    client, _ = _client(Role.MEMBRE)
    assert client.patch(_detail(rencontre), {"score_domicile": 1}, format="json").status_code == 403
    assert client.post(reverse(LIST_URL), {}, format="json").status_code == 403
    assert client.post(_reset_url(rencontre)).status_code == 403
    assert client.delete(_detail(rencontre)).status_code == 403


def test_aenderungen_werden_im_audit_protokoll_festgehalten():
    rencontre = _sync()
    client, user = _client(Role.BUREAU_ADMIN)
    client.patch(_detail(rencontre), {"date_heure": "2030-10-18T17:30:00Z"}, format="json")
    eintrag = AuditLogEntry.objects.get(action="rencontre_corrigee")
    assert eintrag.user == user
    assert eintrag.metadata["rencontre_id"] == str(rencontre.id)
    rencontre.refresh_from_db()
    assert rencontre.modifie_par == user


# --------------------------------------------------------------------------- Tippspiel


def test_manuelles_ergebnis_loest_tippspiel_punkte_neuberechnung_aus():
    tip = TippspielTipFactory(
        rencontre__date_heure=datetime.now(dt_timezone.utc) + timedelta(days=3),
        score_domicile=2,
        score_exterieur=1,
    )
    assert tip.points is None
    client, _ = _client(Role.BUREAU_ADMIN)
    resp = client.patch(
        _detail(tip.rencontre), {"score_domicile": 2, "score_exterieur": 1}, format="json"
    )
    assert resp.status_code == 200
    tip.refresh_from_db()
    assert tip.points == 4  # exaktes Ergebnis


def test_ergebnis_mit_explizitem_status_angesetzt_wird_als_beendet_gespeichert():
    rencontre = _sync()
    client, _ = _client(Role.BUREAU_ADMIN)
    resp = client.patch(
        _detail(rencontre),
        {"score_domicile": 1, "score_exterieur": 0, "statut": "SCHEDULED"},
        format="json",
    )
    assert resp.data["statut"] == "FINISHED"
