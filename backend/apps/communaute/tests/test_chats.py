"""Chats-Zusammenführung (Oktober 2026) : gemeinsame Liste, Einstellungen, Reaktionen,
Anheften, Umfragen, Treffpunkt, GIF-/Übersetzungsdienst und WebSocket-Erweiterungen."""

import asyncio
from datetime import timedelta

import pytest
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.ws_auth import JWTAuthMiddlewareStack
from apps.communaute import chats
from apps.communaute.models import (
    ChatEinstellung,
    Conversation,
    MembreGroupe,
    MessageGroupe,
    MessagePrive,
    NachrichtArt,
    UmfrageStimme,
)
from apps.communaute.routing import websocket_urlpatterns
from apps.communaute.tests.factories import GroupeChatFactory, user_membre_avec_fiche
from apps.reisen.models import Reise

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    return APIClient()


def _auth(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


def _gruppe_mit(*membres, **kwargs):
    gruppe = GroupeChatFactory(type_groupe="prive", createur=membres[0], **kwargs)
    for m in membres:
        MembreGroupe.objects.create(groupe=gruppe, membre=m)
    return gruppe


# --- Datenprüfung ---------------------------------------------------------------------------


def test_bereinige_daten_gif_nur_giphy_https():
    ok = chats.bereinige_daten(
        "gif", {"url": "https://media2.giphy.com/media/x/giphy.gif", "titel": "Tor"}
    )
    assert ok["url"].startswith("https://media2.giphy.com")
    for schlecht in (
        "http://media.giphy.com/x.gif",
        "https://evil.example/x.gif",
        "https://media.giphy.com.evil.example/x.gif",
    ):
        with pytest.raises(Exception):
            chats.bereinige_daten("gif", {"url": schlecht})


def test_bereinige_daten_umfrage_und_treffpunkt():
    umfrage = chats.bereinige_daten(
        "umfrage", {"frage": " Wann? ", "optionen": ["4 Uhr", " ", "5 Uhr"]}
    )
    assert umfrage == {"frage": "Wann?", "optionen": ["4 Uhr", "5 Uhr"], "frist": ""}
    with pytest.raises(Exception):
        chats.bereinige_daten("umfrage", {"frage": "Wann?", "optionen": ["nur eine"]})
    treff = chats.bereinige_daten(
        "treffpunkt", {"ort": "Hbf Gleis 8", "link": "https://maps.example/x"}
    )
    assert treff["ort"] == "Hbf Gleis 8"
    with pytest.raises(Exception):
        chats.bereinige_daten("treffpunkt", {"ort": "Hbf", "link": "javascript:alert(1)"})
    with pytest.raises(Exception):
        chats.bereinige_daten("treffpunkt", {"ort": ""})


# --- Chat-Liste ----------------------------------------------------------------------------


def test_chat_liste_enthaelt_direkt_gruppe_und_reise(api_client):
    user, ich = user_membre_avec_fiche(email="cl1@example.de")
    _, anna = user_membre_avec_fiche(email="cl2@example.de", prenom="Anna")
    konv = Conversation.get_or_create_entre(ich, anna)
    MessagePrive.objects.create(conversation=konv, expediteur=anna, contenu="Hallo")
    gruppe = _gruppe_mit(ich, anna, nom="Stammtisch")
    MessageGroupe.objects.create(groupe=gruppe, auteur=anna, contenu="Freitag 19 Uhr")
    reisegruppe = _gruppe_mit(ich, nom="Reise: Kairo")
    Reise.objects.create(titel="Kairo", chat_gruppe=reisegruppe)

    resp = _auth(api_client, user).get(reverse("communaute:chat-liste"))
    assert resp.status_code == 200
    nach_art = {i["art"]: i for i in resp.data}
    assert set(nach_art) == {"direkt", "gruppe", "reise"}
    assert nach_art["direkt"]["nicht_gelesen"] == 1
    assert nach_art["direkt"]["letzte"]["text"] == "Hallo"
    assert nach_art["gruppe"]["anzahl_mitglieder"] == 2
    assert nach_art["reise"]["name"] == "Kairo"
    assert nach_art["reise"]["reise"]["titel"] == "Kairo"


def test_chat_liste_meldet_online_und_zeigt_fremde_chats_nicht(api_client):
    user, ich = user_membre_avec_fiche(email="cl3@example.de")
    user_b, anna = user_membre_avec_fiche(email="cl4@example.de")
    _, dritter = user_membre_avec_fiche(email="cl5@example.de")
    Conversation.get_or_create_entre(ich, anna)
    Conversation.get_or_create_entre(anna, dritter)
    _gruppe_mit(anna, dritter)

    url = reverse("communaute:chat-liste")
    assert _auth(api_client, user).get(url).data[0]["online"] is False
    api_client.force_authenticate(user=user_b)
    api_client.get(url)  # Anna öffnet die Liste → online
    assert _auth(api_client, user).get(url).data[0]["online"] is True
    assert len(api_client.get(url).data) == 1  # nur der eigene Direktchat


def test_gruppen_ungelesen_nach_lesemarke(api_client):
    user, ich = user_membre_avec_fiche(email="ul1@example.de")
    _, anna = user_membre_avec_fiche(email="ul2@example.de")
    gruppe = _gruppe_mit(ich, anna)
    MessageGroupe.objects.create(groupe=gruppe, auteur=anna, contenu="a")
    MessageGroupe.objects.create(groupe=gruppe, auteur=anna, contenu="b")
    MembreGroupe.objects.filter(groupe=gruppe, membre=ich).update(
        zuletzt_gelesen=timezone.now() - timedelta(minutes=5)
    )
    url = reverse("communaute:chat-liste")
    assert _auth(api_client, user).get(url).data[0]["nicht_gelesen"] == 2
    resp = api_client.post(reverse("communaute:groupe-chat-gelesen", args=[gruppe.id]))
    assert resp.status_code == 204
    assert api_client.get(url).data[0]["nicht_gelesen"] == 0


# --- Einstellungen ----------------------------------------------------------------------------


def test_einstellung_stumm_und_angeheftet(api_client):
    user, ich = user_membre_avec_fiche(email="ei1@example.de")
    gruppe = _gruppe_mit(ich)
    url = reverse("communaute:chat-einstellung")
    resp = _auth(api_client, user).patch(
        url, {"art": "gruppe", "id": str(gruppe.id), "stumm": True}, format="json"
    )
    assert resp.status_code == 200 and resp.data == {"stumm": True, "angeheftet": False}
    api_client.patch(
        url, {"art": "gruppe", "id": str(gruppe.id), "angeheftet": True}, format="json"
    )
    item = api_client.get(reverse("communaute:chat-liste")).data[0]
    assert item["stumm"] is True and item["angeheftet"] is True


def test_einstellung_fremder_chat_verboten(api_client):
    user, _ = user_membre_avec_fiche(email="ei2@example.de")
    _, anna = user_membre_avec_fiche(email="ei3@example.de")
    gruppe = _gruppe_mit(anna)
    resp = _auth(api_client, user).patch(
        reverse("communaute:chat-einstellung"),
        {"art": "gruppe", "id": str(gruppe.id), "stumm": True},
        format="json",
    )
    assert resp.status_code == 403
    assert not ChatEinstellung.objects.exists()


def test_stummer_chat_bekommt_keine_gruppenbenachrichtigung(monkeypatch):
    from apps.communaute import tasks

    _, ich = user_membre_avec_fiche(email="st1@example.de")
    _, anna = user_membre_avec_fiche(email="st2@example.de")
    gruppe = _gruppe_mit(ich, anna)
    ChatEinstellung.objects.create(membre=ich, groupe=gruppe, stumm=True)
    gesendet = []
    monkeypatch.setattr(tasks, "notifier", lambda user, *a, **k: gesendet.append(user))
    tasks.envoyer_notification_message_groupe(str(gruppe.id), str(anna.id))
    assert gesendet == []


# --- Reaktionen, Anheften ------------------------------------------------------------------------


def test_reagieren_schaltet_um_und_zaehlt(api_client):
    user, ich = user_membre_avec_fiche(email="re1@example.de")
    user_b, anna = user_membre_avec_fiche(email="re2@example.de")
    gruppe = _gruppe_mit(ich, anna)
    msg = MessageGroupe.objects.create(groupe=gruppe, auteur=anna, contenu="Tor!")
    url = reverse("communaute:message-groupe-reagieren", args=[msg.id])

    resp = _auth(api_client, user).post(url, {"emoji": "🔥"}, format="json")
    assert resp.data["reaktionen"] == [{"emoji": "🔥", "anzahl": 1, "ich": True}]
    api_client.force_authenticate(user=user_b)
    resp = api_client.post(url, {"emoji": "🔥"}, format="json")
    assert resp.data["reaktionen"] == [{"emoji": "🔥", "anzahl": 2, "ich": True}]
    resp = api_client.post(url, {"emoji": "🔥"}, format="json")  # zurücknehmen
    assert resp.data["reaktionen"] == [{"emoji": "🔥", "anzahl": 1, "ich": False}]


def test_reagieren_nur_fuer_mitglieder_und_gueltiges_emoji(api_client):
    user, ich = user_membre_avec_fiche(email="re3@example.de")
    _, anna = user_membre_avec_fiche(email="re4@example.de")
    gruppe = _gruppe_mit(anna)
    msg = MessageGroupe.objects.create(groupe=gruppe, auteur=anna, contenu="privat")
    url = reverse("communaute:message-groupe-reagieren", args=[msg.id])
    assert _auth(api_client, user).post(url, {"emoji": "👍"}, format="json").status_code == 403
    api_client.force_authenticate(user=anna.user)
    assert api_client.post(url, {"emoji": ""}, format="json").status_code == 400
    assert api_client.post(url, {"emoji": "x" * 40}, format="json").status_code == 400


def test_reagieren_auf_direktnachricht(api_client):
    user, ich = user_membre_avec_fiche(email="re5@example.de")
    _, anna = user_membre_avec_fiche(email="re6@example.de")
    konv = Conversation.get_or_create_entre(ich, anna)
    msg = MessagePrive.objects.create(conversation=konv, expediteur=anna, contenu="Hi")
    resp = _auth(api_client, user).post(
        reverse("communaute:message-prive-reagieren", args=[msg.id]), {"emoji": "😂"}, format="json"
    )
    assert resp.data["reaktionen"][0]["emoji"] == "😂"
    # Fremde Konversation
    user_c, _ = user_membre_avec_fiche(email="re7@example.de")
    api_client.force_authenticate(user=user_c)
    assert (
        api_client.post(
            reverse("communaute:message-prive-reagieren", args=[msg.id]),
            {"emoji": "😂"},
            format="json",
        ).status_code
        == 403
    )


def test_anheften_im_privaten_chat_durch_mitglied_im_oeffentlichen_nur_ersteller(api_client):
    user, ich = user_membre_avec_fiche(email="an1@example.de")
    _, anna = user_membre_avec_fiche(email="an2@example.de")
    privat = _gruppe_mit(ich, anna)
    msg = MessageGroupe.objects.create(groupe=privat, auteur=anna, contenu="Treffpunkt Lobby")
    url = reverse("communaute:message-groupe-anheften", args=[msg.id])
    resp = _auth(api_client, user).post(url)
    assert resp.status_code == 200 and resp.data["angeheftet"] is True
    assert api_client.post(url).data["angeheftet"] is False

    oeffentlich = GroupeChatFactory(createur=anna)
    MembreGroupe.objects.create(groupe=oeffentlich, membre=ich)
    msg2 = MessageGroupe.objects.create(groupe=oeffentlich, auteur=anna, contenu="x")
    assert (
        api_client.post(reverse("communaute:message-groupe-anheften", args=[msg2.id])).status_code
        == 403
    )


# --- Umfragen -------------------------------------------------------------------------------------


def _umfrage(gruppe, autor, frist=""):
    return MessageGroupe.objects.create(
        groupe=gruppe,
        auteur=autor,
        art=NachrichtArt.UMFRAGE,
        daten={"frage": "Treffen?", "optionen": ["04:00", "05:00"], "frist": frist},
    )


def test_abstimmen_wechseln_und_zuruecknehmen(api_client):
    user, ich = user_membre_avec_fiche(email="um1@example.de")
    _, anna = user_membre_avec_fiche(email="um2@example.de")
    gruppe = _gruppe_mit(ich, anna)
    msg = _umfrage(gruppe, anna)
    url = reverse("communaute:message-groupe-abstimmen", args=[msg.id])

    resp = _auth(api_client, user).post(url, {"option": 1}, format="json")
    assert resp.data["umfrage"] == {"zaehler": [0, 1], "gesamt": 1, "meine": 1, "beendet": False}
    resp = api_client.post(url, {"option": 0}, format="json")  # Stimme wechseln
    assert resp.data["umfrage"]["zaehler"] == [1, 0] and resp.data["umfrage"]["meine"] == 0
    resp = api_client.post(url, {"option": 0}, format="json")  # nochmal = zurücknehmen
    assert resp.data["umfrage"]["gesamt"] == 0 and resp.data["umfrage"]["meine"] is None
    assert UmfrageStimme.objects.count() == 0


def test_abstimmen_ungueltig_beendet_und_fremd(api_client):
    user, ich = user_membre_avec_fiche(email="um3@example.de")
    _, anna = user_membre_avec_fiche(email="um4@example.de")
    gruppe = _gruppe_mit(ich, anna)
    url = lambda m: reverse("communaute:message-groupe-abstimmen", args=[m.id])  # noqa: E731

    msg = _umfrage(gruppe, anna)
    c = _auth(api_client, user)
    assert c.post(url(msg), {"option": 7}, format="json").status_code == 400
    assert c.post(url(msg), {"option": "1"}, format="json").status_code == 400
    assert c.post(url(msg), {"option": True}, format="json").status_code == 400

    beendet = _umfrage(gruppe, anna, frist=(timezone.now() - timedelta(hours=1)).isoformat())
    assert c.post(url(beendet), {"option": 0}, format="json").status_code == 400

    kein_poll = MessageGroupe.objects.create(groupe=gruppe, auteur=anna, contenu="hi")
    assert c.post(url(kein_poll), {"option": 0}, format="json").status_code == 400

    fremd, _ = user_membre_avec_fiche(email="um5@example.de")
    assert _auth(api_client, fremd).post(url(msg), {"option": 0}, format="json").status_code == 403


def test_nachrichtenliste_enthaelt_art_umfrage_und_reaktionen(api_client):
    user, ich = user_membre_avec_fiche(email="li1@example.de")
    gruppe = _gruppe_mit(ich)
    _umfrage(gruppe, ich)
    MessageGroupe.objects.create(
        groupe=gruppe,
        auteur=ich,
        art=NachrichtArt.TREFFPUNKT,
        daten={"ort": "Hbf", "zeit": "20:15", "link": ""},
    )
    resp = _auth(api_client, user).get(
        reverse("communaute:message-groupe-list"), {"groupe": str(gruppe.id)}
    )
    arten = [m["art"] for m in resp.data["results"]]
    assert arten == ["umfrage", "treffpunkt"]
    assert resp.data["results"][0]["umfrage"]["zaehler"] == [0, 0]
    assert resp.data["results"][1]["daten"]["ort"] == "Hbf"


# --- GIF und Übersetzung ---------------------------------------------------


def test_gif_dienst_ohne_schluessel_ist_aus(api_client, settings):
    settings.GIPHY_API_KEY = ""
    user, _ = user_membre_avec_fiche(email="gi1@example.de")
    c = _auth(api_client, user)
    assert c.get(reverse("communaute:gif-status")).data["gif"] is False
    assert c.get(reverse("communaute:gif-suche")).status_code == 503


def test_gif_suche_leitet_weiter_und_filtert(api_client, settings, monkeypatch):
    settings.GIPHY_API_KEY = "test"
    aufrufe = []

    class Antwort:
        def raise_for_status(self):
            pass

        def json(self):
            return {
                "data": [
                    {
                        "id": "a",
                        "title": "Tor",
                        "images": {
                            "downsized_medium": {"url": "https://media1.giphy.com/a.gif?cid=1"},
                            "fixed_height_small": {"url": "https://media1.giphy.com/a_s.gif?cid=1"},
                        },
                    },
                    {"id": "b", "images": {}},
                ]
            }

    monkeypatch.setattr(
        chats.requests,
        "get",
        lambda url, params, timeout: aufrufe.append((url, params)) or Antwort(),
    )
    user, _ = user_membre_avec_fiche(email="gi2@example.de")
    resp = _auth(api_client, user).get(reverse("communaute:gif-suche"), {"q": "tor"})
    assert resp.status_code == 200
    assert resp.data["ergebnisse"] == [
        {
            "id": "a",
            "url": "https://media1.giphy.com/a.gif",
            "vorschau": "https://media1.giphy.com/a_s.gif",
            "titel": "Tor",
        }
    ]
    assert aufrufe[0][0].endswith("/search") and aufrufe[0][1]["q"] == "tor"
    assert aufrufe[0][1]["rating"] == "g"
    api_client.get(reverse("communaute:gif-suche"))
    assert aufrufe[1][0].endswith("/trending")


def test_uebersetzen_ohne_schluessel_und_mit(api_client, settings, monkeypatch):
    settings.DEEPL_API_KEY = ""
    user, _ = user_membre_avec_fiche(email="tr1@example.de")
    c = _auth(api_client, user)
    url = reverse("communaute:chat-uebersetzen")
    assert c.post(url, {"text": "Hallo", "ziel": "fr"}, format="json").status_code == 503
    settings.DEEPL_API_KEY = "x:fx"
    monkeypatch.setattr(chats.deepl, "uebersetzen", lambda text, ziel, **k: ("Bonjour", "de"))
    resp = c.post(url, {"text": "Hallo", "ziel": "fr"}, format="json")
    assert resp.data == {"text": "Bonjour", "quelle": "de"}
    assert c.post(url, {"text": "Hallo", "ziel": "ar"}, format="json").status_code == 400


# --- Reisechat ------------------------------------------------------------------------------------


def test_reisechat_schreibt_systemzeilen_bei_zu_und_absage():
    from apps.reisen import services as reisen_services
    from apps.reisen.models import ReiseTeilnehmer, TStatus

    user, ich = user_membre_avec_fiche(email="rc1@example.de")
    _, orga = user_membre_avec_fiche(email="rc2@example.de")
    gruppe = _gruppe_mit(orga, nom="Reise: Kairo")
    reise = Reise.objects.create(titel="Kairo", chat_gruppe=gruppe)
    tn = ReiseTeilnehmer.objects.create(reise=reise, user=user, status=TStatus.DABEI)
    reisen_services.chat_abgleich(tn)
    tn.status = TStatus.ABGESAGT
    tn.save()
    reisen_services.chat_abgleich(tn)
    texte = list(
        MessageGroupe.objects.filter(groupe=gruppe, art=NachrichtArt.SYSTEM)
        .order_by("created_at")
        .values_list("contenu", flat=True)
    )
    assert texte == [f"{ich.prenom} ist dabei", f"{ich.prenom} ist nicht mehr dabei"]


# --- WebSocket -----------------------------------------------------------------

ws_transaktion = pytest.mark.django_db(transaction=True, serialized_rollback=True)


def _application():
    return JWTAuthMiddlewareStack(URLRouter(websocket_urlpatterns))


async def _connect(path, user):
    token = str(AccessToken.for_user(user))
    communicator = WebsocketCommunicator(_application(), f"{path}?token={token}")
    connected, _ = await communicator.connect()
    return communicator, connected


@ws_transaktion
def test_ws_gruppe_umfrage_treffpunkt_und_gif_werden_geprueft_und_gespeichert(monkeypatch):
    monkeypatch.setattr(
        "apps.communaute.tasks.envoyer_notification_message_groupe.delay", lambda *a, **k: None
    )
    _, m1 = user_membre_avec_fiche(email="ws1@example.de")
    gruppe = _gruppe_mit(m1)

    async def run():
        c, ok = await _connect(f"/ws/groupes/{gruppe.id}/", m1.user)
        assert ok
        await c.send_json_to(
            {
                "type": "message",
                "art": "umfrage",
                "daten": {"frage": "Wann?", "optionen": ["4", "5"]},
            }
        )
        a = await c.receive_json_from()
        assert a["art"] == "umfrage" and a["umfrage"]["zaehler"] == [0, 0]
        await c.send_json_to(
            {"type": "message", "art": "treffpunkt", "daten": {"ort": "Hbf", "zeit": "20:15"}}
        )
        b = await c.receive_json_from()
        assert b["art"] == "treffpunkt" and b["daten"]["ort"] == "Hbf"
        await c.send_json_to(
            {"type": "message", "art": "gif", "daten": {"url": "https://media.giphy.com/x.gif"}}
        )
        g = await c.receive_json_from()
        assert g["art"] == "gif" and g["contenu"] == ""
        # ungültig: fremder Host, leere Umfrage, Text ohne Inhalt → nichts wird gesendet
        await c.send_json_to(
            {"type": "message", "art": "gif", "daten": {"url": "https://evil.example/x.gif"}}
        )
        await c.send_json_to(
            {"type": "message", "art": "umfrage", "daten": {"frage": "?", "optionen": ["1"]}}
        )
        await c.send_json_to({"type": "message", "contenu": "  "})
        assert await c.receive_nothing(timeout=0.3)
        await c.disconnect()

    asyncio.run(run())
    assert list(
        MessageGroupe.objects.filter(groupe=gruppe)
        .order_by("created_at")
        .values_list("art", flat=True)
    ) == ["umfrage", "treffpunkt", "gif"]


@ws_transaktion
def test_ws_direktchat_erlaubt_gif_aber_keine_umfrage(monkeypatch):
    monkeypatch.setattr(
        "apps.communaute.tasks.envoyer_notification_message_prive.delay", lambda *a, **k: None
    )
    _, m1 = user_membre_avec_fiche(email="ws2@example.de")
    _, m2 = user_membre_avec_fiche(email="ws3@example.de")
    konv = Conversation.get_or_create_entre(m1, m2)

    async def run():
        c, ok = await _connect(f"/ws/messagerie/{konv.id}/", m1.user)
        assert ok
        await c.send_json_to(
            {"type": "message", "art": "umfrage", "daten": {"frage": "?", "optionen": ["1", "2"]}}
        )
        assert await c.receive_nothing(timeout=0.3)
        await c.send_json_to(
            {"type": "message", "art": "gif", "daten": {"url": "https://i.giphy.com/x.gif"}}
        )
        recu = await c.receive_json_from()
        assert recu["art"] == "gif"
        await c.disconnect()

    asyncio.run(run())
    assert MessagePrive.objects.get(conversation=konv).art == "gif"


@ws_transaktion
def test_ws_tippt_geht_an_die_anderen_nicht_an_den_absender(monkeypatch):
    _, m1 = user_membre_avec_fiche(email="ws4@example.de")
    _, m2 = user_membre_avec_fiche(email="ws5@example.de")
    gruppe = _gruppe_mit(m1, m2)

    async def run():
        c1, ok1 = await _connect(f"/ws/groupes/{gruppe.id}/", m1.user)
        c2, ok2 = await _connect(f"/ws/groupes/{gruppe.id}/", m2.user)
        assert ok1 and ok2
        await c1.send_json_to({"type": "tippt"})
        assert (await c2.receive_json_from()) == {"type": "tippt", "membre_id": str(m1.id)}
        assert await c1.receive_nothing(timeout=0.3)
        await c1.disconnect()
        await c2.disconnect()

    asyncio.run(run())


@ws_transaktion
def test_rest_reaktion_wird_im_websocket_verbreitet(api_client):
    user, m1 = user_membre_avec_fiche(email="ws6@example.de")
    gruppe = _gruppe_mit(m1)
    msg = MessageGroupe.objects.create(groupe=gruppe, auteur=m1, contenu="Tor")

    async def run():
        c, ok = await _connect(f"/ws/groupes/{gruppe.id}/", user)
        assert ok
        await asyncio.to_thread(chats.reagieren, msg, m1, "🔥")
        recu = await c.receive_json_from()
        assert recu["type"] == "message_reaktion" and recu["emoji"] == "🔥" and recu["anzahl"] == 1
        await asyncio.to_thread(chats.anheften_umschalten, msg)
        assert (await c.receive_json_from())["type"] == "message_angeheftet"
        await c.disconnect()

    asyncio.run(run())


# --- Mitglieder und Mitreisende ---------------------------------------------------------------


def test_mitgliederliste_nur_fuer_mitglieder(api_client):
    user, ich = user_membre_avec_fiche(email="mi1@example.de")
    _, anna = user_membre_avec_fiche(email="mi2@example.de", prenom="Anna")
    fremd, _ = user_membre_avec_fiche(email="mi3@example.de")
    gruppe = _gruppe_mit(anna, ich)
    url = reverse("communaute:groupe-chat-mitglieder", args=[gruppe.id])
    resp = _auth(api_client, user).get(url)
    assert resp.status_code == 200
    assert [m["prenom"] for m in resp.data][0] == "Anna"
    assert resp.data[0]["ist_ersteller"] is True and resp.data[1]["ist_ersteller"] is False
    assert _auth(api_client, fremd).get(url).status_code == 404  # private Gruppe : unsichtbar
    oeffentlich = GroupeChatFactory(createur=anna)
    MembreGroupe.objects.create(groupe=oeffentlich, membre=anna)
    url_pub = reverse("communaute:groupe-chat-mitglieder", args=[oeffentlich.id])
    assert api_client.get(url_pub).status_code == 403  # sichtbar, aber Liste nur für Mitglieder


def test_mitreisende_nur_aus_meinen_reisen_mit_status_dabei(api_client):
    from apps.reisen.models import ReiseTeilnehmer, TStatus

    user, ich = user_membre_avec_fiche(email="mr1@example.de")
    user_a, anna = user_membre_avec_fiche(email="mr2@example.de", prenom="Anna")
    user_b, _ = user_membre_avec_fiche(email="mr3@example.de")
    meine = Reise.objects.create(titel="Kairo")
    fremde = Reise.objects.create(titel="Algier")
    ReiseTeilnehmer.objects.create(reise=meine, user=user, status=TStatus.DABEI)
    ReiseTeilnehmer.objects.create(reise=meine, user=user_a, status=TStatus.DABEI)
    ReiseTeilnehmer.objects.create(reise=meine, user=user_b, status=TStatus.INTERESSIERT)
    ReiseTeilnehmer.objects.create(reise=fremde, user=user_a, status=TStatus.DABEI)

    resp = _auth(api_client, user).get(reverse("communaute:chat-mitreisende"))
    assert resp.status_code == 200
    assert [r["titel"] for r in resp.data] == ["Kairo"]
    assert [m["prenom"] for m in resp.data[0]["mitglieder"]] == ["Anna"]
