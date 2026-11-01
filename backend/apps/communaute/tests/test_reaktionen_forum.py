"""Tests – Emoji-Reaktionen (Neuigkeiten, Kommentare, Forum), Forum-Sortierung/Suche,
„Beste Antwort“, Zitat-Antwort und die Datenübernahme der alten Herzen (Migration 0025)."""

from datetime import timedelta

import pytest
from django.db import IntegrityError, transaction
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.communaute.models import Publication, PublicationLike, Reaktion
from apps.communaute.tests.factories import (
    CommentaireFactory,
    PublicationFactory,
    ReponseForumFactory,
    SujetFactory,
)
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    return APIClient()


def _user(role=Role.MEMBRE, email="r1@example.de"):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    return user, MembreFactory(user=user)


def _auth(client, user):
    client.force_authenticate(user=user)
    return client


def _reagieren(client, basis, objekt, emoji="🔥"):
    return client.post(reverse(f"communaute:{basis}-reagieren", args=[objekt.id]), {"emoji": emoji})


# --- Reaktionen: Umschalten, Zähler, "ich" ---


@pytest.mark.parametrize(
    "basis,fabrik",
    [
        ("publication", PublicationFactory),
        ("commentaire", CommentaireFactory),
        ("sujet", SujetFactory),
        ("reponse-forum", ReponseForumFactory),
    ],
)
def test_reagieren_schaltet_um_und_zaehlt(api_client, basis, fabrik):
    user, _ = _user()
    ziel = fabrik()
    resp = _reagieren(_auth(api_client, user), basis, ziel)
    assert resp.status_code == 200
    assert resp.data["reaktionen"] == [{"emoji": "🔥", "anzahl": 1, "ich": True}]

    # zweite Person, anderes Emoji
    user2, _ = _user(email="r2@example.de")
    resp = _reagieren(_auth(api_client, user2), basis, ziel, "👍")
    assert [r["emoji"] for r in resp.data["reaktionen"]] == ["🔥", "👍"]
    assert resp.data["reaktionen"][0]["ich"] is False
    assert resp.data["reaktionen"][1]["ich"] is True

    # dasselbe Emoji nochmal = entfernen
    resp = _reagieren(api_client, basis, ziel, "👍")
    assert [r["emoji"] for r in resp.data["reaktionen"]] == ["🔥"]


def test_reagieren_lehnt_leeres_und_zu_langes_emoji_ab(api_client):
    user, _ = _user()
    publication = PublicationFactory()
    client = _auth(api_client, user)
    assert _reagieren(client, "publication", publication, "").status_code == 400
    assert _reagieren(client, "publication", publication, "x" * 17).status_code == 400
    assert Reaktion.objects.count() == 0


def test_reagieren_erfordert_anmeldung(api_client):
    publication = PublicationFactory()
    assert _reagieren(api_client, "publication", publication).status_code in (401, 403)


def test_reagieren_auf_ausgeblendete_neuigkeit_ist_nicht_moeglich(api_client):
    user, _ = _user()
    publication = PublicationFactory(est_masquee=True)
    assert _reagieren(_auth(api_client, user), "publication", publication).status_code == 404


def test_reagieren_auf_ausgeblendeten_kommentar_und_ausgeblendete_antwort(api_client):
    user, _ = _user()
    kommentar = CommentaireFactory(est_masque=True)
    antwort = ReponseForumFactory(est_masquee=True)
    client = _auth(api_client, user)
    assert _reagieren(client, "commentaire", kommentar).status_code == 404
    assert _reagieren(client, "reponse-forum", antwort).status_code == 404

    admin, _ = _user(Role.BUREAU_ADMIN, "admin-r@example.de")
    assert _reagieren(_auth(api_client, admin), "commentaire", kommentar).status_code == 200


def test_reaktion_hat_genau_ein_ziel_und_ist_pro_mitglied_eindeutig():
    membre = MembreFactory()
    publication = PublicationFactory()
    sujet = SujetFactory()
    with pytest.raises(IntegrityError), transaction.atomic():
        Reaktion.objects.create(membre=membre, emoji="🔥")  # kein Ziel
    with pytest.raises(IntegrityError), transaction.atomic():
        Reaktion.objects.create(
            membre=membre, emoji="🔥", publication=publication, sujet=sujet
        )  # zwei Ziele
    Reaktion.objects.create(membre=membre, emoji="🔥", publication=publication)
    with pytest.raises(IntegrityError), transaction.atomic():
        Reaktion.objects.create(membre=membre, emoji="🔥", publication=publication)
    Reaktion.objects.create(membre=membre, emoji="👍", publication=publication)  # anderes Emoji


def test_listen_und_detail_liefern_reaktionen(api_client):
    user, membre = _user()
    publication = PublicationFactory()
    kommentar = CommentaireFactory(publication=publication)
    Reaktion.objects.create(membre=membre, emoji="❤️", publication=publication)
    Reaktion.objects.create(membre=membre, emoji="👍", commentaire=kommentar)
    resp = _auth(api_client, user).get(reverse("communaute:publication-list"))
    eintrag = resp.data["results"][0]
    assert eintrag["reaktionen"] == [{"emoji": "❤️", "anzahl": 1, "ich": True}]
    assert eintrag["commentaires"][0]["reaktionen"] == [{"emoji": "👍", "anzahl": 1, "ich": True}]


# --- Datenübernahme der alten Herzen (Migration 0025) ---


def test_migration_uebernimmt_herzen_und_letzte_aktivitaet(transactional_db):
    from importlib import import_module

    from django.apps import apps as django_apps

    migration = import_module("apps.communaute.migrations.0025_reaktionen_forum_felder")
    membre = MembreFactory()
    publication = PublicationFactory()
    PublicationLike.objects.create(publication=publication, membre=membre)
    sujet = SujetFactory()
    antwort = ReponseForumFactory(sujet=sujet)
    Sujet = django_apps.get_model("communaute", "Sujet")
    Sujet.objects.filter(pk=sujet.pk).update(letzte_aktivitaet=timezone.now() - timedelta(days=30))

    migration.daten_uebernehmen(django_apps, None)
    migration.daten_uebernehmen(django_apps, None)  # erneut ausführbar, ohne Doppelte

    herz = Reaktion.objects.filter(publication=publication)
    assert herz.count() == 1 and herz.get().emoji == "❤️"
    sujet.refresh_from_db()
    assert sujet.letzte_aktivitaet == antwort.created_at
    assert Publication.objects.filter(pk=publication.pk).exists()


# --- Forum: letzte Aktivität, Zitat, Sortierung, Suche, Unbeantwortet ---


def test_antwort_schreibt_letzte_aktivitaet_fort(api_client):
    user, _ = _user()
    sujet = SujetFactory()
    Sujet = type(sujet)
    Sujet.objects.filter(pk=sujet.pk).update(letzte_aktivitaet=timezone.now() - timedelta(days=5))
    vorher = Sujet.objects.get(pk=sujet.pk).letzte_aktivitaet
    resp = _auth(api_client, user).post(
        reverse("communaute:reponse-forum-list"), {"sujet": str(sujet.id), "contenu": "Hallo"}
    )
    assert resp.status_code == 201
    assert Sujet.objects.get(pk=sujet.pk).letzte_aktivitaet > vorher


def test_zitat_antwort_gleiches_thema_und_auszug(api_client):
    user, _ = _user()
    sujet = SujetFactory()
    erste = ReponseForumFactory(sujet=sujet, contenu="Ein sehr langer Text " * 20)
    resp = _auth(api_client, user).post(
        reverse("communaute:reponse-forum-list"),
        {"sujet": str(sujet.id), "contenu": "Stimmt", "repond_a": str(erste.id)},
    )
    assert resp.status_code == 201
    assert str(resp.data["repond_a"]) == str(erste.id)
    assert resp.data["zitat"]["auteur"]["prenom"] == erste.auteur.prenom
    assert resp.data["zitat"]["auszug"].endswith("…") and len(resp.data["zitat"]["auszug"]) <= 141


def test_zitat_antwort_aus_anderem_thema_wird_abgelehnt(api_client):
    user, _ = _user()
    sujet = SujetFactory()
    fremd = ReponseForumFactory()  # anderes Thema
    resp = _auth(api_client, user).post(
        reverse("communaute:reponse-forum-list"),
        {"sujet": str(sujet.id), "contenu": "Stimmt", "repond_a": str(fremd.id)},
    )
    assert resp.status_code == 400
    assert "repond_a" in resp.data["details"]


def test_beste_antwort_nur_ersteller_oder_moderation(api_client):
    ersteller, membre = _user(email="ers@example.de")
    sujet = SujetFactory(auteur=membre)
    antwort = ReponseForumFactory(sujet=sujet)
    url = reverse("communaute:sujet-beste-antwort", args=[sujet.id])

    fremder, _ = _user(email="fremd@example.de")
    assert _auth(api_client, fremder).post(url, {"reponse": str(antwort.id)}).status_code == 403

    resp = _auth(api_client, ersteller).post(url, {"reponse": str(antwort.id)})
    assert resp.status_code == 200
    assert str(resp.data["beste_antwort"]) == str(antwort.id)
    detail = api_client.get(reverse("communaute:sujet-detail", args=[sujet.id]))
    assert detail.data["reponses"][0]["ist_beste"] is True

    # Markierung lösen
    resp = api_client.post(url, {"reponse": None}, format="json")
    assert resp.status_code == 200 and resp.data["beste_antwort"] is None

    admin, _ = _user(Role.BUREAU_ADMIN, "admin-b@example.de")
    assert _auth(api_client, admin).post(url, {"reponse": str(antwort.id)}).status_code == 200


def test_beste_antwort_muss_zum_thema_gehoeren(api_client):
    ersteller, membre = _user(email="ers2@example.de")
    sujet = SujetFactory(auteur=membre)
    fremd = ReponseForumFactory()
    url = reverse("communaute:sujet-beste-antwort", args=[sujet.id])
    client = _auth(api_client, ersteller)
    assert client.post(url, {"reponse": str(fremd.id)}).status_code == 400
    assert client.post(url, {"reponse": "kein-uuid"}).status_code == 400


def test_liste_sortierung_aktiv_beliebt_und_neu(api_client):
    user, _ = _user()
    jetzt = timezone.now()
    alt_aktiv = SujetFactory(titre="Alt aber aktiv")
    neu_still = SujetFactory(titre="Neu und still")
    beliebt = SujetFactory(titre="Beliebt")
    Sujet = type(alt_aktiv)
    Sujet.objects.filter(pk=alt_aktiv.pk).update(
        created_at=jetzt - timedelta(days=10), letzte_aktivitaet=jetzt
    )
    Sujet.objects.filter(pk=neu_still.pk).update(
        created_at=jetzt - timedelta(days=1), letzte_aktivitaet=jetzt - timedelta(days=1)
    )
    Sujet.objects.filter(pk=beliebt.pk).update(
        created_at=jetzt - timedelta(days=5), letzte_aktivitaet=jetzt - timedelta(days=2)
    )
    ReponseForumFactory.create_batch(3, sujet=beliebt)

    client = _auth(api_client, user)
    url = reverse("communaute:sujet-list")

    def titel(**params):
        return [s["titre"] for s in client.get(url, params).data["results"]]

    assert titel() == ["Neu und still", "Beliebt", "Alt aber aktiv"]
    assert titel(sortierung="aktiv")[0] == "Alt aber aktiv"
    assert titel(sortierung="beliebt")[0] == "Beliebt"
    assert titel(sortierung="unsinn") == titel()  # unbekannter Wert = Standard


def test_angeheftete_themen_bleiben_in_jeder_sortierung_oben(api_client):
    user, _ = _user()
    SujetFactory(titre="Normal")
    SujetFactory(titre="Angeheftet", est_epingle=True)
    client = _auth(api_client, user)
    for sortierung in ("neu", "aktiv", "beliebt"):
        resp = client.get(reverse("communaute:sujet-list"), {"sortierung": sortierung})
        assert resp.data["results"][0]["titre"] == "Angeheftet"


def test_suche_und_unbeantwortet(api_client):
    user, _ = _user()
    mit = SujetFactory(titre="Wohnung in München", contenu="Tipps gesucht")
    ohne = SujetFactory(titre="Zug nach Köln", contenu="Wer fährt mit?")
    ReponseForumFactory(sujet=mit)
    client = _auth(api_client, user)
    url = reverse("communaute:sujet-list")

    assert [s["titre"] for s in client.get(url, {"suche": "münchen"}).data["results"]] == [
        mit.titre
    ]
    assert [s["titre"] for s in client.get(url, {"suche": "fährt"}).data["results"]] == [ohne.titre]
    assert [s["titre"] for s in client.get(url, {"unbeantwortet": "true"}).data["results"]] == [
        ohne.titre
    ]
    assert len(client.get(url, {"suche": "  "}).data["results"]) == 2


def test_liste_zeigt_antwortzahl_letzte_antwort_und_reaktionen(api_client):
    user, membre = _user()
    sujet = SujetFactory()
    ReponseForumFactory(sujet=sujet, auteur=MembreFactory(prenom="Sami"))
    ReponseForumFactory(sujet=sujet, est_masquee=True)
    Reaktion.objects.create(membre=membre, emoji="👍", sujet=sujet)
    eintrag = _auth(api_client, user).get(reverse("communaute:sujet-list")).data["results"][0]
    assert eintrag["nombre_reponses"] == 1
    assert eintrag["letzte_antwort_von"] == "Sami"
    assert eintrag["nombre_reaktionen"] == 1
    assert eintrag["beste_antwort"] is None


# --- Neuigkeiten-Filter ---


def test_neuigkeiten_filter_wichtig_und_mit_bild(api_client):
    user, _ = _user()
    PublicationFactory(contenu="normal")
    PublicationFactory(contenu="wichtig", important=True)
    PublicationFactory(contenu="mit bild", image="fil/x/bild.jpg")
    client = _auth(api_client, user)
    url = reverse("communaute:publication-list")

    def texte(**params):
        return sorted(p["contenu"] for p in client.get(url, params).data["results"])

    assert texte(wichtig="true") == ["wichtig"]
    assert texte(mit_bild="true") == ["mit bild"]
    assert texte(mit_bild="false") == ["normal", "wichtig"]
    assert len(texte()) == 3
