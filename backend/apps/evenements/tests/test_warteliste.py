"""Tests — Zahlungsfrist + Warteliste bei begrenzten Veranstaltungen (2026-10-20)."""

import datetime
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.cotisations.models import StatutCotisation
from apps.evenements import services
from apps.evenements.models import Inscription, StatutInscription
from apps.evenements.tasks import benachrichtige, fristen_verarbeiten
from apps.evenements.tests.factories import EvenementFactory, InscriptionFactory
from apps.membres.models import StatutMembre
from apps.membres.tests.factories import MembreFactory
from apps.notifications.models import Notification
from apps.zentral.models import ZentraleEinstellungen

pytestmark = pytest.mark.django_db

INSCRIRE_URL = "evenements:evenement-inscrire"


def _user(email):
    user = User.objects.create_user(
        email=email, password="Password123!", role=Role.MEMBRE, is_active=True
    )
    membre = MembreFactory(user=user, statut=StatutMembre.ACTIF)
    return user, membre


def _inscrire(user, evenement, places=1):
    client = APIClient()
    client.force_authenticate(user=user)
    return client.post(reverse(INSCRIRE_URL), {"evenement": str(evenement.id), "places": places})


def test_bezahlpflichtige_anmeldung_bekommt_zwei_tage_frist():
    user, _ = _user("f1@example.de")
    evenement = EvenementFactory(places_max=5)
    antwort = _inscrire(user, evenement)
    assert antwort.status_code == 200
    assert antwort.data["statut"] == StatutInscription.EN_ATTENTE_PAIEMENT
    inscription = Inscription.objects.get(pk=antwort.data["id"])
    delta = inscription.zahlungsfrist_bis - timezone.now()
    assert datetime.timedelta(days=1, hours=23) < delta <= datetime.timedelta(days=2)


def test_frist_dauer_ist_zentral_einstellbar():
    einstellungen = ZentraleEinstellungen.get_solo()
    einstellungen.event_zahlungsfrist_tage = 5
    einstellungen.save()
    user, _ = _user("f2@example.de")
    antwort = _inscrire(user, EvenementFactory(places_max=5))
    inscription = Inscription.objects.get(pk=antwort.data["id"])
    delta = inscription.zahlungsfrist_bis - timezone.now()
    assert datetime.timedelta(days=4, hours=23) < delta <= datetime.timedelta(days=5)


def test_keine_frist_bei_unbegrenzter_oder_kostenloser_veranstaltung():
    user, _ = _user("f3@example.de")
    unbegrenzt = EvenementFactory(places_max=None)
    assert _inscrire(user, unbegrenzt).data["zahlungsfrist_bis"] is None
    user2, _ = _user("f4@example.de")
    kostenlos = EvenementFactory(places_max=5, gratuit=True)
    antwort = _inscrire(user2, kostenlos)
    assert antwort.data["statut"] == StatutInscription.CONFIRMEE
    assert antwort.data["zahlungsfrist_bis"] is None


def test_erneutes_absenden_verlaengert_die_frist_nicht():
    user, _ = _user("f5@example.de")
    evenement = EvenementFactory(places_max=5)
    erste = _inscrire(user, evenement)
    inscription = Inscription.objects.get(pk=erste.data["id"])
    alt = timezone.now() + datetime.timedelta(hours=3)
    Inscription.objects.filter(pk=inscription.pk).update(zahlungsfrist_bis=alt)
    _inscrire(user, evenement, places=2)
    inscription.refresh_from_db()
    assert inscription.zahlungsfrist_bis == alt


def test_abgelaufene_frist_storniert_gibt_platz_frei_und_laesst_wartende_nachruecken():
    u1, _ = _user("w1@example.de")
    u2, _ = _user("w2@example.de")
    u3, _ = _user("w3@example.de")
    evenement = EvenementFactory(places_max=1)
    i1 = Inscription.objects.get(pk=_inscrire(u1, evenement).data["id"])
    i2 = Inscription.objects.get(pk=_inscrire(u2, evenement).data["id"])
    i3 = Inscription.objects.get(pk=_inscrire(u3, evenement).data["id"])
    assert i2.statut == StatutInscription.LISTE_ATTENTE
    assert i3.statut == StatutInscription.LISTE_ATTENTE
    assert evenement.places_reservees == 1

    Inscription.objects.filter(pk=i1.pk).update(
        zahlungsfrist_bis=timezone.now() - datetime.timedelta(minutes=1)
    )
    ergebnis = fristen_verarbeiten()
    assert ergebnis["storniert"] == 1

    i1.refresh_from_db()
    i2.refresh_from_db()
    i3.refresh_from_db()
    assert i1.statut == StatutInscription.ANNULEE
    assert i1.cotisation.statut == StatutCotisation.ANNULEE
    # FIFO: u2 rückt nach und bekommt eine NEUE Frist, u3 wartet weiter.
    assert i2.statut == StatutInscription.EN_ATTENTE_PAIEMENT
    assert i2.zahlungsfrist_bis > timezone.now() + datetime.timedelta(days=1)
    assert i2.warteliste_seit is None
    assert i2.cotisation is not None
    assert i3.statut == StatutInscription.LISTE_ATTENTE
    assert services.warteliste_position(i3) == 1


def test_bezahlte_anmeldung_wird_nie_storniert():
    user, _ = _user("p1@example.de")
    evenement = EvenementFactory(places_max=2)
    inscription = Inscription.objects.get(pk=_inscrire(user, evenement).data["id"])
    cotisation = inscription.cotisation
    cotisation.statut = StatutCotisation.PAYEE
    cotisation.save()
    Inscription.objects.filter(pk=inscription.pk).update(
        zahlungsfrist_bis=timezone.now() - datetime.timedelta(hours=1)
    )
    assert services.unbezahlte_stornieren() == 0
    inscription.refresh_from_db()
    assert inscription.statut == StatutInscription.CONFIRMEE
    assert inscription.zahlungsfrist_bis is None


def test_nachruecken_ueberspringt_zu_grosse_gruppen():
    evenement = EvenementFactory(places_max=2)
    belegt = InscriptionFactory(evenement=evenement, places=1)
    gross = InscriptionFactory(
        evenement=evenement,
        places=2,
        statut=StatutInscription.LISTE_ATTENTE,
        warteliste_seit=timezone.now() - datetime.timedelta(hours=2),
    )
    klein = InscriptionFactory(
        evenement=evenement,
        places=1,
        statut=StatutInscription.LISTE_ATTENTE,
        warteliste_seit=timezone.now() - datetime.timedelta(hours=1),
    )
    nachgerueckt = services.warteliste_nachruecken(evenement.pk)
    assert [i.pk for i in nachgerueckt] == [klein.pk]
    gross.refresh_from_db()
    assert gross.statut == StatutInscription.LISTE_ATTENTE
    belegt.refresh_from_db()
    assert belegt.statut == StatutInscription.CONFIRMEE


def test_neue_anmeldung_stellt_sich_hinter_wartende_an():
    evenement = EvenementFactory(places_max=3)
    InscriptionFactory(evenement=evenement, places=2)
    InscriptionFactory(
        evenement=evenement,
        places=2,
        statut=StatutInscription.LISTE_ATTENTE,
        warteliste_seit=timezone.now(),
    )
    user, _ = _user("fifo@example.de")
    # 1 Platz wäre frei, aber es wartet schon jemand => hinten anstellen.
    antwort = _inscrire(user, evenement)
    assert antwort.data["statut"] == StatutInscription.LISTE_ATTENTE
    assert antwort.data["warteliste_position"] == 2


def test_bestehende_anmeldung_aufstocken_bleibt_fehler_wenn_voll():
    user, membre = _user("auf@example.de")
    evenement = EvenementFactory(places_max=2)
    antwort = _inscrire(user, evenement, places=1)
    assert antwort.status_code == 200
    InscriptionFactory(evenement=evenement, places=1)
    zu_gross = _inscrire(user, evenement, places=2)
    assert zu_gross.status_code == 400


def test_wartende_zaehlen_nicht_in_der_kapazitaet():
    evenement = EvenementFactory(places_max=2)
    InscriptionFactory(evenement=evenement, places=1)
    InscriptionFactory(
        evenement=evenement,
        places=3,
        statut=StatutInscription.LISTE_ATTENTE,
        warteliste_seit=timezone.now(),
    )
    assert evenement.places_reservees == 1
    assert evenement.places_restantes == 1


def test_erinnerung_24_stunden_vor_fristende_nur_einmal(mailoutbox):
    user, _ = _user("er@example.de")
    evenement = EvenementFactory(places_max=3)
    inscription = Inscription.objects.get(pk=_inscrire(user, evenement).data["id"])
    Inscription.objects.filter(pk=inscription.pk).update(
        zahlungsfrist_bis=timezone.now() + datetime.timedelta(hours=20)
    )
    assert fristen_verarbeiten()["erinnert"] == 1
    assert fristen_verarbeiten()["erinnert"] == 0
    assert Notification.objects.filter(
        destinataire=user, titre__startswith="Zahlungsfrist endet bald"
    ).exists()
    assert len(mailoutbox) == 1


def test_keine_erinnerung_wenn_frist_noch_weit_weg():
    user, _ = _user("fern@example.de")
    inscription = Inscription.objects.get(
        pk=_inscrire(user, EvenementFactory(places_max=3)).data["id"]
    )
    assert fristen_verarbeiten()["erinnert"] == 0
    inscription.refresh_from_db()
    assert inscription.frist_erinnerung_gesendet_am is None


def test_kapazitaetserhoehung_laesst_wartende_beim_naechsten_lauf_nachruecken():
    evenement = EvenementFactory(places_max=1)
    InscriptionFactory(evenement=evenement, places=1)
    wartend = InscriptionFactory(
        evenement=evenement,
        places=1,
        statut=StatutInscription.LISTE_ATTENTE,
        warteliste_seit=timezone.now(),
        montant_paye=Decimal("0.00"),
    )
    evenement.places_max = 2
    evenement.save()
    assert fristen_verarbeiten()["nachgerueckt"] == 1
    wartend.refresh_from_db()
    assert wartend.statut == StatutInscription.CONFIRMEE  # kostenlos => direkt bestätigt


def test_benachrichtigung_zur_warteliste_wird_erstellt():
    user, _ = _user("bn@example.de")
    evenement = EvenementFactory(places_max=1)
    InscriptionFactory(evenement=evenement, places=1)
    inscription = Inscription.objects.get(pk=_inscrire(user, evenement).data["id"])
    benachrichtige("warteliste", str(inscription.pk))
    assert Notification.objects.filter(destinataire=user, titre__startswith="Warteliste").exists()


def test_stornierung_einer_anmeldung_laesst_wartende_nachruecken():
    u1, m1 = _user("s1@example.de")
    u2, _ = _user("s2@example.de")
    evenement = EvenementFactory(places_max=1)
    i1 = Inscription.objects.get(pk=_inscrire(u1, evenement).data["id"])
    i2 = Inscription.objects.get(pk=_inscrire(u2, evenement).data["id"])
    client = APIClient()
    client.force_authenticate(user=u1)
    antwort = client.post(reverse("evenements:inscription-annuler", args=[i1.id]))
    assert antwort.status_code == 200
    i2.refresh_from_db()
    assert i2.statut == StatutInscription.EN_ATTENTE_PAIEMENT


def test_barerfassung_bei_voller_veranstaltung_bleibt_fehler():
    admin, _ = _user("fin@example.de")
    admin.role = Role.DIR_FINANCIER
    admin.save()
    evenement = EvenementFactory(places_max=1)
    InscriptionFactory(evenement=evenement, places=1)
    ziel = MembreFactory(statut=StatutMembre.ACTIF)
    client = APIClient()
    client.force_authenticate(user=admin)
    antwort = client.post(
        reverse("evenements:evenement-inscrire-especes"),
        {"evenement": str(evenement.id), "places": 1, "membre": str(ziel.id)},
    )
    assert antwort.status_code == 400
