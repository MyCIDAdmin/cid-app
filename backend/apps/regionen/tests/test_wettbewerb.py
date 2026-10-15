# flake8: noqa: F811
"""Regionen-Wettbewerb (Release 30) : Buchung, Rangliste, Korrekturen, Saisons, Regeln."""

import datetime

import pytest
from django.utils import timezone

from apps.accounts.models import Role
from apps.membres.models import StatutMembre
from apps.rbac.tests.factories import UserFactory
from apps.regionen import wettbewerb
from apps.regionen.models import (
    FanProfil,
    PunkteEintrag,
    PunkteGrund,
    Region,
    Saison,
    Veranstaltung,
    WettbewerbEinstellung,
)
from apps.regionen.tests.test_regionen import BASIS, _client, _mitglied
from apps.regionen.tests.test_veranstaltungen import (  # noqa: F401
    _aktion,
    _url,
    _veroeffentlichen,
    buero,
    karte,
    nord,
)

pytestmark = pytest.mark.django_db
W = f"{BASIS}wettbewerb/"


def _heute():
    return timezone.localdate()


@pytest.fixture
def saison():
    h = _heute()
    return Saison.objects.create(
        name="Saison 2026/27",
        start=h - datetime.timedelta(days=60),
        ende=h + datetime.timedelta(60),
    )


@pytest.fixture
def admin():
    return UserFactory(role=Role.SUPER_ADMIN)


def _treffen(karte, buero, anwesende, **kw):
    """Veröffentlicht ein Treffen von heute, meldet die Konten an, hakt sie ab, schließt ab."""
    pk = _veroeffentlichen(karte, buero, delta=0, **kw)
    for u in anwesende:
        _client(u).put(_url(pk, "anmeldung/"), {}, format="json")
        _client(karte).put(_url(pk, f"teilnehmer/{u.id}/"), {"anwesend": True}, format="json")
    assert _aktion(buero, pk, "abschliessen").status_code == 200
    return pk


def _summe(region="nord"):
    return sum(PunkteEintrag.objects.filter(region__slug=region).values_list("punkte", flat=True))


class TestBuchung:
    def test_abschluss_bucht_grund_anwesende_und_erstteilnehmer(self, saison, karte, buero):
        pk = _treffen(karte, buero, [_mitglied("HH"), UserFactory()])
        e = {x.grund: x for x in PunkteEintrag.objects.filter(veranstaltung_id=pk)}
        assert e[PunkteGrund.VERANSTALTUNG].punkte == 50
        assert e[PunkteGrund.ANWESENHEIT].punkte == 4 and e[PunkteGrund.ANWESENHEIT].anzahl == 2
        assert e[PunkteGrund.ERSTTEILNEHMER].punkte == 6
        assert _summe() == 60 and e[PunkteGrund.VERANSTALTUNG].saison == saison

    def test_buchung_ist_wiederholbar_ohne_doppelung(self, saison, karte, buero):
        pk = _treffen(karte, buero, [UserFactory()])
        v = Veranstaltung.objects.get(pk=pk)
        assert wettbewerb.buche_veranstaltung(v) == []
        assert PunkteEintrag.objects.filter(veranstaltung=v).count() == 3

    def test_erstteilnehmer_nur_einmal(self, saison, karte, buero):
        mia = _mitglied("HH")
        _treffen(karte, buero, [mia])
        pk2 = _treffen(karte, buero, [mia, UserFactory()])
        erst = PunkteEintrag.objects.get(veranstaltung_id=pk2, grund=PunkteGrund.ERSTTEILNEHMER)
        assert erst.anzahl == 1 and erst.punkte == 3

    def test_obergrenze_anwesende_je_treffen(self, saison, karte, buero):
        r = WettbewerbEinstellung.holen()
        r.max_anwesende = 1
        r.save()
        pk = _treffen(karte, buero, [UserFactory(), UserFactory(), UserFactory()])
        anw = PunkteEintrag.objects.get(veranstaltung_id=pk, grund=PunkteGrund.ANWESENHEIT)
        assert anw.anzahl == 1 and anw.punkte == 2

    def test_monatsgrenze_zaehlt_weitere_treffen_mit_null(self, saison, karte, buero):
        r = WettbewerbEinstellung.holen()
        r.max_treffen_monat = 1
        r.save()
        _treffen(karte, buero, [UserFactory()])
        pk2 = _treffen(karte, buero, [UserFactory()])
        eintraege = list(PunkteEintrag.objects.filter(veranstaltung_id=pk2))
        assert len(eintraege) == 1 and eintraege[0].punkte == 0
        assert "Obergrenze" in eintraege[0].begruendung

    def test_ohne_saison_oder_eingefroren_keine_punkte(self, karte, buero):
        _treffen(karte, buero, [UserFactory()])
        assert PunkteEintrag.objects.count() == 0
        h = _heute()
        Saison.objects.create(
            name="Alt",
            start=h - datetime.timedelta(days=5),
            ende=h + datetime.timedelta(days=5),
            eingefroren_am=timezone.now(),
        )
        _treffen(karte, buero, [UserFactory()])
        assert PunkteEintrag.objects.count() == 0

    def test_nachbuchen(self, karte, buero, admin):
        pk = _treffen(karte, buero, [UserFactory()])
        h = _heute()
        s = Saison.objects.create(
            name="Neu", start=h - datetime.timedelta(days=10), ende=h + datetime.timedelta(10)
        )
        r = _client(admin).post(f"{W}saisons/{s.pk}/nachbuchen/")
        assert r.status_code == 200 and r.data["gebucht"] == 3
        assert _client(admin).post(f"{W}saisons/{s.pk}/nachbuchen/").data["gebucht"] == 0
        assert PunkteEintrag.objects.filter(veranstaltung_id=pk).count() == 3
        assert _client(_mitglied("HH")).post(f"{W}saisons/{s.pk}/nachbuchen/").status_code == 403


class TestNeumitglied:
    def _fan(self, land="HH", antrag=True):
        user = UserFactory(is_active=True)
        FanProfil.objects.create(
            user=user,
            prenom="Sami",
            nom="B",
            land_de=land,
            datenschutz_am=timezone.now(),
            mitgliedsantrag_am=timezone.now() if antrag else None,
        )
        return user

    def _aktiv(self, user, land="HH"):
        from apps.membres.tests.factories import MembreFactory

        m = MembreFactory(user=user, land_de=land, statut=StatutMembre.EN_ATTENTE)
        m.statut = StatutMembre.ACTIF
        m.save(update_fields=["statut", "updated_at"])
        return m

    def test_bonus_fuer_region_einmalig(self, saison):
        user = self._fan()
        m = self._aktiv(user)
        e = PunkteEintrag.objects.get(grund=PunkteGrund.NEUMITGLIED)
        assert e.punkte == 20 and e.region.slug == "nord"
        m.save(update_fields=["statut", "updated_at"])
        assert PunkteEintrag.objects.filter(grund=PunkteGrund.NEUMITGLIED).count() == 1

    def test_kein_bonus_ohne_fan_antrag_region_oder_saison(self, saison):
        self._aktiv(UserFactory(is_active=True))  # kein Fan
        self._aktiv(self._fan(antrag=False))
        self._aktiv(self._fan(land="HE"), land="HE")  # Region fehlt
        assert PunkteEintrag.objects.count() == 0
        saison.delete()
        self._aktiv(self._fan())
        assert PunkteEintrag.objects.count() == 0


class TestRangliste:
    def test_fans_sehen_rangliste_mit_pro_mitglied_und_abzeichen(self, saison, karte, buero):
        _treffen(karte, buero, [UserFactory()])
        r = _client(UserFactory()).get(W)
        assert r.status_code == 200 and r.data["saison"]["name"] == "Saison 2026/27"
        erste = r.data["rangliste"][0]
        assert erste["region"]["slug"] == "nord" and erste["rang"] == 1
        assert erste["punkte"] == 55 and erste["treffen"] == 1
        assert erste["mitglieder"] == 1 and erste["punkte_pro_mitglied"] == 55
        assert {"key": "erstes_treffen", "anzahl": 1} in erste["abzeichen"]
        assert r.data["regeln"]["punkte_veranstaltung"] == 50
        assert r.data["darf_verwalten"] is False and r.data["ist_admin"] is False
        assert len(r.data["rangliste"]) == 4 and r.data["rangliste"][1]["punkte"] == 0

    def test_gleichstand_teilt_den_rang(self, saison):
        r = _client(UserFactory()).get(W)
        assert [z["rang"] for z in r.data["rangliste"]] == [1, 1, 1, 1]

    def test_ranking_nach_punkten_pro_mitglied(self, saison):
        from apps.membres.tests.factories import MembreFactory

        for _ in range(2):
            MembreFactory(land_de="NW", statut=StatutMembre.ACTIF)
        MembreFactory(land_de="BE", statut=StatutMembre.ACTIF)
        for slug, punkte in (("nrw", 100), ("berlin", 70)):
            PunkteEintrag.objects.create(
                saison=saison,
                region=Region.objects.get(slug=slug),
                grund=PunkteGrund.KORREKTUR,
                punkte=punkte,
                datum=_heute(),
            )
        zeilen = _client(UserFactory()).get(W).data["rangliste"]
        assert [z["region"]["slug"] for z in zeilen[:2]] == ["berlin", "nrw"]
        assert zeilen[0]["punkte_pro_mitglied"] == 70 and zeilen[1]["punkte_pro_mitglied"] == 50

    def test_verlauf_ist_aufgelaufen(self, saison, karte, buero):
        _treffen(karte, buero, [UserFactory()])
        v = _client(UserFactory()).get(W).data["verlauf"]
        nord = next(s for s in v["serien"] if s["slug"] == "nord")
        assert len(v["monate"]) == len(nord["werte"]) and nord["werte"][-1] == 55

    def test_monatssieger_fleissigste_region(self, saison):
        h = _heute()
        vormonat = (h.replace(day=1) - datetime.timedelta(days=1)).replace(day=3)
        for slug, punkte in (("nord", 30), ("nrw", 40)):
            PunkteEintrag.objects.create(
                saison=saison,
                region=Region.objects.get(slug=slug),
                grund=PunkteGrund.KORREKTUR,
                punkte=punkte,
                datum=vormonat,
            )
        d = _client(UserFactory()).get(W).data
        assert d["monatssieger"] == [
            {"monat": f"{vormonat.year}-{vormonat.month:02d}", "regionen": ["nrw"]}
        ]
        nrw = next(z for z in d["rangliste"] if z["region"]["slug"] == "nrw")
        assert {"key": "fleissigste_region", "anzahl": 1} in nrw["abzeichen"]

    def test_zehn_treffen_abzeichen(self, saison):
        nord = Region.objects.get(slug="nord")
        for i in range(10):
            PunkteEintrag.objects.create(
                saison=saison,
                region=nord,
                grund=PunkteGrund.VERANSTALTUNG,
                punkte=50,
                datum=_heute(),
                schluessel=f"t:{i}",
            )
        z = next(
            z
            for z in _client(UserFactory()).get(W).data["rangliste"]
            if z["region"]["slug"] == "nord"
        )
        assert {"key": "zehn_treffen", "anzahl": 1} in z["abzeichen"]

    def test_ohne_saison_leer(self):
        d = _client(UserFactory()).get(W).data
        assert d["saison"] is None and d["rangliste"] == []

    def test_regionsseite_zeigt_platz(self, saison, karte, buero):
        _treffen(karte, buero, [UserFactory()])
        d = _client(UserFactory()).get(f"{BASIS}nord/").data["wettbewerb"]
        assert d["rang"] == 1 and d["punkte"] == 55 and d["regionen"] == 4

    def test_region_mit_punkten_nicht_loeschbar(self, saison, admin):
        r = Region.objects.create(slug="x", name="X")
        PunkteEintrag.objects.create(
            saison=saison, region=r, grund=PunkteGrund.KORREKTUR, punkte=5, datum=_heute()
        )
        assert _client(admin).delete(f"{BASIS}verwaltung/{r.pk}/").status_code == 400


class TestKorrektur:
    def test_nur_buero_mit_begruendung(self, saison, buero):
        daten = {"region": "nord", "punkte": -10, "begruendung": "Doppelt gezählt"}
        assert (
            _client(UserFactory()).post(f"{W}korrekturen/", daten, format="json").status_code == 403
        )
        r = _client(buero).post(f"{W}korrekturen/", daten, format="json")
        assert r.status_code == 201 and r.data["grund"] == "korrektur" and r.data["punkte"] == -10
        assert _summe() == -10
        for schlecht in (
            {**daten, "begruendung": ""},
            {**daten, "punkte": 0},
            {**daten, "punkte": "5"},
            {**daten, "punkte": 5000},
            {**daten, "region": "gibtsnicht"},
        ):
            assert _client(buero).post(f"{W}korrekturen/", schlecht, format="json").status_code in (
                400,
                404,
            )

    def test_keine_korrektur_ohne_oder_in_eingefrorener_saison(self, saison, buero):
        daten = {"region": "nord", "punkte": 5, "begruendung": "x"}
        saison.eingefroren_am = timezone.now()
        saison.save()
        assert _client(buero).post(f"{W}korrekturen/", daten, format="json").status_code == 400
        saison.delete()
        assert _client(buero).post(f"{W}korrekturen/", daten, format="json").status_code == 400

    def test_journal_nur_fuer_buero_mit_filtern(self, saison, buero, karte):
        _treffen(karte, buero, [UserFactory()])
        _client(buero).post(
            f"{W}korrekturen/",
            {"region": "nrw", "punkte": 7, "begruendung": "Bonus"},
            format="json",
        )
        assert _client(UserFactory()).get(f"{W}journal/").status_code == 403
        alle = _client(buero).get(f"{W}journal/").data
        assert alle["gesamt"] == 4
        nrw = _client(buero).get(f"{W}journal/?region=nrw").data
        assert nrw["gesamt"] == 1 and nrw["ergebnisse"][0]["begruendung"] == "Bonus"
        assert _client(buero).get(f"{W}journal/?limit=abc").status_code == 400


class TestSaisons:
    def _daten(self, **kw):
        h = _heute()
        d = {
            "name": "Saison A",
            "start": (h - datetime.timedelta(days=10)).isoformat(),
            "ende": (h + datetime.timedelta(days=10)).isoformat(),
            "preis": "Ein Pokal",
        }
        d.update(kw)
        return d

    def test_anlegen_pruefen_aendern_loeschen(self, admin):
        c = _client(admin)
        r = c.post(f"{W}saisons/", self._daten(), format="json")
        assert r.status_code == 201 and r.data["laufend"] is True and r.data["preis"] == "Ein Pokal"
        assert (
            c.post(f"{W}saisons/", self._daten(name="B"), format="json").status_code == 400
        )  # Überschneidung
        h = _heute()
        spaeter = {"start": (h + datetime.timedelta(20)).isoformat()}
        spaeter["ende"] = (h + datetime.timedelta(40)).isoformat()
        assert (
            c.post(
                f"{W}saisons/", self._daten(name="Saison A", **spaeter), format="json"
            ).status_code
            == 400
        )
        assert (
            c.post(f"{W}saisons/", self._daten(name="B", **spaeter), format="json").status_code
            == 201
        )
        verkehrt = self._daten(name="C", start=spaeter["ende"], ende=spaeter["start"])
        assert c.post(f"{W}saisons/", verkehrt, format="json").status_code == 400
        assert (
            c.post(f"{W}saisons/", self._daten(name="D", start="x"), format="json").status_code
            == 400
        )
        pk = r.data["id"]
        assert c.patch(f"{W}saisons/{pk}/", {"preis": "Neu"}, format="json").data["preis"] == "Neu"
        assert c.delete(f"{W}saisons/{pk}/").status_code == 204

    def test_nur_admin(self, saison, buero):
        c = _client(buero)
        assert c.post(f"{W}saisons/", {}, format="json").status_code == 403
        assert c.get(f"{W}saisons/").status_code == 403
        assert c.patch(f"{W}saisons/{saison.pk}/", {}, format="json").status_code == 403
        assert c.post(f"{W}saisons/{saison.pk}/einfrieren/").status_code == 403

    def test_saison_mit_punkten_bleibt_erhalten(self, saison, admin):
        PunkteEintrag.objects.create(
            saison=saison,
            region=Region.objects.get(slug="nord"),
            grund=PunkteGrund.KORREKTUR,
            punkte=1,
            datum=_heute(),
        )
        assert _client(admin).delete(f"{W}saisons/{saison.pk}/").status_code == 400

    def test_einfrieren_und_ewige_tabelle(self, admin, karte, buero):
        h = _heute()
        s = Saison.objects.create(
            name="Vorbei", start=h - datetime.timedelta(20), ende=h - datetime.timedelta(1)
        )
        nord = Region.objects.get(slug="nord")
        PunkteEintrag.objects.create(
            saison=s, region=nord, grund=PunkteGrund.KORREKTUR, punkte=80, datum=s.ende
        )
        c = _client(admin)
        assert c.post(f"{W}saisons/{s.pk}/einfrieren/").data["eingefroren"] is True
        assert c.post(f"{W}saisons/{s.pk}/einfrieren/").status_code == 400
        assert c.patch(f"{W}saisons/{s.pk}/", {"preis": "x"}, format="json").status_code == 400
        # nach dem Einfrieren zählt die Momentaufnahme
        PunkteEintrag.objects.create(
            saison=s, region=nord, grund=PunkteGrund.KORREKTUR, punkte=999, datum=s.ende
        )
        d = _client(UserFactory()).get(f"{W}?saison={s.pk}").data
        assert d["rangliste"][0]["punkte"] == 80
        assert d["ewige_tabelle"][0]["punkte"] == 80 and d["ewige_tabelle"][0]["saisons"] == 1

    def test_laufende_saison_nicht_einfrierbar(self, saison, admin):
        assert _client(admin).post(f"{W}saisons/{saison.pk}/einfrieren/").status_code == 400

    def test_zuletzt_beendete_saison_wird_angezeigt(self):
        h = _heute()
        Saison.objects.create(
            name="Alt", start=h - datetime.timedelta(40), ende=h - datetime.timedelta(20)
        )
        d = _client(UserFactory()).get(W).data
        assert d["saison"]["name"] == "Alt" and d["saison"]["laufend"] is False
        assert _client(UserFactory()).get(f"{W}?saison=kaputt").status_code == 400


class TestRegeln:
    def test_lesen_alle_aendern_nur_admin(self, admin, buero):
        assert _client(UserFactory()).get(f"{W}regeln/").data["punkte_neumitglied"] == 20
        assert (
            _client(buero).put(f"{W}regeln/", {"punkte_anwesend": 5}, format="json").status_code
            == 403
        )
        r = _client(admin).put(
            f"{W}regeln/", {"punkte_anwesend": 5, "max_treffen_monat": 3}, format="json"
        )
        assert (
            r.status_code == 200
            and r.data["punkte_anwesend"] == 5
            and r.data["max_treffen_monat"] == 3
        )
        for schlecht in (
            {"punkte_anwesend": -1},
            {"max_treffen_monat": 0},
            {"punkte_veranstaltung": "x"},
            {"max_anwesende": True},
        ):
            assert _client(admin).put(f"{W}regeln/", schlecht, format="json").status_code == 400

    def test_geaenderte_regeln_gelten_fuer_neue_buchungen(self, saison, admin, karte, buero):
        _client(admin).put(f"{W}regeln/", {"punkte_veranstaltung": 10}, format="json")
        pk = _treffen(karte, buero, [])
        assert PunkteEintrag.objects.get(veranstaltung_id=pk).punkte == 10
