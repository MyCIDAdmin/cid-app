"""Tests — automatische Hinweise für das Modul „Übersicht“ (2026-10-20)."""

import datetime
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.boutique.models import PanierReservierung
from apps.boutique.tests.factories import (
    ProduitBonAchatFactory,
    ProduitFactory,
    VarianteProduitFactory,
)
from apps.evenements.models import StatutInscription
from apps.evenements.tests.factories import EvenementFactory, InscriptionFactory
from apps.membres.models import StatutMembre
from apps.membres.tests.factories import MembreFactory
from apps.projets.tests.factories import ProjetFactory
from apps.regionen.models import Region, Teilnahme, Veranstaltung, VeranstaltungStatus
from apps.zentral.hinweise import hinweise_fuer
from apps.zentral.models import ZentraleEinstellungen

pytestmark = pytest.mark.django_db

URL = "zentral:hinweise"


def _heute():
    return timezone.localdate()


def _in_tagen(n):
    return _heute() + datetime.timedelta(days=n)


@pytest.fixture
def nutzer():
    user = User.objects.create_user(
        email="hinweis@example.de", password="Password123!", role=Role.MEMBRE, is_active=True
    )
    membre = MembreFactory(user=user, statut=StatutMembre.ACTIF)
    return user, membre


def _ids(user):
    return [h["id"] for h in hinweise_fuer(user)]


def test_endpoint_nur_fuer_angemeldete(nutzer):
    assert APIClient().get(reverse(URL)).status_code == 401
    client = APIClient()
    client.force_authenticate(user=nutzer[0])
    antwort = client.get(reverse(URL))
    assert antwort.status_code == 200
    assert antwort.data["results"] == []


def test_standardwerte_der_schwellen():
    e = ZentraleEinstellungen.get_solo()
    assert (
        e.hinweis_tage_vorher,
        e.hinweis_plaetze_absolut,
        e.hinweis_plaetze_prozent,
        e.hinweis_lager_menge,
        e.hinweis_max_anzahl,
    ) == (7, 5, 20, 5, 3)


def test_veranstaltung_plaetze_knapp_absolut(nutzer):
    ev = EvenementFactory(places_max=10, date_evenement=_in_tagen(30))
    InscriptionFactory(evenement=ev, places=6)  # 4 frei <= 5
    hinweise = hinweise_fuer(nutzer[0])
    assert [h["id"] for h in hinweise] == [f"evenement:{ev.pk}"]
    assert hinweise[0]["gruende"] == ["plaetze"]
    assert hinweise[0]["plaetze_frei"] == 4
    assert hinweise[0]["plaetze_gesamt"] == 10
    assert hinweise[0]["link"] == f"/evenements?evenement={ev.pk}"


def test_veranstaltung_plaetze_knapp_prozent(nutzer):
    ev = EvenementFactory(places_max=100, date_evenement=_in_tagen(30))
    InscriptionFactory(evenement=ev, places=1, montant_paye=Decimal("0"))
    assert _ids(nutzer[0]) == []  # 99 frei
    InscriptionFactory(evenement=ev, places=79)  # 20 frei = 20 %
    assert f"evenement:{ev.pk}" in _ids(nutzer[0])


def test_veranstaltung_termin_nah_auch_ohne_begrenzung(nutzer):
    ev = EvenementFactory(places_max=None, date_evenement=_in_tagen(3))
    hinweise = hinweise_fuer(nutzer[0])
    assert hinweise[0]["id"] == f"evenement:{ev.pk}"
    assert hinweise[0]["gruende"] == ["termin"]
    assert hinweise[0]["tage"] == 3


def test_veranstaltung_weit_weg_und_reichlich_platz_kein_hinweis(nutzer):
    EvenementFactory(places_max=50, date_evenement=_in_tagen(30))
    assert _ids(nutzer[0]) == []


def test_ausgebucht_angemeldet_oder_entwurf_erscheint_nicht(nutzer):
    user, membre = nutzer
    voll = EvenementFactory(places_max=2, date_evenement=_in_tagen(2))
    InscriptionFactory(evenement=voll, places=2)
    eigene = EvenementFactory(places_max=None, date_evenement=_in_tagen(2))
    InscriptionFactory(evenement=eigene, membre=membre)
    EvenementFactory(places_max=None, date_evenement=_in_tagen(2), statut="brouillon")
    EvenementFactory(places_max=None, date_evenement=_in_tagen(-1))
    assert _ids(user) == []


def test_angemeldete_auf_warteliste_zaehlt_als_angemeldet(nutzer):
    user, membre = nutzer
    ev = EvenementFactory(places_max=None, date_evenement=_in_tagen(2))
    InscriptionFactory(evenement=ev, membre=membre, statut=StatutInscription.LISTE_ATTENTE)
    assert _ids(user) == []


def test_nicht_mitglied_sieht_nur_oeffentliche_veranstaltungen():
    user = User.objects.create_user(
        email="gast@example.de", password="Password123!", role=Role.MEMBRE, is_active=True
    )
    MembreFactory(user=user, statut=StatutMembre.EN_ATTENTE)
    EvenementFactory(places_max=None, date_evenement=_in_tagen(2), visible_public=False)
    oeffentlich = EvenementFactory(
        places_max=None, date_evenement=_in_tagen(2), visible_public=True
    )
    ids = _ids(user)
    assert f"evenement:{oeffentlich.pk}" in ids or ids == []  # Menü-Barriere kann alles sperren
    assert all(not i.startswith("evenement:") or i == f"evenement:{oeffentlich.pk}" for i in ids)


def test_projekt_frist_nah(nutzer):
    nah = ProjetFactory(date_limite=_in_tagen(4))
    ProjetFactory(date_limite=_in_tagen(40))
    ProjetFactory(date_limite=None)
    ProjetFactory(date_limite=_in_tagen(2), statut="termine")
    ProjetFactory(date_limite=_in_tagen(2), sichtbarkeit="entwurf")
    hinweise = hinweise_fuer(nutzer[0])
    assert [h["id"] for h in hinweise] == [f"projekt:{nah.pk}"]
    assert hinweise[0]["gruende"] == ["frist"]
    assert hinweise[0]["tage"] == 4


def test_regionale_veranstaltung_plaetze_und_termin(nutzer):
    user, _ = nutzer
    region = Region.objects.create(slug="stuttgart", name="Stuttgart")
    v = Veranstaltung.objects.create(
        region=region,
        titel="Stammtisch",
        datum=_in_tagen(2),
        ort="Stuttgart",
        max_teilnehmer=10,
        status=VeranstaltungStatus.VEROEFFENTLICHT,
    )
    for i in range(7):
        teilnehmer = User.objects.create_user(
            email=f"t{i}@example.de", password="Password123!", is_active=True
        )
        Teilnahme.objects.create(veranstaltung=v, user=teilnehmer)
    hinweise = hinweise_fuer(user)
    assert hinweise[0]["id"] == f"veranstaltung:{v.pk}"
    assert hinweise[0]["gruende"] == ["plaetze", "termin"]
    assert hinweise[0]["plaetze_frei"] == 3
    assert hinweise[0]["link"] == "/regionen/stuttgart"
    Teilnahme.objects.create(veranstaltung=v, user=user)
    assert _ids(user) == []  # bereits angemeldet


def test_artikel_bestand_knapp_und_reservierungen_zaehlen_mit(nutzer):
    user, _ = nutzer
    knapp = ProduitFactory()
    variante = VarianteProduitFactory(produit=knapp, stock=8)
    ProduitFactory()  # ohne Varianten => nicht verfügbar, kein Hinweis
    VarianteProduitFactory(produit=ProduitFactory(), stock=50)
    assert _ids(user) == []  # 8 > 5
    andere = MembreFactory(statut=StatutMembre.ACTIF)
    PanierReservierung.objects.create(
        membre=andere,
        variante=variante,
        quantite=4,
        expire_le=timezone.now() + datetime.timedelta(minutes=10),
    )
    hinweise = hinweise_fuer(user)
    assert [h["id"] for h in hinweise] == [f"artikel:{knapp.pk}"]
    assert hinweise[0]["bestand"] == 4
    assert hinweise[0]["link"] == f"/boutique/{knapp.pk}"


def test_artikel_frist_nah_und_gutscheine_ausgenommen(nutzer):
    user, _ = nutzer
    p = ProduitFactory(reservierung_frist=timezone.now() + datetime.timedelta(days=3, hours=1))
    VarianteProduitFactory(produit=p, stock=50)
    gutschein = ProduitBonAchatFactory(
        reservierung_frist=timezone.now() + datetime.timedelta(days=1)
    )
    assert gutschein.pk
    hinweise = hinweise_fuer(user)
    assert [h["id"] for h in hinweise] == [f"artikel:{p.pk}"]
    assert hinweise[0]["gruende"] == ["frist"]


def test_nur_fuer_mitglieder_artikel_nicht_fuer_nicht_mitglied():
    user = User.objects.create_user(
        email="gast2@example.de", password="Password123!", role=Role.MEMBRE, is_active=True
    )
    MembreFactory(user=user, statut=StatutMembre.EN_ATTENTE)
    p = ProduitFactory(nur_mitglieder=True)
    VarianteProduitFactory(produit=p, stock=2)
    assert f"artikel:{p.pk}" not in _ids(user)


def test_maximal_konfigurierte_anzahl_wichtigstes_zuerst(nutzer):
    user, _ = nutzer
    # 5 Hinweise, davon einer mit Plätzen UND Termin (am wichtigsten).
    top = EvenementFactory(places_max=10, date_evenement=_in_tagen(2))
    InscriptionFactory(evenement=top, places=8)
    for i in range(4):
        EvenementFactory(places_max=None, date_evenement=_in_tagen(3 + i))
    ids = _ids(user)
    assert len(ids) == 3
    assert ids[0] == f"evenement:{top.pk}"
    e = ZentraleEinstellungen.get_solo()
    e.hinweis_max_anzahl = 5
    e.save()
    assert len(_ids(user)) == 5


def test_schwellen_sind_zentral_einstellbar(nutzer):
    user, _ = nutzer
    EvenementFactory(places_max=None, date_evenement=_in_tagen(10))
    assert _ids(user) == []
    e = ZentraleEinstellungen.get_solo()
    e.hinweis_tage_vorher = 14
    e.save()
    assert len(_ids(user)) == 1
    ev = EvenementFactory(places_max=20, date_evenement=_in_tagen(40))
    InscriptionFactory(evenement=ev, places=14)  # 6 frei: > 5, aber 30 % > 20 %
    assert f"evenement:{ev.pk}" not in _ids(user)
    e.hinweis_plaetze_absolut = 6
    e.save()
    assert f"evenement:{ev.pk}" in _ids(user)


@pytest.mark.parametrize(
    "feld,wert",
    [
        ("hinweis_tage_vorher", 0),
        ("hinweis_tage_vorher", 61),
        ("hinweis_plaetze_prozent", 101),
        ("hinweis_max_anzahl", 11),
        ("hinweis_lager_menge", 0),
    ],
)
def test_ungueltige_schwellen_werden_abgelehnt(feld, wert):
    admin = User.objects.create_user(
        email="adm@example.de", password="Password123!", role=Role.SUPER_ADMIN, is_active=True
    )
    client = APIClient()
    client.force_authenticate(user=admin)
    antwort = client.patch(reverse("zentral:einstellungen"), {feld: wert}, format="json")
    assert antwort.status_code == 400
