"""Spalte "Form" der Tabelle (2026-10-06) : aus beendeten Rencontres abgeleitet, sonst leer."""

import datetime

import pytest

from apps.communaute.models import StatutRencontre
from apps.communaute.serializers import ClassementLigueSerializer

from .factories import ClassementLigueFactory, RencontreCalendrierFactory

pytestmark = pytest.mark.django_db


def _spiel(tage, heim, gast, tore_heim, tore_gast):
    return RencontreCalendrierFactory(
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
