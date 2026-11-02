"""Tests — Shop-Verwaltung Überblick (Kacheln, Aufgaben, Stapel, Artikel-Hinweise)."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.boutique.models import (
    ModePaiementCommande,
    Reservierung,
    ReservierungsModus,
    StatutCommande,
    StatutReservierung,
)
from apps.boutique.tests.factories import (
    CommandeFactory,
    LigneCommandeFactory,
    ProduitBonAchatFactory,
    ProduitFactory,
    VarianteProduitFactory,
)
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db

URL = "boutique:verwaltung-ueberblick"


def _client(role):
    user = User.objects.create_user(
        email=f"{role}@example.de", password="Password123!", role=role, is_active=True
    )
    MembreFactory(user=user)
    client = APIClient()
    client.force_authenticate(user)
    return client


def _alt(commande, tage, feld="created_at"):
    """created_at ist auto_now_add: Alter nachträglich per update setzen."""
    type(commande).objects.filter(pk=commande.pk).update(
        **{feld: timezone.now() - timedelta(days=tage)}
    )


def _bestellung(statut, tage=0, mode=ModePaiementCommande.VIREMENT, physisch=True):
    c = CommandeFactory(statut=statut, mode_paiement=mode, montant_total=Decimal("25.00"))
    if physisch:
        LigneCommandeFactory(commande=c)
    else:
        bon = ProduitBonAchatFactory()
        LigneCommandeFactory(commande=c, variante=bon.variantes.first())
    _alt(c, tage)
    return c


def _get(client):
    return client.get(reverse(URL))


def test_anonym_und_mitglied_ohne_recht_abgewiesen():
    assert _get(APIClient()).status_code in (401, 403)
    assert _get(_client(Role.MEMBRE)).status_code == 403


def test_leere_verwaltung_alles_gruen():
    antwort = _get(_client(Role.DIR_FINANCIER))
    assert antwort.status_code == 200
    daten = antwort.json()
    assert daten["aufgaben"] == []
    assert all(k["ton"] == "gruen" for k in daten["kacheln"].values())
    assert daten["stapel"] == {
        "zahlung_offen": 0,
        "zu_versenden": 0,
        "unterwegs": 0,
        "erledigt": 0,
        "abgebrochen": 0,
    }


def test_zahlung_offen_zaehlt_nur_manuelle_und_alle_seiten():
    for _ in range(3):
        _bestellung(StatutCommande.EN_ATTENTE, tage=8)
    _bestellung(StatutCommande.EN_ATTENTE, tage=9, mode=ModePaiementCommande.EN_LIGNE)
    daten = _get(_client(Role.DIR_FINANCIER)).json()
    kachel = daten["kacheln"]["zahlung_offen"]
    assert kachel["anzahl"] == 3
    assert kachel["aeltest_tage"] == 8
    assert kachel["ton"] == "rot"
    assert daten["stapel"]["zahlung_offen"] == 4  # Stapel zählt alle offenen Bestellungen
    aufgabe = next(a for a in daten["aufgaben"] if a["art"] == "zahlung")
    assert aufgabe["darf"] is True
    assert aufgabe["rolle"] == "finanz"
    assert aufgabe["schwere"] == "rot"


def test_junge_zahlung_ist_orange():
    _bestellung(StatutCommande.EN_ATTENTE, tage=2)
    kachel = _get(_client(Role.DIR_FINANCIER)).json()["kacheln"]["zahlung_offen"]
    assert kachel["ton"] == "orange"


def test_zu_versenden_ohne_reinen_gutschein_kauf():
    _bestellung(StatutCommande.CONFIRMEE, tage=6)
    _bestellung(StatutCommande.EN_PREPARATION, tage=1)
    _bestellung(StatutCommande.CONFIRMEE, tage=10, physisch=False)
    daten = _get(_client(Role.DIR_FINANCIER)).json()
    kachel = daten["kacheln"]["zu_versenden"]
    assert kachel["anzahl"] == 2
    assert kachel["aeltest_tage"] == 6
    assert kachel["ton"] == "rot"


def test_buero_sieht_finanzaufgaben_als_nicht_erlaubt():
    _bestellung(StatutCommande.EN_ATTENTE, tage=3)
    daten = _get(_client(Role.BUREAU_ADMIN)).json()
    assert daten["kann_finanz"] is False
    assert daten["kann_buero"] is True
    assert next(a for a in daten["aufgaben"] if a["art"] == "zahlung")["darf"] is False


def test_unterwegs_aufgabe_erst_ab_schwelle():
    kurz = _bestellung(StatutCommande.EXPEDIEE, tage=3)
    lang = _bestellung(StatutCommande.EXPEDIEE, tage=8)
    for c, t in ((kurz, 2), (lang, 7)):
        _alt(c, t, feld="date_expedition")
    daten = _get(_client(Role.BUREAU_ADMIN)).json()
    aufgabe = next(a for a in daten["aufgaben"] if a["art"] == "unterwegs")
    assert aufgabe["anzahl"] == 1
    assert aufgabe["tage"] == 7
    assert daten["stapel"]["unterwegs"] == 2


def test_reservierungen_nach_frist_je_artikel():
    p = ProduitFactory(
        reservierung_modus=ReservierungsModus.NUR_RESERVIEREN,
        reservierung_frist=timezone.now() - timedelta(days=2),
    )
    VarianteProduitFactory(produit=p, stock=50)
    for menge, st in ((2, StatutReservierung.AKTIV), (3, StatutReservierung.AKTIV)):
        Reservierung.objects.create(produit=p, membre=MembreFactory(), quantite=menge, statut=st)
    Reservierung.objects.create(
        produit=p,
        membre=MembreFactory(),
        quantite=9,
        statut=StatutReservierung.ABGEHOLT,
    )
    # Frist noch offen -> keine Aufgabe
    q = ProduitFactory(
        reservierung_modus=ReservierungsModus.NUR_RESERVIEREN,
        reservierung_frist=timezone.now() + timedelta(days=2),
    )
    Reservierung.objects.create(produit=q, membre=MembreFactory(), quantite=1)
    daten = _get(_client(Role.BUREAU_ADMIN)).json()
    aufgaben = [a for a in daten["aufgaben"] if a["art"] == "reservierung"]
    assert len(aufgaben) == 1
    assert aufgaben[0]["anzahl"] == 5
    assert aufgaben[0]["daten"]["produkt"] == p.nom
    assert daten["kacheln"]["reservierungen_offen"]["anzahl"] == 5
    codes = [h["code"] for h in daten["hinweise"][str(p.id)]]
    assert "frist_vorbei" in codes


def test_artikel_hinweise():
    knapp = ProduitFactory(nom="Knapp", seuil_alerte_stock=5)
    VarianteProduitFactory(produit=knapp, taille="S", couleur="", stock=4)
    VarianteProduitFactory(produit=knapp, taille="L", couleur="", stock=20)
    leer = ProduitFactory(nom="Leer")
    VarianteProduitFactory(produit=leer, stock=0)
    gratis = ProduitFactory(nom="Gratis", prix=Decimal("0.00"))
    VarianteProduitFactory(produit=gratis, stock=9)
    lang = ProduitFactory(nom="X" * 70)
    VarianteProduitFactory(produit=lang, stock=9)
    archiv = ProduitFactory(statut="archive", nom="Alt")
    daten = _get(_client(Role.BUREAU_ADMIN)).json()["hinweise"]
    knapp_h = {h["code"]: h for h in daten[str(knapp.id)]}
    assert knapp_h["bestand_knapp"]["detail"]["varianten"] == [{"variante": "S", "stock": 4}]
    assert "ausverkauft" in {h["code"] for h in daten[str(leer.id)]}
    assert "preis_null" in {h["code"] for h in daten[str(gratis.id)]}
    assert "name_lang" in {h["code"] for h in daten[str(lang.id)]}
    assert str(archiv.id) not in daten


def test_entwurf_ohne_bild_nur_info():
    p = ProduitFactory(statut="brouillon")
    VarianteProduitFactory(produit=p, stock=9)
    h = _get(_client(Role.BUREAU_ADMIN)).json()["hinweise"][str(p.id)]
    assert [(x["code"], x["schwere"]) for x in h] == [("bild_fehlt", "info")]


def test_aufgaben_nach_dringlichkeit_sortiert():
    _bestellung(StatutCommande.EN_ATTENTE, tage=1)  # orange
    _bestellung(StatutCommande.CONFIRMEE, tage=9)  # rot
    aufgaben = _get(_client(Role.DIR_FINANCIER)).json()["aufgaben"]
    assert [a["art"] for a in aufgaben][:2] == ["versand", "zahlung"]


def test_nur_lesend():
    antwort = _client(Role.DIR_FINANCIER).post(reverse(URL), {})
    assert antwort.status_code == 405


def test_bestellzeilen_nennen_artikel_und_variante():
    p = ProduitFactory(nom="Heimtrikot")
    v = VarianteProduitFactory(produit=p, taille="M", couleur="", stock=5)
    c = CommandeFactory(statut=StatutCommande.CONFIRMEE)
    LigneCommandeFactory(commande=c, variante=v)
    liste = _client(Role.BUREAU_ADMIN).get(reverse("boutique:commande-list")).json()
    zeile = liste["results"][0]["lignes"][0]
    assert zeile["produit_nom"] == "Heimtrikot"
    assert zeile["variante_label"] == "M"
