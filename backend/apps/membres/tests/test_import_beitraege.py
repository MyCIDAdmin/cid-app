"""
Tests Release 2 (2026-10-12) — Historie-Import im langen Format (Mitglied + Jahr + Angebot +
Beitrag), siehe apps.membres.imports_beitraege. Gleiche Endpunkte wie der Jahresstatus-Import.
"""

import datetime
import io
from decimal import Decimal

import openpyxl
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.adhesions.models import (
    CampagneAdhesion,
    OffreAdhesion,
    Souscription,
    StatutCampagne,
    StatutSouscription,
)
from apps.adhesions.tests.factories import CampagneAdhesionFactory, OffreAdhesionFactory
from apps.cotisations.models import Cotisation, ModePaiement, StatutCotisation, TypeArticle
from apps.membres.imports_historique import analyser_historique, ausfuehren_historique
from apps.membres.models import HistoriqueStatutMembre, StatutMembre
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
KOPF = ["email", "cin", "jahr", "kampagne", "angebot", "betrag", "zahlungsdatum", "zahlungsart"]


def _xlsx(rows, headers=KOPF):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return SimpleUploadedFile("beitraege.xlsx", buf.getvalue(), content_type=XLSX_MIME)


def _zeilen(analyse):
    return {z.ligne: z for z in analyse.zeilen}


def _ergebnisse(ergebnis):
    return {z.ligne: z for z in ergebnis.zeilen}


def test_pruefen_legt_nichts_an_und_zeigt_neue_kampagne_und_angebot():
    membre = MembreFactory(email="ahmed@example.de", cin="12345678")
    fichier = _xlsx([["ahmed@example.de", "12345678", 2023, "", "Gold", 120, "15.03.2023", "bar"]])

    analyse = analyser_historique(fichier, "b.xlsx")

    zeile = _zeilen(analyse)[2]
    assert zeile.status == "neu"
    assert zeile.existant == membre
    assert [a["champ"] for a in zeile.aenderungen] == [
        "kampagne",
        "angebot",
        "betrag",
        "datum",
        "status",
    ]
    assert CampagneAdhesion.objects.count() == 0
    assert Souscription.objects.count() == 0
    assert Cotisation.objects.count() == 0
    assert HistoriqueStatutMembre.objects.count() == 0


def test_ausfuehren_legt_archivierte_kampagne_angebot_souscription_und_zahlung_an():
    importeur = MembreFactory()
    membre = MembreFactory(email="ahmed@example.de", cin="12345678", statut=StatutMembre.INACTIF)
    fichier = _xlsx(
        [["ahmed@example.de", "12345678", 2023, "", "Gold", "120,00", "15.03.2023", "bar"]]
    )

    ergebnis = ausfuehren_historique(fichier, set(), "b.xlsx", importeur=importeur)

    assert _ergebnisse(ergebnis)[2].ergebnis == "importiert"
    kampagne = CampagneAdhesion.objects.get(annee=2023)
    assert kampagne.statut == StatutCampagne.CLOTUREE
    assert kampagne.created_by == importeur
    offre = OffreAdhesion.objects.get(campagne=kampagne)
    assert (offre.nom, offre.prix_plein, offre.visible) == ("Gold", Decimal("120.00"), False)
    souscription = Souscription.objects.get(membre=membre, campagne=kampagne)
    assert souscription.statut == StatutSouscription.PAYEE
    assert souscription.prix_paye == Decimal("120.00")
    assert souscription.date_souscription.date() == datetime.date(2023, 3, 15)
    zahlung = souscription.cotisation
    assert zahlung.statut == StatutCotisation.PAYEE
    assert zahlung.type_article == TypeArticle.ADHESION
    assert zahlung.mode_paiement == ModePaiement.ESPECES
    assert zahlung.montant == Decimal("120.00")
    assert zahlung.annee == 2023
    assert zahlung.date_paiement.date() == datetime.date(2023, 3, 15)
    assert zahlung.reference_transaction
    assert zahlung.saisie_par == importeur
    assert HistoriqueStatutMembre.objects.get(membre=membre, annee=2023).statut == "actif"


def test_bestehende_kampagne_und_angebot_werden_wiederverwendet_betrag_default_ist_preis():
    membre = MembreFactory(email="m@example.de", cin="22223333")
    kampagne = CampagneAdhesionFactory(annee=2022, statut=StatutCampagne.CLOTUREE)
    offre = OffreAdhesionFactory(campagne=kampagne, nom="Gold", prix_plein=Decimal("90.00"))
    fichier = _xlsx([["m@example.de", "", 2022, "", "gold", None, None, ""]])

    ergebnis = ausfuehren_historique(fichier, set(), "b.xlsx")

    assert _ergebnisse(ergebnis)[2].ergebnis == "importiert"
    assert CampagneAdhesion.objects.count() == 1
    assert OffreAdhesion.objects.count() == 1
    souscription = Souscription.objects.get(membre=membre)
    assert souscription.offre == offre
    assert souscription.prix_paye == Decimal("90.00")
    assert souscription.date_souscription.date() == kampagne.date_debut


def test_neues_angebot_ohne_betrag_ist_fehler():
    MembreFactory(email="m@example.de", cin="22223333")
    fichier = _xlsx([["m@example.de", "", 2021, "", "Platin", None, None, ""]])

    analyse = analyser_historique(fichier)

    zeile = _zeilen(analyse)[2]
    assert zeile.status == "fehler"
    assert "Betrag" in zeile.grund


def test_zwei_gleichrangige_kampagnen_im_jahr_ohne_kampagnenspalte_ist_fehler():
    MembreFactory(email="m@example.de", cin="22223333")
    CampagneAdhesionFactory(annee=2020, nom="A", statut=StatutCampagne.CLOTUREE)
    CampagneAdhesionFactory(annee=2020, nom="B", statut=StatutCampagne.CLOTUREE)
    fichier = _xlsx([["m@example.de", "", 2020, "", "Gold", 50, None, ""]])

    zeile = _zeilen(analyser_historique(fichier))[2]

    assert zeile.status == "fehler"
    assert "kampagne" in zeile.grund

    mit_name = _xlsx([["m@example.de", "", 2020, "b", "Gold", 50, None, ""]])
    assert _zeilen(analyser_historique(mit_name))[2].status == "neu"


def test_ungueltige_werte_sind_fehler():
    MembreFactory(email="m@example.de", cin="22223333")
    fichier = _xlsx(
        [
            ["m@example.de", "", "abc", "", "Gold", 50, None, ""],
            ["m@example.de", "", 2020, "", "Gold", "x", None, ""],
            ["m@example.de", "", 2020, "", "Gold", 50, "kein datum", ""],
            ["m@example.de", "", 2020, "", "Gold", 50, None, "bitcoin"],
            ["m@example.de", "", 2020, "", "", 50, None, ""],
            ["unbekannt@example.de", "", 2020, "", "Gold", 50, None, ""],
        ]
    )

    stati = [z.status for z in analyser_historique(fichier).zeilen]

    assert stati == ["fehler"] * 6


def test_mitglied_und_jahr_doppelt_ist_fehler_mehrere_jahre_sind_erlaubt():
    MembreFactory(email="m@example.de", cin="22223333")
    fichier = _xlsx(
        [
            ["m@example.de", "", 2022, "", "Gold", 50, None, ""],
            ["m@example.de", "", 2023, "", "Gold", 50, None, ""],
            ["m@example.de", "", 2022, "", "Silber", 30, None, ""],
        ]
    )

    zeilen = _zeilen(analyser_historique(fichier))

    assert [zeilen[n].status for n in (2, 3, 4)] == ["neu", "neu", "fehler"]


def test_identische_bestehende_daten_sind_unveraendert():
    fichier_zeile = ["m@example.de", "", 2022, "", "Gold", 50, "01.02.2022", "paypal"]
    MembreFactory(email="m@example.de", cin="22223333")
    ausfuehren_historique(_xlsx([fichier_zeile]), set())

    analyse = analyser_historique(_xlsx([fichier_zeile]))

    assert _zeilen(analyse)[2].status == "unveraendert"


def test_abweichende_souscription_ist_dublette_und_wird_nur_bei_auswahl_ueberschrieben():
    membre = MembreFactory(email="m@example.de", cin="22223333")
    ausfuehren_historique(
        _xlsx([["m@example.de", "", 2022, "", "Gold", 50, "01.02.2022", "paypal"]]), set()
    )
    neu = [["m@example.de", "", 2022, "", "Gold", 80, "05.03.2022", "bar"]]

    analyse = analyser_historique(_xlsx(neu))
    assert _zeilen(analyse)[2].status == "dublette"

    ergebnis = ausfuehren_historique(_xlsx(neu), set())
    assert _ergebnisse(ergebnis)[2].ergebnis == "uebersprungen"
    assert Souscription.objects.get(membre=membre).prix_paye == Decimal("50.00")

    ergebnis = ausfuehren_historique(_xlsx(neu), {2})
    assert _ergebnisse(ergebnis)[2].ergebnis == "ueberschrieben"
    souscription = Souscription.objects.get(membre=membre)
    assert souscription.prix_paye == Decimal("80.00")
    assert Cotisation.objects.filter(membre=membre).count() == 1
    zahlung = Cotisation.objects.get(membre=membre)
    assert zahlung.montant == Decimal("80.00")
    assert zahlung.mode_paiement == ModePaiement.ESPECES
    assert Souscription.objects.count() == 1
    assert CampagneAdhesion.objects.count() == 1


def test_betrag_null_legt_souscription_ohne_zahlung_an():
    membre = MembreFactory(email="m@example.de", cin="22223333")

    ausfuehren_historique(
        _xlsx([["m@example.de", "", 2019, "", "Ehrenmitglied", 0, None, ""]]), set()
    )

    assert Souscription.objects.get(membre=membre).cotisation is None
    assert Cotisation.objects.count() == 0
    assert HistoriqueStatutMembre.objects.get(membre=membre, annee=2019).statut == "actif"


def test_jahresstatus_inaktiv_wird_bei_auswahl_auf_aktiv_gesetzt():
    membre = MembreFactory(email="m@example.de", cin="22223333")
    HistoriqueStatutMembre.objects.create(
        membre=membre,
        annee=2022,
        statut=StatutMembre.INACTIF,
        raison="manuel",
        date_effet="2022-01-01T00:00:00Z",
    )
    zeile = [["m@example.de", "", 2022, "", "Gold", 50, None, ""]]

    ergebnis = ausfuehren_historique(_xlsx(zeile), set())
    assert _ergebnisse(ergebnis)[2].ergebnis == "teilweise"
    assert HistoriqueStatutMembre.objects.get(membre=membre, annee=2022).statut == "inactif"
    assert Souscription.objects.filter(membre=membre).count() == 1

    ausfuehren_historique(_xlsx(zeile), {2})
    assert HistoriqueStatutMembre.objects.get(membre=membre, annee=2022).statut == "actif"


def test_breites_format_bleibt_unveraendert():
    membre = MembreFactory(email="m@example.de", cin="22223333")
    fichier = _xlsx([["m@example.de", "", "actif"]], headers=["email", "cin", "2022"])

    ergebnis = ausfuehren_historique(fichier, set())

    assert _ergebnisse(ergebnis)[2].ergebnis == "importiert"
    assert HistoriqueStatutMembre.objects.get(membre=membre, annee=2022).statut == "actif"
    assert Souscription.objects.count() == 0


# --- Vue API ---


@pytest.fixture
def rh_client():
    user = User.objects.create_user(
        email="rh-beitrag@example.de", password="Password123!", role=Role.RH, is_active=True
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


def test_vue_bestaetigen_nutzt_das_membre_des_benutzers_als_ersteller(rh_client):
    client, user = rh_client
    importeur = MembreFactory(email=user.email, user=user)
    MembreFactory(email="m@example.de", cin="22223333")
    fichier = _xlsx([["m@example.de", "", 2018, "", "Gold", 50, None, ""]])

    resp = client.post(
        reverse("membres:membre-import-historique-bestaetigen"),
        {"fichier": fichier},
        format="multipart",
    )

    assert resp.status_code == 200, resp.data
    assert resp.data["zaehler"]["importiert"] == 1
    assert CampagneAdhesion.objects.get(annee=2018).created_by == importeur


def test_vue_template_variante_beitraege(rh_client):
    client, _ = rh_client
    resp = client.get(reverse("membres:membre-import-historique-template") + "?variante=beitraege")
    assert resp.status_code == 200
    blatt = openpyxl.load_workbook(io.BytesIO(resp.content)).worksheets[0]
    assert [c.value for c in blatt[1]] == KOPF
