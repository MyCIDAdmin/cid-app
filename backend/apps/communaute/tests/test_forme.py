"""Spalte "Form" der Tabelle (2026-10-06) : aus beendeten Rencontres abgeleitet, sonst leer."""

import datetime

import pytest

from apps.communaute.models import StatutRencontre
from apps.communaute.serializers import ClassementLigueSerializer, est_ligue_1

from .factories import ClassementLigueFactory, RencontreCalendrierFactory

pytestmark = pytest.mark.django_db


def _spiel(tage, heim, gast, tore_heim, tore_gast, competition="Ligue 1"):
    return RencontreCalendrierFactory(
        competition=competition,
        equipe_domicile=heim,
        equipe_exterieur=gast,
        date_heure=datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)
        + datetime.timedelta(days=tage),
        score_domicile=tore_heim,
        score_exterieur=tore_gast,
        statut=StatutRencontre.TERMINEE,
    )


def test_form_wird_aus_beendeten_spielen_abgeleitet():
    eintrag = ClassementLigueFactory(equipe="Club Africain", joues=5, forme_recente="")
    ergebnisse = [(2, 0), (1, 1), (0, 3), (4, 1), (2, 2)]
    for i, (heim, gast) in enumerate(ergebnisse):
        _spiel(i, "Club Africain", f"Gegner {i}", heim, gast)
    assert ClassementLigueSerializer(eintrag).data["forme_recente"] == "VNDVN"


def test_form_leer_wenn_spiele_fehlen():
    eintrag = ClassementLigueFactory(equipe="ES Tunis", joues=10, forme_recente="")
    _spiel(0, "Club Africain", "ES Tunis", 1, 0)
    assert ClassementLigueSerializer(eintrag).data["forme_recente"] == ""


def test_gespeicherte_form_hat_vorrang():
    eintrag = ClassementLigueFactory(equipe="Club Africain", forme_recente="VVVVV")
    assert ClassementLigueSerializer(eintrag).data["forme_recente"] == "VVVVV"


def test_form_zaehlt_nur_ligue_1_spiele():
    eintrag = ClassementLigueFactory(equipe="Club Africain", joues=5, forme_recente="")
    for i in range(5):
        _spiel(i, "Club Africain", f"Gegner {i}", 1, 0)  # fünf Siege in der Liga
    # Pokalniederlage und CAF-Spiel danach dürfen die Form nicht verändern
    _spiel(10, "Club Africain", "Pokalgegner", 0, 3, competition="Coupe de Tunisie")
    _spiel(11, "Club Africain", "Afrika", 0, 2, competition="CAF Champions League")
    assert ClassementLigueSerializer(eintrag).data["forme_recente"] == "VVVVV"


def test_form_leer_wenn_ligue_1_spiele_fehlen_obwohl_pokalspiele_da_sind():
    eintrag = ClassementLigueFactory(equipe="Club Africain", joues=5, forme_recente="")
    for i in range(5):
        _spiel(i, "Club Africain", f"Gegner {i}", 1, 0, competition="Coupe de Tunisie")
    assert ClassementLigueSerializer(eintrag).data["forme_recente"] == ""


def test_est_ligue_1_erkennt_namensvarianten():
    assert est_ligue_1("Ligue 1")
    assert est_ligue_1("Ligue 1 Tunisie")
    assert est_ligue_1("Tunisian Ligue Professionnelle 1")
    assert not est_ligue_1("Coupe de Tunisie")
    assert not est_ligue_1("CAF Champions League")
    assert not est_ligue_1("")
