"""Regionale Veranstaltungen (Release 28) : Ablauf, Rechte, Anmeldung, Anwesenheit, Seite."""

import datetime

import pytest
from django.utils import timezone

from apps.accounts.models import Role
from apps.notifications.models import Notification
from apps.rbac.tests.factories import UserFactory
from apps.regionen.models import Region, Teilnahme, Veranstaltung, VeranstaltungStatus
from apps.regionen.tests.test_regionen import BASIS, _bild, _client, _mitglied, _verantwortlicher

pytestmark = pytest.mark.django_db
S = VeranstaltungStatus


def _tag(delta=7):
    return (timezone.localdate() + datetime.timedelta(days=delta)).isoformat()


@pytest.fixture
def nord():
    return Region.objects.get(slug="nord")


@pytest.fixture
def karte(nord):
    user = _mitglied("HH")
    _verantwortlicher(nord, user, anzeige_name="Alex")
    return user


@pytest.fixture
def buero():
    return UserFactory(role=Role.BUREAU_ADMIN)


def _neu(user, delta=7, **kw):
    daten = {"titel": "Public Viewing", "datum": _tag(delta), "ort": "Hamburg, Kneipe X"}
    daten.update(kw)
    return _client(user).post(f"{BASIS}nord/veranstaltungen/", daten, format="json")


def _url(pk, ende=""):
    return f"{BASIS}nord/veranstaltungen/{pk}/{ende}"


def _aktion(user, pk, aktion, **kw):
    return _client(user).post(_url(pk, "aktion/"), {"aktion": aktion, **kw}, format="json")


def _veroeffentlichen(karte, buero, delta=7, **kw):
    pk = _neu(karte, delta, **kw).data["id"]
    assert _aktion(karte, pk, "einreichen").status_code == 200
    assert _aktion(buero, pk, "freigeben").status_code == 200
    return pk


class TestAblauf:
    def test_entwurf_von_verantwortlichen_mit_kartenname(self, karte):
        r = _neu(karte, uhrzeit="19:30", max_teilnehmer=20, beschreibung="Spiel schauen")
        assert r.status_code == 201
        assert r.data["status"] == "entwurf" and r.data["ersteller_name"] == "Alex"
        assert r.data["uhrzeit"] == "19:30" and r.data["darf_einreichen"] is True
        assert r.data["darf_freigeben"] is False and "teilen" not in r.data

    def test_nur_verantwortliche_und_buero_legen_an(self, nord):
        assert _neu(_mitglied("HH")).status_code == 403
        assert _neu(UserFactory()).status_code == 403
        anderer = _mitglied("NW")
        _verantwortlicher(Region.objects.get(slug="nrw"), anderer)
        assert _neu(anderer).status_code == 403

    def test_validierung(self, karte):
        assert _neu(karte, titel="").status_code == 400
        assert _neu(karte, datum="morgen").status_code == 400
        assert _neu(karte, uhrzeit="25:99").status_code == 400
        assert _neu(karte, max_teilnehmer=0).status_code == 400
        assert _neu(karte, ort="").status_code == 400
        assert _neu(karte, standort="kein-uuid").status_code == 400

    def test_standort_muss_zur_region_gehoeren(self, karte):
        from apps.regionen.models import Standort

        fremd = Standort.objects.create(region=Region.objects.get(slug="nrw"), name="Köln")
        assert _neu(karte, standort=str(fremd.id)).status_code == 400
        eigen = Standort.objects.create(region=Region.objects.get(slug="nord"), name="Bremen")
        assert _neu(karte, standort=str(eigen.id)).data["standort"]["name"] == "Bremen"

    def test_einreichen_benachrichtigt_buero_freigeben_den_ersteller(self, karte, buero):
        pk = _neu(karte).data["id"]
        assert _aktion(karte, pk, "einreichen").data["status"] == "eingereicht"
        assert Notification.objects.filter(destinataire=buero).count() == 1
        assert (
            _aktion(karte, pk, "freigeben").status_code == 403
        )  # Verantwortliche geben nicht frei
        r = _aktion(buero, pk, "freigeben")
        assert r.data["status"] == "veroeffentlicht" and "oeffentliche_url" in r.data
        assert Notification.objects.filter(destinataire=karte).count() == 1

    def test_zurueckweisen_braucht_grund_und_erlaubt_erneutes_einreichen(self, karte, buero):
        pk = _neu(karte).data["id"]
        _aktion(karte, pk, "einreichen")
        assert _aktion(buero, pk, "zurueckweisen").status_code == 400
        r = _aktion(buero, pk, "zurueckweisen", grund="Datum kollidiert")
        assert r.data["status"] == "zurueckgewiesen" and r.data["ablehngrund"] == "Datum kollidiert"
        assert _client(karte).patch(_url(pk), {"datum": _tag(9)}, format="json").status_code == 200
        r = _aktion(karte, pk, "einreichen")
        assert r.data["status"] == "eingereicht" and r.data["ablehngrund"] == ""

    def test_vergangenes_datum_nicht_einreichbar(self, karte):
        pk = _neu(karte, delta=-2).data["id"]
        assert _aktion(karte, pk, "einreichen").status_code == 400

    def test_unbekannte_aktion_und_fremde(self, karte):
        pk = _neu(karte).data["id"]
        assert _aktion(karte, pk, "löschen").status_code == 400
        assert _aktion(_mitglied("HH"), pk, "einreichen").status_code == 403

    def test_aendern_nach_veroeffentlichung_nur_buero(self, karte, buero):
        pk = _veroeffentlichen(karte, buero)
        assert _client(karte).patch(_url(pk), {"titel": "Neu"}, format="json").status_code == 400
        r = _client(buero).patch(_url(pk), {"titel": "Neu"}, format="json")
        assert r.status_code == 200 and r.data["titel"] == "Neu"

    def test_loeschen_nur_entwuerfe(self, karte, buero):
        pk = _neu(karte).data["id"]
        assert _client(karte).delete(_url(pk)).status_code == 204
        pk = _veroeffentlichen(karte, buero)
        assert _client(buero).delete(_url(pk)).status_code == 400

    def test_bild(self, karte):
        pk = _neu(karte).data["id"]
        r = _client(karte).post(_url(pk, "bild/"), {"bild": _bild()}, format="multipart")
        assert r.status_code == 200 and r.data["bild_url"]
        assert _client(karte).delete(_url(pk, "bild/")).data["bild_url"] is None
        assert (
            _client(_mitglied("HH"))
            .post(_url(pk, "bild/"), {"bild": _bild()}, format="multipart")
            .status_code
            == 403
        )


class TestSichtbarkeit:
    def test_entwuerfe_nur_fuer_verantwortliche_und_buero(self, karte, buero):
        pk = _neu(karte).data["id"]
        leser = _client(UserFactory())
        assert leser.get(f"{BASIS}nord/veranstaltungen/").data["ergebnisse"] == []
        assert leser.get(_url(pk)).status_code == 404
        assert len(_client(karte).get(f"{BASIS}nord/veranstaltungen/").data["ergebnisse"]) == 1
        assert len(_client(buero).get(f"{BASIS}nord/veranstaltungen/").data["ergebnisse"]) == 1

    def test_veroeffentlicht_fuer_alle_konten_ohne_interna(self, karte, buero):
        pk = _veroeffentlichen(karte, buero)
        for user in (UserFactory(), _mitglied("BY")):
            r = _client(user).get(_url(pk))
            assert r.status_code == 200 and r.data["darf_bearbeiten"] is False
            assert r.data["ablehngrund"] == "" and r.data["darf_teilnehmer_sehen"] is False
        assert _client().get(_url(pk)).status_code in (401, 403)

    def test_filter_kommend_vergangen(self, karte, buero):
        _veroeffentlichen(karte, buero, delta=3)
        _veroeffentlichen(karte, buero, delta=0)
        # vergangenes Treffen direkt anlegen
        Veranstaltung.objects.create(
            region=Region.objects.get(slug="nord"),
            titel="Alt",
            datum=timezone.localdate() - datetime.timedelta(days=5),
            ort="x",
            status=S.ABGESCHLOSSEN,
        )
        kommend = _client(karte).get(f"{BASIS}nord/veranstaltungen/?zeit=kommend").data
        assert len(kommend["ergebnisse"]) == 2
        vergangen = _client(karte).get(f"{BASIS}nord/veranstaltungen/?zeit=vergangen").data
        assert [e["titel"] for e in vergangen["ergebnisse"]] == ["Alt"]

    def test_naechste_veranstaltung_in_der_regionsliste_und_freigabeflag(self, karte, buero):
        _veroeffentlichen(karte, buero, delta=4, titel="Derby")
        r = _client(karte).get(BASIS)
        nord = next(e for e in r.data["ergebnisse"] if e["slug"] == "nord")
        assert nord["naechste_veranstaltung"]["titel"] == "Derby"
        nrw = next(e for e in r.data["ergebnisse"] if e["slug"] == "nrw")
        assert nrw["naechste_veranstaltung"] is None
        assert r.data["darf_freigeben"] is False
        assert _client(buero).get(BASIS).data["darf_freigeben"] is True

    def test_freigabeliste_nur_buero(self, karte, buero):
        pk = _neu(karte).data["id"]
        _aktion(karte, pk, "einreichen")
        url = f"{BASIS}veranstaltungen/zur-freigabe/"
        assert _client(karte).get(url).status_code == 403
        r = _client(buero).get(url)
        assert [e["id"] for e in r.data["ergebnisse"]] == [pk]
        assert r.data["ergebnisse"][0]["darf_freigeben"] is True


class TestAnmeldung:
    def test_anmelden_abmelden_fuer_jedes_konto(self, karte, buero):
        pk = _veroeffentlichen(karte, buero, max_teilnehmer=2)
        url = _url(pk, "anmeldung/")
        fan = _client(UserFactory())
        r = fan.put(url, {"aktiv": True}, format="json")
        assert (
            r.status_code == 200 and r.data["angemeldet"] is True and r.data["teilnehmer_zahl"] == 1
        )
        assert (
            fan.put(url, {"aktiv": True}, format="json").data["teilnehmer_zahl"] == 1
        )  # idempotent
        r = fan.put(url, {"aktiv": False}, format="json")
        assert r.data["angemeldet"] is False and r.data["teilnehmer_zahl"] == 0

    def test_kapazitaet(self, karte, buero):
        pk = _veroeffentlichen(karte, buero, max_teilnehmer=1)
        url = _url(pk, "anmeldung/")
        assert _client(UserFactory()).put(url, {}, format="json").status_code == 200
        zweiter = _client(UserFactory())
        assert zweiter.put(url, {}, format="json").status_code == 400
        assert zweiter.get(_url(pk)).data["kann_anmelden"] is False

    def test_nicht_anmeldbar_ohne_veroeffentlichung_oder_in_vergangenheit(self, karte, buero):
        pk = _neu(karte).data["id"]
        url = _url(pk, "anmeldung/")
        assert _client(UserFactory()).put(url, {}, format="json").status_code == 404
        assert _client(karte).put(url, {}, format="json").status_code == 400
        pk = _veroeffentlichen(karte, buero, delta=0)
        Veranstaltung.objects.filter(pk=pk).update(
            datum=timezone.localdate() - datetime.timedelta(days=1)
        )
        assert (
            _client(UserFactory()).put(_url(pk, "anmeldung/"), {}, format="json").status_code == 400
        )

    def test_absage_benachrichtigt_angemeldete(self, karte, buero):
        pk = _veroeffentlichen(karte, buero)
        fan = UserFactory()
        _client(fan).put(_url(pk, "anmeldung/"), {}, format="json")
        r = _aktion(karte, pk, "absagen")
        assert r.data["status"] == "abgesagt"
        assert Notification.objects.filter(destinataire=fan).count() == 1
        assert _aktion(UserFactory(), pk, "absagen").status_code == 403

    def test_ungueltiger_wert(self, karte, buero):
        pk = _veroeffentlichen(karte, buero)
        assert (
            _client(UserFactory())
            .put(_url(pk, "anmeldung/"), {"aktiv": "ja"}, format="json")
            .status_code
            == 400
        )


class TestAnwesenheit:
    def _lauf(self, karte, buero):
        pk = _veroeffentlichen(karte, buero, delta=0)
        mia = _mitglied("HH")
        fan = UserFactory()
        for u in (mia, fan):
            _client(u).put(_url(pk, "anmeldung/"), {}, format="json")
        return pk, mia, fan

    def test_teilnehmerliste_nur_fuer_verantwortliche_und_buero(self, karte, buero):
        pk, mia, fan = self._lauf(karte, buero)
        r = _client(karte).get(_url(pk, "teilnehmer/"))
        assert r.status_code == 200 and len(r.data["ergebnisse"]) == 2
        namen = {e["name"] for e in r.data["ergebnisse"]}
        assert "Mia Muster" in namen and fan.email not in namen  # keine E-Mail für Verantwortliche
        assert any(
            e["name"] == fan.email
            for e in _client(buero).get(_url(pk, "teilnehmer/")).data["ergebnisse"]
        )
        assert _client(mia).get(_url(pk, "teilnehmer/")).status_code == 403

    def test_haekchen_und_abschluss(self, karte, buero):
        pk, mia, fan = self._lauf(karte, buero)
        assert _client(karte).get(_url(pk)).data["darf_anwesenheit"] is True
        r = _client(karte).put(_url(pk, f"teilnehmer/{mia.id}/"), {"anwesend": True}, format="json")
        assert r.status_code == 200 and r.data["anwesend"] is True
        assert (
            _client(mia)
            .put(_url(pk, f"teilnehmer/{mia.id}/"), {"anwesend": True}, format="json")
            .status_code
            == 403
        )
        assert _aktion(karte, pk, "abschliessen").status_code == 403  # nur Büro
        r = _aktion(buero, pk, "abschliessen")
        assert r.data["status"] == "abgeschlossen" and r.data["anwesende_zahl"] == 1
        # nach Abschluss gesperrt
        assert (
            _client(karte)
            .put(_url(pk, f"teilnehmer/{fan.id}/"), {"anwesend": True}, format="json")
            .status_code
            == 400
        )
        assert Teilnahme.objects.filter(veranstaltung_id=pk, anwesend=True).count() == 1

    def test_vor_dem_termin_keine_anwesenheit_und_kein_abschluss(self, karte, buero):
        pk = _veroeffentlichen(karte, buero, delta=5)
        fan = UserFactory()
        _client(fan).put(_url(pk, "anmeldung/"), {}, format="json")
        assert (
            _client(karte)
            .put(_url(pk, f"teilnehmer/{fan.id}/"), {"anwesend": True}, format="json")
            .status_code
            == 400
        )
        assert _aktion(buero, pk, "abschliessen").status_code == 400
        assert _client(karte).get(_url(pk)).data["darf_anwesenheit"] is False

    def test_anwesenheit_nur_fuer_angemeldete(self, karte, buero):
        pk, _, _ = self._lauf(karte, buero)
        fremd = UserFactory()
        assert (
            _client(karte)
            .put(_url(pk, f"teilnehmer/{fremd.id}/"), {"anwesend": True}, format="json")
            .status_code
            == 404
        )
        assert (
            _client(karte)
            .put(_url(pk, f"teilnehmer/{fremd.id}/"), {"anwesend": "ja"}, format="json")
            .status_code
            == 400
        )


class TestOeffentlich:
    def test_seite_ohne_anmeldung_mit_vorschau_und_teilen_texten(self, karte, buero):
        pk = _veroeffentlichen(karte, buero, titel="Derby <b>live</b>", uhrzeit="20:00")
        fan = UserFactory()
        _client(fan).put(_url(pk, "anmeldung/"), {}, format="json")
        r = _client().get(f"{BASIS}public/veranstaltungen/{pk}/")
        assert r.status_code == 200 and r["Content-Type"].startswith("text/html")
        html = r.content.decode()
        assert 'property="og:title"' in html and "Derby &lt;b&gt;live&lt;/b&gt;" in html
        assert "<b>live</b>" not in html  # Ausgabe wird maskiert
        assert "Komm vorbei!" in html and "Venez nombreux !" in html
        assert fan.email not in html and "Mia" not in html  # keine Teilnehmerdaten
        assert r["X-Robots-Tag"] == "noindex"

    def test_nicht_oeffentlich_solange_nicht_freigegeben(self, karte):
        pk = _neu(karte).data["id"]
        assert _client().get(f"{BASIS}public/veranstaltungen/{pk}/").status_code == 404

    def test_abgesagte_ist_sichtbar_mit_hinweis(self, karte, buero):
        pk = _veroeffentlichen(karte, buero)
        _aktion(karte, pk, "absagen")
        r = _client().get(f"{BASIS}public/veranstaltungen/{pk}/")
        assert r.status_code == 200 and "Abgesagt" in r.content.decode()

    def test_teilen_texte_in_der_api(self, karte, buero):
        pk = _veroeffentlichen(karte, buero, titel="Derby", uhrzeit="20:00", ort="Köln")
        t = _client(UserFactory()).get(_url(pk)).data["teilen"]
        assert "Derby – CID Nord" in t["de"] and "20:00 Uhr" in t["de"] and "Köln" in t["de"]
        assert "le " in t["fr"] and "à 20:00" in t["fr"]
        assert t["de"].endswith(f"/public/veranstaltungen/{pk}/")
