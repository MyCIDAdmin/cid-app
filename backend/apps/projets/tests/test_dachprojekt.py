"""Tests — Dach-Projekte mit Teilprojekten und Meilensteinen (Nutzerwunsch 2026-10-20)."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.cotisations.models import ModePaiement, StatutCotisation, TypeArticle
from apps.cotisations.tests.factories import CotisationFactory
from apps.membres.tests.factories import MembreFactory
from apps.projets.models import ProjetMeilenstein, SichtbarkeitProjet, StatutProjet
from apps.projets.tests.factories import ProjetFactory

pytestmark = pytest.mark.django_db


def _user(role=Role.MEMBRE, email="u@example.de"):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    return user, MembreFactory(user=user)


def _client(user=None):
    client = APIClient()
    if user is not None:
        client.force_authenticate(user)
    return client


def _detail(projet):
    return reverse("projets:projet-detail", args=[projet.id])


def _uebersicht(projet):
    return reverse("projets:projet-uebersicht", args=[projet.id])


def _spende(projet, betrag, **kwargs):
    kwargs.setdefault("statut", StatutCotisation.PAYEE)
    return CotisationFactory(
        type_article=TypeArticle.PROJET,
        projet=projet,
        montant=betrag,
        mode_paiement=ModePaiement.CARTE,
        **kwargs,
    )


# --- Verknüpfung Dach <-> Teilprojekt --------------------------------------------------------


def test_admin_ordnet_projekt_einem_dach_zu():
    admin, _ = _user(Role.BUREAU_ADMIN, "admin@example.de")
    dach = ProjetFactory(titre="Sportplätze Akademie")
    kind = ProjetFactory(titre="Umkleidekabinen")

    resp = _client(admin).patch(_detail(kind), {"parent": str(dach.id)}, format="json")

    assert resp.status_code == 200, resp.json()
    assert resp.json()["parent"] == str(dach.id)
    assert resp.json()["parent_detail"] == {"id": str(dach.id), "titre": "Sportplätze Akademie"}
    dach_antwort = _client(admin).get(_detail(dach))
    assert dach_antwort.json()["nb_teilprojekte"] == 1


def test_teilprojekt_kann_kein_dach_sein():
    admin, _ = _user(Role.BUREAU_ADMIN, "admin@example.de")
    dach = ProjetFactory()
    kind = ProjetFactory(parent=dach)
    enkel = ProjetFactory()

    resp = _client(admin).patch(_detail(enkel), {"parent": str(kind.id)}, format="json")

    assert resp.status_code == 400
    assert "parent" in resp.json()["details"]


def test_dach_mit_teilprojekten_kann_keinem_dach_zugeordnet_werden():
    admin, _ = _user(Role.BUREAU_ADMIN, "admin@example.de")
    dach = ProjetFactory()
    ProjetFactory(parent=dach)
    anderes_dach = ProjetFactory()

    resp = _client(admin).patch(_detail(dach), {"parent": str(anderes_dach.id)}, format="json")

    assert resp.status_code == 400
    assert "parent" in resp.json()["details"]


def test_projekt_ist_nicht_sein_eigenes_dach():
    admin, _ = _user(Role.BUREAU_ADMIN, "admin@example.de")
    projet = ProjetFactory()

    resp = _client(admin).patch(_detail(projet), {"parent": str(projet.id)}, format="json")

    assert resp.status_code == 400


def test_dach_loeschen_laesst_teilprojekte_bestehen():
    dach = ProjetFactory()
    kind = ProjetFactory(parent=dach)

    dach.delete()

    kind.refresh_from_db()
    assert kind.parent_id is None


def test_beginn_darf_nicht_nach_der_frist_liegen():
    admin, _ = _user(Role.BUREAU_ADMIN, "admin@example.de")
    projet = ProjetFactory()

    resp = _client(admin).patch(
        _detail(projet),
        {"date_debut": "2027-05-01", "date_limite": "2027-01-01"},
        format="json",
    )

    assert resp.status_code == 400
    assert "date_debut" in resp.json()["details"]


def test_unveroeffentlichtes_dach_wird_ueber_teilprojekt_nicht_verraten():
    dach = ProjetFactory(sichtbarkeit=SichtbarkeitProjet.ENTWURF, titre="Geheim")
    kind = ProjetFactory(parent=dach)
    member, _ = _user(Role.MEMBRE, "m@example.de")

    resp = _client(member).get(_detail(kind))

    assert resp.status_code == 200
    assert resp.json()["parent_detail"] is None


def test_entwurf_teilprojekte_werden_fuer_mitglieder_nicht_mitgezaehlt():
    dach = ProjetFactory()
    ProjetFactory(parent=dach)
    ProjetFactory(parent=dach, sichtbarkeit=SichtbarkeitProjet.ENTWURF)
    member, _ = _user(Role.MEMBRE, "m@example.de")
    admin, _ = _user(Role.BUREAU_ADMIN, "a@example.de")

    assert _client(member).get(_detail(dach)).json()["nb_teilprojekte"] == 1
    assert _client(admin).get(_detail(dach)).json()["nb_teilprojekte"] == 2


# --- Übersicht -------------------------------------------------------------------------------


def test_uebersicht_summiert_spenden_ueber_dach_und_teilprojekte():
    dach = ProjetFactory(objectif_montant=Decimal("100000.00"))
    kabinen = ProjetFactory(parent=dach, objectif_montant=Decimal("20000.00"))
    hotel = ProjetFactory(parent=dach, objectif_montant=Decimal("50000.00"))
    muster = MembreFactory()
    _spende(dach, "100.00", membre=muster)
    _spende(kabinen, "250.00", membre=muster)
    _spende(hotel, "50.00")
    _spende(hotel, "999.00", statut=StatutCotisation.EN_ATTENTE)  # zählt nicht

    resp = _client().get(_uebersicht(dach))

    assert resp.status_code == 200, resp.json()
    summen = resp.json()["summen"]
    assert Decimal(summen["montant_collecte"]) == Decimal("400.00")
    assert Decimal(summen["objectif_montant"]) == Decimal("170000.00")
    assert summen["nb_contributeurs"] == 2  # `muster` zählt nur einmal
    assert summen["teilprojekte_gesamt"] == 2
    assert {p["titre"] for p in resp.json()["teilprojekte"]} == {kabinen.titre, hotel.titre}


def test_uebersicht_fortschritt_aus_meilensteinen():
    dach = ProjetFactory()
    kind = ProjetFactory(parent=dach)
    ProjetMeilenstein.objects.create(projet=dach, titel="Planung", erledigt_am=date(2026, 1, 1))
    ProjetMeilenstein.objects.create(projet=dach, titel="Bau")
    ProjetMeilenstein.objects.create(projet=kind, titel="Rohbau", erledigt_am=date(2026, 2, 1))
    ProjetMeilenstein.objects.create(projet=kind, titel="Eröffnung")

    summen = _client().get(_uebersicht(dach)).json()["summen"]

    assert summen["meilensteine_gesamt"] == 4
    assert summen["meilensteine_erledigt"] == 2
    assert summen["fortschritt_prozent"] == 50


def test_uebersicht_fortschritt_ohne_meilensteine_aus_abgeschlossenen_teilprojekten():
    dach = ProjetFactory()
    ProjetFactory(parent=dach, statut=StatutProjet.TERMINE)
    ProjetFactory(parent=dach, statut=StatutProjet.EN_COURS)
    ProjetFactory(parent=dach, statut=StatutProjet.EN_COURS)
    ProjetFactory(parent=dach, statut=StatutProjet.TERMINE)

    summen = _client().get(_uebersicht(dach)).json()["summen"]

    assert summen["teilprojekte_termine"] == 2
    assert summen["teilprojekte_aktiv"] == 2
    assert summen["fortschritt_prozent"] == 50


def test_uebersicht_zeitraum_umfasst_dach_und_teilprojekte():
    dach = ProjetFactory(date_debut=date(2027, 1, 1), date_limite=date(2031, 12, 31))
    ProjetFactory(parent=dach, date_debut=date(2026, 9, 1), date_limite=date(2028, 6, 30))

    summen = _client().get(_uebersicht(dach)).json()["summen"]

    assert summen["beginn"] == "2026-09-01"
    assert summen["ende"] == "2031-12-31"


def test_uebersicht_verbirgt_entwurf_teilprojekte_vor_mitgliedern():
    dach = ProjetFactory()
    ProjetFactory(parent=dach, titre="Öffentlich")
    ProjetFactory(parent=dach, titre="Intern", sichtbarkeit=SichtbarkeitProjet.ENTWURF)
    member, _ = _user(Role.MEMBRE, "m@example.de")
    admin, _ = _user(Role.BUREAU_ADMIN, "a@example.de")

    titel_member = {
        p["titre"] for p in _client(member).get(_uebersicht(dach)).json()["teilprojekte"]
    }
    titel_admin = {p["titre"] for p in _client(admin).get(_uebersicht(dach)).json()["teilprojekte"]}

    assert titel_member == {"Öffentlich"}
    assert titel_admin == {"Öffentlich", "Intern"}


def test_uebersicht_fuer_unveroeffentlichtes_dach_ist_fuer_besucher_404():
    dach = ProjetFactory(sichtbarkeit=SichtbarkeitProjet.ENTWURF)

    assert _client().get(_uebersicht(dach)).status_code == 404


# --- Meilensteine ----------------------------------------------------------------------------


def _meilenstein_liste():
    return reverse("projets:projet-meilenstein-list")


def test_leitung_legt_meilenstein_an_und_hakt_ihn_ab():
    leitung_u, leitung_m = _user(Role.MEMBRE, "leitung@example.de")
    projet = ProjetFactory(responsable=leitung_m)
    client = _client(leitung_u)

    resp = client.post(
        _meilenstein_liste(),
        {"projet": str(projet.id), "titel": "Rohbau fertig", "faellig_am": "2027-06-30"},
        format="json",
    )
    assert resp.status_code == 201, resp.json()
    assert resp.json()["erledigt"] is False
    assert resp.json()["erledigt_am"] is None

    erledigt = client.patch(
        reverse("projets:projet-meilenstein-detail", args=[resp.json()["id"]]),
        {"erledigt": True},
        format="json",
    )
    assert erledigt.status_code == 200
    assert erledigt.json()["erledigt"] is True
    assert erledigt.json()["erledigt_am"] == timezone.localdate().isoformat()

    zurueck = client.patch(
        reverse("projets:projet-meilenstein-detail", args=[resp.json()["id"]]),
        {"erledigt": False},
        format="json",
    )
    assert zurueck.json()["erledigt"] is False
    assert zurueck.json()["erledigt_am"] is None


def test_admin_darf_meilenstein_jedes_projekts_verwalten():
    admin, _ = _user(Role.BUREAU_ADMIN, "admin@example.de")
    projet = ProjetFactory()

    resp = _client(admin).post(
        _meilenstein_liste(), {"projet": str(projet.id), "titel": "Start"}, format="json"
    )

    assert resp.status_code == 201


def test_mitglied_und_fremder_verantwortlicher_duerfen_keine_meilensteine_anlegen():
    projet = ProjetFactory()
    member, _ = _user(Role.MEMBRE, "m@example.de")
    fremd_u, fremd_m = _user(Role.MEMBRE, "fremd@example.de")
    ProjetFactory(responsable=fremd_m)

    for user in (member, fremd_u):
        resp = _client(user).post(
            _meilenstein_liste(), {"projet": str(projet.id), "titel": "X"}, format="json"
        )
        assert resp.status_code == 403
    assert _client().post(
        _meilenstein_liste(), {"projet": str(projet.id), "titel": "X"}, format="json"
    ).status_code in (401, 403)


def test_meilenstein_aendern_und_loeschen_nur_durch_berechtigte():
    leitung_u, leitung_m = _user(Role.MEMBRE, "leitung@example.de")
    projet = ProjetFactory(responsable=leitung_m)
    meilenstein = ProjetMeilenstein.objects.create(projet=projet, titel="Alt")
    member, _ = _user(Role.MEMBRE, "m@example.de")
    url = reverse("projets:projet-meilenstein-detail", args=[meilenstein.id])

    assert _client(member).patch(url, {"titel": "Neu"}, format="json").status_code == 403
    assert _client(member).delete(url).status_code == 403
    assert _client(leitung_u).patch(url, {"titel": "Neu"}, format="json").status_code == 200
    assert _client(leitung_u).delete(url).status_code == 204


def test_meilenstein_projekt_ist_unveraenderlich():
    leitung_u, leitung_m = _user(Role.MEMBRE, "leitung@example.de")
    projet = ProjetFactory(responsable=leitung_m)
    anderes = ProjetFactory(responsable=leitung_m)
    meilenstein = ProjetMeilenstein.objects.create(projet=projet, titel="M")

    resp = _client(leitung_u).patch(
        reverse("projets:projet-meilenstein-detail", args=[meilenstein.id]),
        {"projet": str(anderes.id)},
        format="json",
    )

    assert resp.status_code == 400


def test_meilensteine_eines_entwurfs_sind_fuer_besucher_unsichtbar():
    projet = ProjetFactory(sichtbarkeit=SichtbarkeitProjet.ENTWURF)
    ProjetMeilenstein.objects.create(projet=projet, titel="Geheim")
    offen = ProjetFactory()
    ProjetMeilenstein.objects.create(projet=offen, titel="Offen")

    resp = _client().get(_meilenstein_liste())

    assert resp.status_code == 200
    assert [m["titel"] for m in resp.json()] == ["Offen"]


def test_meilenstein_ueberfaellig_nur_wenn_offen_und_frist_vorbei():
    projet = ProjetFactory()
    gestern = timezone.localdate() - timedelta(days=1)
    offen = ProjetMeilenstein.objects.create(projet=projet, titel="A", faellig_am=gestern)
    fertig = ProjetMeilenstein.objects.create(
        projet=projet, titel="B", faellig_am=gestern, erledigt_am=gestern
    )

    assert offen.ueberfaellig is True
    assert fertig.ueberfaellig is False


def test_projektliste_meldet_meilenstein_zaehler():
    projet = ProjetFactory()
    ProjetMeilenstein.objects.create(projet=projet, titel="A", erledigt_am=date(2026, 1, 1))
    ProjetMeilenstein.objects.create(projet=projet, titel="B")

    resp = _client().get(reverse("projets:projet-list"))

    eintrag = next(p for p in resp.json()["results"] if p["id"] == str(projet.id))
    assert eintrag["meilensteine_gesamt"] == 2
    assert eintrag["meilensteine_erledigt"] == 1
