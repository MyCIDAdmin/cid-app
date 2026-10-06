"""
Tests — Sichtbarkeit (Brouillon/Publié), équipe, tâches/Kanban et rappels (2026-10-06).
Règles : un brouillon n'est visible que de l'équipe et des gestionnaires ; l'espace de travail
(équipe, tâches, commentaires) n'est visible que de l'équipe, des gestionnaires et — en lecture
seule — du service financier ; Observateur = lecture seule ; la Direction gère l'équipe.
"""

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.membres.tests.factories import MembreFactory
from apps.notifications.models import Notification, TypeNotification
from apps.projets.models import (
    Aufgabe,
    ProjetMitglied,
    RolleProjet,
    SichtbarkeitProjet,
    StatutAufgabe,
)
from apps.projets.tasks import erinnere_aufgaben_faellig
from apps.projets.tests.factories import ProjetFactory, ProjetImageFactory

pytestmark = pytest.mark.django_db


def _user(role, email):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    membre = MembreFactory(user=user)
    return user, membre


def _client(user=None):
    client = APIClient()
    if user is not None:
        client.force_authenticate(user=user)
    return client


@pytest.fixture
def szenario():
    """Projet publié avec Direction (responsable), Collaboration, Observateur ; un tiers hors
    équipe ; un Bureau Admin."""
    leitung_u, leitung_m = _user(Role.MEMBRE, "leitung@example.de")
    mitarbeit_u, mitarbeit_m = _user(Role.MEMBRE, "mitarbeit@example.de")
    beobachter_u, beobachter_m = _user(Role.MEMBRE, "beobachter@example.de")
    fremd_u, fremd_m = _user(Role.MEMBRE, "fremd@example.de")
    admin_u, _ = _user(Role.BUREAU_ADMIN, "admin@example.de")
    projet = ProjetFactory(responsable=leitung_m)
    ProjetMitglied.objects.create(projet=projet, membre=mitarbeit_m, rolle=RolleProjet.MITARBEIT)
    ProjetMitglied.objects.create(projet=projet, membre=beobachter_m, rolle=RolleProjet.BEOBACHTER)
    return {
        "projet": projet,
        "leitung": (leitung_u, leitung_m),
        "mitarbeit": (mitarbeit_u, mitarbeit_m),
        "beobachter": (beobachter_u, beobachter_m),
        "fremd": (fremd_u, fremd_m),
        "admin": admin_u,
    }


def _aufgaben_url():
    return reverse("projets:projet-aufgabe-list")


def _aufgabe_url(aufgabe, name="detail"):
    return reverse(f"projets:projet-aufgabe-{name}", args=[aufgabe.id])


def _neue_aufgabe(projet, **kwargs):
    kwargs.setdefault("titel", "Aufgabe")
    return Aufgabe.objects.create(projet=projet, **kwargs)


# --- Sichtbarkeit ---------------------------------------------------------------------------


def test_responsable_wird_automatisch_leitung(szenario):
    projet = szenario["projet"]
    eintrag = ProjetMitglied.objects.get(projet=projet, membre=szenario["leitung"][1])
    assert eintrag.rolle == RolleProjet.LEITUNG


def test_neues_projekt_ist_standardmaessig_entwurf():
    from apps.projets.models import Projet

    assert Projet.objects.create(titre="Neu").sichtbarkeit == SichtbarkeitProjet.ENTWURF


def test_entwurf_nur_fuer_team_und_verwalter_sichtbar(szenario):
    entwurf = ProjetFactory(
        sichtbarkeit=SichtbarkeitProjet.ENTWURF, titre="Intern", responsable=szenario["leitung"][1]
    )
    url = reverse("projets:projet-list")

    def titel(client):
        return [p["titre"] for p in client.get(url).data["results"]]

    assert "Intern" not in titel(_client())  # anonyme
    assert "Intern" not in titel(_client(szenario["fremd"][0]))
    assert "Intern" in titel(_client(szenario["leitung"][0]))
    assert "Intern" in titel(_client(szenario["admin"]))
    detail = reverse("projets:projet-detail", args=[entwurf.id])
    assert _client(szenario["fremd"][0]).get(detail).status_code == 404
    assert _client(szenario["beobachter"][0]).get(detail).status_code == 404  # nicht im Team
    assert _client(szenario["leitung"][0]).get(detail).status_code == 200


def test_bilder_eines_entwurfs_sind_verborgen(szenario):
    entwurf = ProjetFactory(sichtbarkeit=SichtbarkeitProjet.ENTWURF)
    ProjetImageFactory(projet=entwurf)
    url = reverse("projets:projet-image-list")
    assert _client(szenario["fremd"][0]).get(url).data["results"] == []
    assert len(_client(szenario["admin"]).get(url).data["results"]) == 1


def test_leitung_kann_veroeffentlichen_mitarbeit_nicht(szenario):
    projet = ProjetFactory(
        sichtbarkeit=SichtbarkeitProjet.ENTWURF, responsable=szenario["leitung"][1]
    )
    ProjetMitglied.objects.create(
        projet=projet, membre=szenario["mitarbeit"][1], rolle=RolleProjet.MITARBEIT
    )
    url = reverse("projets:projet-sichtbarkeit", args=[projet.id])
    body = {"sichtbarkeit": "veroeffentlicht"}
    assert _client(szenario["mitarbeit"][0]).post(url, body, format="json").status_code == 403
    assert _client(szenario["leitung"][0]).post(url, body, format="json").status_code == 200
    projet.refresh_from_db()
    assert projet.sichtbarkeit == SichtbarkeitProjet.VEROEFFENTLICHT
    assert (
        _client(szenario["leitung"][0]).post(url, {"sichtbarkeit": "x"}, format="json").status_code
        == 400
    )


# --- Team -----------------------------------------------------------------------------------


def test_leitung_fuegt_teammitglied_hinzu_mitarbeit_nicht(szenario):
    neu = MembreFactory()
    url = reverse("projets:projet-team-list")
    body = {"projet": str(szenario["projet"].id), "membre": str(neu.id), "rolle": "mitarbeit"}
    assert _client(szenario["mitarbeit"][0]).post(url, body, format="json").status_code == 403
    assert _client(szenario["fremd"][0]).post(url, body, format="json").status_code == 403
    assert _client(szenario["leitung"][0]).post(url, body, format="json").status_code == 201
    assert (
        _client(szenario["leitung"][0]).post(url, body, format="json").status_code == 400
    )  # doppelt


def test_team_liste_fuer_aussenstehende_leer(szenario):
    url = reverse("projets:projet-team-list")
    assert _client(szenario["fremd"][0]).get(url).data["results"] == []
    assert (
        len(
            _client(szenario["mitarbeit"][0])
            .get(url, {"projet": szenario["projet"].id})
            .data["results"]
        )
        == 3
    )


def test_letzte_leitung_nicht_entfernbar_oder_herabstufbar(szenario):
    eintrag = ProjetMitglied.objects.get(projet=szenario["projet"], rolle=RolleProjet.LEITUNG)
    url = reverse("projets:projet-team-detail", args=[eintrag.id])
    client = _client(szenario["leitung"][0])
    assert client.delete(url).status_code == 400
    assert client.patch(url, {"rolle": "mitarbeit"}, format="json").status_code == 400
    ProjetMitglied.objects.filter(
        projet=szenario["projet"], membre=szenario["mitarbeit"][1]
    ).update(rolle=RolleProjet.LEITUNG)
    assert client.patch(url, {"rolle": "mitarbeit"}, format="json").status_code == 200


# --- Aufgaben -------------------------------------------------------------------------------


def test_aufgaben_anonym_401(szenario):
    assert _client().get(_aufgaben_url()).status_code == 401


def test_aufgaben_nur_fuer_team_sichtbar(szenario):
    _neue_aufgabe(szenario["projet"])
    assert _client(szenario["fremd"][0]).get(_aufgaben_url()).data["results"] == []
    assert len(_client(szenario["beobachter"][0]).get(_aufgaben_url()).data["results"]) == 1
    assert len(_client(szenario["admin"]).get(_aufgaben_url()).data["results"]) == 1


def test_aufgabe_erstellen_je_nach_rolle(szenario):
    body = {"projet": str(szenario["projet"].id), "titel": "Flyer drucken"}
    assert (
        _client(szenario["beobachter"][0]).post(_aufgaben_url(), body, format="json").status_code
        == 403
    )
    assert (
        _client(szenario["fremd"][0]).post(_aufgaben_url(), body, format="json").status_code == 403
    )
    resp = _client(szenario["mitarbeit"][0]).post(_aufgaben_url(), body, format="json")
    assert resp.status_code == 201
    assert resp.data["status"] == "offen"


def test_verantwortlich_muss_im_team_sein(szenario):
    body = {
        "projet": str(szenario["projet"].id),
        "titel": "x",
        "verantwortlich": str(szenario["fremd"][1].id),
    }
    resp = _client(szenario["leitung"][0]).post(_aufgaben_url(), body, format="json")
    assert resp.status_code == 400
    assert "verantwortlich" in resp.data["details"]


def test_erledigt_am_wird_gesetzt_und_geloescht(szenario):
    aufgabe = _neue_aufgabe(szenario["projet"])
    client = _client(szenario["mitarbeit"][0])
    resp = client.patch(_aufgabe_url(aufgabe), {"status": "erledigt"}, format="json")
    assert resp.status_code == 200 and resp.data["erledigt_am"] is not None
    resp = client.patch(_aufgabe_url(aufgabe), {"status": "in_arbeit"}, format="json")
    assert resp.data["erledigt_am"] is None


def test_projekt_einer_aufgabe_ist_unveraenderlich(szenario):
    anderes = ProjetFactory()
    aufgabe = _neue_aufgabe(szenario["projet"])
    resp = _client(szenario["leitung"][0]).patch(
        _aufgabe_url(aufgabe), {"projet": str(anderes.id), "titel": "neu"}, format="json"
    )
    assert resp.status_code == 200
    aufgabe.refresh_from_db()
    assert aufgabe.projet_id == szenario["projet"].id and aufgabe.titel == "neu"


def test_loeschen_nur_leitung(szenario):
    aufgabe = _neue_aufgabe(szenario["projet"])
    assert _client(szenario["mitarbeit"][0]).delete(_aufgabe_url(aufgabe)).status_code == 403
    assert _client(szenario["leitung"][0]).delete(_aufgabe_url(aufgabe)).status_code == 204


def test_verschieben_innerhalb_und_zwischen_spalten(szenario):
    a, b, c = (_neue_aufgabe(szenario["projet"], titel=t, ordre=i) for i, t in enumerate("abc"))
    client = _client(szenario["mitarbeit"][0])
    resp = client.post(
        _aufgabe_url(c, "verschieben"), {"status": "offen", "position": 0}, format="json"
    )
    assert resp.status_code == 200
    reihenfolge = list(
        Aufgabe.objects.filter(projet=szenario["projet"], status="offen").values_list(
            "titel", flat=True
        )
    )
    assert reihenfolge == ["c", "a", "b"]
    resp = client.post(
        _aufgabe_url(a, "verschieben"), {"status": "erledigt", "position": 0}, format="json"
    )
    assert resp.data["status"] == "erledigt" and resp.data["erledigt_am"] is not None
    offen = list(
        Aufgabe.objects.filter(projet=szenario["projet"], status="offen").values_list(
            "titel", "ordre"
        )
    )
    assert offen == [("c", 0), ("b", 1)]


def test_verschieben_beobachter_verboten_und_status_validiert(szenario):
    a = _neue_aufgabe(szenario["projet"])
    url = _aufgabe_url(a, "verschieben")
    assert (
        _client(szenario["beobachter"][0])
        .post(url, {"status": "review"}, format="json")
        .status_code
        == 403
    )
    assert (
        _client(szenario["leitung"][0]).post(url, {"status": "kaputt"}, format="json").status_code
        == 400
    )
    assert (
        _client(szenario["leitung"][0])
        .post(url, {"status": "review", "position": "x"}, format="json")
        .status_code
        == 400
    )


# --- Benachrichtigungen, Kommentare, Fortschritt ---------------------------------------------


def test_zuweisung_erzeugt_benachrichtigung_nicht_bei_selbstzuweisung(szenario):
    client = _client(szenario["leitung"][0])
    body = {
        "projet": str(szenario["projet"].id),
        "titel": "T",
        "verantwortlich": str(szenario["mitarbeit"][1].id),
    }
    assert client.post(_aufgaben_url(), body, format="json").status_code == 201
    assert (
        Notification.objects.filter(
            destinataire=szenario["mitarbeit"][0],
            type_notification=TypeNotification.PROJEKT_AUFGABE_ZUGEWIESEN,
        ).count()
        == 1
    )
    body["verantwortlich"] = str(szenario["leitung"][1].id)
    assert client.post(_aufgaben_url(), body, format="json").status_code == 201
    assert not Notification.objects.filter(destinataire=szenario["leitung"][0]).exists()


def test_kommentare_nur_fuer_bearbeiter_und_benachrichtigen_verantwortlichen(szenario):
    aufgabe = _neue_aufgabe(szenario["projet"], verantwortlich=szenario["mitarbeit"][1])
    url = reverse("projets:projet-aufgabe-kommentar-list")
    body = {"aufgabe": str(aufgabe.id), "text": "Bitte prüfen"}
    assert _client(szenario["beobachter"][0]).post(url, body, format="json").status_code == 403
    assert _client(szenario["fremd"][0]).post(url, body, format="json").status_code == 403
    assert _client(szenario["leitung"][0]).post(url, body, format="json").status_code == 201
    assert Notification.objects.filter(
        destinataire=szenario["mitarbeit"][0],
        type_notification=TypeNotification.PROJEKT_AUFGABE_KOMMENTAR,
    ).exists()
    assert (
        len(_client(szenario["beobachter"][0]).get(url, {"aufgabe": aufgabe.id}).data["results"])
        == 1
    )


def test_arbeitsbereich_kennzahlen_und_zugriff(szenario):
    projet = szenario["projet"]
    _neue_aufgabe(projet, status=StatutAufgabe.ERLEDIGT)
    _neue_aufgabe(projet, frist=timezone.localdate() - timedelta(days=1))
    url = reverse("projets:projet-arbeitsbereich", args=[projet.id])
    resp = _client(szenario["mitarbeit"][0]).get(url)
    assert resp.status_code == 200
    assert (resp.data["gesamt"], resp.data["erledigt"], resp.data["ueberfaellig"]) == (2, 1, 1)
    assert resp.data["prozent"] == 50
    assert _client(szenario["fremd"][0]).get(url).status_code == 403


def test_projektliste_zeigt_rolle_und_zugriff(szenario):
    resp = _client(szenario["mitarbeit"][0]).get(reverse("projets:projet-list"))
    projekt = next(p for p in resp.data["results"] if p["id"] == str(szenario["projet"].id))
    assert projekt["meine_rolle"] == "mitarbeit" and projekt["darf_arbeitsbereich"] is True
    assert projekt["darf_team_verwalten"] is False
    resp = _client(szenario["fremd"][0]).get(reverse("projets:projet-list"))
    projekt = next(p for p in resp.data["results"] if p["id"] == str(szenario["projet"].id))
    assert projekt["meine_rolle"] is None and projekt["darf_arbeitsbereich"] is False


def test_erinnerung_faellige_aufgaben(szenario):
    heute = timezone.localdate()
    mitarbeit = szenario["mitarbeit"][1]
    _neue_aufgabe(szenario["projet"], verantwortlich=mitarbeit, frist=heute)
    _neue_aufgabe(szenario["projet"], verantwortlich=mitarbeit, frist=heute + timedelta(days=1))
    _neue_aufgabe(szenario["projet"], verantwortlich=mitarbeit, frist=heute + timedelta(days=5))
    _neue_aufgabe(
        szenario["projet"], verantwortlich=mitarbeit, frist=heute, status=StatutAufgabe.ERLEDIGT
    )
    _neue_aufgabe(szenario["projet"], frist=heute)  # ohne Verantwortliche(n)
    assert erinnere_aufgaben_faellig() == 2
    assert (
        Notification.objects.filter(
            destinataire=szenario["mitarbeit"][0],
            type_notification=TypeNotification.PROJEKT_AUFGABE_FAELLIG,
        ).count()
        == 2
    )
