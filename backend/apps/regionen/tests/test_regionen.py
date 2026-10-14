"""Regionen (Release 26) : Startdaten, Zuordnung, Rechte und Verwaltung."""

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import Role
from apps.membres.tests.factories import MembreFactory
from apps.rbac import services as rbac
from apps.rbac.registry import API_PREFIXES_MENU, VISIBILITE_NON_MEMBRE_DEFAUT
from apps.rbac.tests.factories import UserFactory
from apps.regionen import services
from apps.regionen.models import Region, RegionLand, Standort, Verantwortlicher

pytestmark = pytest.mark.django_db

BASIS = "/api/v1/regionen/"


def _client(user=None):
    c = APIClient()
    if user is not None:
        c.force_authenticate(user)
    return c


def _bild(name="x.png"):
    puffer = io.BytesIO()
    Image.new("RGB", (40, 20), (200, 30, 30)).save(puffer, format="PNG")
    return SimpleUploadedFile(name, puffer.getvalue(), content_type="image/png")


@pytest.fixture
def admin():
    return UserFactory(role=Role.SUPER_ADMIN)


@pytest.fixture
def buero():
    return UserFactory(role=Role.BUREAU_ADMIN)


@pytest.fixture
def nord():
    return Region.objects.get(slug="nord")


def _mitglied(land="NW", **kw):
    user = UserFactory(**kw)
    MembreFactory(user=user, land_de=land, prenom="Mia", nom="Muster")
    user.refresh_from_db()
    return user


def _verantwortlicher(region, user=None, **kw):
    user = user or _mitglied("HH")
    return Verantwortlicher.objects.create(
        region=region, user=user, anzeige_name=kw.pop("anzeige_name", "Ahmed"), **kw
    )


class TestStartdaten:
    def test_vier_startregionen_mit_laendern(self):
        namen = list(Region.objects.values_list("name", flat=True))
        assert namen == ["Nord", "NRW", "Berlin", "München"]
        zuordnung = {
            r.slug: sorted(r.laender.values_list("land", flat=True)) for r in Region.objects.all()
        }
        assert zuordnung["nord"] == ["HB", "HH", "MV", "NI", "SH"]
        assert zuordnung["nrw"] == ["NW"]
        assert zuordnung["berlin"] == ["BB", "BE", "SN", "ST", "TH"]
        assert zuordnung["muenchen"] == ["BW", "BY"]
        assert not RegionLand.objects.filter(land__in=["HE", "RP", "SL"]).exists()

    def test_mitglied_bekommt_region_aus_dem_bundesland(self):
        assert services.meine_region(_mitglied("NW")).slug == "nrw"
        assert services.meine_region(_mitglied("HE")) is None
        assert services.meine_region(UserFactory()) is None  # Konto ohne Mitgliedsprofil

    def test_mitgliederzahl_zaehlt_nur_aktive(self, nord):
        MembreFactory(land_de="HH")
        MembreFactory(land_de="NI")
        MembreFactory(land_de="HH", statut="inaktiv")
        MembreFactory(land_de="BY")
        assert services.mitglieder_zahl(nord) == 2

    def test_menuepunkt_ist_fuer_konten_ohne_mitgliedschaft_freigeschaltet(self):
        assert "regionen" in VISIBILITE_NON_MEMBRE_DEFAUT
        assert ("/api/v1/regionen/", "regionen") in API_PREFIXES_MENU
        assert rbac.gate_nicht_mitglied(UserFactory(), BASIS) is True


class TestLesen:
    def test_anmeldung_noetig(self):
        assert _client().get(BASIS).status_code in (401, 403)

    def test_liste_fuer_mitglied_und_ohne_mitgliedschaft(self, nord):
        _verantwortlicher(nord)
        r = _client(_mitglied("HH")).get(BASIS)
        assert r.status_code == 200 and len(r.data["ergebnisse"]) == 4
        eintrag = next(e for e in r.data["ergebnisse"] if e["slug"] == "nord")
        assert eintrag["meine_region"] is True and eintrag["verantwortliche"][0]["name"] == "Ahmed"
        assert r.data["ohne_region"] is False
        fan = _client(UserFactory()).get(BASIS)
        assert fan.status_code == 200 and fan.data["ohne_region"] is True

    def test_inaktive_region_ist_unsichtbar(self, nord):
        nord.aktiv = False
        nord.save()
        assert len(_client(_mitglied()).get(BASIS).data["ergebnisse"]) == 3
        assert _client(_mitglied()).get(f"{BASIS}nord/").status_code == 404

    def test_detail_zeigt_standorte_laender_und_rechte(self, nord):
        Standort.objects.create(region=nord, name="Hamburg", land="HH")
        Standort.objects.create(region=nord, name="Alt", aktiv=False)
        r = _client(_mitglied()).get(f"{BASIS}nord/")
        assert [s["name"] for s in r.data["standorte"]] == ["Hamburg"]
        assert {x["code"] for x in r.data["laender"]} == {"HH", "HB", "SH", "NI", "MV"}
        assert r.data["darf_bearbeiten"] is False
        assert r.data["darf_personen_verwalten"] is False

    def test_kontakt_email_nur_wenn_freiwillig_eingetragen(self, nord):
        _verantwortlicher(nord, kontakt_email="")
        karte = _client(_mitglied()).get(f"{BASIS}nord/").data["verantwortliche"][0]
        assert karte["kontakt_email"] == "" and "user" not in karte and "email" not in karte


class TestBearbeiten:
    def test_verantwortlicher_aendert_beschreibung_seiner_region(self, nord):
        v = _verantwortlicher(nord)
        r = _client(v.user).patch(
            f"{BASIS}nord/",
            {"beschreibung_de": " Moin! ", "beschreibung_fr": "Salut"},
            format="json",
        )
        assert r.status_code == 200 and r.data["beschreibung"] == {"de": "Moin!", "fr": "Salut"}
        assert r.data["darf_bearbeiten"] is True and r.data["darf_personen_verwalten"] is False

    def test_verantwortlicher_darf_andere_region_nicht_bearbeiten(self):
        v = _verantwortlicher(Region.objects.get(slug="nord"))
        r = _client(v.user).patch(f"{BASIS}nrw/", {"beschreibung_de": "x"}, format="json")
        assert r.status_code == 403

    def test_buero_und_app_admin_duerfen_jede_region_bearbeiten(self, buero, admin):
        for user in (buero, admin):
            r = _client(user).patch(f"{BASIS}nrw/", {"beschreibung_de": "ok"}, format="json")
            assert r.status_code == 200

    def test_mitglied_und_rh_duerfen_nicht(self):
        for user in (_mitglied(), UserFactory(role=Role.RH)):
            r = _client(user).patch(f"{BASIS}nrw/", {"beschreibung_de": "x"}, format="json")
            assert r.status_code == 403

    def test_zu_langer_text_wird_abgelehnt(self, admin):
        r = _client(admin).patch(f"{BASIS}nrw/", {"beschreibung_de": "x" * 4001}, format="json")
        assert r.status_code == 400

    def test_banner_hochladen_und_entfernen(self, nord):
        v = _verantwortlicher(nord)
        c = _client(v.user)
        r = c.post(f"{BASIS}nord/banner/", {"banner": _bild()}, format="multipart")
        assert r.status_code == 200 and r.data["banner_url"]
        r = c.delete(f"{BASIS}nord/banner/")
        assert r.status_code == 200 and r.data["banner_url"] is None

    def test_banner_ohne_datei_oder_kein_bild(self, nord):
        c = _client(_verantwortlicher(nord).user)
        assert c.post(f"{BASIS}nord/banner/", {}, format="multipart").status_code == 400
        text = SimpleUploadedFile("a.png", b"kein bild", content_type="image/png")
        assert (
            c.post(f"{BASIS}nord/banner/", {"banner": text}, format="multipart").status_code == 400
        )

    def test_fremder_darf_kein_banner_hochladen(self):
        r = _client(_mitglied()).post(
            f"{BASIS}nord/banner/", {"banner": _bild()}, format="multipart"
        )
        assert r.status_code == 403


class TestVerantwortliche:
    def test_buero_weist_person_zu(self, buero, nord):
        ziel = _mitglied("HH")
        standort = Standort.objects.create(region=nord, name="Hamburg")
        r = _client(buero).post(
            f"{BASIS}nord/verantwortliche/",
            {"user": str(ziel.id), "funktion": "Ansprechperson", "standort": str(standort.id)},
            format="json",
        )
        assert r.status_code == 201 and r.data["name"] == "Mia Muster"
        assert r.data["standort"]["name"] == "Hamburg"
        assert Verantwortlicher.objects.filter(region=nord, user=ziel).exists()

    def test_doppelte_zuweisung_und_unbekannte_person(self, buero, nord):
        v = _verantwortlicher(nord)
        c = _client(buero)
        assert (
            c.post(
                f"{BASIS}nord/verantwortliche/", {"user": str(v.user_id)}, format="json"
            ).status_code
            == 400
        )
        assert (
            c.post(f"{BASIS}nord/verantwortliche/", {"user": "x"}, format="json").status_code == 400
        )

    def test_person_ohne_mitgliedsprofil_braucht_anzeigenamen(self, buero):
        fan = UserFactory()
        c = _client(buero)
        r = c.post(f"{BASIS}nord/verantwortliche/", {"user": str(fan.id)}, format="json")
        assert r.status_code == 400
        r = c.post(
            f"{BASIS}nord/verantwortliche/", {"user": str(fan.id), "name": "Fan"}, format="json"
        )
        assert r.status_code == 201

    def test_standort_einer_anderen_region_wird_abgelehnt(self, buero):
        fremd = Standort.objects.create(region=Region.objects.get(slug="nrw"), name="Köln")
        r = _client(buero).post(
            f"{BASIS}nord/verantwortliche/",
            {"user": str(_mitglied().id), "standort": str(fremd.id)},
            format="json",
        )
        assert r.status_code == 400

    def test_verantwortliche_duerfen_keine_personen_zuweisen(self, nord):
        v = _verantwortlicher(nord)
        r = _client(v.user).post(
            f"{BASIS}nord/verantwortliche/", {"user": str(_mitglied().id)}, format="json"
        )
        assert r.status_code == 403

    def test_eigene_karte_aendern(self, nord):
        v = _verantwortlicher(nord)
        r = _client(v.user).patch(
            f"{BASIS}nord/verantwortliche/{v.id}/",
            {"funktion": "Fan-Beauftragter", "vorstellung": "Moin!", "kontakt_email": "a@b.de"},
            format="json",
        )
        assert r.status_code == 200 and r.data["kontakt_email"] == "a@b.de" and r.data["eigene"]
        v.refresh_from_db()
        assert v.funktion == "Fan-Beauftragter"

    def test_fremde_karte_nur_fuer_buero(self, nord, buero):
        v = _verantwortlicher(nord)
        andere = _verantwortlicher(nord, anzeige_name="Alex")
        url = f"{BASIS}nord/verantwortliche/{v.id}/"
        assert _client(andere.user).patch(url, {"funktion": "x"}, format="json").status_code == 403
        assert _client(buero).patch(url, {"funktion": "x"}, format="json").status_code == 200

    def test_ungueltige_karteneingaben(self, nord):
        v = _verantwortlicher(nord)
        c = _client(v.user)
        url = f"{BASIS}nord/verantwortliche/{v.id}/"
        assert c.patch(url, {"kontakt_email": "kaputt"}, format="json").status_code == 400
        assert c.patch(url, {"name": "  "}, format="json").status_code == 400
        assert c.patch(url, {"vorstellung": "x" * 1001}, format="json").status_code == 400

    def test_foto_hochladen_und_entfernen(self, nord):
        v = _verantwortlicher(nord)
        c = _client(v.user)
        url = f"{BASIS}nord/verantwortliche/{v.id}/foto/"
        assert c.post(url, {"foto": _bild()}, format="multipart").data["foto_url"]
        assert c.delete(url).data["foto_url"] is None

    def test_entfernen_nur_durch_buero(self, nord, buero):
        v = _verantwortlicher(nord)
        url = f"{BASIS}nord/verantwortliche/{v.id}/"
        assert _client(v.user).delete(url).status_code == 403
        assert _client(buero).delete(url).status_code == 204
        assert not Verantwortlicher.objects.exists()

    def test_personensuche(self, buero):
        ziel = _mitglied("HH")
        c = _client(buero)
        assert c.get(f"{BASIS}personen/?q=Muster").data["ergebnisse"][0]["id"] == str(ziel.id)
        assert c.get(f"{BASIS}personen/?q=M").data["ergebnisse"] == []
        assert _client(_mitglied()).get(f"{BASIS}personen/?q=Muster").status_code == 403


class TestVerwaltung:
    def test_nur_app_admin(self, buero):
        assert _client(buero).get(f"{BASIS}verwaltung/").status_code == 403
        assert (
            _client(_mitglied())
            .post(f"{BASIS}verwaltung/", {"name": "X"}, format="json")
            .status_code
            == 403
        )

    def test_liste_zeigt_laender_ohne_region(self, admin):
        r = _client(admin).get(f"{BASIS}verwaltung/")
        assert r.status_code == 200 and len(r.data["ergebnisse"]) == 4
        assert sorted(r.data["ohne_region"]) == ["HE", "RP", "SL"]
        assert len(r.data["laender"]) == 16

    def test_region_anlegen_mit_eindeutigem_slug(self, admin):
        c = _client(admin)
        r = c.post(f"{BASIS}verwaltung/", {"name": "Süd West", "farbe": "#112233"}, format="json")
        assert r.status_code == 201 and r.data["slug"] == "sued-west"
        assert c.post(f"{BASIS}verwaltung/", {"name": "süd west"}, format="json").status_code == 400
        r = c.post(f"{BASIS}verwaltung/", {"name": "Personen"}, format="json")
        assert r.data["slug"] == "personen-region"

    def test_ungueltige_region_eingaben(self, admin):
        c = _client(admin)
        assert c.post(f"{BASIS}verwaltung/", {"name": ""}, format="json").status_code == 400
        assert (
            c.post(f"{BASIS}verwaltung/", {"name": "X", "farbe": "rot"}, format="json").status_code
            == 400
        )
        assert (
            c.post(
                f"{BASIS}verwaltung/", {"name": "X", "reihenfolge": -1}, format="json"
            ).status_code
            == 400
        )

    def test_region_aendern_und_deaktivieren(self, admin, nord):
        r = _client(admin).patch(
            f"{BASIS}verwaltung/{nord.id}/",
            {"name": "Norden", "farbe": "#000000", "reihenfolge": 9, "aktiv": False},
            format="json",
        )
        assert r.status_code == 200 and r.data["name"] == "Norden" and r.data["aktiv"] is False
        assert (
            _client(admin)
            .patch(f"{BASIS}verwaltung/{nord.id}/", {"name": "NRW"}, format="json")
            .status_code
            == 400
        )

    def test_laender_zuordnen_verschiebt_von_anderer_region(self, admin, nord):
        r = _client(admin).put(
            f"{BASIS}verwaltung/{nord.id}/laender/", {"laender": ["HH", "HE", "NW"]}, format="json"
        )
        assert r.status_code == 200 and sorted(r.data["laender"]) == ["HE", "HH", "NW"]
        assert RegionLand.objects.get(land="NW").region == nord
        assert not Region.objects.get(slug="nrw").laender.exists()
        assert RegionLand.objects.get(land="HE").region == nord

    def test_ungueltige_laenderliste(self, admin, nord):
        c = _client(admin)
        assert (
            c.put(
                f"{BASIS}verwaltung/{nord.id}/laender/", {"laender": ["XX"]}, format="json"
            ).status_code
            == 400
        )
        assert (
            c.put(
                f"{BASIS}verwaltung/{nord.id}/laender/", {"laender": "HH"}, format="json"
            ).status_code
            == 400
        )

    def test_region_mit_verantwortlichen_ist_nicht_loeschbar(self, admin, nord):
        v = _verantwortlicher(nord)
        c = _client(admin)
        assert c.delete(f"{BASIS}verwaltung/{nord.id}/").status_code == 400
        v.delete()
        assert c.delete(f"{BASIS}verwaltung/{nord.id}/").status_code == 204
        assert not Region.objects.filter(slug="nord").exists()

    def test_standorte_verwalten(self, admin, nord):
        c = _client(admin)
        r = c.post(
            f"{BASIS}verwaltung/{nord.id}/standorte/",
            {"name": "Bremen", "land": "HB"},
            format="json",
        )
        assert r.status_code == 201
        sid = r.data["id"]
        assert (
            c.post(
                f"{BASIS}verwaltung/{nord.id}/standorte/", {"name": "bremen"}, format="json"
            ).status_code
            == 400
        )
        assert (
            c.post(
                f"{BASIS}verwaltung/{nord.id}/standorte/",
                {"name": "X", "land": "ZZ"},
                format="json",
            ).status_code
            == 400
        )
        r = c.patch(
            f"{BASIS}verwaltung/standorte/{sid}/",
            {"name": "Bremerhaven", "aktiv": False},
            format="json",
        )
        assert r.status_code == 200 and r.data["name"] == "Bremerhaven" and r.data["aktiv"] is False
        assert c.delete(f"{BASIS}verwaltung/standorte/{sid}/").status_code == 204
        assert not Standort.objects.exists()

    def test_standort_loeschen_laesst_karte_bestehen(self, admin, nord):
        s = Standort.objects.create(region=nord, name="Bremen")
        v = _verantwortlicher(nord, standort=s)
        _client(admin).delete(f"{BASIS}verwaltung/standorte/{s.id}/")
        v.refresh_from_db()
        assert v.standort is None
