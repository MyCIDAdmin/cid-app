"""Tests — Reservierungen im Shop (Release 4, 2026-10-12): Modus pro Produkt, Frist,
Gesamtlimit, Limit pro Mitglied; Bestellung (reservieren + bezahlen) und reine Reservierung."""

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.boutique.models import ReservierungsModus, StatutCommande
from apps.boutique.tests.factories import (
    ProduitBonAchatFactory,
    ProduitFactory,
    VarianteProduitFactory,
)
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db

LISTE = "boutique:reservierung-list"
PASSER = "boutique:commande-passer"


@pytest.fixture
def api_client():
    return APIClient()


def _user(role, email):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    return user, MembreFactory(user=user)


def _produkt(modus=ReservierungsModus.NUR_RESERVIEREN, **kw):
    produkt = ProduitFactory(reservierung_modus=modus, **kw)
    variante = VarianteProduitFactory(produit=produkt, stock=50, taille="", couleur="")
    return produkt, variante


def _reservieren(client, produkt, menge=1, variante=None):
    daten = {"produit": str(produkt.id), "quantite": menge}
    if variante is not None:
        daten["variante"] = str(variante.id)
    return client.post(reverse(LISTE), daten, format="json")


def _bestellen(client, variante, menge):
    return client.post(
        reverse(PASSER),
        {
            "lignes": [{"variante": str(variante.id), "quantite": menge}],
            "nom_destinataire": "Test",
            "adresse_livraison": "Musterstr. 1",
            "code_postal_livraison": "10115",
            "ville_livraison": "Berlin",
            "pays_livraison": "Allemagne",
        },
        format="json",
    )


# --- nur reservieren ---


def test_mitglied_reserviert(api_client):
    produkt, variante = _produkt()
    user, membre = _user(Role.MEMBRE, "a@example.de")
    api_client.force_authenticate(user)

    resp = _reservieren(api_client, produkt, 2, variante)

    assert resp.status_code == 201, resp.data
    assert resp.data["statut"] == "aktiv"
    assert resp.data["membre"] == membre.id


def test_anonym_darf_nicht_reservieren(api_client):
    produkt, _ = _produkt()
    assert _reservieren(api_client, produkt).status_code in (401, 403)


def test_produkt_ohne_reservierung_wird_abgelehnt(api_client):
    produkt, _ = _produkt(modus=ReservierungsModus.AUS)
    user, _ = _user(Role.MEMBRE, "a@example.de")
    api_client.force_authenticate(user)
    assert _reservieren(api_client, produkt).status_code == 400


def test_limit_pro_mitglied(api_client):
    produkt, _ = _produkt(reservierung_max_pro_mitglied=2)
    user, _ = _user(Role.MEMBRE, "a@example.de")
    api_client.force_authenticate(user)

    assert _reservieren(api_client, produkt, 2).status_code == 201
    resp = _reservieren(api_client, produkt, 1)

    assert resp.status_code == 400
    assert "quantite" in resp.data["details"]


def test_gesamtlimit_gilt_ueber_alle_mitglieder(api_client):
    produkt, _ = _produkt(reservierung_max_gesamt=3)
    a, _ = _user(Role.MEMBRE, "a@example.de")
    b, _ = _user(Role.MEMBRE, "b@example.de")
    api_client.force_authenticate(a)
    assert _reservieren(api_client, produkt, 2).status_code == 201
    api_client.force_authenticate(b)

    assert _reservieren(api_client, produkt, 2).status_code == 400
    assert _reservieren(api_client, produkt, 1).status_code == 201


def test_frist_abgelaufen(api_client):
    produkt, _ = _produkt(reservierung_frist=timezone.now() - timedelta(hours=1))
    user, _ = _user(Role.MEMBRE, "a@example.de")
    api_client.force_authenticate(user)
    assert _reservieren(api_client, produkt).status_code == 400


def test_storno_gibt_menge_wieder_frei(api_client):
    produkt, _ = _produkt(reservierung_max_gesamt=1)
    user, _ = _user(Role.MEMBRE, "a@example.de")
    api_client.force_authenticate(user)
    erste = _reservieren(api_client, produkt).data
    assert _reservieren(api_client, produkt).status_code == 400

    resp = api_client.post(reverse("boutique:reservierung-stornieren", args=[erste["id"]]))

    assert resp.status_code == 200
    assert resp.data["statut"] == "storniert"
    assert _reservieren(api_client, produkt).status_code == 201


def test_fremde_reservierung_ist_unsichtbar(api_client):
    produkt, _ = _produkt()
    a, _ = _user(Role.MEMBRE, "a@example.de")
    b, _ = _user(Role.MEMBRE, "b@example.de")
    api_client.force_authenticate(a)
    res = _reservieren(api_client, produkt).data
    api_client.force_authenticate(b)

    assert api_client.get(reverse(LISTE)).data["results"] == []
    assert (
        api_client.post(reverse("boutique:reservierung-stornieren", args=[res["id"]])).status_code
        == 404
    )


def test_nach_frist_storniert_nur_die_verwaltung(api_client):
    produkt, _ = _produkt(reservierung_frist=timezone.now() + timedelta(hours=1))
    user, _ = _user(Role.MEMBRE, "a@example.de")
    api_client.force_authenticate(user)
    res = _reservieren(api_client, produkt).data
    produkt.reservierung_frist = timezone.now() - timedelta(minutes=1)
    produkt.save()

    assert (
        api_client.post(reverse("boutique:reservierung-stornieren", args=[res["id"]])).status_code
        == 400
    )
    admin, _ = _user(Role.BUREAU_ADMIN, "admin@example.de")
    api_client.force_authenticate(admin)
    assert (
        api_client.post(reverse("boutique:reservierung-stornieren", args=[res["id"]])).status_code
        == 200
    )


def test_verwaltung_sieht_alle_und_setzt_abgeholt(api_client):
    produkt, _ = _produkt()
    user, _ = _user(Role.MEMBRE, "a@example.de")
    api_client.force_authenticate(user)
    res = _reservieren(api_client, produkt).data
    url = reverse("boutique:reservierung-abholen", args=[res["id"]])
    assert api_client.post(url).status_code == 403  # Mitglied darf nicht

    admin, _ = _user(Role.BUREAU_ADMIN, "admin@example.de")
    api_client.force_authenticate(admin)
    assert len(api_client.get(reverse(LISTE)).data["results"]) == 1
    resp = api_client.post(url)

    assert resp.status_code == 200
    assert resp.data["statut"] == "abgeholt"


def test_variante_pflicht_bei_mehreren_varianten(api_client):
    produkt = ProduitFactory(reservierung_modus=ReservierungsModus.NUR_RESERVIEREN)
    VarianteProduitFactory(produit=produkt, taille="S")
    VarianteProduitFactory(produit=produkt, taille="M")
    user, _ = _user(Role.MEMBRE, "a@example.de")
    api_client.force_authenticate(user)
    assert _reservieren(api_client, produkt).status_code == 400


# --- reservieren und bezahlen (Bestellung) ---


def test_bestellung_nur_reservierbares_produkt_abgelehnt(api_client):
    _, variante = _produkt(modus=ReservierungsModus.NUR_RESERVIEREN)
    user, _ = _user(Role.MEMBRE, "a@example.de")
    api_client.force_authenticate(user)
    assert _bestellen(api_client, variante, 1).status_code == 400


def test_bestellung_limit_pro_mitglied_und_gesamt(api_client):
    _, variante = _produkt(
        modus=ReservierungsModus.RESERVIEREN_UND_BEZAHLEN,
        reservierung_max_pro_mitglied=2,
        reservierung_max_gesamt=3,
    )
    a, _ = _user(Role.MEMBRE, "a@example.de")
    b, _ = _user(Role.MEMBRE, "b@example.de")
    api_client.force_authenticate(a)
    assert _bestellen(api_client, variante, 3).status_code == 400  # pro Mitglied
    assert _bestellen(api_client, variante, 2).status_code == 201
    api_client.force_authenticate(b)
    assert _bestellen(api_client, variante, 2).status_code == 400  # Gesamt: nur noch 1
    assert _bestellen(api_client, variante, 1).status_code == 201


def test_stornierte_bestellung_zaehlt_nicht(api_client):
    produkt, variante = _produkt(
        modus=ReservierungsModus.RESERVIEREN_UND_BEZAHLEN, reservierung_max_gesamt=1
    )
    user, membre = _user(Role.MEMBRE, "a@example.de")
    api_client.force_authenticate(user)
    erste = _bestellen(api_client, variante, 1)
    assert erste.status_code == 201
    assert _bestellen(api_client, variante, 1).status_code == 400

    from apps.boutique.models import Commande

    Commande.objects.filter(pk=erste.data["id"]).update(statut=StatutCommande.ANNULEE)

    assert _bestellen(api_client, variante, 1).status_code == 201


def test_bestellung_nach_frist_abgelehnt(api_client):
    _, variante = _produkt(
        modus=ReservierungsModus.RESERVIEREN_UND_BEZAHLEN,
        reservierung_frist=timezone.now() - timedelta(minutes=5),
    )
    user, _ = _user(Role.MEMBRE, "a@example.de")
    api_client.force_authenticate(user)
    assert _bestellen(api_client, variante, 1).status_code == 400


def test_normales_produkt_bleibt_unbeschraenkt(api_client):
    _, variante = _produkt(modus=ReservierungsModus.AUS)
    user, _ = _user(Role.MEMBRE, "a@example.de")
    api_client.force_authenticate(user)
    assert _bestellen(api_client, variante, 5).status_code == 201


# --- Produkt-API ---


def test_produktliste_zeigt_restmenge_und_offen(api_client):
    produkt, _ = _produkt(reservierung_max_gesamt=2)
    user, _ = _user(Role.MEMBRE, "a@example.de")
    api_client.force_authenticate(user)
    _reservieren(api_client, produkt, 2)

    resp = api_client.get(reverse("boutique:produit-detail", args=[produkt.id]))

    assert resp.data["reservierung_verfuegbar"] == 0
    assert resp.data["reservierung_offen"] is False
    assert resp.data["reservierung_meine_menge"] == 2


def test_gutschein_kann_nicht_reservierbar_sein(api_client):
    admin, _ = _user(Role.BUREAU_ADMIN, "admin@example.de")
    api_client.force_authenticate(admin)
    produkt = ProduitBonAchatFactory()

    resp = api_client.patch(
        reverse("boutique:produit-detail", args=[produkt.id]),
        {"reservierung_modus": "nur_reservieren"},
        format="json",
    )

    assert resp.status_code == 400


def test_admin_setzt_reservierung_am_produkt(api_client):
    admin, _ = _user(Role.BUREAU_ADMIN, "admin@example.de")
    api_client.force_authenticate(admin)
    produkt = ProduitFactory()

    resp = api_client.patch(
        reverse("boutique:produit-detail", args=[produkt.id]),
        {
            "reservierung_modus": "nur_reservieren",
            "reservierung_max_gesamt": 100,
            "reservierung_max_pro_mitglied": 4,
        },
        format="json",
    )

    assert resp.status_code == 200, resp.data
    produkt.refresh_from_db()
    assert produkt.reservierung_max_pro_mitglied == 4


def test_meine_parameter_beschraenkt_auch_die_verwaltung_auf_eigene(api_client):
    produkt, _ = _produkt()
    user, _ = _user(Role.MEMBRE, "a@example.de")
    api_client.force_authenticate(user)
    _reservieren(api_client, produkt)
    admin, _ = _user(Role.BUREAU_ADMIN, "admin@example.de")
    api_client.force_authenticate(admin)

    assert len(api_client.get(reverse(LISTE)).data["results"]) == 1
    assert api_client.get(reverse(LISTE), {"meine": "1"}).data["results"] == []


def test_reservierungsartikel_verschwindet_nach_frist_aus_dem_shop(api_client):
    offen, _ = _produkt(reservierung_frist=timezone.now() + timedelta(days=1))
    abgelaufen, _ = _produkt(reservierung_frist=timezone.now() - timedelta(hours=1))
    ohne_frist, _ = _produkt()
    normal = ProduitFactory()
    VarianteProduitFactory(produit=normal, stock=5, taille="", couleur="")
    # Normales Produkt mit alter Frist-Angabe bleibt: nur Reservierungsartikel verschwinden.
    normal.reservierung_frist = timezone.now() - timedelta(days=3)
    normal.save(update_fields=["reservierung_frist"])
    mitglied, _ = _user(Role.MEMBRE, "m@example.de")
    api_client.force_authenticate(mitglied)

    ids = {r["id"] for r in api_client.get(reverse("boutique:produit-list")).data["results"]}

    assert str(abgelaufen.id) not in ids
    assert {str(offen.id), str(ohne_frist.id), str(normal.id)} <= ids
    detail = api_client.get(reverse("boutique:produit-detail", args=[abgelaufen.id]))
    assert detail.status_code == 404


def test_verwaltung_sieht_abgelaufene_reservierungsartikel_weiterhin(api_client):
    abgelaufen, _ = _produkt(reservierung_frist=timezone.now() - timedelta(hours=1))
    admin, _ = _user(Role.SUPER_ADMIN, "admin@example.de")
    api_client.force_authenticate(admin)

    ids = {r["id"] for r in api_client.get(reverse("boutique:produit-list")).data["results"]}

    assert str(abgelaufen.id) in ids
