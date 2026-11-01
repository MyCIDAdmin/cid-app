"""Tests — Fan-Club-Umbau (2026-11) : Tipps aller Mitglieder erst nach der Sperre, Rangliste mit
Trend, Spieler des Spiels, Wettbewerbsart, Tabellen-Trend und Kalender-Abo."""

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.communaute import fanclub, services
from apps.communaute.models import (
    ClassementLigue,
    SpielerStimme,
    StatutPaiementTeilnahme,
    StatutRencontre,
)
from apps.communaute.tests.factories import (
    ClassementLigueFactory,
    RencontreCalendrierFactory,
    StatistiqueJoueurFactory,
    TippspielFactory,
    TippspielTeilnahmeFactory,
    TippspielTipFactory,
)
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db


def _user(role=Role.MEMBRE, email="a@example.com", **membre_kwargs):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    membre = MembreFactory(user=user, **membre_kwargs)
    return user, membre


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _spiel(delta_tage, **kwargs):
    """Spiel von Club Africain in `delta_tage` Tagen (negativ = Vergangenheit)."""
    return RencontreCalendrierFactory(
        competition="Ligue 1",
        date_heure=timezone.now() + timedelta(days=delta_tage),
        **kwargs,
    )


def _beendet(delta_tage, dom, ext, **kwargs):
    return _spiel(
        delta_tage,
        statut=StatutRencontre.TERMINEE,
        score_domicile=dom,
        score_exterieur=ext,
        **kwargs,
    )


def _tipp(teilnahme, rencontre, dom, ext, punkte=None):
    return TippspielTipFactory(
        teilnahme=teilnahme,
        rencontre=rencontre,
        score_domicile=dom,
        score_exterieur=ext,
        points=punkte,
    )


# ---------------------------------------------------------------------------
# Sperre
# ---------------------------------------------------------------------------


def test_sperre_ein_tag_vor_anpfiff():
    assert fanclub.tipps_gesperrt(_spiel(0.5)) is True
    assert fanclub.tipps_gesperrt(_spiel(2)) is False


def test_sperre_gilt_auch_fuer_beendete_und_verschobene_spiele():
    assert fanclub.tipps_gesperrt(_beendet(-3, 1, 0)) is True
    assert fanclub.tipps_gesperrt(_spiel(10, statut=StatutRencontre.REPORTEE)) is True


# ---------------------------------------------------------------------------
# Matrix : Sichtbarkeit
# ---------------------------------------------------------------------------


@pytest.fixture
def szene():
    """Tippspiel mit drei Teilnehmern, einem beendeten, einem gesperrten und einem offenen Spiel."""
    tippspiel = TippspielFactory()
    user_a, membre_a = _user(email="a@example.com", prenom="Sana", nom="Weber")
    user_b, membre_b = _user(email="b@example.com", prenom="Riadh", nom="Ben Salah")
    user_c, membre_c = _user(email="c@example.com", prenom="Mehdi", nom="Trabelsi")
    ta = TippspielTeilnahmeFactory(tippspiel=tippspiel, membre=membre_a)
    tb = TippspielTeilnahmeFactory(tippspiel=tippspiel, membre=membre_b)
    tc = TippspielTeilnahmeFactory(tippspiel=tippspiel, membre=membre_c)
    beendet = _beendet(-7, 2, 1)
    gesperrt = _spiel(0.5)
    offen = _spiel(6)
    _tipp(ta, beendet, 2, 1, 4)
    _tipp(tb, beendet, 1, 0, 1)
    _tipp(tc, beendet, 0, 2, 0)
    _tipp(ta, gesperrt, 1, 1)
    _tipp(tb, gesperrt, 2, 0)
    _tipp(ta, offen, 3, 0)
    return {
        "tippspiel": tippspiel,
        "users": (user_a, user_b, user_c),
        "beendet": beendet,
        "gesperrt": gesperrt,
        "offen": offen,
    }


def _matrix(user, tippspiel, **params):
    r = _client(user).get(
        reverse("communaute:tippspiel-matrix"),
        {"tippspiel": str(tippspiel.id), **params},
    )
    assert r.status_code == 200, r.content
    return r.data


def test_matrix_zeigt_tipps_der_anderen_nach_sperre(szene):
    daten = _matrix(szene["users"][0], szene["tippspiel"])
    assert daten["tipps_sichtbar"] is True
    ids = [s["id"] for s in daten["spalten"]]
    assert ids == [str(szene["beendet"].id), str(szene["gesperrt"].id)]
    zeile_b = next(z for z in daten["zeilen"] if z["name"] == "Riadh B.")
    assert zeile_b["tipps"][str(szene["gesperrt"].id)] == {"d": 2, "e": 0, "p": None}
    assert zeile_b["tipps"][str(szene["beendet"].id)] == {"d": 1, "e": 0, "p": 1}


def test_matrix_zeigt_nie_tipps_offener_spiele(szene):
    daten = _matrix(szene["users"][0], szene["tippspiel"])
    offen_id = str(szene["offen"].id)
    assert offen_id not in [s["id"] for s in daten["spalten"]]
    for zeile in daten["zeilen"]:
        assert offen_id not in zeile["tipps"]


def test_matrix_nur_vorname_und_initial(szene):
    daten = _matrix(szene["users"][0], szene["tippspiel"])
    namen = {z["name"] for z in daten["zeilen"]}
    assert namen == {"Sana W.", "Riadh B.", "Mehdi T."}


def test_matrix_markiert_eigene_zeile(szene):
    daten = _matrix(szene["users"][1], szene["tippspiel"])
    eigene = [z for z in daten["zeilen"] if z["ist_ich"]]
    assert len(eigene) == 1 and eigene[0]["name"] == "Riadh B."


def test_nicht_teilnehmer_sieht_nur_rangliste_ohne_tipps(szene):
    fremd, _ = _user(email="fremd@example.com", prenom="Nora", nom="Klein")
    daten = _matrix(fremd, szene["tippspiel"])
    assert daten["tipps_sichtbar"] is False
    assert daten["zeilen"] and all(z["tipps"] == {} for z in daten["zeilen"])


def test_unbestaetigte_teilnahme_sieht_keine_tipps(szene):
    tippspiel = TippspielFactory(montant_participation="10.00")
    user, membre = _user(email="wartet@example.com", prenom="Lina", nom="Meyer")
    TippspielTeilnahmeFactory(
        tippspiel=tippspiel,
        membre=membre,
        statut_paiement=StatutPaiementTeilnahme.EN_ATTENTE,
    )
    daten = _matrix(user, tippspiel)
    assert daten["tipps_sichtbar"] is False
    assert daten["teilnehmer"] == 0


def test_unbestaetigte_teilnehmer_stehen_nicht_in_der_matrix(szene):
    _, membre = _user(email="offen@example.com", prenom="Omar", nom="Lang")
    TippspielTeilnahmeFactory(
        tippspiel=szene["tippspiel"],
        membre=membre,
        statut_paiement=StatutPaiementTeilnahme.EN_ATTENTE,
    )
    daten = _matrix(szene["users"][0], szene["tippspiel"])
    assert daten["teilnehmer"] == 3


def test_administrator_sieht_tipps_ohne_teilnahme(szene):
    admin, _ = _user(role=Role.SUPER_ADMIN, email="root@example.com", prenom="Root", nom="Admin")
    assert _matrix(admin, szene["tippspiel"])["tipps_sichtbar"] is True


def test_matrix_verlangt_anmeldung_und_parameter(szene):
    r = APIClient().get(
        reverse("communaute:tippspiel-matrix"),
        {"tippspiel": str(szene["tippspiel"].id)},
    )
    assert r.status_code in (401, 403)
    c = _client(szene["users"][0])
    assert c.get(reverse("communaute:tippspiel-matrix")).status_code == 400
    assert c.get(reverse("communaute:tippspiel-matrix"), {"tippspiel": "kaputt"}).status_code == 400


def test_matrix_entwurf_nur_fuer_administrator(szene):
    entwurf = TippspielFactory(statut="brouillon")
    r = _client(szene["users"][0]).get(
        reverse("communaute:tippspiel-matrix"), {"tippspiel": str(entwurf.id)}
    )
    assert r.status_code == 404


def test_matrix_begrenzt_die_zahl_der_spalten(szene):
    ta = szene["tippspiel"].participations.first()
    for i in range(1, 6):
        _tipp(ta, _beendet(-10 - i, 1, 0), 1, 0, 4)
    daten = _matrix(szene["users"][0], szene["tippspiel"], spalten=3)
    assert len(daten["spalten"]) == 3
    # die jüngsten, zeitlich aufsteigend
    zeiten = [s["date_heure"] for s in daten["spalten"]]
    assert zeiten == sorted(zeiten)
    assert str(szene["gesperrt"].id) in [s["id"] for s in daten["spalten"]]


# ---------------------------------------------------------------------------
# Matrix : Rangliste, Trend, exakte Treffer
# ---------------------------------------------------------------------------


def test_rangliste_punkte_exakt_und_rang(szene):
    daten = _matrix(szene["users"][0], szene["tippspiel"])
    reihenfolge = [(z["rang"], z["name"], z["punkte"], z["exakt"]) for z in daten["zeilen"]]
    assert reihenfolge == [
        (1, "Sana W.", 4, 1),
        (2, "Riadh B.", 1, 0),
        (3, "Mehdi T.", 0, 0),
    ]


def test_rangliste_trend_gegenueber_dem_letzten_spiel(szene):
    ta = szene["tippspiel"].participations.get(membre__prenom="Sana")
    tb = szene["tippspiel"].participations.get(membre__prenom="Riadh")
    # Früheres Spiel: Riadh führte (2 Punkte), Sana 0. Das jüngste Spiel (4 : 1 Punkte)
    # hat Sana an ihm vorbeigeschoben.
    frueher = _beendet(-20, 3, 0)
    _tipp(tb, frueher, 2, 0, 2)
    _tipp(ta, frueher, 0, 0, 0)
    daten = _matrix(szene["users"][0], szene["tippspiel"])
    sana = next(z for z in daten["zeilen"] if z["name"] == "Sana W.")
    riadh = next(z for z in daten["zeilen"] if z["name"] == "Riadh B.")
    assert sana["rang"] == 1 and sana["rang_vorher"] == 2
    assert riadh["rang"] == 2 and riadh["rang_vorher"] == 1


def test_rangliste_ohne_beendetes_spiel_hat_keinen_trend():
    tippspiel = TippspielFactory()
    user, membre = _user(email="neu@example.com", prenom="Neu", nom="Mitglied")
    TippspielTeilnahmeFactory(tippspiel=tippspiel, membre=membre)
    daten = _matrix(user, tippspiel)
    assert daten["letztes_spiel"] is None
    assert daten["zeilen"][0]["rang_vorher"] is None


def test_letzte_punkte_pro_zeile(szene):
    daten = _matrix(szene["users"][0], szene["tippspiel"])
    assert daten["letztes_spiel"] == str(szene["beendet"].id)
    assert {z["name"]: z["letzte_punkte"] for z in daten["zeilen"]} == {
        "Sana W.": 4,
        "Riadh B.": 1,
        "Mehdi T.": 0,
    }


# ---------------------------------------------------------------------------
# Wettbewerbsart und Spielplan-Feld
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "name,art",
    [
        ("Ligue 1", "liga"),
        ("Tunisian Ligue Professionnelle 1", "liga"),
        ("CAF Champions League", "kontinental"),
        ("African Champions League", "kontinental"),
        ("Ligue des Champions CAF", "kontinental"),
        ("CAF Confederation Cup", "kontinental"),
        ("Coupe de Tunisie", "pokal"),
        ("Tunisian Cup", "pokal"),
        ("Freundschaftsspiel", "sonstige"),
        ("", "sonstige"),
    ],
)
def test_wettbewerb_art(name, art):
    assert fanclub.wettbewerb_art(name) == art


def test_spielplan_liefert_art():
    RencontreCalendrierFactory(competition="CAF Champions League", date_heure=timezone.now())
    r = APIClient().get(reverse("communaute:calendrier-list"))
    assert r.status_code == 200
    assert r.data["results"][0]["art"] == "kontinental"


# ---------------------------------------------------------------------------
# Tabelle : Platz vor dem letzten Spieltag
# ---------------------------------------------------------------------------


def _zeile(**kw):
    return {
        "team": {"name": kw.get("name", "Club Africain")},
        "overallLeaguePosition": kw["rang"],
        "overallLeaguePlayed": kw["spiele"],
        "overallLeaguePTS": kw.get("punkte", 10),
    }


def test_trend_wird_nur_bei_neuem_spieltag_gesetzt():
    saison = services._saison_actuelle()
    services._synchroniser_classement_depuis([_zeile(rang=4, spiele=8)])
    assert ClassementLigue.objects.get(saison=saison).rang_vorher is None
    # gleicher Spieltag, anderer Platz (z. B. Korrektur): kein Vergleichswert
    services._synchroniser_classement_depuis([_zeile(rang=3, spiele=8)])
    assert ClassementLigue.objects.get(saison=saison).rang_vorher is None
    # neuer Spieltag: der bisherige Platz wird zum Vergleichswert
    services._synchroniser_classement_depuis([_zeile(rang=2, spiele=9)])
    zeile = ClassementLigue.objects.get(saison=saison)
    assert (zeile.rang, zeile.rang_vorher) == (2, 3)
    # derselbe Spieltag nochmals synchronisiert: Vergleichswert bleibt
    services._synchroniser_classement_depuis([_zeile(rang=2, spiele=9)])
    assert ClassementLigue.objects.get(saison=saison).rang_vorher == 3


def test_classement_api_liefert_rang_vorher():
    ClassementLigueFactory(saison=services._saison_actuelle(), rang=2, rang_vorher=4)
    r = APIClient().get(reverse("communaute:classement-list"))
    assert r.data["results"][0]["rang_vorher"] == 4


# ---------------------------------------------------------------------------
# Spieler des Spiels
# ---------------------------------------------------------------------------


@pytest.fixture
def kader():
    saison = services._saison_actuelle()
    spieler = [
        StatistiqueJoueurFactory(saison=saison, equipe="Club Africain", nom=n, numero=i + 1)
        for i, n in enumerate(["A. Jlassi", "W. Chaabane", "K. Dridi"])
    ]
    StatistiqueJoueurFactory(saison=saison, equipe="Club Africain", nom="Ersatz", matchs_joues=0)
    StatistiqueJoueurFactory(saison=saison, equipe="Gegner", nom="Fremder")
    return spieler


def _vote_url():
    return reverse("communaute:spieler-des-spiels")


def test_spieler_des_spiels_nimmt_letztes_beendetes_spiel(kader):
    alt = _beendet(-30, 1, 0)
    neu = _beendet(-0.2, 3, 1)
    user, _ = _user()
    r = _client(user).get(_vote_url())
    assert r.status_code == 200
    assert r.data["rencontre"] == str(neu.id)
    assert r.data["offen"] is True
    assert [k["name"] for k in r.data["kandidaten"]] == [
        "A. Jlassi",
        "W. Chaabane",
        "K. Dridi",
    ]
    assert r.data["ergebnis"] is None  # erst nach der eigenen Stimme sichtbar
    assert alt.id != neu.id


def test_ohne_beendetes_spiel_ist_die_antwort_leer():
    user, _ = _user()
    assert _client(user).get(_vote_url()).data == {"rencontre": None}


def test_stimme_abgeben_zeigt_danach_das_ergebnis(kader):
    spiel = _beendet(-0.2, 3, 1)
    user, membre = _user()
    andere, andere_membre = _user(email="b@example.com", prenom="B", nom="B")
    SpielerStimme.objects.create(
        rencontre=spiel,
        membre=andere_membre,
        spieler=kader[1],
        spieler_name=kader[1].nom,
    )
    r = _client(user).post(_vote_url(), {"rencontre": str(spiel.id), "spieler": str(kader[1].id)})
    assert r.status_code == 201, r.content
    assert r.data["meine_stimme"] == str(kader[1].id)
    assert r.data["ergebnis"] == [{"name": "W. Chaabane", "stimmen": 2}]
    assert r.data["stimmen_gesamt"] == 2


def test_zweite_stimme_wird_abgelehnt(kader):
    spiel = _beendet(-0.2, 3, 1)
    user, _ = _user()
    c = _client(user)
    c.post(_vote_url(), {"rencontre": str(spiel.id), "spieler": str(kader[0].id)})
    r = c.post(_vote_url(), {"rencontre": str(spiel.id), "spieler": str(kader[1].id)})
    assert r.status_code == 400
    assert SpielerStimme.objects.count() == 1


def test_stimme_nur_fuer_kaderspieler_mit_einsatz(kader):
    spiel = _beendet(-0.2, 3, 1)
    user, _ = _user()
    c = _client(user)
    ersatz = StatistiqueJoueurFactory(
        saison=services._saison_actuelle(), equipe="Club Africain", matchs_joues=0
    )
    for fremd in (ersatz.id, "00000000-0000-0000-0000-000000000000"):
        r = c.post(_vote_url(), {"rencontre": str(spiel.id), "spieler": str(fremd)})
        assert r.status_code == 400


def test_abstimmung_ist_nach_26_stunden_geschlossen(kader):
    spiel = _beendet(-2, 2, 0)
    user, _ = _user()
    c = _client(user)
    r = c.get(_vote_url(), {"rencontre": str(spiel.id)})
    assert r.data["offen"] is False and r.data["kandidaten"] == []
    assert r.data["ergebnis"] == []  # Ergebnis ist nach Ablauf sichtbar
    r = c.post(_vote_url(), {"rencontre": str(spiel.id), "spieler": str(kader[0].id)})
    assert r.status_code == 400


def test_abstimmung_nicht_fuer_spiele_ohne_den_verein(kader):
    fremd = RencontreCalendrierFactory(
        equipe_domicile="A",
        equipe_exterieur="B",
        statut=StatutRencontre.TERMINEE,
        score_domicile=1,
        score_exterieur=0,
        date_heure=timezone.now() - timedelta(hours=3),
    )
    user, _ = _user()
    assert _client(user).get(_vote_url(), {"rencontre": str(fremd.id)}).status_code == 400


def test_abstimmung_verlangt_anmeldung():
    assert APIClient().get(_vote_url()).status_code in (401, 403)


# ---------------------------------------------------------------------------
# Kalender-Abo
# ---------------------------------------------------------------------------


def test_ics_enthaelt_spiele_und_ist_oeffentlich():
    spiel = RencontreCalendrierFactory(
        competition="CAF Champions League, Gruppe A",
        equipe_domicile="Club Africain",
        equipe_exterieur="Zamalek SC",
        date_heure=timezone.now() + timedelta(days=3),
    )
    r = APIClient().get(reverse("communaute:spielplan-ics"))
    assert r.status_code == 200
    assert r["Content-Type"].startswith("text/calendar")
    text = r.content.decode()
    assert text.startswith("BEGIN:VCALENDAR\r\n") and text.endswith("END:VCALENDAR\r\n")
    assert f"UID:{spiel.id}@cid-fanclub" in text
    assert "SUMMARY:Club Africain – Zamalek SC" in text
    assert "CAF Champions League\\, Gruppe A" in text  # Komma maskiert


def test_ics_markiert_abgesagte_und_verschobene_spiele():
    RencontreCalendrierFactory(statut=StatutRencontre.ANNULEE, date_heure=timezone.now())
    RencontreCalendrierFactory(statut=StatutRencontre.REPORTEE, date_heure=timezone.now())
    text = APIClient().get(reverse("communaute:spielplan-ics")).content.decode()
    assert "STATUS:CANCELLED" in text
    assert "(verschoben)" in text


def test_ics_zeilen_sind_hoechstens_75_byte_lang():
    RencontreCalendrierFactory(
        competition="Ein sehr langer Wettbewerbsname " * 6, date_heure=timezone.now()
    )
    text = APIClient().get(reverse("communaute:spielplan-ics")).content.decode()
    assert all(len(z.encode()) <= 75 for z in text.split("\r\n"))
