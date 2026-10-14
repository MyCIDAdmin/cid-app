"""Tests — Sitzungsmodus und Terminfindung (Release 18)."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import Role
from apps.kalender.models import Beschluss, TerminEinladung
from apps.projets.models import Aufgabe
from apps.projets.tests.factories import ProjetFactory

from .test_kalender import TERMINE, _client, _eintraege, _termin, _titel, _user

pytestmark = pytest.mark.django_db

UMFRAGEN = "/api/v1/kalender/terminumfragen/"


@pytest.fixture
def bureau():
    return _user(Role.BUREAU_ADMIN, "bureau@example.de")[0]


def _sitzung_url(termin_id, rest=""):
    return f"{TERMINE}{termin_id}/sitzung/{rest}"


def _sitzungstermin(bureau, einladen=()):
    termin = _termin(bureau, titel="Vorstandssitzung", kategorie="sitzung")
    for user_id in einladen:
        TerminEinladung.objects.create(termin=termin, user_id=user_id)
    return str(termin.pk)


def test_tagesordnung_und_protokoll_speichern(bureau):
    tid = _sitzungstermin(bureau)
    c = _client(bureau)
    antwort = c.put(
        _sitzung_url(tid),
        {
            "tops": [{"titel": "Begrüßung"}, {"titel": "Finanzen", "beschreibung": "Kassenstand"}],
            "protokoll": "Alle waren da.",
        },
        format="json",
    )
    assert antwort.status_code == 200, antwort.data
    assert [t["titel"] for t in antwort.data["tops"]] == ["Begrüßung", "Finanzen"]
    assert antwort.data["protokoll"] == "Alle waren da."
    # Zweites Speichern mit ids : ein Punkt entfällt, der andere bleibt (gleiche id).
    erste = antwort.data["tops"][1]
    antwort = c.put(_sitzung_url(tid), {"tops": [erste]}, format="json")
    assert [t["id"] for t in antwort.data["tops"]] == [erste["id"]]


def test_protokoll_nur_fuer_eingeladene_und_bearbeiten_nur_verwaltung(bureau):
    eingeladen, _ = _user(email="e@example.de")
    fremd, _ = _user(email="f@example.de")
    tid = _sitzungstermin(bureau, einladen=[str(eingeladen.pk)])
    # Fremde sehen weder Termin (Kreis Bureau) noch Sitzung.
    assert _client(fremd).get(_sitzung_url(tid)).status_code == 404
    _client(bureau).put(_sitzung_url(tid), {"protokoll": "geheim"}, format="json")
    antwort = _client(eingeladen).get(_sitzung_url(tid))
    assert antwort.status_code == 200
    assert antwort.data["protokoll"] == "geheim"
    assert antwort.data["darf_bearbeiten"] is False
    assert (
        _client(eingeladen).put(_sitzung_url(tid), {"protokoll": "x"}, format="json").status_code
        == 403
    )


def test_beschluss_wird_zur_projekt_aufgabe(bureau):
    verantwortlich, v_membre = _user(email="v@example.de")
    projekt = ProjetFactory()
    tid = _sitzungstermin(bureau, einladen=[str(verantwortlich.pk)])
    c = _client(bureau)
    antwort = c.post(
        _sitzung_url(tid, "beschluesse/"),
        {
            "text": "Flyer drucken lassen",
            "verantwortlich": str(verantwortlich.pk),
            "frist": "2026-11-30",
        },
        format="json",
    )
    assert antwort.status_code == 201, antwort.data
    bid = antwort.data["id"]
    # Ohne Projekt : Fehler
    assert (
        c.post(_sitzung_url(tid, f"beschluesse/{bid}/aufgabe/"), {}, format="json").status_code
        == 400
    )
    antwort = c.post(
        _sitzung_url(tid, f"beschluesse/{bid}/aufgabe/"),
        {"projekt": str(projekt.pk)},
        format="json",
    )
    assert antwort.status_code == 201, antwort.data
    aufgabe = Aufgabe.objects.get(projet=projekt)
    assert aufgabe.titel == "Flyer drucken lassen"
    assert aufgabe.verantwortlich == v_membre
    assert str(aufgabe.frist) == "2026-11-30"
    assert Beschluss.objects.get(pk=bid).aufgabe == aufgabe
    # Nur einmal
    assert (
        c.post(
            _sitzung_url(tid, f"beschluesse/{bid}/aufgabe/"),
            {"projekt": str(projekt.pk)},
            format="json",
        ).status_code
        == 400
    )


def test_protokoll_versenden_an_eingeladene(bureau, mailoutbox):
    eingeladen, _ = _user(email="e@example.de")
    tid = _sitzungstermin(bureau, einladen=[str(eingeladen.pk)])
    c = _client(bureau)
    assert c.post(_sitzung_url(tid, "versenden/")).status_code == 400  # noch nichts zu senden
    c.put(_sitzung_url(tid), {"protokoll": "Kurz und gut."}, format="json")
    c.post(_sitzung_url(tid, "beschluesse/"), {"text": "Fest planen"}, format="json")
    antwort = c.post(_sitzung_url(tid, "versenden/"))
    assert antwort.status_code == 200, antwort.data
    assert {m.to[0] for m in mailoutbox} >= {"e@example.de", "bureau@example.de"}
    assert "Fest planen" in mailoutbox[0].body
    assert c.get(_sitzung_url(tid)).data["versendet_am"] is not None


def _umfrage_payload(teilnehmer, **extra):
    start = timezone.now() + timedelta(days=7)
    daten = {
        "titel": "Vorstandssitzung November",
        "ort": "Köln",
        "dauer_minuten": 90,
        "optionen": [
            {"beginn": start.isoformat()},
            {"beginn": (start + timedelta(days=1)).isoformat()},
        ],
        "teilnehmer": [str(u.pk) for u in teilnehmer],
    }
    daten.update(extra)
    return daten


def test_terminfindung_von_der_abfrage_bis_zum_termin(bureau):
    a, _ = _user(email="a@example.de")
    b, _ = _user(email="b@example.de")
    fremd, _ = _user(email="f@example.de")
    c = _client(bureau)
    antwort = c.post(UMFRAGEN, _umfrage_payload([a, b]), format="json")
    assert antwort.status_code == 201, antwort.data
    uid = antwort.data["id"]
    optionen = [o["id"] for o in antwort.data["optionen"]]

    # Nur Teilnehmer sehen die Abfrage ; Fremde nicht.
    assert _client(fremd).get(f"{UMFRAGEN}{uid}/").status_code == 404
    assert len(_client(a).get(UMFRAGEN).data) == 1

    # Abstimmen (ändern erlaubt), Fremde nicht.
    stimmen = {optionen[0]: "ja", optionen[1]: "nein"}
    assert (
        _client(a)
        .post(f"{UMFRAGEN}{uid}/abstimmen/", {"stimmen": stimmen}, format="json")
        .status_code
        == 200
    )
    _client(b).post(
        f"{UMFRAGEN}{uid}/abstimmen/", {"stimmen": {optionen[0]: "vielleicht"}}, format="json"
    )
    assert (
        _client(fremd)
        .post(f"{UMFRAGEN}{uid}/abstimmen/", {"stimmen": stimmen}, format="json")
        .status_code
        == 404
    )
    assert (
        _client(a)
        .post(f"{UMFRAGEN}{uid}/abstimmen/", {"stimmen": {"x": "ja"}}, format="json")
        .status_code
        == 400
    )

    # Teilnehmer sehen nur Zahlen, das Bureau auch die Namen.
    als_a = _client(a).get(f"{UMFRAGEN}{uid}/").data
    assert als_a["optionen"][0]["ja"] == 1 and als_a["optionen"][0]["vielleicht"] == 1
    assert als_a["optionen"][0]["stimmen"] == []
    als_bureau = c.get(f"{UMFRAGEN}{uid}/").data
    assert len(als_bureau["optionen"][0]["stimmen"]) == 2

    # Entscheiden : nur mit Schreibrecht ; danach gibt es Termin + Einladungen.
    assert (
        _client(a)
        .post(f"{UMFRAGEN}{uid}/entscheiden/", {"option": optionen[0]}, format="json")
        .status_code
        == 403
    )
    antwort = c.post(f"{UMFRAGEN}{uid}/entscheiden/", {"option": optionen[0]}, format="json")
    assert antwort.status_code == 200, antwort.data
    assert antwort.data["status"] == "entschieden"
    termin_id = antwort.data["termin"]
    assert TerminEinladung.objects.filter(termin_id=termin_id).count() == 2
    assert "Vorstandssitzung November" in _titel(_eintraege(a, "meine"))
    # Danach keine Stimmen und keine zweite Entscheidung mehr.
    assert (
        _client(a)
        .post(f"{UMFRAGEN}{uid}/abstimmen/", {"stimmen": stimmen}, format="json")
        .status_code
        == 400
    )
    assert (
        c.post(f"{UMFRAGEN}{uid}/entscheiden/", {"option": optionen[1]}, format="json").status_code
        == 400
    )


def test_terminfindung_anlegen_nur_mit_schreibrecht_und_pruefungen(bureau):
    a, _ = _user(email="a@example.de")
    assert _client(a).post(UMFRAGEN, _umfrage_payload([a]), format="json").status_code == 403
    c = _client(bureau)
    einzeln = _umfrage_payload([a])
    einzeln["optionen"] = einzeln["optionen"][:1]
    assert c.post(UMFRAGEN, einzeln, format="json").status_code == 400
    assert c.post(UMFRAGEN, _umfrage_payload([]), format="json").status_code == 400
    assert c.post(UMFRAGEN, _umfrage_payload([a], titel=" "), format="json").status_code == 400


def test_terminfindung_abbrechen(bureau):
    a, _ = _user(email="a@example.de")
    c = _client(bureau)
    uid = c.post(UMFRAGEN, _umfrage_payload([a]), format="json").data["id"]
    antwort = c.delete(f"{UMFRAGEN}{uid}/")
    assert antwort.data["status"] == "abgebrochen"
    assert _client(a).delete(f"{UMFRAGEN}{uid}/").status_code == 403
