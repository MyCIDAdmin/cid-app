"""Tests — Web-Push (Release 2026.11)."""

import base64
import json
import os
from unittest import mock

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.urls import reverse
from rest_framework.test import APIClient

from apps.notifications import push, tasks
from apps.notifications.models import Notification, PushAbo, PushEinstellung, TypeNotification
from apps.notifications.services import notifier
from apps.notifications.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

URL = "notifications:push"
ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123"


def _b64(daten: bytes) -> str:
    return base64.urlsafe_b64encode(daten).rstrip(b"=").decode()


def _geraet(endpoint: str = ENDPOINT) -> dict:
    """Wie `PushSubscription.toJSON()` : ein echter Schlüssel, damit die Verschlüsselung läuft."""
    privat = ec.generate_private_key(ec.SECP256R1())
    oeffentlich = privat.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return {
        "endpoint": endpoint,
        "keys": {"p256dh": _b64(oeffentlich), "auth": _b64(os.urandom(16))},
    }


@pytest.fixture(autouse=True)
def schluessel(settings):
    oeffentlich, privat = push.schluessel_erzeugen()
    settings.VAPID_PUBLIC_KEY = oeffentlich
    settings.VAPID_PRIVATE_KEY = privat
    settings.VAPID_SUBJECT = "mailto:test@example.de"
    settings.FRONTEND_URL = "https://my-cid.de"


@pytest.fixture
def user():
    return UserFactory()


@pytest.fixture
def client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture
def gesendet():
    with mock.patch.object(push, "sende") as m:
        yield m


class TestZustandUndAnmeldung:
    def test_ohne_schluessel_ist_push_inaktiv(self, client, settings):
        settings.VAPID_PRIVATE_KEY = ""
        daten = client.get(reverse(URL)).json()
        assert daten["aktiv"] is False
        assert daten["schluessel"] == ""
        assert daten["geraete"] == []
        assert (
            client.post(reverse("notifications:push-abo"), _geraet(), format="json").status_code
            == 404
        )
        assert client.post(reverse("notifications:push-test")).status_code == 404

    def test_zustand_zeigt_oeffentlichen_schluessel_aber_nie_den_privaten(self, client, settings):
        daten = client.get(reverse(URL)).json()
        assert daten["aktiv"] is True
        assert daten["schluessel"] == settings.VAPID_PUBLIC_KEY
        assert settings.VAPID_PRIVATE_KEY not in json.dumps(daten)
        assert "knoten" not in daten

    def test_anmelden_speichert_geraet_und_alle_arten(self, client, user):
        antwort = client.post(
            reverse("notifications:push-abo"),
            _geraet(),
            format="json",
            HTTP_USER_AGENT="Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36",
        )
        assert antwort.status_code == 201
        abo = PushAbo.objects.get(user=user)
        assert abo.endpoint == ENDPOINT
        assert abo.geraet == "Android · Chrome"
        assert push.einstellung_von(user).kategorien == push.ALLE_KATEGORIEN
        assert antwort.json()["geraete"][0]["geraet"] == "Android · Chrome"

    def test_dieselbe_adresse_gehoert_nur_einem_konto(self, client, user):
        anderer = UserFactory()
        PushAbo.objects.create(user=anderer, endpoint=ENDPOINT, p256dh="x" * 30, auth="y" * 16)
        client.post(reverse("notifications:push-abo"), _geraet(), format="json")
        assert PushAbo.objects.filter(endpoint=ENDPOINT).count() == 1
        assert PushAbo.objects.get(endpoint=ENDPOINT).user == user

    @pytest.mark.parametrize(
        "endpoint",
        [
            "http://fcm.googleapis.com/fcm/send/x",  # kein https
            "https://169.254.169.254/latest/meta-data",  # interne Adresse
            "https://localhost/push",
            "https://fcm.googleapis.com.evil.example/x",  # nur ähnlicher Name
            "https://evil.example/fcm.googleapis.com",
            "https://user:pw@fcm.googleapis.com/x",
            "https://fcm.googleapis.com:8443/x",
            "",
        ],
    )
    def test_fremde_adressen_werden_abgelehnt(self, client, endpoint):
        antwort = client.post(reverse("notifications:push-abo"), _geraet(endpoint), format="json")
        assert antwort.status_code == 400
        assert not PushAbo.objects.exists()

    @pytest.mark.parametrize(
        "endpoint",
        [
            "https://fcm.googleapis.com/fcm/send/x",
            "https://updates.push.services.mozilla.com/wpush/v2/x",
            "https://web.push.apple.com/x",
            "https://wns2-par02p.notify.windows.com/w/?token=x",
        ],
    )
    def test_bekannte_push_dienste_sind_erlaubt(self, endpoint):
        assert push.endpoint_erlaubt(endpoint) is True

    def test_ungueltige_schluessel_werden_abgelehnt(self, client):
        daten = _geraet()
        daten["keys"]["auth"] = "x"
        assert (
            client.post(reverse("notifications:push-abo"), daten, format="json").status_code == 400
        )
        assert (
            client.post(
                reverse("notifications:push-abo"), {"endpoint": ENDPOINT}, format="json"
            ).status_code
            == 400
        )

    def test_hoechstens_zehn_geraete_je_konto(self, client, user):
        for i in range(12):
            push.abo_speichern(
                user,
                endpoint=f"https://fcm.googleapis.com/fcm/send/{i}",
                p256dh="p" * 30,
                auth="a" * 16,
            )
        assert PushAbo.objects.filter(user=user).count() == push.MAX_GERAETE

    def test_abmelden_loescht_nur_das_eigene_geraet(self, client, user):
        anderer = UserFactory()
        PushAbo.objects.create(user=user, endpoint=ENDPOINT, p256dh="p" * 30, auth="a" * 16)
        fremd = "https://fcm.googleapis.com/fcm/send/fremd"
        PushAbo.objects.create(user=anderer, endpoint=fremd, p256dh="p" * 30, auth="a" * 16)
        assert (
            client.delete(
                reverse("notifications:push-abo"), {"endpoint": fremd}, format="json"
            ).status_code
            == 204
        )
        assert PushAbo.objects.filter(endpoint=fremd).exists()
        client.delete(reverse("notifications:push-abo"), {"endpoint": ENDPOINT}, format="json")
        assert not PushAbo.objects.filter(user=user).exists()

    def test_arten_aendern_und_pruefen(self, client, user):
        assert (
            client.patch(reverse(URL), {"kategorien": ["gibtsnicht"]}, format="json").status_code
            == 400
        )
        antwort = client.patch(
            reverse(URL), {"kategorien": ["reisen", "nachrichten"]}, format="json"
        )
        assert antwort.status_code == 200
        assert antwort.json()["kategorien"] == ["reisen", "nachrichten"]
        assert PushEinstellung.objects.get(user=user).kategorien == ["reisen", "nachrichten"]

    def test_anonym_ist_nicht_erlaubt(self):
        assert APIClient().get(reverse(URL)).status_code in (401, 403)


class TestVersand:
    def _abo(self, user, endpoint=ENDPOINT):
        return PushAbo.objects.create(user=user, endpoint=endpoint, p256dh="p" * 30, auth="a" * 16)

    def _gewaehlt(self, user, *arten):
        PushEinstellung.objects.update_or_create(user=user, defaults={"kategorien": list(arten)})

    def test_notifier_plant_push_nur_fuer_gewaehlte_art(
        self, user, django_capture_on_commit_callbacks
    ):
        self._abo(user)
        self._gewaehlt(user, "nachrichten")
        with mock.patch.object(tasks.sende_push, "delay") as plan:
            with django_capture_on_commit_callbacks(execute=True):
                notifier(
                    user,
                    TypeNotification.COMMUNAUTE_MENTION,
                    titre="Du wurdest erwähnt",
                    message="geheim",
                )
                notifier(user, TypeNotification.REISE_INFO, titre="Reise-Info", message="x")
        assert plan.call_count == 1

    def test_ohne_geraet_oder_schluessel_wird_nichts_geplant(
        self, user, settings, django_capture_on_commit_callbacks
    ):
        self._gewaehlt(user, *push.ALLE_KATEGORIEN)
        with mock.patch.object(tasks.sende_push, "delay") as plan:
            with django_capture_on_commit_callbacks(execute=True):
                notifier(user, TypeNotification.BIENVENUE, titre="t", message="m")
            self._abo(user)
            settings.VAPID_PUBLIC_KEY = ""
            with django_capture_on_commit_callbacks(execute=True):
                notifier(user, TypeNotification.BIENVENUE, titre="t", message="m")
        plan.assert_not_called()

    def test_ohne_einstellung_kommt_kein_push(self, user, django_capture_on_commit_callbacks):
        self._abo(user)
        with mock.patch.object(tasks.sende_push, "delay") as plan:
            with django_capture_on_commit_callbacks(execute=True):
                notifier(user, TypeNotification.BIENVENUE, titre="t", message="m")
        plan.assert_not_called()

    def test_nutzlast_enthaelt_titel_und_link_aber_nicht_den_inhalt(self, user, gesendet):
        self._abo(user)
        self._gewaehlt(user, *push.ALLE_KATEGORIEN)
        n = Notification.objects.create(
            destinataire=user,
            type_notification=TypeNotification.BIENVENUE,
            titre="Willkommen",
            message="GEHEIMER INHALT",
            lien="/chats/gruppe/1",
        )
        tasks.sende_push(str(n.pk))
        nutzlast = gesendet.call_args[0][1]
        assert nutzlast["titel"] == "Willkommen"
        assert nutzlast["link"] == "/chats/gruppe/1"
        assert "GEHEIMER INHALT" not in json.dumps(nutzlast)
        assert PushAbo.objects.get(user=user).zuletzt_zugestellt is not None

    def test_fremde_links_werden_zu_startseite(self, user):
        n = Notification(
            destinataire=user,
            type_notification="bienvenue",
            titre="t",
            message="m",
            lien="https://evil.example",
        )
        assert push.nutzlast_fuer(n)["link"] == "/"

    def test_abgelaufenes_geraet_wird_geloescht_und_die_anderen_bekommen_trotzdem(self, user):
        kaputt = self._abo(user, "https://fcm.googleapis.com/fcm/send/weg")
        self._abo(user, "https://fcm.googleapis.com/fcm/send/ok")

        def fake(abo, nutzlast):
            if abo.pk == kaputt.pk:
                raise push.PushAboUngueltig()

        with mock.patch.object(push, "sende", side_effect=fake):
            assert push.sende_an_konto(user, {"titel": "t"}) == 1
        assert list(PushAbo.objects.values_list("endpoint", flat=True)) == [
            "https://fcm.googleapis.com/fcm/send/ok"
        ]

    def test_netzfehler_eines_geraets_loescht_es_nicht(self, user):
        self._abo(user)
        with mock.patch.object(push, "sende", side_effect=RuntimeError("Netz")):
            assert push.sende_an_konto(user, {"titel": "t"}) == 0
        assert PushAbo.objects.filter(user=user).exists()

    def test_testmeldung(self, client, user, gesendet):
        assert client.post(reverse("notifications:push-test")).status_code == 409
        self._abo(user)
        assert client.post(reverse("notifications:push-test")).status_code == 204
        assert gesendet.call_count == 1
        gesendet.side_effect = RuntimeError("Netz")
        assert client.post(reverse("notifications:push-test")).status_code == 502

    def test_kategorien_decken_ticket_und_chat_ab(self):
        from apps.notifications.telegram import kategorie_von

        assert kategorie_von(TypeNotification.COMMUNAUTE_MESSAGE_GROUPE) == "nachrichten"
        assert kategorie_von(TypeNotification.TICKET_BEREIT) == "veranstaltungen"


class TestEchteVerschluesselung:
    """Ohne Mock der Bibliothek : prüft, dass Schlüssel, Verschlüsselung und VAPID-Kopfzeile
    zusammenpassen und die Anfrage an die richtige Adresse geht (Netz selbst ist ersetzt)."""

    def test_anfrage_ist_verschluesselt_und_signiert(self, user):
        geraet = _geraet()
        abo = PushAbo.objects.create(
            user=user,
            endpoint=geraet["endpoint"],
            p256dh=geraet["keys"]["p256dh"],
            auth=geraet["keys"]["auth"],
        )
        antwort = mock.Mock(status_code=201)
        with mock.patch("pywebpush.requests.post", return_value=antwort) as post:
            push.sende(abo, {"titel": "Hallo Welt", "link": "/"})
        assert post.call_args[0][0] == ENDPOINT
        kopf = post.call_args[1]["headers"]
        assert kopf["content-encoding"] == "aes128gcm"
        assert kopf["authorization"].startswith("vapid ")
        assert b"Hallo Welt" not in post.call_args[1]["data"]

    def test_schluesselpaar_passt_zusammen(self, settings):
        from py_vapid import Vapid02

        vapid = push._vapid()
        oeffentlich = vapid.public_key.public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
        )
        assert _b64(oeffentlich) == settings.VAPID_PUBLIC_KEY
        assert isinstance(vapid, Vapid02)

    def test_abgelehnte_adresse_wird_als_ungueltig_erkannt(self, user):
        geraet = _geraet()
        abo = PushAbo.objects.create(
            user=user,
            endpoint=geraet["endpoint"],
            p256dh=geraet["keys"]["p256dh"],
            auth=geraet["keys"]["auth"],
        )
        with mock.patch(
            "pywebpush.requests.post", return_value=mock.Mock(status_code=410, text="gone")
        ):
            with pytest.raises(push.PushAboUngueltig):
                push.sende(abo, {"titel": "x", "link": "/"})


class TestGeraet:
    @pytest.mark.parametrize(
        "ua,erwartet",
        [
            (
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Version/17 Mobile Safari/604",
                "iPhone/iPad · Safari",
            ),
            ("Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537 Edg/130", "Windows · Edge"),
            ("Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko Firefox/130.0", "Linux · Firefox"),
            ("", "Gerät · Browser"),
        ],
    )
    def test_bezeichnung(self, ua, erwartet):
        assert push.geraet_von(ua) == erwartet


class TestBefehl:
    def test_schluessel_befehl_gibt_paar_aus(self, capsys):
        from django.core.management import call_command

        call_command("vapid_schluessel")
        ausgabe = capsys.readouterr().out
        assert "VAPID_PUBLIC_KEY=" in ausgabe and "VAPID_PRIVATE_KEY=" in ausgabe
