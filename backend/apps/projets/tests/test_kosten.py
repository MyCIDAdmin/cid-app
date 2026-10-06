"""
Tests — Projektkosten (2026-10-06) : Plankosten je Kostenart, Ist-Kosten als `finances.Depense`
mit Projekt, Erfassung durch das Team, Freigabe durch die Finanzen (Vier-Augen), Plan/Ist.
"""

import datetime
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.cotisations.models import TypeArticle
from apps.cotisations.tests.factories import CotisationFactory
from apps.finances.models import (
    CategorieDepense,
    Depense,
    FinanzProtokoll,
    Jahresabschluss,
    StatutDepense,
)
from apps.membres.tests.factories import MembreFactory
from apps.projets.models import Aufgabe, PlanKosten, ProjetMitglied, RolleProjet
from apps.projets.tests.factories import ProjetFactory

pytestmark = pytest.mark.django_db

JAHR = 2026
DATUM = datetime.date(JAHR, 5, 4)


def _user(role, email):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    return user, MembreFactory(user=user)


def _client(user=None):
    client = APIClient()
    if user is not None:
        client.force_authenticate(user=user)
    return client


@pytest.fixture
def kat():
    return CategorieDepense.objects.filter(actif=True).first()


@pytest.fixture
def kat2():
    return CategorieDepense.objects.filter(actif=True).last()


@pytest.fixture
def szenario():
    leitung_u, leitung_m = _user(Role.MEMBRE, "kleitung@example.de")
    mit_u, mit_m = _user(Role.MEMBRE, "kmit@example.de")
    beo_u, beo_m = _user(Role.MEMBRE, "kbeo@example.de")
    fremd_u, _ = _user(Role.MEMBRE, "kfremd@example.de")
    fin_u, _ = _user(Role.DIR_FINANCIER, "kfin@example.de")
    projet = ProjetFactory(responsable=leitung_m)
    ProjetMitglied.objects.create(projet=projet, membre=mit_m, rolle=RolleProjet.MITARBEIT)
    ProjetMitglied.objects.create(projet=projet, membre=beo_m, rolle=RolleProjet.BEOBACHTER)
    return {
        "projet": projet,
        "leitung": leitung_u,
        "mit": mit_u,
        "beo": beo_u,
        "fremd": fremd_u,
        "fin": fin_u,
    }


def _body(szenario, kat, **extra):
    body = {
        "projet": str(szenario["projet"].id),
        "date_depense": DATUM.isoformat(),
        "montant": "40.00",
        "categorie": str(kat.id),
        "fournisseur": "Druckerei",
    }
    body.update(extra)
    return body


def _post_kosten(client, szenario, kat, **extra):
    return client.post(reverse("projets:projet-kosten-list"), _body(szenario, kat, **extra))


# --- Plankosten -----------------------------------------------------------------------------


def test_plankosten_schreiben_nur_leitung_und_verwaltung(szenario, kat):
    url = reverse("projets:projet-plankosten-list")
    body = {
        "projet": str(szenario["projet"].id),
        "categorie": str(kat.id),
        "betrag": "300.00",
    }
    for rolle in ("mit", "beo", "fremd"):
        assert _client(szenario[rolle]).post(url, body, format="json").status_code == 403
    assert _client(szenario["leitung"]).post(url, body, format="json").status_code == 201


def test_plankosten_pro_kostenart_nur_einmal_und_unveraenderlich(szenario, kat, kat2):
    client = _client(szenario["leitung"])
    url = reverse("projets:projet-plankosten-list")
    body = {"projet": str(szenario["projet"].id), "categorie": str(kat.id), "betrag": "10"}
    plan_id = client.post(url, body, format="json").data["id"]
    assert client.post(url, body, format="json").status_code == 400
    detail = reverse("projets:projet-plankosten-detail", args=[plan_id])
    resp = client.patch(detail, {"betrag": "25.50", "categorie": str(kat2.id)}, format="json")
    assert resp.status_code == 200
    plan = PlanKosten.objects.get(pk=plan_id)
    assert plan.betrag == Decimal("25.50") and plan.categorie_id == kat.id
    assert client.delete(detail).status_code == 204


def test_plankosten_nicht_sichtbar_fuer_aussenstehende(szenario, kat):
    PlanKosten.objects.create(projet=szenario["projet"], categorie=kat, betrag=Decimal("5"))
    url = reverse("projets:projet-plankosten-list")
    assert _client(szenario["fremd"]).get(url).data == []
    assert len(_client(szenario["beo"]).get(url).data) == 1
    assert len(_client(szenario["fin"]).get(url).data) == 1
    assert _client().get(url).status_code == 401


def test_deaktivierte_kostenart_wird_abgelehnt(szenario, kat):
    CategorieDepense.objects.filter(pk=kat.pk).update(actif=False)
    resp = _client(szenario["leitung"]).post(
        reverse("projets:projet-plankosten-list"),
        {"projet": str(szenario["projet"].id), "categorie": str(kat.id), "betrag": "1"},
        format="json",
    )
    assert resp.status_code == 400


# --- Ist-Kosten erfassen ----------------------------------------------------------------------


def test_erfassung_je_rolle(szenario, kat):
    assert _post_kosten(_client(szenario["beo"]), szenario, kat).status_code == 403
    assert _post_kosten(_client(szenario["fremd"]), szenario, kat).status_code == 403
    assert _post_kosten(_client(), szenario, kat).status_code == 401
    resp = _post_kosten(_client(szenario["mit"]), szenario, kat)
    assert resp.status_code == 201
    assert resp.data["statut"] == StatutDepense.EN_ATTENTE
    depense = Depense.objects.get(pk=resp.data["id"])
    assert (
        depense.projet_id == szenario["projet"].id and depense.saisie_par_id == szenario["mit"].id
    )
    assert FinanzProtokoll.objects.filter(objekt_id=str(depense.id)).exists()


def test_projekt_ist_pflicht(szenario, kat):
    body = _body(szenario, kat)
    del body["projet"]
    resp = _client(szenario["leitung"]).post(reverse("projets:projet-kosten-list"), body)
    assert resp.status_code == 400


def test_aufgabe_muss_zum_projekt_gehoeren(szenario, kat):
    eigene = Aufgabe.objects.create(projet=szenario["projet"], titel="Flyer")
    fremde = Aufgabe.objects.create(projet=ProjetFactory(), titel="Andere")
    client = _client(szenario["mit"])
    assert _post_kosten(client, szenario, kat, aufgabe=str(fremde.id)).status_code == 400
    resp = _post_kosten(client, szenario, kat, aufgabe=str(eigene.id))
    assert resp.status_code == 201 and resp.data["aufgabe_titel"] == "Flyer"


def test_gesperrtes_jahr_blockiert_erfassung(szenario, kat):
    Jahresabschluss.objects.create(annee=JAHR, aktiv=True, abgeschlossen_am=timezone.now())
    assert _post_kosten(_client(szenario["leitung"]), szenario, kat).status_code == 409


def test_liste_nur_fuer_team_und_finanzen(szenario, kat):
    _post_kosten(_client(szenario["leitung"]), szenario, kat)
    url = reverse("projets:projet-kosten-list")
    assert _client(szenario["fremd"]).get(url).data == []
    assert len(_client(szenario["beo"]).get(url).data) == 1
    assert len(_client(szenario["fin"]).get(url, {"projet": szenario["projet"].id}).data) == 1


# --- Ändern / Löschen ---------------------------------------------------------------------------


def test_aendern_nur_eigene_oder_leitung_und_nicht_nach_freigabe(szenario, kat):
    leitung_id = _post_kosten(_client(szenario["leitung"]), szenario, kat).data["id"]
    mein_id = _post_kosten(_client(szenario["mit"]), szenario, kat).data["id"]
    mit = _client(szenario["mit"])
    fremd_detail = reverse("projets:projet-kosten-detail", args=[leitung_id])
    mein_detail = reverse("projets:projet-kosten-detail", args=[mein_id])
    assert mit.patch(fremd_detail, {"montant": "1.00"}).status_code == 403
    assert mit.patch(mein_detail, {"montant": "55.00"}).status_code == 200
    assert _client(szenario["leitung"]).patch(mein_detail, {"montant": "60.00"}).status_code == 200
    Depense.objects.filter(pk=mein_id).update(statut=StatutDepense.APPROUVEE)
    assert mit.patch(mein_detail, {"montant": "1.00"}).status_code == 400
    assert mit.delete(mein_detail).status_code == 400


def test_projekt_einer_ausgabe_ist_unveraenderlich(szenario, kat):
    client = _client(szenario["leitung"])
    kosten_id = _post_kosten(client, szenario, kat).data["id"]
    anderes = ProjetFactory()
    resp = client.patch(
        reverse("projets:projet-kosten-detail", args=[kosten_id]),
        {"projet": str(anderes.id), "fournisseur": "Neu"},
    )
    assert resp.status_code == 200
    depense = Depense.objects.get(pk=kosten_id)
    assert depense.projet_id == szenario["projet"].id and depense.fournisseur == "Neu"


def test_loeschen_protokolliert(szenario, kat):
    client = _client(szenario["mit"])
    kosten_id = _post_kosten(client, szenario, kat).data["id"]
    assert (
        client.delete(reverse("projets:projet-kosten-detail", args=[kosten_id])).status_code == 204
    )
    assert not Depense.objects.filter(pk=kosten_id).exists()
    assert FinanzProtokoll.objects.filter(aktion="geloescht", objekt_id=kosten_id).exists()


# --- Plan / Ist ---------------------------------------------------------------------------------


def test_uebersicht_plan_ist_offen_einnahmen(szenario, kat, kat2):
    projet = szenario["projet"]
    PlanKosten.objects.create(projet=projet, categorie=kat, betrag=Decimal("100.00"))
    PlanKosten.objects.create(projet=projet, categorie=kat2, betrag=Decimal("50.00"))
    aufgabe = Aufgabe.objects.create(projet=projet, titel="Druck")
    mit = _client(szenario["mit"])
    freigegeben = _post_kosten(mit, szenario, kat, montant="40.00", aufgabe=str(aufgabe.id)).data
    offen = _post_kosten(mit, szenario, kat, montant="10.00").data
    abgelehnt = _post_kosten(mit, szenario, kat2, montant="99.00").data
    fin = _client(szenario["fin"])
    assert (
        fin.post(reverse("finances:depense-approuver", args=[freigegeben["id"]])).status_code == 200
    )
    resp = fin.post(
        reverse("finances:depense-rejeter", args=[abgelehnt["id"]]), {"motif": "Beleg fehlt"}
    )
    assert resp.status_code == 200
    assert offen["statut"] == StatutDepense.EN_ATTENTE
    CotisationFactory(type_article=TypeArticle.PROJET, projet=projet, montant=Decimal("70.00"))

    url = reverse("projets:projet-kosten-uebersicht", args=[projet.id])
    for user in ("mit", "beo", "fin", "leitung"):
        assert _client(szenario[user]).get(url).status_code == 200
    daten = _client(szenario["leitung"]).get(url).data
    assert Decimal(daten["plan_gesamt"]) == Decimal("150.00")
    assert Decimal(daten["ist_gesamt"]) == Decimal("40.00")
    assert Decimal(daten["offen_gesamt"]) == Decimal("10.00")
    assert Decimal(daten["abweichung"]) == Decimal("110.00")
    assert Decimal(daten["einnahmen"]) == Decimal("70.00")
    assert Decimal(daten["ergebnis"]) == Decimal("30.00")
    zeilen = {z["categorie"]: z for z in daten["kategorien"]}
    assert Decimal(zeilen[kat.id]["ist"]) == Decimal("40.00") and zeilen[kat.id]["prozent"] == 40
    assert Decimal(zeilen[kat2.id]["ist"]) == Decimal("0.00")  # abgelehnt zählt nirgends
    assert [(a["titel"], Decimal(a["ist"])) for a in daten["aufgaben"]] == [
        ("Druck", Decimal("40.00"))
    ]
    assert daten["darf_erfassen"] is True and daten["darf_plan_bearbeiten"] is True
    assert {k["id"] for k in daten["kostenarten"]} >= {kat.id, kat2.id}
    assert _client(szenario["beo"]).get(url).data["darf_erfassen"] is False


def test_uebersicht_nur_fuer_berechtigte(szenario):
    url = reverse("projets:projet-kosten-uebersicht", args=[szenario["projet"].id])
    assert _client(szenario["fremd"]).get(url).status_code in (403, 404)
    assert _client().get(url).status_code in (401, 403, 404)


def test_projektausgaben_im_jahresbilanz(szenario, kat):
    from apps.stats.bilan import bilan_annuel

    depense = _post_kosten(_client(szenario["leitung"]), szenario, kat, montant="25.00").data
    _client(szenario["fin"]).post(reverse("finances:depense-approuver", args=[depense["id"]]))
    ergebnis = bilan_annuel(JAHR)["resultats_projets"][0]
    assert ergebnis["depenses"] == Decimal("25.00") and ergebnis["resultat"] == Decimal("-25.00")
