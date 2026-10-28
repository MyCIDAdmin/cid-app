"""Tests des Moduls Reisen & Fahrgemeinschaften (Konzept 2026-10-29)."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.communaute.models import RencontreCalendrier
from apps.membres.models import StatutMembre
from apps.membres.tests.factories import MembreFactory
from apps.notifications.models import Notification, TypeNotification
from apps.reisen import services as sv
from apps.reisen.erinnerungen import erinnere_entscheidungen
from apps.reisen.models import Reise, ReiseErinnerung, ReiseTeilnehmer, TStatus

pytestmark = pytest.mark.django_db

BASE = "/api/v1/reisen/"


def user(email, role=Role.MEMBRE, mitglied=True):
    u = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    if mitglied:
        MembreFactory(user=u, email=email, statut=StatutMembre.ACTIF)
    return u


def api(u):
    c = APIClient()
    c.force_authenticate(user=u)
    return c


@pytest.fixture
def orga():
    return user("orga@example.de")


@pytest.fixture
def anna():
    return user("anna@example.de")


@pytest.fixture
def ben():
    return user("ben@example.de")


def neue_reise(u, **extra):
    daten = {"titel": "Kairo", "ziel_ort": "Kairo", "land": "Ägypten", **extra}
    r = api(u).post(BASE, daten, format="json")
    assert r.status_code == 201, r.data
    return r.data["id"]


def dabei(reise_id, *users):
    for u in users:
        r = api(u).post(f"{BASE}{reise_id}/beitreten/", {"status": "dabei"}, format="json")
        assert r.status_code == 200, r.data


def offen(**extra):
    return {"sichtbarkeit": "mitglieder", "beitritt": "offen", **extra}


# --- Zugang -----------------------------------------------------------------------------------


def test_nicht_mitglied_darf_nicht_anlegen():
    gast = user("gast@example.de", mitglied=False)
    assert api(gast).post(BASE, {"titel": "X"}, format="json").status_code == 403


def test_nur_eingeladene_sind_unsichtbar(orga, anna):
    rid = neue_reise(orga, sichtbarkeit="eingeladen")
    assert api(anna).get(f"{BASE}{rid}/").status_code == 404
    assert api(anna).get(BASE).data == []
    assert (
        api(anna).post(f"{BASE}{rid}/beitreten/", {"status": "dabei"}, format="json").status_code
        == 404
    )


def test_einladungslink_und_nur_einladung(orga, anna):
    rid = neue_reise(orga, sichtbarkeit="eingeladen", beitritt="einladung")
    token = api(orga).get(f"{BASE}{rid}/").data["einladungs_token"]
    r = api(anna).post(f"{BASE}per-link/", {"token": token}, format="json")
    assert r.status_code == 200 and r.data["id"] == rid
    assert api(anna).get(f"{BASE}{rid}/").status_code == 200
    dabei(rid, anna)
    assert ReiseTeilnehmer.objects.get(user=anna).status == TStatus.DABEI
    assert api(anna).post(f"{BASE}per-link/", {"token": "falsch"}, format="json").status_code == 404


def test_nur_einladung_ohne_einladung_verboten(orga, anna):
    rid = neue_reise(orga, **offen(beitritt="einladung"))
    r = api(anna).post(f"{BASE}{rid}/beitreten/", {"status": "dabei"}, format="json")
    assert r.status_code == 403


def test_nicht_mitglied_sieht_nur_konto_reisen(orga):
    gast = user("gast@example.de", mitglied=False)
    r1 = neue_reise(orga, sichtbarkeit="mitglieder")
    r2 = neue_reise(orga, sichtbarkeit="konto", titel="Offen")
    ids = {x["id"] for x in api(gast).get(BASE).data}
    assert ids == {r2} and r1 not in ids


def test_genehmigung_anfrage_zusage_und_ablehnung(orga, anna, ben):
    rid = neue_reise(orga, **offen(beitritt="genehmigung"))
    for u in (anna, ben):
        r = api(u).post(
            f"{BASE}{rid}/beitreten/",
            {"status": "dabei", "nachricht": "Gerne"},
            format="json",
        )
        assert r.data["mein_status"] == "angefragt"
    assert (
        Notification.objects.filter(
            destinataire=orga, type_notification=TypeNotification.REISE_ANFRAGE
        ).count()
        == 2
    )
    tn_anna = ReiseTeilnehmer.objects.get(user=anna).id
    tn_ben = ReiseTeilnehmer.objects.get(user=ben).id
    # Teilnehmer ohne Orga-Rolle darf nicht entscheiden
    assert (
        api(anna)
        .post(
            f"{BASE}{rid}/teilnehmer/{tn_ben}/entscheiden/",
            {"zusage": True},
            format="json",
        )
        .status_code
        == 403
    )
    assert (
        api(orga)
        .post(
            f"{BASE}{rid}/teilnehmer/{tn_anna}/entscheiden/",
            {"zusage": True},
            format="json",
        )
        .status_code
        == 204
    )
    assert (
        api(orga)
        .post(
            f"{BASE}{rid}/teilnehmer/{tn_ben}/entscheiden/",
            {"zusage": False},
            format="json",
        )
        .status_code
        == 204
    )
    assert ReiseTeilnehmer.objects.get(user=anna).status == TStatus.DABEI
    assert ReiseTeilnehmer.objects.get(user=ben).status == TStatus.ABGELEHNT
    assert (
        api(ben).post(f"{BASE}{rid}/beitreten/", {"status": "dabei"}, format="json").status_code
        == 403
    )


def test_interessent_stimmt_nicht_ab_und_sieht_keine_namen(orga, anna):
    rid = neue_reise(orga, **offen())
    api(anna).post(f"{BASE}{rid}/beitreten/", {"status": "interessiert"}, format="json")
    e = api(orga).post(
        f"{BASE}{rid}/entscheidungen/",
        {"typ": "stimmung", "titel": "Lust?"},
        format="json",
    )
    assert e.status_code == 201
    assert api(anna).get(f"{BASE}{rid}/entscheidungen/").data == []  # nur Beschlossenes
    assert api(anna).get(f"{BASE}{rid}/teilnehmer/").data == []
    assert api(anna).get(f"{BASE}{rid}/infos/").status_code == 403
    d = api(anna).get(f"{BASE}{rid}/").data
    assert d["interessiert"] == 1 and "jetzt_dran" not in d and "regeln" not in d


def test_hoechstzahl_warteliste_und_nachruecken(orga, anna, ben):
    rid = neue_reise(orga, **offen(max_teilnehmer=2))
    dabei(rid, anna, ben)
    assert ReiseTeilnehmer.objects.get(user=ben).status == TStatus.WARTELISTE
    assert api(anna).post(f"{BASE}{rid}/absagen/").status_code == 204
    assert ReiseTeilnehmer.objects.get(user=ben).status == TStatus.DABEI
    assert Notification.objects.filter(
        destinataire=ben, type_notification=TypeNotification.REISE_EINLADUNG
    ).exists()


def test_organisator_kann_nicht_absagen(orga):
    rid = neue_reise(orga, **offen())
    assert api(orga).post(f"{BASE}{rid}/absagen/").status_code == 400


def test_einladen_benachrichtigt(orga, anna):
    rid = neue_reise(orga, sichtbarkeit="eingeladen")
    r = api(orga).post(
        f"{BASE}{rid}/einladen/", {"membre_ids": [str(anna.membre.id)]}, format="json"
    )
    assert r.data["eingeladen"] == 1
    assert Notification.objects.filter(
        destinataire=anna, type_notification=TypeNotification.REISE_EINLADUNG
    ).exists()
    assert api(anna).get(f"{BASE}{rid}/").status_code == 200


def test_uebernahme_durch_vertreter(orga, anna):
    rid = neue_reise(orga, **offen())
    dabei(rid, anna)
    tn = ReiseTeilnehmer.objects.get(user=anna)
    assert api(anna).post(f"{BASE}{rid}/uebernehmen/").status_code == 403
    assert (
        api(orga)
        .post(
            f"{BASE}{rid}/teilnehmer/{tn.id}/rolle/",
            {"rolle": "vertreter"},
            format="json",
        )
        .status_code
        == 204
    )
    assert api(anna).post(f"{BASE}{rid}/uebernehmen/").status_code == 204
    assert ReiseTeilnehmer.objects.get(user=anna).rolle == "organisator"
    assert ReiseTeilnehmer.objects.get(user=orga).rolle == "vertreter"
    assert Notification.objects.filter(
        destinataire=orga, titre__startswith="Organisation übernommen"
    ).exists()


def test_chat_wird_mit_dabei_abgeglichen(orga, anna):
    from apps.communaute.models import MembreGroupe

    rid = neue_reise(orga, **offen())
    gruppe = Reise.objects.get(pk=rid).chat_gruppe
    assert gruppe is not None
    dabei(rid, anna)
    assert MembreGroupe.objects.filter(groupe=gruppe, membre=anna.membre).exists()
    api(anna).post(f"{BASE}{rid}/absagen/")
    assert not MembreGroupe.objects.filter(groupe=gruppe, membre=anna.membre).exists()


# --- Entscheidungen -----------------------------------------------------------------------------


def hotel_abstimmung(rid, orga, typ="auswahl", **extra):
    r = api(orga).post(
        f"{BASE}{rid}/entscheidungen/",
        {
            "typ": typ,
            "baustein": "unterkunft",
            "titel": "Hotel",
            "optionen": [
                {"titel": "Hotel Nil", "preis": "55.00", "preis_einheit": "nacht"},
                {"titel": "Hotel Sphinx", "preis": "80.00", "preis_einheit": "nacht"},
            ],
            **extra,
        },
        format="json",
    )
    assert r.status_code == 201, r.data
    return r.data["id"]


def option_ids(rid, eid, u):
    d = api(u).get(f"{BASE}{rid}/entscheidungen/").data
    ent = next(x for x in d if x["id"] == eid)
    return {o["titel"]: o["id"] for o in ent["optionen"]}


def test_abstimmung_aendern_beschliessen_und_sichtbar(orga, anna):
    rid = neue_reise(orga, **offen(budget_grenzen={"unterkunft": "60"}))
    dabei(rid, anna)
    eid = hotel_abstimmung(rid, orga)
    ids = option_ids(rid, eid, anna)
    r = api(anna).post(
        f"{BASE}{rid}/entscheidungen/{eid}/stimmen/",
        {"stimmen": [{"option": ids["Hotel Sphinx"]}]},
        format="json",
    )
    assert r.status_code == 200
    # Stimme ändern
    api(anna).post(
        f"{BASE}{rid}/entscheidungen/{eid}/stimmen/",
        {"stimmen": [{"option": ids["Hotel Nil"]}]},
        format="json",
    )
    opts = {
        o["titel"]: o for o in api(orga).get(f"{BASE}{rid}/entscheidungen/").data[0]["optionen"]
    }
    assert opts["Hotel Nil"]["stimmen"]["ja"] == 1 and opts["Hotel Sphinx"]["stimmen"]["ja"] == 0
    assert opts["Hotel Nil"]["waehler"]["ja"] == [sv.name_von(anna)]
    assert (
        opts["Hotel Sphinx"]["ueber_budget"] is True and opts["Hotel Nil"]["ueber_budget"] is False
    )
    # Einfachauswahl : zwei Optionen verboten
    r = api(anna).post(
        f"{BASE}{rid}/entscheidungen/{eid}/stimmen/",
        {"stimmen": [{"option": ids["Hotel Nil"]}, {"option": ids["Hotel Sphinx"]}]},
        format="json",
    )
    assert r.status_code == 400
    # Nur Organisation beschließt
    assert (
        api(anna)
        .post(
            f"{BASE}{rid}/entscheidungen/{eid}/beschliessen/",
            {"option": ids["Hotel Nil"]},
            format="json",
        )
        .status_code
        == 403
    )
    r = api(orga).post(
        f"{BASE}{rid}/entscheidungen/{eid}/beschliessen/",
        {"option": ids["Hotel Nil"]},
        format="json",
    )
    assert r.status_code == 200 and r.data["status"] == "beschlossen"
    d = api(anna).get(f"{BASE}{rid}/").data
    assert (
        d["beschlossen"][0]["beschluss"]["titel"] == "Hotel Nil"
        and d["beschlossen"][0]["beschluss"]["folgen"] == 1
    )
    # Nach Beschluss keine Stimme mehr
    assert (
        api(anna)
        .post(f"{BASE}{rid}/entscheidungen/{eid}/stimmen/", {"stimmen": []}, format="json")
        .status_code
        == 400
    )
    # Abweichung vom Vorschlag braucht Begründung ... (schon beschlossen -> 400)
    assert (
        api(orga)
        .post(
            f"{BASE}{rid}/entscheidungen/{eid}/beschliessen/",
            {"option": ids["Hotel Sphinx"]},
            format="json",
        )
        .status_code
        == 400
    )


def test_abweichender_beschluss_braucht_begruendung(orga, anna):
    rid = neue_reise(orga, **offen())
    dabei(rid, anna)
    eid = hotel_abstimmung(rid, orga)
    ids = option_ids(rid, eid, anna)
    api(anna).post(
        f"{BASE}{rid}/entscheidungen/{eid}/stimmen/",
        {"stimmen": [{"option": ids["Hotel Nil"]}]},
        format="json",
    )
    url = f"{BASE}{rid}/entscheidungen/{eid}/beschliessen/"
    assert api(orga).post(url, {"option": ids["Hotel Sphinx"]}, format="json").status_code == 400
    assert (
        api(orga)
        .post(
            url,
            {"option": ids["Hotel Sphinx"], "begruendung": "Näher am Stadion"},
            format="json",
        )
        .status_code
        == 200
    )


def test_frist_abgelaufen_keine_stimme_verlaengern(orga, anna):
    rid = neue_reise(orga, **offen())
    dabei(rid, anna)
    eid = hotel_abstimmung(rid, orga, frist=(timezone.now() + timedelta(hours=1)).isoformat())
    ids = option_ids(rid, eid, anna)
    from apps.reisen.models import Entscheidung

    Entscheidung.objects.filter(pk=eid).update(frist=timezone.now() - timedelta(minutes=1))
    r = api(anna).post(
        f"{BASE}{rid}/entscheidungen/{eid}/stimmen/",
        {"stimmen": [{"option": ids["Hotel Nil"]}]},
        format="json",
    )
    assert r.status_code == 400
    assert api(orga).get(f"{BASE}{rid}/entscheidungen/").data[0]["status"] == "geschlossen"
    neu = (timezone.now() + timedelta(days=1)).isoformat()
    assert (
        api(orga)
        .post(
            f"{BASE}{rid}/entscheidungen/{eid}/verlaengern/",
            {"frist": neu},
            format="json",
        )
        .status_code
        == 200
    )
    r = api(anna).post(
        f"{BASE}{rid}/entscheidungen/{eid}/stimmen/",
        {"stimmen": [{"option": ids["Hotel Nil"]}]},
        format="json",
    )
    assert r.status_code == 200


def test_empfehlung_selbst_organisieren_zaehlt_nicht_fuer_option(orga, anna):
    rid = neue_reise(orga, **offen())
    dabei(rid, anna)
    eid = hotel_abstimmung(rid, orga, typ="empfehlung")
    ids = option_ids(rid, eid, anna)
    assert "Ich organisiere selbst" in ids
    api(anna).post(
        f"{BASE}{rid}/entscheidungen/{eid}/stimmen/",
        {"stimmen": [{"option": ids["Ich organisiere selbst"]}]},
        format="json",
    )
    d = (
        api(orga)
        .post(
            f"{BASE}{rid}/entscheidungen/{eid}/beschliessen/",
            {"option": ids["Hotel Nil"]},
            format="json",
        )
        .data
    )
    assert d["beschluss"]["folgen"] == 0  # niemand folgt der Empfehlung


def test_terminfindung_bester_zeitraum_setzt_reise_datum(orga, anna, ben):
    rid = neue_reise(orga, **offen())
    dabei(rid, anna, ben)
    r = api(orga).post(
        f"{BASE}{rid}/entscheidungen/",
        {
            "typ": "termin",
            "titel": "Wann?",
            "optionen": [
                {"titel": "A", "von_datum": "2026-11-26", "bis_datum": "2026-11-30"},
                {"titel": "B", "von_datum": "2026-12-03", "bis_datum": "2026-12-07"},
            ],
        },
        format="json",
    )
    eid = r.data["id"]
    ids = option_ids(rid, eid, anna)
    api(anna).post(
        f"{BASE}{rid}/entscheidungen/{eid}/stimmen/",
        {
            "stimmen": [
                {"option": ids["A"], "wert": "vielleicht"},
                {"option": ids["B"], "wert": "ja"},
            ]
        },
        format="json",
    )
    api(ben).post(
        f"{BASE}{rid}/entscheidungen/{eid}/stimmen/",
        {
            "stimmen": [
                {"option": ids["A"], "wert": "nein"},
                {"option": ids["B"], "wert": "ja"},
            ]
        },
        format="json",
    )
    ent = api(orga).get(f"{BASE}{rid}/entscheidungen/").data[0]
    assert [o["titel"] for o in ent["optionen"]] == ["B", "A"]  # bester zuerst
    api(orga).post(
        f"{BASE}{rid}/entscheidungen/{eid}/beschliessen/",
        {"option": ids["B"]},
        format="json",
    )
    reise = Reise.objects.get(pk=rid)
    assert str(reise.start) == "2026-12-03" and str(reise.ende) == "2026-12-07"


def test_terminfindung_ohne_datum_ist_ungueltig(orga):
    rid = neue_reise(orga, **offen())
    r = api(orga).post(
        f"{BASE}{rid}/entscheidungen/",
        {"typ": "termin", "titel": "Wann?", "optionen": [{"titel": "A"}]},
        format="json",
    )
    assert r.status_code == 400


def test_vorschlaege_nur_wenn_erlaubt(orga, anna):
    rid = neue_reise(orga, **offen(vorschlaege_erlaubt=False))
    dabei(rid, anna)
    eid = hotel_abstimmung(rid, orga)
    url = f"{BASE}{rid}/entscheidungen/{eid}/optionen/"
    assert api(anna).post(url, {"titel": "Neu"}, format="json").status_code == 403
    api(orga).patch(f"{BASE}{rid}/", {"vorschlaege_erlaubt": True}, format="json")
    assert api(anna).post(url, {"titel": "Neu", "preis": "40"}, format="json").status_code == 201


def test_erinnerung_genau_einmal_und_nur_ohne_stimme(orga, anna, ben):
    rid = neue_reise(orga, **offen())
    dabei(rid, anna, ben)
    eid = hotel_abstimmung(rid, orga, frist=(timezone.now() + timedelta(hours=20)).isoformat())
    ids = option_ids(rid, eid, anna)
    api(anna).post(
        f"{BASE}{rid}/entscheidungen/{eid}/stimmen/",
        {"stimmen": [{"option": ids["Hotel Nil"]}]},
        format="json",
    )
    n = erinnere_entscheidungen()["gesendet"]
    assert n == 2  # Organisator und Ben (Anna hat abgestimmt)
    assert erinnere_entscheidungen()["gesendet"] == 0
    assert not ReiseErinnerung.objects.filter(user=anna).exists()
    assert (
        Notification.objects.filter(
            destinataire=ben, type_notification=TypeNotification.REISE_FRIST
        ).count()
        == 1
    )


# --- Privatsphäre ------------------------------------------------------------------------------


def etappe(u, rid, **extra):
    daten = {
        "richtung": "hin",
        "art": "flug",
        "von_ort": "Hamburg",
        "nach_ort": "Kairo",
        "abfahrt": "2026-11-26T08:00:00Z",
        "ankunft": "2026-11-26T13:00:00Z",
        "status": "gebucht",
        "referenz": "ABC123",
        **extra,
    }
    r = api(u).post(f"{BASE}{rid}/etappen/", daten, format="json")
    assert r.status_code == 201, r.data
    return r.data["id"]


def teilnehmer_sicht(u, rid, von_user):
    for t in api(u).get(f"{BASE}{rid}/teilnehmer/").data:
        if t["user"] == str(von_user.pk):
            return t
    raise AssertionError("nicht gefunden")


def test_etappen_sind_standardmaessig_privat(orga, anna, ben):
    rid = neue_reise(orga, **offen())
    dabei(rid, anna, ben)
    etappe(anna, rid)
    # Ben sieht Annas Etappen nicht
    assert teilnehmer_sicht(ben, rid, anna)["etappen"] == []
    # Organisation sieht sie, aber nie die Buchungsreferenz
    sicht = teilnehmer_sicht(orga, rid, anna)["etappen"]
    assert len(sicht) == 1 and "referenz" not in sicht[0]
    # Anna selbst sieht die Referenz
    assert teilnehmer_sicht(anna, rid, anna)["etappen"][0]["referenz"] == "ABC123"
    # Freigabe an alle
    api(anna).patch(f"{BASE}{rid}/meine/", {"freigabe_hin": "alle"}, format="json")
    sicht = teilnehmer_sicht(ben, rid, anna)["etappen"]
    assert len(sicht) == 1 and sicht[0]["nach_ort"] == "Kairo" and "referenz" not in sicht[0]


def test_freigabe_hin_gilt_nicht_fuer_rueckreise(orga, anna, ben):
    rid = neue_reise(orga, **offen())
    dabei(rid, anna, ben)
    etappe(anna, rid)
    etappe(anna, rid, richtung="rueck", von_ort="Kairo", nach_ort="Hamburg")
    api(anna).patch(f"{BASE}{rid}/meine/", {"freigabe_hin": "alle"}, format="json")
    assert [e["richtung"] for e in teilnehmer_sicht(ben, rid, anna)["etappen"]] == ["hin"]


def test_verbergen_vor_orga_zeigt_nur_grobe_angaben(orga, anna):
    rid = neue_reise(orga, **offen())
    dabei(rid, anna)
    etappe(anna, rid)
    api(anna).patch(
        f"{BASE}{rid}/meine/",
        {"verbergen_vor_orga": True, "unterkunft_gebucht": True, "notiz": "Allergie"},
        format="json",
    )
    t = teilnehmer_sicht(orga, rid, anna)
    assert t["etappen"] == [
        {
            "id": t["etappen"][0]["id"],
            "richtung": "hin",
            "nach_ort": "Kairo",
            "tag": "2026-11-26",
            "gebucht": True,
        }
    ]
    assert t["unterkunft"] == {"gebucht": True}
    assert "notiz" not in t and "stadionkarte" not in t


def test_unterkunft_privat_und_freigegeben(orga, anna, ben):
    rid = neue_reise(orga, **offen())
    dabei(rid, anna, ben)
    u = (
        api(orga)
        .post(f"{BASE}{rid}/unterkuenfte/", {"name": "Hotel Nil"}, format="json")
        .data["id"]
    )
    api(anna).patch(f"{BASE}{rid}/meine/", {"unterkunft": u}, format="json")
    assert teilnehmer_sicht(ben, rid, anna)["unterkunft"] is None
    api(anna).patch(f"{BASE}{rid}/meine/", {"freigabe_unterkunft": "alle"}, format="json")
    assert teilnehmer_sicht(ben, rid, anna)["unterkunft"]["name"] == "Hotel Nil"


def test_unterkunft_einer_anderen_reise_ist_ungueltig(orga, anna):
    r1 = neue_reise(orga, **offen())
    r2 = neue_reise(orga, **offen(), titel="Andere")
    dabei(r1, anna)
    fremd = api(orga).post(f"{BASE}{r2}/unterkuenfte/", {"name": "X"}, format="json").data["id"]
    assert (
        api(anna).patch(f"{BASE}{r1}/meine/", {"unterkunft": fremd}, format="json").status_code
        == 400
    )


def test_fremde_etappe_nicht_aenderbar(orga, anna, ben):
    rid = neue_reise(orga, **offen())
    dabei(rid, anna, ben)
    eid = etappe(anna, rid)
    assert api(ben).delete(f"{BASE}{rid}/etappen/{eid}/").status_code == 404
    assert (
        api(orga)
        .patch(f"{BASE}{rid}/etappen/{eid}/", {"status": "offen"}, format="json")
        .status_code
        == 404
    )


def test_unterschiedliche_wege_bilden_getrennte_gruppen(orga, anna, ben):
    rid = neue_reise(orga, **offen())
    dabei(rid, anna, ben)
    etappe(anna, rid)  # Hamburg -> Kairo, 26.11.
    etappe(
        ben,
        rid,
        von_ort="Frankfurt",
        von_code="FRA",
        nach_ort="Kairo",
        ankunft="2026-11-27T02:00:00Z",
    )
    api(ben).patch(f"{BASE}{rid}/meine/", {"unterkunft_eigen": "Airbnb Zamalek"}, format="json")
    u = (
        api(orga)
        .post(f"{BASE}{rid}/unterkuenfte/", {"name": "Hotel Nil"}, format="json")
        .data["id"]
    )
    api(anna).patch(f"{BASE}{rid}/meine/", {"unterkunft": u}, format="json")
    d = api(anna).get(f"{BASE}{rid}/uebersicht/").data
    assert [(z["ort"], z["tag"], z["anzahl"]) for z in d["ankuenfte"]] == [
        ("Kairo", "2026-11-26", 1),
        ("Kairo", "2026-11-27", 1),
    ]
    assert {b["unterkunft"] for b in d["belegung"]} == {
        "Hotel Nil",
        "Eigene Unterkunft",
    }
    # Zähler anonym : Anna sieht Bens Namen nicht (nicht freigegeben)
    assert all(sv.name_von(ben) not in z["namen"] for z in d["ankuenfte"])
    assert d["ampel"]["teilnehmer"] == 3 and d["ampel"]["hin_gebucht"] == 2


def test_uebersicht_nur_fuer_teilnehmende(orga, anna):
    rid = neue_reise(orga, **offen())
    assert api(anna).get(f"{BASE}{rid}/uebersicht/").status_code == 403


# --- Aufgaben, Infos, Kosten -----------------------------------------------------------------


def test_aufgaben_vorlage_zuweisung_und_rechte(orga, anna, ben):
    rid = neue_reise(orga, **offen(), vorlage="auswaerts_ausland")
    dabei(rid, anna, ben)
    aufgaben = api(anna).get(f"{BASE}{rid}/aufgaben/").data
    assert len(aufgaben) == 4
    aid = aufgaben[0]["id"]
    r = api(orga).patch(
        f"{BASE}{rid}/aufgaben/{aid}/",
        {"verantwortlich": str(anna.pk), "frist": "2020-01-01"},
        format="json",
    )
    assert r.status_code == 200 and r.data["ueberfaellig"] is True
    assert Notification.objects.filter(
        destinataire=anna, type_notification=TypeNotification.REISE_AUFGABE
    ).exists()
    assert (
        api(ben)
        .patch(f"{BASE}{rid}/aufgaben/{aid}/", {"status": "erledigt"}, format="json")
        .status_code
        == 403
    )
    assert (
        api(anna).patch(f"{BASE}{rid}/aufgaben/{aid}/", {"titel": "x"}, format="json").status_code
        == 403
    )
    assert (
        api(anna)
        .patch(f"{BASE}{rid}/aufgaben/{aid}/", {"status": "erledigt"}, format="json")
        .status_code
        == 200
    )
    dran = api(anna).get(f"{BASE}{rid}/").data["jetzt_dran"]
    assert not any(p["art"] == "aufgabe_ueberfaellig" for p in dran)  # erledigt


def test_aufgabe_nur_an_teilnehmende(orga, anna):
    rid = neue_reise(orga, **offen())
    api(anna).post(f"{BASE}{rid}/beitreten/", {"status": "interessiert"}, format="json")
    r = api(orga).post(
        f"{BASE}{rid}/aufgaben/",
        {"titel": "X", "verantwortlich": str(anna.pk)},
        format="json",
    )
    assert r.status_code == 400


def test_info_wird_bereinigt_und_gelesen_liste(orga, anna):
    rid = neue_reise(orga, **offen())
    dabei(rid, anna)
    r = api(orga).post(
        f"{BASE}{rid}/infos/",
        {
            "titel": "Treffpunkt",
            "text": "<p>Hallo<script>x()</script></p>",
            "wichtig": True,
            "gelesen_pflicht": True,
        },
        format="json",
    )
    assert r.status_code == 201
    info = api(orga).get(f"{BASE}{rid}/infos/").data[0]
    assert "script" not in info["text"] and len(info["ausstehend"]) == 2
    assert api(anna).post(f"{BASE}{rid}/infos/{info['id']}/gelesen/").status_code == 204
    assert Notification.objects.filter(
        destinataire=anna, type_notification=TypeNotification.REISE_INFO
    ).exists()
    dran = api(anna).get(f"{BASE}{rid}/").data["jetzt_dran"]
    assert not any(p["art"] == "info_lesen" for p in dran)
    assert api(anna).post(f"{BASE}{rid}/infos/", {"titel": "x"}, format="json").status_code == 403


def test_regeln_bestaetigen(orga, anna):
    rid = neue_reise(orga, **offen(regeln="<p>Keine Pyrotechnik</p>"))
    dabei(rid, anna)
    assert any(p["art"] == "regeln" for p in api(anna).get(f"{BASE}{rid}/").data["jetzt_dran"])
    assert api(anna).post(f"{BASE}{rid}/regeln-bestaetigen/").status_code == 204
    assert not any(p["art"] == "regeln" for p in api(anna).get(f"{BASE}{rid}/").data["jetzt_dran"])


@pytest.mark.parametrize(
    ("cents", "gewichte"),
    [
        (10000, {"a": Decimal(1), "b": Decimal(1), "c": Decimal(1)}),
        (1, {"a": Decimal(1), "b": Decimal(1)}),
        (9999, {"a": Decimal("1.5"), "b": Decimal(1), "c": Decimal("0.5")}),
    ],
)
def test_kostenverteilung_geht_auf_den_cent_auf(cents, gewichte):
    assert sum(sv.verteile_cents(cents, gewichte).values()) == cents


def test_kostenrechnung_salden_und_ueberweisungen(orga, anna, ben):
    rid = neue_reise(orga, **offen())
    dabei(rid, anna, ben)
    r = api(orga).post(
        f"{BASE}{rid}/kosten/",
        {"bezeichnung": "Hotel", "betrag": "300.00"},
        format="json",
    )
    assert r.status_code == 200
    r = api(anna).post(
        f"{BASE}{rid}/kosten/",
        {"bezeichnung": "Taxi", "betrag": "30.00"},
        format="json",
    )
    d = r.data
    salden = {s["name"]: s["cents"] for s in d["salden"]}
    assert sum(salden.values()) == 0
    # Organisator zahlte 300, Anna 30 : jeder schuldet 110
    assert sorted(salden.values()) == [-11000, -8000, 19000]
    assert sum(u["cents"] for u in d["ueberweisungen"]) == 19000
    assert "Verein vermittelt keine Reise" in d["hinweis"]
    pid = d["posten"][0]["id"]
    assert api(ben).delete(f"{BASE}{rid}/kosten/{pid}/").status_code == 403


def test_kosten_mit_gewichten_und_auswahl(orga, anna, ben):
    rid = neue_reise(orga, **offen())
    dabei(rid, anna, ben)
    r = api(orga).post(
        f"{BASE}{rid}/kosten/",
        {
            "bezeichnung": "Mietwagen",
            "betrag": "100.00",
            "teilnehmer": [
                {"user": str(anna.pk), "gewicht": 2},
                {"user": str(ben.pk), "gewicht": 1},
            ],
        },
        format="json",
    )
    salden = {s["user"]: s["cents"] for s in r.data["salden"]}
    assert salden[str(orga.pk)] == 10000
    assert salden[str(anna.pk)] == -6667 and salden[str(ben.pk)] == -3333


# --- Reise ändern, Spielplan, Vorschau ---------------------------------------------------------


def test_reise_aendern_nur_orga_und_bereinigt(orga, anna):
    rid = neue_reise(orga, **offen())
    dabei(rid, anna)
    assert api(anna).patch(f"{BASE}{rid}/", {"titel": "X"}, format="json").status_code == 403
    r = api(orga).patch(
        f"{BASE}{rid}/", {"beschreibung": "<p>ok</p><script>x</script>"}, format="json"
    )
    assert r.status_code == 204
    assert "script" not in Reise.objects.get(pk=rid).beschreibung


def test_absage_der_reise_benachrichtigt(orga, anna):
    rid = neue_reise(orga, **offen())
    dabei(rid, anna)
    api(orga).patch(f"{BASE}{rid}/", {"abgesagt": True}, format="json")
    assert Notification.objects.filter(
        destinataire=anna, titre__startswith="Reise abgesagt"
    ).exists()
    assert (
        api(ben_neu := user("neu@example.de"))
        .post(f"{BASE}{rid}/beitreten/", {"status": "dabei"}, format="json")
        .status_code
        == 400
    )
    assert ben_neu


def test_ende_vor_start_und_max_unter_min(orga):
    assert (
        api(orga)
        .post(
            BASE,
            {"titel": "X", "start": "2026-12-05", "ende": "2026-12-01"},
            format="json",
        )
        .status_code
        == 400
    )
    assert (
        api(orga)
        .post(
            BASE,
            {"titel": "X", "min_teilnehmer": 10, "max_teilnehmer": 5},
            format="json",
        )
        .status_code
        == 400
    )


def test_reise_aus_spielplan_vorbefuellt_stadion_bleibt_leer(orga):
    r = RencontreCalendrier.objects.create(
        evenement_externe_id="x1",
        competition="CAF",
        equipe_domicile="Zamalek SC",
        equipe_exterieur="Club Africain",
        date_heure=timezone.now() + timedelta(days=30),
    )
    res = api(orga).post(BASE, {"rencontre": str(r.id)}, format="json")
    assert res.status_code == 201
    reise = Reise.objects.get(pk=res.data["id"])
    assert "Zamalek" in reise.titel and reise.start is not None and reise.stadion == ""
    # Stadion eintragen -> wird je Gegner gemerkt
    api(orga).patch(
        f"{BASE}{reise.id}/",
        {"stadion": "Cairo International", "ziel_ort": "Kairo"},
        format="json",
    )
    v = api(orga).get(f"{BASE}stadion-vorschlag/", {"rencontre": str(r.id)}).data
    assert v["gegner"] == "Zamalek SC" and v["stadion"] == "Cairo International"
    # nächste Reise zum selben Gegner wird vorbefüllt
    res2 = api(orga).post(BASE, {"rencontre": str(r.id)}, format="json")
    assert Reise.objects.get(pk=res2.data["id"]).stadion == "Cairo International"
    assert len(api(orga).get(BASE, {"rencontre": str(r.id)}).data) == 2


def test_oeffentliche_vorschau_ohne_namen_und_nur_wenn_erlaubt(orga, anna):
    rid = neue_reise(orga, sichtbarkeit="mitglieder", vorschau_oeffentlich=True)
    dabei(rid, anna)
    c = APIClient()
    d = c.get(f"{BASE}oeffentlich/{rid}/")
    assert d.status_code == 200 and d.data["interessiert"] == 2
    assert "anna" not in str(d.data).lower() and "orga" not in str(d.data).lower()
    assert "og:title" in c.get(f"{BASE}oeffentlich/{rid}/teilen/").content.decode()
    nur_einl = neue_reise(orga, sichtbarkeit="eingeladen", vorschau_oeffentlich=True)
    assert c.get(f"{BASE}oeffentlich/{nur_einl}/").status_code == 404
    aus = neue_reise(orga, sichtbarkeit="mitglieder", vorschau_oeffentlich=False)
    assert c.get(f"{BASE}oeffentlich/{aus}/").status_code == 404


def test_loeschen_nur_organisator(orga, anna):
    rid = neue_reise(orga, **offen())
    dabei(rid, anna)
    assert api(anna).delete(f"{BASE}{rid}/").status_code == 403
    assert api(orga).delete(f"{BASE}{rid}/").status_code == 204
    assert not Reise.objects.filter(pk=rid).exists()


def test_verwalter_sieht_alle_aber_keine_privaten_details(orga, anna):
    admin = user("admin@example.de", role=Role.BUREAU_ADMIN)
    rid = neue_reise(orga, sichtbarkeit="eingeladen")
    d = api(admin).get(f"{BASE}{rid}/")
    assert d.status_code == 200 and d.data["kann_verwalten"] is True
    dabei_reise = neue_reise(orga, **offen())
    dabei(dabei_reise, anna)
    etappe(anna, dabei_reise)
    # Verwalter ohne Teilnahme sieht keine Etappen von Anna
    for t in api(admin).get(f"{BASE}{dabei_reise}/teilnehmer/").data:
        assert t.get("etappen", []) == []


def test_mitgliedersuche_liefert_nur_name_und_id(orga, anna):
    gast = user("gast@example.de", mitglied=False)
    r = api(orga).get(f"{BASE}mitglieder-suche/", {"q": anna.membre.nom[:4]})
    assert r.status_code == 200
    assert {"id": str(anna.membre.id), "name": sv.name_von(anna)} in r.data
    assert all(set(x) == {"id", "name"} for x in r.data)
    assert api(orga).get(f"{BASE}mitglieder-suche/", {"q": "a"}).data == []
    assert not any(x["id"] == str(orga.membre.id) for x in r.data)
    assert gast
