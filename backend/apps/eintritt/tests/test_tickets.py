"""Eintrittstickets (2026-10-23) : Erzeugung, Gültigkeit, Versand per Mail und Telegram, API."""

import datetime
from unittest import mock

import pytest
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.eintritt import pdf, services, tasks
from apps.eintritt.models import Eintrittsticket
from apps.evenements.models import StatutEvenement, StatutInscription
from apps.evenements.tests.factories import EvenementFactory, InscriptionFactory
from apps.membres.models import StatutMembre
from apps.membres.tests.factories import MembreFactory
from apps.notifications import telegram
from apps.notifications.models import Notification, TelegramVerknuepfung, TypeNotification
from apps.regionen.models import Region, Teilnahme, Veranstaltung, VeranstaltungStatus

pytestmark = pytest.mark.django_db
API = "/api/v1/eintritt/"


def _membre(email="t1@example.de", prenom="Sami", nom="Ben Ali"):
    user = User.objects.create_user(
        email=email, password="Password123!", role=Role.MEMBRE, is_active=True
    )
    return MembreFactory(user=user, statut=StatutMembre.ACTIF, prenom=prenom, nom=nom)


def _client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _anmeldung(membre=None, aktiv=True, **kw):
    evenement = EvenementFactory(ticket_aktiv=aktiv, **kw.pop("evenement", {}))
    return InscriptionFactory(evenement=evenement, membre=membre or _membre(), **kw)


@pytest.fixture
def versand_geplant():
    """Führt on_commit-Funktionen nicht aus, merkt sich aber, dass der Versand geplant wurde."""
    with mock.patch.object(tasks.ticket_senden, "delay") as delay:
        yield delay


@pytest.fixture
def commit(django_capture_on_commit_callbacks):
    return django_capture_on_commit_callbacks


class TestErzeugung:
    def test_bestaetigte_anmeldung_bekommt_ticket_und_versand_wird_geplant(
        self, commit, versand_geplant
    ):
        with commit(execute=True):
            ins = _anmeldung()
        ticket = Eintrittsticket.objects.get(inscription=ins)
        assert ticket.gueltig
        versand_geplant.assert_called_once_with(str(ticket.pk))

    def test_ohne_schalter_kein_ticket(self):
        ins = _anmeldung(aktiv=False)
        assert not Eintrittsticket.objects.filter(inscription=ins).exists()

    def test_unbezahlte_anmeldung_noch_kein_ticket_nach_zahlung_schon(self, versand_geplant):
        ins = _anmeldung(statut=StatutInscription.EN_ATTENTE_PAIEMENT)
        assert not Eintrittsticket.objects.filter(inscription=ins).exists()
        ins.statut = StatutInscription.CONFIRMEE
        ins.save(update_fields=["statut", "updated_at"])
        assert Eintrittsticket.objects.filter(inscription=ins, gueltig=True).exists()

    def test_warteliste_hat_kein_ticket(self):
        ins = _anmeldung(statut=StatutInscription.LISTE_ATTENTE)
        assert not Eintrittsticket.objects.filter(inscription=ins).exists()

    def test_storno_macht_ungueltig_und_neue_bestaetigung_wieder_gueltig(self, versand_geplant):
        ins = _anmeldung()
        ticket = Eintrittsticket.objects.get(inscription=ins)
        ticket.versendet_am = timezone.now()
        ticket.save()
        ins.statut = StatutInscription.ANNULEE
        ins.save()
        ticket.refresh_from_db()
        assert not ticket.gueltig
        ins.statut = StatutInscription.CONFIRMEE
        ins.save()
        ticket.refresh_from_db()
        assert ticket.gueltig and ticket.versendet_am is None

    def test_absage_der_veranstaltung_macht_tickets_ungueltig(self, versand_geplant):
        ins = _anmeldung()
        ins.evenement.statut = StatutEvenement.ANNULE
        ins.evenement.save()
        assert not Eintrittsticket.objects.get(inscription=ins).gueltig

    def test_schalter_nachtraeglich_einschalten_stellt_tickets_fuer_bestaetigte_aus(
        self, versand_geplant
    ):
        ins = _anmeldung(aktiv=False)
        ins.evenement.ticket_aktiv = True
        ins.evenement.save()
        assert Eintrittsticket.objects.filter(inscription=ins, gueltig=True).exists()

    def test_schalter_ausschalten_macht_vorhandene_ungueltig(self, versand_geplant):
        ins = _anmeldung()
        ins.evenement.ticket_aktiv = False
        ins.evenement.save()
        assert not Eintrittsticket.objects.get(inscription=ins).gueltig

    def test_code_ist_zufaellig_und_eindeutig(self, versand_geplant):
        a = Eintrittsticket.objects.get(inscription=_anmeldung(_membre("c1@example.de")))
        b = Eintrittsticket.objects.get(inscription=_anmeldung(_membre("c2@example.de")))
        assert a.code != b.code and len(a.code) >= 24


class TestTreffen:
    def _treffen(self, status=VeranstaltungStatus.VEROEFFENTLICHT, aktiv=True):
        return Veranstaltung.objects.create(
            region=Region.objects.get(slug="nord"),
            titel="Public Viewing",
            datum=timezone.localdate() + datetime.timedelta(days=5),
            ort="Hamburg",
            status=status,
            ticket_aktiv=aktiv,
        )

    def test_teilnahme_an_veroeffentlichtem_treffen_bekommt_ticket(self, versand_geplant):
        v = self._treffen()
        tn = Teilnahme.objects.create(veranstaltung=v, user=_membre().user)
        ticket = Eintrittsticket.objects.get(teilnahme=tn)
        assert services.anzeige(ticket)["erwachsene"] == 1

    def test_entwurf_kein_ticket_nach_veroeffentlichung_schon(self, versand_geplant):
        v = self._treffen(status=VeranstaltungStatus.ENTWURF)
        tn = Teilnahme.objects.create(veranstaltung=v, user=_membre().user)
        assert not Eintrittsticket.objects.filter(teilnahme=tn).exists()
        v.status = VeranstaltungStatus.VEROEFFENTLICHT
        v.save()
        assert Eintrittsticket.objects.filter(teilnahme=tn, gueltig=True).exists()

    def test_absage_macht_ungueltig(self, versand_geplant):
        v = self._treffen()
        tn = Teilnahme.objects.create(veranstaltung=v, user=_membre().user)
        v.status = VeranstaltungStatus.ABGESAGT
        v.save()
        assert not Eintrittsticket.objects.get(teilnahme=tn).gueltig


class TestAnzeige:
    def test_personenzahl_aus_der_anmeldung(self, versand_geplant):
        ins = _anmeldung(places=2, nombre_accompagnants_adultes=1, nombre_accompagnants_enfants=1)
        daten = services.anzeige(Eintrittsticket.objects.get(inscription=ins))
        assert (daten["erwachsene"], daten["kinder"]) == (3, 1)
        assert daten["name"] == "Sami Ben Ali"

    def test_qr_ist_png_mit_praefix_und_ohne_personendaten(self, versand_geplant):
        ticket = Eintrittsticket.objects.get(inscription=_anmeldung())
        assert services.qr_png(ticket).startswith(b"\x89PNG")
        inhalt = services.qr_inhalt(ticket)
        assert inhalt == f"CID-T:{ticket.code}"
        assert "Sami" not in inhalt

    def test_pdf_mit_und_ohne_namen(self, versand_geplant):
        ticket = Eintrittsticket.objects.get(inscription=_anmeldung())
        gesehen = []

        class FalschesHtml:
            def __init__(self, string):
                gesehen.append(string)

            def write_pdf(self):
                return b"%PDF-test"

        with mock.patch.object(pdf, "HTML", FalschesHtml):
            pdf.ticket_pdf(ticket, mit_name=True)
            pdf.ticket_pdf(ticket, mit_name=False)
        assert "Sami Ben Ali" in gesehen[0]
        assert "Sami Ben Ali" not in gesehen[1]

    def test_echtes_pdf_wird_erzeugt(self, versand_geplant):
        ticket = Eintrittsticket.objects.get(inscription=_anmeldung())
        assert pdf.ticket_pdf(ticket).startswith(b"%PDF")


class TestVersand:
    def _ticket(self):
        with mock.patch.object(tasks.ticket_senden, "delay"):
            return Eintrittsticket.objects.get(inscription=_anmeldung())

    def test_mail_mit_pdf_und_in_app_hinweis(self):
        ticket = self._ticket()
        kanaele = tasks.ticket_senden(str(ticket.pk))
        assert kanaele == 1
        nachricht = mail.outbox[-1]
        assert len(nachricht.attachments) == 1
        dateiname, inhalt, typ = nachricht.attachments[0]
        assert dateiname.endswith(".pdf") and typ == "application/pdf"
        assert inhalt.startswith(b"%PDF")
        ticket.refresh_from_db()
        assert ticket.versendet_am is not None
        assert Notification.objects.filter(
            destinataire=services.inhaber(ticket), type_notification=TypeNotification.TICKET_BEREIT
        ).exists()

    def test_nur_einmal_ausser_bei_erneut(self):
        ticket = self._ticket()
        tasks.ticket_senden(str(ticket.pk))
        anzahl = len(mail.outbox)
        assert tasks.ticket_senden(str(ticket.pk)) == 0
        assert len(mail.outbox) == anzahl
        tasks.ticket_senden(str(ticket.pk), True)
        assert len(mail.outbox) == anzahl + 1

    def test_ungueltiges_ticket_wird_nicht_gesendet(self):
        ticket = self._ticket()
        ticket.gueltig = False
        ticket.save()
        assert tasks.ticket_senden(str(ticket.pk)) == 0
        assert mail.outbox == []

    def test_telegram_nur_wenn_verbunden_und_art_gewaehlt(self):
        ticket = self._ticket()
        user = services.inhaber(ticket)
        with mock.patch.object(telegram, "bot_konfiguriert", return_value=True), mock.patch.object(
            telegram, "sende_dokument"
        ) as senden:
            tasks.ticket_senden(str(ticket.pk), True)  # nicht verbunden
            senden.assert_not_called()
            TelegramVerknuepfung.objects.create(user=user, chat_id=4711, kategorien=["shop"])
            tasks.ticket_senden(str(ticket.pk), True)  # Art nicht gewählt
            senden.assert_not_called()
            TelegramVerknuepfung.objects.filter(user=user).update(kategorien=["veranstaltungen"])
            kanaele = tasks.ticket_senden(str(ticket.pk), True)
        assert kanaele == 2
        chat_id, inhalt, dateiname, beschriftung = senden.call_args.args
        assert chat_id == 4711 and inhalt.startswith(b"%PDF")
        assert dateiname.endswith(".pdf") and "Sami" not in beschriftung

    def test_blockierter_bot_trennt_die_verbindung(self):
        ticket = self._ticket()
        user = services.inhaber(ticket)
        TelegramVerknuepfung.objects.create(user=user, chat_id=1, kategorien=["veranstaltungen"])
        with mock.patch.object(telegram, "bot_konfiguriert", return_value=True), mock.patch.object(
            telegram, "sende_dokument", side_effect=telegram.TelegramGesperrt()
        ):
            assert tasks.ticket_senden(str(ticket.pk)) == 1  # nur Mail
        assert TelegramVerknuepfung.objects.get(user=user).chat_id is None

    def test_keine_zweite_telegram_kurznachricht_fuer_das_ticket(self):
        ticket = self._ticket()
        user = services.inhaber(ticket)
        TelegramVerknuepfung.objects.create(user=user, chat_id=1, kategorien=["veranstaltungen"])
        with mock.patch.object(telegram, "bot_konfiguriert", return_value=True), mock.patch.object(
            telegram, "sende_dokument"
        ), mock.patch.object(telegram, "sende_text") as text:
            tasks.ticket_senden(str(ticket.pk))
        text.assert_not_called()


class TestApi:
    def _ticket_fuer(self, membre, **kw):
        with mock.patch.object(tasks.ticket_senden, "delay"):
            ins = _anmeldung(membre=membre, **kw)
        return Eintrittsticket.objects.get(inscription=ins)

    def test_nur_anmeldung_noetig(self):
        assert APIClient().get(f"{API}meine/").status_code in (401, 403)

    def test_meine_tickets_mit_qr_und_nur_eigene(self):
        ich, anderer = _membre("ich@example.de"), _membre("andere@example.de")
        meins = self._ticket_fuer(ich, places=2)
        self._ticket_fuer(anderer)
        antwort = _client(ich.user).get(f"{API}meine/")
        assert antwort.status_code == 200
        tickets = antwort.json()["tickets"]
        assert [t["id"] for t in tickets] == [str(meins.pk)]
        assert tickets[0]["qr"].startswith("data:image/png;base64,")
        assert tickets[0]["erwachsene"] == 2
        assert "code" not in tickets[0]

    def test_vergangene_und_ungueltige_tickets_nicht_in_der_liste(self):
        ich = _membre()
        alt = self._ticket_fuer(
            ich,
            evenement={"date_evenement": timezone.localdate() - datetime.timedelta(days=2)},
        )
        storniert = self._ticket_fuer(ich)
        storniert.gueltig = False
        storniert.save()
        assert alt.pk
        assert _client(ich.user).get(f"{API}meine/").json()["tickets"] == []

    def test_senden_plant_versand_und_bremst_dauerklicken(self):
        ich = _membre()
        ticket = self._ticket_fuer(ich)
        with mock.patch.object(tasks.ticket_senden, "delay") as delay:
            antwort = _client(ich.user).post(f"{API}{ticket.pk}/senden/")
            assert antwort.status_code == 200
            delay.assert_called_once_with(str(ticket.pk), True)
            ticket.versendet_am = timezone.now()
            ticket.save()
            assert _client(ich.user).post(f"{API}{ticket.pk}/senden/").status_code == 429

    def test_erneuern_gibt_neuen_code_und_plant_versand(self):
        ich = _membre()
        ticket = self._ticket_fuer(ich)
        alt = ticket.code
        with mock.patch.object(tasks.ticket_senden, "delay"):
            antwort = _client(ich.user).post(f"{API}{ticket.pk}/erneuern/")
        assert antwort.status_code == 200
        ticket.refresh_from_db()
        assert ticket.code != alt and ticket.erneuert_am is not None
        assert not Eintrittsticket.objects.filter(code=alt).exists()

    def test_fremdes_ticket_ist_404(self):
        ticket = self._ticket_fuer(_membre("a@example.de"))
        fremder = _membre("b@example.de")
        client = _client(fremder.user)
        assert client.post(f"{API}{ticket.pk}/senden/").status_code == 404
        assert client.post(f"{API}{ticket.pk}/erneuern/").status_code == 404
