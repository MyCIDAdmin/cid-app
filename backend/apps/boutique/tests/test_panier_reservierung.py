"""Warenkorb-Reservierung (2026-10-20): Artikel im Warenkorb sind für die zentral einstellbare
Dauer (Standard 20 Minuten) reserviert und zählen im Lagerstand der anderen nicht mehr als
verfügbar ; jede Änderung setzt den Countdown zurück ; nach Ablauf sind sie wieder frei."""

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.boutique import panier
from apps.boutique.models import PanierReservierung
from apps.boutique.tests.factories import ProduitBonAchatFactory, VarianteProduitFactory
from apps.membres.tests.factories import MembreFactory
from apps.zentral.models import ZentraleEinstellungen

pytestmark = pytest.mark.django_db

URL = "boutique:panier-reservierung"
PASSER_URL = "boutique:commande-passer"
VARIANTE_LIST_URL = "boutique:variante-list"


def _user(email, role=Role.MEMBRE):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    return user, MembreFactory(user=user)


def _client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _lignes(*paare):
    return {"lignes": [{"variante": str(v.id), "quantite": q} for v, q in paare]}


def _adresse():
    return {
        "nom_destinataire": "Max Muster",
        "adresse_livraison": "Hauptstr. 1",
        "code_postal_livraison": "10115",
        "ville_livraison": "Berlin",
        "pays_livraison": "Allemagne",
    }


def test_reservierung_startet_countdown_und_zaehlt_im_lagerstand():
    variante = VarianteProduitFactory(stock=5)
    user_a, membre_a = _user("a@example.de")

    resp = _client(user_a).put(reverse(URL), _lignes((variante, 3)), format="json")

    assert resp.status_code == 200
    assert resp.data["zeilen"] == [{"variante": str(variante.id), "reserviert": 3, "verfuegbar": 5}]
    assert 1190 <= resp.data["restzeit_sekunden"] <= 1200  # 20 Minuten
    # Physischer Bestand bleibt, verfügbar für andere nur noch 2
    variante.refresh_from_db()
    assert variante.stock == 5
    _user_b, membre_b = _user("b@example.de")
    assert panier.verfuegbarer_bestand(variante, membre_b) == 2
    assert panier.verfuegbarer_bestand(variante, membre_a) == 5  # eigene zählt nicht ab


def test_dauer_ist_zentral_einstellbar():
    einstellungen = ZentraleEinstellungen.get_solo()
    einstellungen.warenkorb_reservierung_minuten = 5
    einstellungen.save()
    variante = VarianteProduitFactory(stock=5)
    user, _ = _user("a@example.de")

    resp = _client(user).put(reverse(URL), _lignes((variante, 1)), format="json")

    assert 290 <= resp.data["restzeit_sekunden"] <= 300


def test_weiterer_artikel_setzt_countdown_zurueck():
    v1, v2 = VarianteProduitFactory(stock=5), VarianteProduitFactory(stock=5)
    user, membre = _user("a@example.de")
    client = _client(user)
    client.put(reverse(URL), _lignes((v1, 1)), format="json")
    # Countdown künstlich fast ablaufen lassen
    PanierReservierung.objects.update(expire_le=timezone.now() + timedelta(seconds=30))

    resp = client.put(reverse(URL), _lignes((v1, 1), (v2, 2)), format="json")

    assert resp.data["restzeit_sekunden"] >= 1190
    ablauf = set(PanierReservierung.objects.values_list("expire_le", flat=True))
    assert len(ablauf) == 1  # alle Zeilen teilen dieselbe neue Frist


def test_teilreservierung_wenn_nicht_genug_frei():
    variante = VarianteProduitFactory(stock=4)
    user_a, _ = _user("a@example.de")
    user_b, _ = _user("b@example.de")
    _client(user_a).put(reverse(URL), _lignes((variante, 3)), format="json")

    resp = _client(user_b).put(reverse(URL), _lignes((variante, 3)), format="json")

    assert resp.status_code == 200
    assert resp.data["zeilen"][0]["reserviert"] == 1
    assert resp.data["zeilen"][0]["verfuegbar"] == 1


def test_abgelaufene_reservierung_gibt_bestand_wieder_frei():
    variante = VarianteProduitFactory(stock=4)
    user_a, _ = _user("a@example.de")
    _user_b, membre_b = _user("b@example.de")
    _client(user_a).put(reverse(URL), _lignes((variante, 4)), format="json")
    assert panier.verfuegbarer_bestand(variante, membre_b) == 0

    PanierReservierung.objects.update(expire_le=timezone.now() - timedelta(seconds=1))

    assert panier.verfuegbarer_bestand(variante, membre_b) == 4  # sofort, ohne Celery
    assert panier.bereinige_abgelaufene() == 1
    assert PanierReservierung.objects.count() == 0


def test_entfernte_artikel_werden_freigegeben_und_delete_leert_alles():
    v1, v2 = VarianteProduitFactory(stock=5), VarianteProduitFactory(stock=5)
    user, _ = _user("a@example.de")
    client = _client(user)
    client.put(reverse(URL), _lignes((v1, 1), (v2, 1)), format="json")

    client.put(reverse(URL), _lignes((v2, 1)), format="json")
    assert list(PanierReservierung.objects.values_list("variante_id", flat=True)) == [v2.id]

    assert client.delete(reverse(URL)).status_code == 204
    assert PanierReservierung.objects.count() == 0


def test_get_liefert_eigenen_stand():
    variante = VarianteProduitFactory(stock=5)
    user, _ = _user("a@example.de")
    client = _client(user)
    assert client.get(reverse(URL)).data["expire_le"] is None
    client.put(reverse(URL), _lignes((variante, 2)), format="json")
    daten = client.get(reverse(URL)).data
    assert daten["restzeit_sekunden"] > 0
    assert daten["zeilen"][0]["reserviert"] == 2


def test_gutschein_wird_nicht_reserviert():
    bon = ProduitBonAchatFactory().variantes.first()
    user, _ = _user("a@example.de")
    resp = _client(user).put(reverse(URL), _lignes((bon, 1)), format="json")
    assert resp.status_code == 200
    assert resp.data["zeilen"] == []
    assert PanierReservierung.objects.count() == 0


def test_variantenliste_zeigt_verfuegbaren_lagerstand_ohne_eigene_reservierung():
    variante = VarianteProduitFactory(stock=5)
    user_a, _ = _user("a@example.de")
    user_b, _ = _user("b@example.de")
    _client(user_a).put(reverse(URL), _lignes((variante, 3)), format="json")

    fuer_b = _client(user_b).get(reverse(VARIANTE_LIST_URL), {"produit": str(variante.produit_id)})
    fuer_a = _client(user_a).get(reverse(VARIANTE_LIST_URL), {"produit": str(variante.produit_id)})

    assert fuer_b.data["results"][0]["stock"] == 5
    assert fuer_b.data["results"][0]["stock_verfuegbar"] == 2
    assert fuer_a.data["results"][0]["stock_verfuegbar"] == 5


def test_bestellung_wird_durch_fremde_reservierung_blockiert():
    variante = VarianteProduitFactory(stock=3)
    user_a, _ = _user("a@example.de")
    user_b, _ = _user("b@example.de")
    _client(user_a).put(reverse(URL), _lignes((variante, 3)), format="json")

    resp = _client(user_b).post(
        reverse(PASSER_URL),
        {**_lignes((variante, 1)), **_adresse()},
        format="json",
    )

    assert resp.status_code == 400
    assert "0 disponible" in str(resp.data)


def test_bestellung_verbraucht_eigene_reservierung():
    variante = VarianteProduitFactory(stock=3)
    user_a, _ = _user("a@example.de")
    client = _client(user_a)
    client.put(reverse(URL), _lignes((variante, 3)), format="json")

    resp = client.post(reverse(PASSER_URL), {**_lignes((variante, 3)), **_adresse()}, format="json")

    assert resp.status_code == 201
    variante.refresh_from_db()
    assert variante.stock == 0
    assert PanierReservierung.objects.count() == 0


def test_nur_mit_anmeldung_und_mitgliedsakte():
    assert APIClient().put(reverse(URL), {"lignes": []}, format="json").status_code == 401
    ohne_akte = User.objects.create_user(
        email="x@example.de", password="Password123!", role=Role.MEMBRE, is_active=True
    )
    assert _client(ohne_akte).put(reverse(URL), {"lignes": []}, format="json").status_code in (
        400,
        403,
    )
