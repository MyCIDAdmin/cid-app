"""Weitere Länder (Release 36) : Sektoren außerhalb Deutschlands (z. B. Dänemark, Frankreich)."""

import pytest

from apps.accounts.models import Role
from apps.membres.models import StatutMembre
from apps.membres.tests.factories import MembreFactory
from apps.rbac.tests.factories import UserFactory
from apps.regionen import services
from apps.regionen.models import FanProfil, Region, RegionPays
from apps.regionen.tests.test_fan import _anmelden, _fan
from apps.regionen.tests.test_regionen import BASIS, _client

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin():
    return UserFactory(role=Role.SUPER_ADMIN)


@pytest.fixture
def nord():
    return Region.objects.get(slug="nord")


@pytest.fixture
def nord_mit_dk(nord):
    RegionPays.objects.create(region=nord, pays="DK")
    return nord


class TestZuordnung:
    def test_staaten_festlegen_und_verschieben(self, admin, nord):
        c = _client(admin)
        r = c.put(f"{BASIS}verwaltung/{nord.id}/staaten/", {"staaten": ["DK", "FR"]}, format="json")
        assert r.status_code == 200 and sorted(r.data["staaten"]) == ["DK", "FR"]
        nrw = Region.objects.get(slug="nrw")
        r = c.put(f"{BASIS}verwaltung/{nrw.id}/staaten/", {"staaten": ["FR"]}, format="json")
        assert r.status_code == 200
        assert RegionPays.objects.get(pays="FR").region == nrw
        assert list(nord.staaten.values_list("pays", flat=True)) == ["DK"]

    @pytest.mark.parametrize("wert", [["DE"], ["XX"], ["ZZ"], "DK"])
    def test_ungueltige_staatenliste(self, admin, nord, wert):
        r = _client(admin).put(
            f"{BASIS}verwaltung/{nord.id}/staaten/", {"staaten": wert}, format="json"
        )
        assert r.status_code == 400

    def test_nur_app_admin(self, nord):
        buero = UserFactory(role=Role.BUREAU_ADMIN)
        r = _client(buero).put(
            f"{BASIS}verwaltung/{nord.id}/staaten/", {"staaten": ["DK"]}, format="json"
        )
        assert r.status_code == 403

    def test_verwaltung_listet_staaten_und_freie_staaten(self, admin, nord_mit_dk):
        d = _client(admin).get(f"{BASIS}verwaltung/").data
        nord = next(x for x in d["ergebnisse"] if x["slug"] == "nord")
        assert nord["staaten"] == ["DK"]
        frei = set(d["staaten_ohne_region"])
        assert "FR" in frei and "DK" not in frei and "DE" not in frei and "XX" not in frei


class TestZuordnungLogik:
    def test_region_von_gebiet(self, nord_mit_dk):
        assert services.region_von_gebiet("DK", "") == nord_mit_dk
        assert services.region_von_gebiet("DE", "HH") == nord_mit_dk
        assert services.region_von_gebiet("FR", "") is None
        # Im Inland entscheidet das Bundesland, nie ein Ausland-Eintrag.
        assert services.region_von_gebiet("DE", "BY").slug == "muenchen"

    def test_mitglied_im_ausland_zaehlt_im_sektor(self, nord_mit_dk):
        vorher = services.mitglieder_zahl(nord_mit_dk)
        user = UserFactory()
        MembreFactory(user=user, pays="DK", land_de="", statut=StatutMembre.ACTIF)
        user.refresh_from_db()
        assert services.meine_region(user) == nord_mit_dk
        assert services.mitglieder_zahl(nord_mit_dk) == vorher + 1


class TestFanImAusland:
    def test_optionen_nennen_staaten_mit_sektor(self, nord_mit_dk):
        d = _client().get(f"{BASIS}fan/optionen/").data
        staaten = {x["code"]: x for x in d["staaten"]}
        assert staaten["DK"]["region"]["slug"] == "nord"
        assert staaten["FR"]["region"] is None and "DE" not in staaten

    def test_registrierung_mit_land_ignoriert_bundesland(self, nord_mit_dk):
        r, _ = _anmelden(pays="DK", land_de="BY")
        assert r.status_code == 201, r.data
        profil = FanProfil.objects.get(user__email__iexact="fan@example.org")
        assert profil.pays == "DK" and profil.land_de == ""

    def test_registrierung_ohne_pays_bleibt_deutschland(self):
        r, _ = _anmelden()
        assert r.status_code == 201, r.data
        assert FanProfil.objects.get(user__email__iexact="fan@example.org").pays == "DE"

    def test_land_wechsel_aendert_sektor(self, nord_mit_dk):
        fan = _fan(land_de="BY")
        r = _client(fan).patch(f"{BASIS}fan/", {"pays": "DK"}, format="json")
        assert r.status_code == 200, r.data
        assert r.data["pays"] == "DK" and r.data["region"]["slug"] == "nord"
        r = _client(fan).patch(f"{BASIS}fan/", {"pays": "DE", "land_de": "BY"}, format="json")
        assert r.data["region"]["slug"] == "muenchen"
