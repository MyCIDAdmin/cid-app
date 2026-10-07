"""Tests API — Business Partner & Lieferanten (Lesen ab RH, Pflegen ab Bureau Admin)."""

import pytest
from django.db import IntegrityError, transaction
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.boutique.tests.factories import ProduitFactory
from apps.evenements.tests.factories import EvenementFactory
from apps.partenaires.models import (
    Partner,
    PartnerKategorie,
    PartnerStatus,
    PartnerVerknuepfung,
)
from apps.projets.tests.factories import ProjetFactory

pytestmark = pytest.mark.django_db

LISTE = "partenaires:partner-list"


def _client(role):
    user = User.objects.create_user(
        email=f"{role}@example.com", password="Password123!", role=role, is_active=True
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


@pytest.fixture
def bureau():
    return _client(Role.BUREAU_ADMIN)


def _partner(nom="Muster Catering", **kw):
    return Partner.objects.create(nom=nom, **kw)


def _bewertung_daten(**kw):
    daten = {"qualitaet": 5, "preis_leistung": 4, "zuverlaessigkeit": 3, "kommunikation": 4}
    daten.update(kw)
    return daten


def test_seed_kategorien_vorhanden():
    assert PartnerKategorie.objects.filter(nom="Catering").exists()
    assert PartnerKategorie.objects.count() >= 9


def test_anonym_und_mitglied_haben_keinen_zugriff():
    assert APIClient().get(reverse(LISTE)).status_code == 401
    client, _ = _client(Role.MEMBRE)
    assert client.get(reverse(LISTE)).status_code == 403


def test_rh_darf_lesen_aber_nicht_schreiben():
    client, _ = _client(Role.RH)
    assert client.get(reverse(LISTE)).status_code == 200
    assert client.post(reverse(LISTE), {"nom": "X"}, format="json").status_code == 403


def test_anlegen_und_aendern(bureau):
    client, user = bureau
    kat = PartnerKategorie.objects.get(nom="Catering")
    resp = client.post(
        reverse(LISTE),
        {"nom": "Lecker GmbH", "typ": "lieferant", "kategorien": [str(kat.pk)], "ville": "Köln"},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["kategorien_namen"] == ["Catering"]
    partner = Partner.objects.get(pk=resp.data["id"])
    assert partner.created_by == user
    resp = client.patch(
        reverse("partenaires:partner-detail", args=[partner.pk]),
        {"bevorzugt": True, "statut": "archiviert"},
        format="json",
    )
    assert resp.status_code == 200
    partner.refresh_from_db()
    assert partner.bevorzugt is True
    assert partner.statut == PartnerStatus.AKTIV  # Status nur über Archivieren-Aktion


def test_kein_delete(bureau):
    client, _ = bureau
    partner = _partner()
    resp = client.delete(reverse("partenaires:partner-detail", args=[partner.pk]))
    assert resp.status_code == 405
    assert Partner.objects.filter(pk=partner.pk).exists()


def test_archivieren_blendet_aus_liste_aus_und_reaktivieren(bureau):
    client, _ = bureau
    partner = _partner()
    assert (
        client.post(reverse("partenaires:partner-archivieren", args=[partner.pk])).status_code
        == 200
    )
    assert client.get(reverse(LISTE)).data == []
    assert len(client.get(reverse(LISTE), {"alle": "1"}).data) == 1
    assert len(client.get(reverse(LISTE), {"statut": "archiviert"}).data) == 1
    client.post(reverse("partenaires:partner-reaktivieren", args=[partner.pk]))
    assert len(client.get(reverse(LISTE)).data) == 1


def test_filter_kategorie_typ_suche_bevorzugt(bureau):
    client, _ = bureau
    catering = PartnerKategorie.objects.get(nom="Catering")
    druck = PartnerKategorie.objects.get(nom="Druck & Werbung")
    a = _partner("Alpha Catering", typ="lieferant", bevorzugt=True)
    a.kategorien.add(catering)
    b = _partner("Beta Druck", typ="partner", ville="Berlin")
    b.kategorien.add(druck)
    c = _partner("Gamma Beides", typ="beides")
    c.kategorien.add(catering, druck)

    def namen(**params):
        return sorted(p["nom"] for p in client.get(reverse(LISTE), params).data)

    assert namen(kategorie=str(catering.pk)) == ["Alpha Catering", "Gamma Beides"]
    assert namen(kategorie=f"{catering.pk},{druck.pk}") == [
        "Alpha Catering",
        "Beta Druck",
        "Gamma Beides",
    ]
    assert namen(typ="lieferant") == ["Alpha Catering", "Gamma Beides"]
    assert namen(typ="partner") == ["Beta Druck", "Gamma Beides"]
    assert namen(q="berlin") == ["Beta Druck"]
    assert namen(bevorzugt="1") == ["Alpha Catering"]


def test_verknuepfen_projekt_event_produkt_und_filter(bureau):
    client, _ = bureau
    partner = _partner()
    andere = _partner("Andere")
    projekt, event, produkt = ProjetFactory(), EvenementFactory(), ProduitFactory()
    url = reverse("partenaires:partner-verknuepfen", args=[partner.pk])
    for typ, ziel in (("projet", projekt), ("evenement", event), ("produit", produkt)):
        resp = client.post(
            url, {"ziel_typ": typ, "ziel_id": str(ziel.pk), "rolle": "sponsor"}, format="json"
        )
        assert resp.status_code == 201, resp.data
        assert resp.data["ziel_typ"] == typ
        assert resp.data["ziel_label"]
    detail = client.get(reverse("partenaires:partner-detail", args=[partner.pk])).data
    assert len(detail["verknuepfungen"]) == 3
    assert detail["verknuepfungen_anzahl"] == 3
    liste = client.get(reverse(LISTE), {"projet": str(projekt.pk)}).data
    assert [p["nom"] for p in liste] == [partner.nom]
    assert andere.pk not in [p["id"] for p in liste]


def test_verknuepfen_doppelt_und_ungueltig(bureau):
    client, _ = bureau
    partner = _partner()
    projekt = ProjetFactory()
    url = reverse("partenaires:partner-verknuepfen", args=[partner.pk])
    body = {"ziel_typ": "projet", "ziel_id": str(projekt.pk), "rolle": "lieferant"}
    assert client.post(url, body, format="json").status_code == 201
    assert client.post(url, body, format="json").status_code == 400
    body["rolle"] = "sponsor"  # andere Rolle am selben Ziel ist erlaubt
    assert client.post(url, body, format="json").status_code == 201
    unbekannt = {"ziel_typ": "projet", "ziel_id": "00000000-0000-0000-0000-000000000000"}
    assert client.post(url, unbekannt, format="json").status_code == 400
    assert (
        client.post(url, {"ziel_typ": "foo", "ziel_id": str(projekt.pk)}, format="json").status_code
        == 400
    )


def test_check_constraint_genau_ein_ziel():
    partner = _partner()
    with pytest.raises(IntegrityError), transaction.atomic():
        PartnerVerknuepfung.objects.create(partner=partner)
    with pytest.raises(IntegrityError), transaction.atomic():
        PartnerVerknuepfung.objects.create(
            partner=partner, projet=ProjetFactory(), produit=ProduitFactory()
        )


def test_verknuepfung_loeschen(bureau):
    client, _ = bureau
    partner = _partner()
    v = PartnerVerknuepfung.objects.create(partner=partner, projet=ProjetFactory())
    resp = client.delete(reverse("partenaires:verknuepfung-loeschen", args=[v.pk]))
    assert resp.status_code == 204
    assert not PartnerVerknuepfung.objects.filter(pk=v.pk).exists()


def test_bewertung_anlegen_schnitt_und_min_note(bureau):
    client, user = bureau
    gut, schlecht = _partner("Gut"), _partner("Schlecht")
    for partner, daten in (
        (gut, _bewertung_daten(qualitaet=5, preis_leistung=5, zuverlaessigkeit=5, kommunikation=5)),
        (
            schlecht,
            _bewertung_daten(qualitaet=1, preis_leistung=2, zuverlaessigkeit=1, kommunikation=2),
        ),
    ):
        resp = client.post(
            reverse("partenaires:partner-bewertungen", args=[partner.pk]), daten, format="json"
        )
        assert resp.status_code == 201, resp.data
    assert resp.data["schnitt"] == 1.5
    liste = {p["nom"]: p for p in client.get(reverse(LISTE)).data}
    assert liste["Gut"]["bewertung_schnitt"] == 5.0
    assert liste["Gut"]["bewertung_anzahl"] == 1
    assert [p["nom"] for p in client.get(reverse(LISTE), {"min_note": "4"}).data] == ["Gut"]
    assert client.get(reverse(LISTE), {"min_note": "abc"}).status_code == 400
    sortiert = client.get(reverse(LISTE), {"ordering": "note"}).data
    assert sortiert[0]["nom"] == "Gut"
    gelistet = client.get(reverse("partenaires:partner-bewertungen", args=[gut.pk])).data
    assert len(gelistet) == 1


@pytest.mark.parametrize("wert", [0, 6])
def test_bewertung_grenzen(bureau, wert):
    client, _ = bureau
    partner = _partner()
    resp = client.post(
        reverse("partenaires:partner-bewertungen", args=[partner.pk]),
        _bewertung_daten(qualitaet=wert),
        format="json",
    )
    assert resp.status_code == 400


def test_bewertung_mit_fremder_verknuepfung_abgelehnt(bureau):
    client, _ = bureau
    partner, anderer = _partner(), _partner("Anderer")
    fremd = PartnerVerknuepfung.objects.create(partner=anderer, projet=ProjetFactory())
    resp = client.post(
        reverse("partenaires:partner-bewertungen", args=[partner.pk]),
        _bewertung_daten(verknuepfung=str(fremd.pk)),
        format="json",
    )
    assert resp.status_code == 400


def test_bewertung_loeschen_nur_autor_oder_super_admin(bureau):
    client, _ = bureau
    partner = _partner()
    resp = client.post(
        reverse("partenaires:partner-bewertungen", args=[partner.pk]),
        _bewertung_daten(),
        format="json",
    )
    url = reverse("partenaires:bewertung-loeschen", args=[resp.data["id"]])
    fremd, _ = _client(Role.DIR_FINANCIER)
    assert fremd.delete(url).status_code == 403
    admin, _ = _client(Role.SUPER_ADMIN)
    assert admin.delete(url).status_code == 204
    resp = client.post(
        reverse("partenaires:partner-bewertungen", args=[partner.pk]),
        _bewertung_daten(),
        format="json",
    )
    assert (
        client.delete(reverse("partenaires:bewertung-loeschen", args=[resp.data["id"]])).status_code
        == 204
    )


def test_kategorien_verwalten_und_zaehlen(bureau):
    client, _ = bureau
    resp = client.post(
        reverse("partenaires:kategorie-list"),
        {"nom": "Fotografie", "nom_fr": "Photo"},
        format="json",
    )
    assert resp.status_code == 201
    kat = PartnerKategorie.objects.get(nom="Fotografie")
    _partner("Foto Müller").kategorien.add(kat)
    archiviert = _partner("Alt", statut=PartnerStatus.ARCHIVIERT)
    archiviert.kategorien.add(kat)
    liste = {k["nom"]: k for k in client.get(reverse("partenaires:kategorie-list")).data}
    assert liste["Fotografie"]["anzahl"] == 1
    resp = client.patch(
        reverse("partenaires:kategorie-detail", args=[kat.pk]), {"actif": False}, format="json"
    )
    assert resp.status_code == 200
    doppelt = client.post(
        reverse("partenaires:kategorie-list"), {"nom": "Fotografie"}, format="json"
    )
    assert doppelt.status_code == 400


def test_ziele_suche(bureau):
    client, _ = bureau
    ProjetFactory(titre="Sommerfest Kasse")
    ProduitFactory(nom="Schal Rot")
    url = reverse("partenaires:ziele")
    resp = client.get(url, {"typ": "projet", "q": "sommer"})
    assert [z["label"] for z in resp.data] == ["Sommerfest Kasse"]
    assert client.get(url, {"typ": "produit", "q": "schal"}).data[0]["label"] == "Schal Rot"
    assert client.get(url, {"typ": "xyz"}).status_code == 400
