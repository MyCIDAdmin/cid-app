"""Tests — Telegram-Anbindung und Geburtstagsgruß (Release 32)."""

import datetime
from unittest import mock

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.membres.models import StatutMembre
from apps.membres.tests.factories import MembreFactory
from apps.notifications import tasks, telegram
from apps.notifications.models import (
    Geburtstagsgruss,
    Notification,
    TelegramVerknuepfung,
    TypeNotification,
)
from apps.notifications.services import notifier
from apps.notifications.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

URL = "notifications:telegram"
HOOK = {"HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN": "geheim-123"}


@pytest.fixture(autouse=True)
def bot(settings):
    settings.TELEGRAM_BOT_TOKEN = "123:ABC"
    settings.TELEGRAM_BOT_USERNAME = "MyCID_Chatbot"
    settings.TELEGRAM_WEBHOOK_SECRET = "geheim-123"
    settings.FRONTEND_URL = "https://my-cid.de"


@pytest.fixture
def gesendet():
    with mock.patch.object(telegram, "sende_text") as m:
        yield m


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _update(chat_id, text, typ="private"):
    return {"message": {"chat": {"id": chat_id, "type": typ}, "text": text}}


def _verbinden(user, chat_id=4711):
    code, _ = telegram.neuer_code(user)
    telegram.verknuepfe(code, chat_id)
    return code


class TestVerknuepfung:
    def test_zustand_ohne_bot_ist_inaktiv(self, settings):
        settings.TELEGRAM_BOT_TOKEN = ""
        user = UserFactory()
        r = _client(user).get(reverse(URL))
        assert r.status_code == 200 and r.data["aktiv"] is False and r.data["verbunden"] is False
        assert _client(user).post(reverse("notifications:telegram-verbinden")).status_code == 503

    def test_link_und_start_verbinden_das_konto(self, gesendet):
        user = UserFactory()
        r = _client(user).post(reverse("notifications:telegram-verbinden"))
        assert r.data["link"].startswith("https://t.me/MyCID_Chatbot?start=")
        code = r.data["link"].split("start=")[1]
        w = APIClient().post(
            reverse("notifications:telegram-webhook"),
            _update(4711, f"/start {code}"),
            format="json",
            **HOOK,
        )
        assert w.status_code == 200
        obj = TelegramVerknuepfung.objects.get(user=user)
        assert obj.chat_id == 4711 and obj.code_hash == ""
        assert "Verbunden" in gesendet.call_args.args[1]
        assert _client(user).get(reverse(URL)).data["verbunden"] is True

    def test_code_nur_einmal_und_nur_begrenzt_gueltig(self, gesendet):
        user = UserFactory()
        code, _ = telegram.neuer_code(user)
        assert telegram.verknuepfe(code, 1) is not None
        assert telegram.verknuepfe(code, 2) is None
        andere = UserFactory()
        alt, _ = telegram.neuer_code(andere)
        TelegramVerknuepfung.objects.filter(user=andere).update(
            code_gueltig_bis=timezone.now() - datetime.timedelta(minutes=1)
        )
        assert telegram.verknuepfe(alt, 3) is None

    def test_chat_gehoert_nur_einem_konto(self):
        a, b = UserFactory(), UserFactory()
        _verbinden(a, 99)
        _verbinden(b, 99)
        assert TelegramVerknuepfung.objects.get(user=a).chat_id is None
        assert TelegramVerknuepfung.objects.get(user=b).chat_id == 99

    def test_webhook_schutz(self, gesendet):
        url = reverse("notifications:telegram-webhook")
        assert APIClient().post(url, _update(1, "/start x"), format="json").status_code == 403
        falsch = {"HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN": "nein"}
        assert APIClient().post(url, {}, format="json", **falsch).status_code == 403
        gesendet.assert_not_called()

    def test_webhook_ohne_geheimnis_ist_abgeschaltet(self, settings):
        settings.TELEGRAM_WEBHOOK_SECRET = ""
        r = APIClient().post(reverse("notifications:telegram-webhook"), {}, format="json")
        assert r.status_code == 404

    def test_ungueltiger_code_stop_und_hilfe(self, gesendet):
        user = UserFactory()
        url = reverse("notifications:telegram-webhook")
        APIClient().post(url, _update(5, "/start falsch"), format="json", **HOOK)
        assert "abgelaufen" in gesendet.call_args.args[1]
        _verbinden(user, 5)
        APIClient().post(url, _update(5, "/stop"), format="json", **HOOK)
        assert TelegramVerknuepfung.objects.get(user=user).chat_id is None
        APIClient().post(url, _update(5, "hallo"), format="json", **HOOK)
        assert "Benachrichtigungen" in gesendet.call_args.args[1]
        n = gesendet.call_count
        for u in (_update(5, "/stop", typ="group"), {"edited_message": {}}, "kaputt"):
            assert APIClient().post(url, u, format="json", **HOOK).status_code == 200
        assert gesendet.call_count == n

    def test_kategorien_aendern_und_trennen(self, gesendet):
        user = UserFactory()
        _verbinden(user)
        c = _client(user)
        r = c.patch(reverse(URL), {"kategorien": ["regionen", "kalender"]}, format="json")
        assert r.data["kategorien"] == ["regionen", "kalender"]
        assert c.patch(reverse(URL), {"kategorien": ["x"]}, format="json").status_code == 400
        assert c.delete(reverse(URL)).status_code == 204
        assert TelegramVerknuepfung.objects.get(user=user).chat_id is None

    def test_testnachricht(self, gesendet):
        user = UserFactory()
        c = _client(user)
        assert c.post(reverse("notifications:telegram-test")).status_code == 409
        _verbinden(user, 7)
        assert c.post(reverse("notifications:telegram-test")).status_code == 204
        assert gesendet.call_args.args[0] == 7


class TestVersand:
    def test_notifier_plant_telegram_nur_fuer_gewaehlte_art(
        self, django_capture_on_commit_callbacks
    ):
        user = UserFactory()
        _verbinden(user)
        TelegramVerknuepfung.objects.filter(user=user).update(kategorien=["regionen"])
        with mock.patch.object(tasks.sende_telegram, "delay") as delay:
            with django_capture_on_commit_callbacks(execute=True):
                notifier(user, TypeNotification.REGION_VERANSTALTUNG, titre="T", message="m")
                notifier(user, TypeNotification.PAIEMENT_CONFIRME, titre="T2", message="m")
        assert delay.call_count == 1

    def test_ohne_verbindung_oder_bot_wird_nichts_geplant(
        self, settings, django_capture_on_commit_callbacks
    ):
        user = UserFactory()
        with mock.patch.object(tasks.sende_telegram, "delay") as delay:
            with django_capture_on_commit_callbacks(execute=True):
                notifier(user, TypeNotification.BIENVENUE, titre="T", message="m")
                _verbinden(user)
                settings.TELEGRAM_BOT_TOKEN = ""
                notifier(user, TypeNotification.BIENVENUE, titre="T", message="m")
        delay.assert_not_called()

    def test_text_enthaelt_titel_und_link_aber_nicht_den_inhalt(self, gesendet):
        user = UserFactory(langue_preferee="fr")
        _verbinden(user, 8)
        n = Notification.objects.create(
            destinataire=user,
            type_notification=TypeNotification.REGION_VERANSTALTUNG,
            titre="Titel",
            message="GEHEIMER INHALT",
            lien="/regionen/nord",
        )
        tasks.sende_telegram(str(n.pk))
        text = gesendet.call_args.args[1]
        assert "Titel" in text and "https://my-cid.de/regionen/nord" in text
        assert "GEHEIMER" not in text and "Détails" in text

    def test_gesperrter_bot_loest_die_verbindung(self):
        user = UserFactory()
        _verbinden(user, 9)
        n = Notification.objects.create(
            destinataire=user, type_notification=TypeNotification.BIENVENUE, titre="T", message="m"
        )
        with mock.patch.object(telegram, "sende_text", side_effect=telegram.TelegramGesperrt):
            tasks.sende_telegram(str(n.pk))
        assert TelegramVerknuepfung.objects.get(user=user).chat_id is None

    def test_kategorien_decken_alle_typen_ab(self):
        for typ in TypeNotification.values:
            assert telegram.kategorie_von(typ) in telegram.ALLE_KATEGORIEN
        nicht_eingeordnet = [
            t for t in TypeNotification.values if telegram.kategorie_von(t) == telegram.SONSTIGES
        ]
        assert nicht_eingeordnet == []


class TestGeburtstag:
    def _mitglied(self, tag, **kw):
        user = UserFactory()
        return MembreFactory(user=user, date_naissance=tag, **kw)

    def test_sendet_nur_heute_an_aktive_und_nur_einmal(self, mailoutbox):
        heute = datetime.date(2026, 10, 15)
        a = self._mitglied(datetime.date(1990, 10, 15), prenom="Amel")
        self._mitglied(datetime.date(1990, 10, 16))
        self._mitglied(datetime.date(1990, 10, 15), statut=StatutMembre.INACTIF)
        assert tasks.sende_geburtstagsgruesse(heute.isoformat()) == 1
        assert tasks.sende_geburtstagsgruesse(heute.isoformat()) == 0
        assert len(mailoutbox) == 1
        mail = mailoutbox[0]
        assert mail.to == [a.user.email]
        assert "Amel" in mail.body and "Joyeux anniversaire" in mail.body
        assert "عيد ميلاد" in mail.body
        assert Geburtstagsgruss.objects.filter(user=a.user, jahr=2026).count() == 1

    def test_abmeldung_und_globaler_schalter(self, mailoutbox):
        m = self._mitglied(datetime.date(1985, 3, 3))
        m.user.ui_praeferenzen = {"geburtstagsgruss": False}
        m.user.save()
        self._mitglied(datetime.date(1985, 3, 3))
        assert tasks.sende_geburtstagsgruesse("2026-03-03") == 1
        from apps.notifications.models import ParametresNotification

        ParametresNotification.objects.update_or_create(pk=1, defaults={"email_membres": False})
        self._mitglied(datetime.date(1985, 3, 4))
        assert tasks.sende_geburtstagsgruesse("2026-03-04") == 0

    def test_29_februar_wird_im_nichtschaltjahr_am_28_gefeiert(self, mailoutbox):
        self._mitglied(datetime.date(1992, 2, 29))
        assert tasks.sende_geburtstagsgruesse("2027-02-28") == 1
        assert tasks.sende_geburtstagsgruesse("2028-02-28") == 0
        assert tasks.sende_geburtstagsgruesse("2028-02-29") == 1

    def test_mailfehler_stoppt_die_anderen_nicht(self, mailoutbox):
        self._mitglied(datetime.date(1980, 5, 5))
        self._mitglied(datetime.date(1981, 5, 5))
        aufrufe = {"n": 0}
        from apps.notifications import email_cid

        original = email_cid.envoyer_email_cid

        def kaputt(**kw):
            aufrufe["n"] += 1
            if aufrufe["n"] == 1:
                raise RuntimeError("smtp")
            return original(**kw)

        with mock.patch.object(email_cid, "envoyer_email_cid", kaputt):
            assert tasks.sende_geburtstagsgruesse("2026-05-05") == 1
        assert Geburtstagsgruss.objects.count() == 1
