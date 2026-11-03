"""Abstimmungen und Wahlen unter einem Dach (Welle 2e): Wahl-Abstimmungen im alten Bereich."""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.vote.tests.factories import VoteSessionFactory
from apps.wahlen.tests.factories import mitglied, verwaltung
from apps.wahlen.tests.test_ergebnis import geoeffnet

pytestmark = pytest.mark.django_db

LISTE = "vote:vote-session-list"


def als(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def test_das_buero_kann_die_abstimmung_einer_wahl_nicht_vorzeitig_schliessen():
    wahl, _a, _k = geoeffnet()
    antwort = als(verwaltung()).post(
        reverse("vote:vote-session-cloturer", args=[wahl.vote_session_id])
    )
    assert antwort.status_code == 400
    assert "Wahl" in str(antwort.data)
    wahl.vote_session.refresh_from_db()
    assert wahl.vote_session.statut == "ouverte"


def test_schnell_abstimmungen_lassen_sich_weiter_schliessen():
    session = VoteSessionFactory(statut="ouverte", created_by=verwaltung())
    antwort = als(verwaltung()).post(reverse("vote:vote-session-cloturer", args=[session.id]))
    assert antwort.status_code == 200


def test_liste_filtert_nach_art_und_nennt_die_wahl():
    wahl, _a, _k = geoeffnet()
    schnell = VoteSessionFactory(statut="ouverte", created_by=verwaltung())
    client = als(mitglied()[0])
    alle = {s["id"]: s for s in client.get(reverse(LISTE)).data["results"]}
    assert str(wahl.vote_session_id) in alle and str(schnell.id) in alle
    assert alle[str(wahl.vote_session_id)]["wahl"] == {"id": str(wahl.id), "titel": wahl.titel}
    assert alle[str(schnell.id)]["wahl"] is None
    nur_schnell = client.get(reverse(LISTE), {"art": "schnell"}).data["results"]
    assert [s["id"] for s in nur_schnell] == [str(schnell.id)]
    nur_wahl = client.get(reverse(LISTE), {"art": "wahl"}).data["results"]
    assert [s["id"] for s in nur_wahl] == [str(wahl.vote_session_id)]


def test_einzelabruf_nennt_die_wahl():
    wahl, _a, _k = geoeffnet()
    antwort = als(mitglied()[0]).get(
        reverse("vote:vote-session-detail", args=[wahl.vote_session_id])
    )
    assert antwort.data["wahl"]["id"] == str(wahl.id)
