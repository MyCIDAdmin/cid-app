"""Release 7 — Artikel „Exklusiv nur für Mitglieder“ : sichtbar für alle, bestellbar nur für aktive
Mitglieder (serverseitig)."""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.boutique.models import ReservierungsModus
from apps.boutique.tests.factories import ProduitFactory, VarianteProduitFactory
from apps.membres.models import StatutMembre
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db

PASSER = "boutique:commande-passer"
ESPECES = "boutique:commande-vendre-especes"


def _client(role=Role.MEMBRE, statut=StatutMembre.ACTIF, email="m7@example.de"):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    MembreFactory(user=user, statut=statut)
    client = APIClient()
    client.force_authenticate(user)
    return client


def _exklusiv(**kw):
    produkt = ProduitFactory(nur_mitglieder=True, **kw)
    return produkt, VarianteProduitFactory(produit=produkt, taille="", couleur="", stock=10)


def _bestellen(client, variante):
    return client.post(
        reverse(PASSER),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 1}],
            "nom_destinataire": "T",
            "adresse_livraison": "Str. 1",
            "code_postal_livraison": "10115",
            "ville_livraison": "Berlin",
        },
        format="json",
    )


def test_exklusiver_artikel_bleibt_fuer_alle_sichtbar_mit_sperrflag():
    produkt, _ = _exklusiv()
    url = reverse("boutique:produit-detail", args=[produkt.id])
    anonym = APIClient().get(url)
    assert anonym.status_code == 200
    assert anonym.data["nur_mitglieder"] is True
    assert anonym.data["zugang_gesperrt"] is True
    aktiv = _client(email="aktiv@example.de").get(url)
    assert aktiv.data["zugang_gesperrt"] is False
    inaktiv = _client(statut=StatutMembre.INACTIF, email="inaktiv@example.de").get(url)
    assert inaktiv.data["zugang_gesperrt"] is True


def test_normaler_artikel_ist_nie_gesperrt():
    produkt = ProduitFactory()
    resp = APIClient().get(reverse("boutique:produit-detail", args=[produkt.id]))
    assert resp.data["nur_mitglieder"] is False
    assert resp.data["zugang_gesperrt"] is False


def test_bestellung_nicht_aktives_mitglied_abgelehnt():
    _, variante = _exklusiv()
    client = _client(statut=StatutMembre.INACTIF, email="b-inaktiv@example.de")
    resp = _bestellen(client, variante)
    assert resp.status_code == 400
    assert "exklusiv" in str(resp.data)


def test_bestellung_aktives_mitglied_erlaubt():
    _, variante = _exklusiv()
    assert _bestellen(_client(email="b-aktiv@example.de"), variante).status_code == 201


def test_reservierung_nicht_aktives_mitglied_abgelehnt():
    produkt, _ = _exklusiv(reservierung_modus=ReservierungsModus.NUR_RESERVIEREN)
    daten = {"produit": str(produkt.id), "quantite": 1}
    gesperrt = _client(statut=StatutMembre.INACTIF, email="r-inaktiv@example.de")
    assert (
        gesperrt.post(reverse("boutique:reservierung-list"), daten, format="json").status_code
        == 400
    )
    erlaubt = _client(email="r-aktiv@example.de")
    assert (
        erlaubt.post(reverse("boutique:reservierung-list"), daten, format="json").status_code == 201
    )


def test_barverkauf_nur_an_aktive_mitglieder():
    _, variante = _exklusiv()
    df = _client(role=Role.DIR_FINANCIER, email="df7@example.de")
    inaktiv = MembreFactory(statut=StatutMembre.INACTIF)
    aktiv = MembreFactory(statut=StatutMembre.ACTIF)
    daten = {"variante": str(variante.id), "quantite": 1}
    assert (
        df.post(reverse(ESPECES), {**daten, "membre": str(inaktiv.id)}, format="json").status_code
        == 400
    )
    assert (
        df.post(reverse(ESPECES), {**daten, "membre": str(aktiv.id)}, format="json").status_code
        == 201
    )


def test_verwaltung_kann_flag_setzen():
    admin = _client(role=Role.BUREAU_ADMIN, email="adm7@example.de")
    produkt = ProduitFactory()
    resp = admin.patch(
        reverse("boutique:produit-detail", args=[produkt.id]),
        {"nur_mitglieder": True},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    produkt.refresh_from_db()
    assert produkt.nur_mitglieder is True
