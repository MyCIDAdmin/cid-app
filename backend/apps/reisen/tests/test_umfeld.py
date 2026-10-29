"""Tests der Karte „Am Reiseziel“ (Ortszeit, Wetter, Kurs). Es gibt keinen Netzzugriff : alle
Anbieter werden gemockt."""

from datetime import date, timedelta
from unittest.mock import patch

import pytest
import requests
from django.core.cache import cache
from django.utils import timezone

from apps.reisen import umfeld
from apps.reisen.models import Reise

from .test_reisen import BASE, api, neue_reise, offen, user

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _leerer_cache():
    cache.clear()
    yield
    cache.clear()


def _heute_plus(n):
    return (timezone.localdate() + timedelta(days=n)).isoformat()


def _antworten(url, params):
    if url == umfeld.GEOCODING:
        return {
            "results": [
                {
                    "latitude": 36.7,
                    "longitude": 3.1,
                    "country": "Algerien",
                    "country_code": "DZ",
                    "timezone": "Africa/Algiers",
                }
            ]
        }
    if url == umfeld.WETTER:
        tage = [_heute_plus(i) for i in range(16)]
        return {
            "current": {"temperature_2m": 21.4, "weather_code": 1, "is_day": 1},
            "daily": {
                "time": tage,
                "weather_code": [3] * 16,
                "temperature_2m_max": [24.2] * 16,
                "temperature_2m_min": [14.6] * 16,
            },
        }
    if url == umfeld.KURSE:
        return {
            "result": "success",
            "rates": {"DZD": 150.5, "USD": 1.1},
            "time_last_update_utc": "Thu, 29 Oct 2026 00:02:31 +0000",
        }
    raise AssertionError(url)


@pytest.fixture
def netz():
    with patch.object(umfeld, "_get_json", side_effect=_antworten) as m:
        yield m


@pytest.fixture
def orga():
    return user("orga@example.de")


def _reise(orga_user, **extra):
    daten = {
        **offen(),
        "ziel_ort": "Algier",
        "land": "Algerien",
        "start": _heute_plus(3),
        "ende": _heute_plus(6),
        **extra,
    }
    return neue_reise(orga_user, **daten)


def test_umfeld_liefert_zeit_wetter_kurs_und_link(orga, netz):
    rid = _reise(orga)
    r = api(orga).get(f"{BASE}{rid}/umfeld/")
    assert r.status_code == 200
    d = r.data
    assert d["verfuegbar"] is True
    assert d["zeitzone"] == "Africa/Algiers"
    assert d["wetter"]["jetzt"] == {"temp": 21, "code": 1, "tag": True}
    assert [t["datum"] for t in d["wetter"]["tage"]] == [_heute_plus(i) for i in range(3, 7)]
    assert d["wetter"]["tage"][0] == {"datum": _heute_plus(3), "code": 3, "max": 24, "min": 15}
    assert d["kurs"] == {"code": "DZD", "kurs": 150.5, "stand": "29 Oct 2026"}
    assert d["sicherheit"].startswith("https://www.auswaertiges-amt.de/")


def test_zielort_wird_einmal_aufgeloest_und_gemerkt(orga, netz):
    rid = _reise(orga)
    api(orga).get(f"{BASE}{rid}/umfeld/")
    reise = Reise.objects.get(pk=rid)
    assert reise.ziel_waehrung == "DZD" and reise.ziel_zeitzone == "Africa/Algiers"
    aufrufe = [c.args[0] for c in netz.call_args_list].count(umfeld.GEOCODING)
    api(orga).get(f"{BASE}{rid}/umfeld/")
    assert [c.args[0] for c in netz.call_args_list].count(umfeld.GEOCODING) == aufrufe == 1


def test_wetter_und_kurs_kommen_aus_dem_cache(orga, netz):
    rid = _reise(orga)
    api(orga).get(f"{BASE}{rid}/umfeld/")
    anzahl = netz.call_count
    api(orga).get(f"{BASE}{rid}/umfeld/")
    assert netz.call_count == anzahl


def test_ohne_zielort_gibt_es_keine_karte(orga, netz):
    rid = _reise(orga, ziel_ort="", land="")
    assert api(orga).get(f"{BASE}{rid}/umfeld/").data == {"verfuegbar": False}
    netz.assert_not_called()


def test_unbekannter_ort_und_netzfehler_brechen_nicht(orga):
    rid = _reise(orga)
    with patch.object(umfeld, "_get_json", return_value={"results": []}):
        assert api(orga).get(f"{BASE}{rid}/umfeld/").data == {"verfuegbar": False}
    cache.clear()
    with patch.object(umfeld, "_get_json", side_effect=requests.ConnectionError("weg")):
        assert api(orga).get(f"{BASE}{rid}/umfeld/").data == {"verfuegbar": False}


def test_ausfall_einer_quelle_blendet_nur_diesen_block_aus(orga):
    rid = _reise(orga)

    def teilweise(url, params):
        if url == umfeld.GEOCODING:
            return _antworten(url, params)
        raise requests.Timeout("zu langsam")

    with patch.object(umfeld, "_get_json", side_effect=teilweise):
        d = api(orga).get(f"{BASE}{rid}/umfeld/").data
    assert d["verfuegbar"] is True and d["wetter"] is None and d["kurs"] is None
    assert d["zeitzone"] == "Africa/Algiers"


def test_euro_land_zeigt_keinen_kurs(orga):
    rid = _reise(orga, ziel_ort="Berlin", land="Deutschland")

    def antworten(url, params):
        if url == umfeld.GEOCODING:
            return {
                "results": [
                    {
                        "latitude": 52.5,
                        "longitude": 13.4,
                        "country": "Deutschland",
                        "country_code": "DE",
                        "timezone": "Europe/Berlin",
                    }
                ]
            }
        return _antworten(url, params)

    with patch.object(umfeld, "_get_json", side_effect=antworten):
        d = api(orga).get(f"{BASE}{rid}/umfeld/").data
    assert d["kurs"] is None


def test_reise_weit_in_der_zukunft_nennt_den_beginn_der_vorhersage(orga, netz):
    rid = _reise(orga, start=_heute_plus(40), ende=_heute_plus(43))
    w = api(orga).get(f"{BASE}{rid}/umfeld/").data["wetter"]
    assert w["tage"] == [] and w["vorhersage_ab"] == _heute_plus(40 - 15)
    assert w["jetzt"]["temp"] == 21


def test_land_mit_abweichender_schreibweise_nimmt_den_einzigen_treffer(orga):
    rid = _reise(orga, land="Algeria")
    with patch.object(umfeld, "_get_json", side_effect=_antworten):
        assert api(orga).get(f"{BASE}{rid}/umfeld/").data["verfuegbar"] is True


def test_unsichtbare_reise_bleibt_404(orga, netz):
    rid = _reise(orga, sichtbarkeit="eingeladen", beitritt="einladung")
    fremd = user("fremd@example.de")
    assert api(fremd).get(f"{BASE}{rid}/umfeld/").status_code == 404


def test_fenster_und_zeitzone_hilfen():
    heute = date(2026, 10, 29)
    assert umfeld._fenster(None, None, heute) == (heute, heute + timedelta(days=4))
    assert umfeld._fenster(date(2026, 10, 1), date(2026, 11, 30), heute) == (
        heute,
        heute + timedelta(days=9),
    )
    assert umfeld.zeitzone_gueltig("Europe/Berlin") == "Europe/Berlin"
    assert umfeld.zeitzone_gueltig("Kein/Ort") == ""
