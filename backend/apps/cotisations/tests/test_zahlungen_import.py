"""Release 3 (2026-10-12) — Excel-Import von Zahlungen, offene Zahlungseingänge, Buchung."""

import io
from decimal import Decimal

import openpyxl
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.cotisations.imports_zahlungen import analyser_zahlungen, ausfuehren_zahlungen
from apps.cotisations.models import (
    Cotisation,
    ModePaiement,
    StatutCotisation,
    StatutZahlungseingang,
    TypeArticle,
    Zahlungseingang,
)
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
KOPF = [
    "datum",
    "betrag",
    "zahlungsart",
    "referenz",
    "verwendungszweck",
    "email",
    "cin",
    "artikel",
    "jahr",
]


def _xlsx(rows, headers=KOPF):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return SimpleUploadedFile("zahlungen.xlsx", buf.getvalue(), content_type=XLSX_MIME)


def _z(analyse):
    return {z.ligne: z for z in analyse.zeilen}


def _e(ergebnis):
    return {z.ligne: z for z in ergebnis.zeilen}


def test_pruefen_schreibt_nichts_und_klassifiziert():
    MembreFactory(email="amira@example.de", cin="11112222")
    fichier = _xlsx(
        [
            [
                "15.03.2026",
                45,
                "Überweisung",
                "R-1",
                "Beitrag",
                "amira@example.de",
                "",
                "Mitgliedsbeitrag",
                2026,
            ],
            ["16.03.2026", 20, "Bar", "", "Spende", "", "", "", ""],
        ]
    )
    analyse = analyser_zahlungen(fichier, "z.xlsx")
    zeilen = _z(analyse)
    assert zeilen[2].status == "neu"
    assert "gebucht" in zeilen[2].grund
    assert zeilen[3].status == "neu"
    assert "offen" in zeilen[3].grund
    assert Zahlungseingang.objects.count() == 0
    assert Cotisation.objects.count() == 0


def test_vollstaendige_zeile_wird_gebucht_ohne_benachrichtigung():
    importeur = MembreFactory()
    membre = MembreFactory(email="amira@example.de", cin="11112222")
    fichier = _xlsx(
        [
            [
                "15.03.2026",
                "45,00",
                "Überweisung",
                "R-1",
                "Beitrag 2026",
                "amira@example.de",
                "",
                "Mitgliedsbeitrag",
                2026,
            ]
        ]
    )
    ergebnis = ausfuehren_zahlungen(fichier, set(), "z.xlsx", importeur=importeur)
    assert _e(ergebnis)[2].ergebnis == "importiert"
    zahlung = Cotisation.objects.get(membre=membre)
    assert zahlung.statut == StatutCotisation.PAYEE
    assert zahlung.type_article == TypeArticle.COTISATION
    assert zahlung.montant == Decimal("45.00")
    assert zahlung.annee == 2026
    assert zahlung.mode_paiement == ModePaiement.VIREMENT_SEPA
    assert zahlung.reference_transaction == "R-1"
    assert zahlung.saisie_par == importeur
    assert zahlung.date_paiement.date().isoformat() == "2026-03-15"
    eingang = Zahlungseingang.objects.get()
    assert eingang.status == StatutZahlungseingang.GEBUCHT
    assert eingang.cotisation == zahlung


def test_ohne_zuordnung_bleibt_offen():
    fichier = _xlsx([["16.03.2026", 20, "Bar", "", "Spende Versammlung", "", "", "", ""]])
    ergebnis = ausfuehren_zahlungen(fichier, set(), "z.xlsx")
    assert _e(ergebnis)[2].ergebnis == "importiert"
    eingang = Zahlungseingang.objects.get()
    assert eingang.status == StatutZahlungseingang.OFFEN
    assert eingang.membre is None
    assert Cotisation.objects.count() == 0


def test_unbekanntes_mitglied_wird_offen_mit_hinweis():
    fichier = _xlsx([["16.03.2026", 20, "", "", "", "niemand@example.de", "", "Spende", ""]])
    ausfuehren_zahlungen(fichier, set(), "z.xlsx")
    eingang = Zahlungseingang.objects.get()
    assert eingang.status == StatutZahlungseingang.OFFEN
    assert "Kein bestehendes Mitglied" in eingang.hinweis


def test_referenz_dublette_wird_uebersprungen_auch_im_register():
    MembreFactory(email="amira@example.de", cin="11112222")
    zeile = ["15.03.2026", 45, "", "R-1", "", "amira@example.de", "", "Mitgliedsbeitrag", ""]
    ausfuehren_zahlungen(_xlsx([zeile]), set(), "z.xlsx")
    analyse = analyser_zahlungen(_xlsx([zeile]))
    assert _z(analyse)[2].status == "dublette"
    ergebnis = ausfuehren_zahlungen(_xlsx([zeile]), set(), "z.xlsx")
    assert _e(ergebnis)[2].ergebnis == "uebersprungen"
    assert Zahlungseingang.objects.count() == 1


def test_dublette_ohne_referenz_gleiches_mitglied_datum_betrag():
    MembreFactory(email="amira@example.de", cin="11112222")
    zeile = ["15.03.2026", 45, "", "", "", "amira@example.de", "", "Mitgliedsbeitrag", ""]
    ausfuehren_zahlungen(_xlsx([zeile]), set(), "z.xlsx")
    assert _z(analyser_zahlungen(_xlsx([zeile])))[2].status == "dublette"


def test_referenz_doppelt_in_datei_und_ungueltige_werte_sind_fehler():
    fichier = _xlsx(
        [
            ["15.03.2026", 10, "", "R-9", "", "", "", "", ""],
            ["15.03.2026", 10, "", "R-9", "", "", "", "", ""],
            ["kein datum", 10, "", "", "", "", "", "", ""],
            ["15.03.2026", 0, "", "", "", "", "", "", ""],
            ["15.03.2026", 10, "bitcoin", "", "", "", "", "", ""],
            ["15.03.2026", 10, "", "", "", "", "", "unbekannt", ""],
        ]
    )
    stati = [z.status for z in analyser_zahlungen(fichier).zeilen]
    assert stati == ["neu", "fehler", "fehler", "fehler", "fehler", "fehler"]


def test_pflichtspalten_fehlen():
    from apps.membres.import_gemeinsam import ImportDateiFehler

    with pytest.raises(ImportDateiFehler):
        analyser_zahlungen(_xlsx([[1]], headers=["betrag"]))


# --- API ---


@pytest.fixture
def fin_client():
    user = User.objects.create_user(
        email="fin-zahl@example.de",
        password="Password123!",
        role=Role.DIR_FINANCIER,
        is_active=True,
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _offen(**kwargs):
    daten = {"datum": "2026-03-16", "betrag": Decimal("20.00"), "mode_paiement": "especes"}
    daten.update(kwargs)
    return Zahlungseingang.objects.create(**daten)


def test_api_zuordnen_ergaenzen_und_buchen(fin_client):
    membre = MembreFactory()
    eingang = _offen()
    url = reverse("cotisations:zahlungseingang-detail", args=[eingang.id])

    resp = fin_client.post(reverse("cotisations:zahlungseingang-buchen", args=[eingang.id]))
    assert resp.status_code == 400
    assert "Mitglied" in resp.data["message"]

    resp = fin_client.patch(url, {"membre": str(membre.id), "type_article": "don"}, format="json")
    assert resp.status_code == 200, resp.data
    assert resp.data["fehlt"] == []

    resp = fin_client.post(reverse("cotisations:zahlungseingang-buchen", args=[eingang.id]))
    assert resp.status_code == 200, resp.data
    assert resp.data["status"] == "gebucht"
    zahlung = Cotisation.objects.get(membre=membre)
    assert zahlung.type_article == TypeArticle.DON
    assert zahlung.statut == StatutCotisation.PAYEE

    resp = fin_client.patch(url, {"betrag": "30.00"}, format="json")
    assert resp.status_code == 400  # gebuchte Einträge sind gesperrt


def test_api_verwerfen_und_wiederherstellen(fin_client):
    eingang = _offen()
    resp = fin_client.post(reverse("cotisations:zahlungseingang-verwerfen", args=[eingang.id]))
    assert resp.status_code == 200 and resp.data["status"] == "verworfen"
    resp = fin_client.post(
        reverse("cotisations:zahlungseingang-wiederherstellen", args=[eingang.id])
    )
    assert resp.data["status"] == "offen"


def test_api_liste_filter_status(fin_client):
    _offen()
    _offen(status=StatutZahlungseingang.VERWORFEN)
    resp = fin_client.get(reverse("cotisations:zahlungseingang-list") + "?status=offen")
    assert resp.status_code == 200
    assert resp.data["count"] == 1


def test_api_import_pruefen_bestaetigen_und_template(fin_client):
    MembreFactory(email="amira@example.de", cin="11112222")
    zeile = ["15.03.2026", 45, "", "", "", "amira@example.de", "", "Mitgliedsbeitrag", ""]
    resp = fin_client.post(
        reverse("cotisations:zahlungen-import-pruefen"),
        {"fichier": _xlsx([zeile])},
        format="multipart",
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["zaehler"]["neu"] == 1
    assert Zahlungseingang.objects.count() == 0
    resp = fin_client.post(
        reverse("cotisations:zahlungen-import-bestaetigen"),
        {"fichier": _xlsx([zeile])},
        format="multipart",
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["zaehler"]["importiert"] == 1
    assert Cotisation.objects.count() == 1
    assert fin_client.get(reverse("cotisations:zahlungen-import-template")).status_code == 200


def test_api_ohne_matrix_recht_verweigert():
    user = User.objects.create_user(
        email="rh-zahl@example.de", password="Password123!", role=Role.RH, is_active=True
    )
    client = APIClient()
    client.force_authenticate(user=user)
    assert client.get(reverse("cotisations:zahlungseingang-list")).status_code == 403
    assert client.get(reverse("cotisations:zahlungen-import-template")).status_code == 403


# ── Release 5 : verwaltbare Dropdown-Listen ──────────────────────────────────────────────────


def test_vorlage_hat_versteckte_listen_und_dropdowns():
    from apps.cotisations.imports_zahlungen import construire_classeur_template_zahlungen

    wb = construire_classeur_template_zahlungen()
    assert wb["Listen"].sheet_state == "hidden"
    assert wb["Listen"]["A1"].value == "zahlungsart"
    werte = [c.value for c in wb["Listen"]["A"][1:] if c.value]
    assert {"Überweisung", "PayPal", "Bar", "Karte"} <= set(werte)
    validierungen = {
        str(next(iter(v.sqref.ranges)).coord)[0]: v
        for v in wb["Zahlungen"].data_validations.dataValidation
    }
    assert validierungen["C"].errorStyle == "stop"  # zahlungsart = Spalte C
    assert validierungen["E"].errorStyle == "warning"  # verwendungszweck = Spalte E
    assert validierungen["C"].formula1.startswith("=Listen!$A$2:$A$")


def test_inaktiver_wert_verschwindet_aus_dropdown_bleibt_aber_importierbar():
    from apps.cotisations.imports_zahlungen import construire_classeur_template_zahlungen
    from apps.cotisations.models import ImportListenWert

    ImportListenWert.objects.filter(bezeichnung="Karte").update(aktiv=False)
    wb = construire_classeur_template_zahlungen()
    assert "Karte" not in [c.value for c in wb["Listen"]["A"]]
    analyse = analyser_zahlungen(_xlsx([["15.03.2026", 10, "Karte", "", "", "", "", "", ""]]))
    assert _z(analyse)[2].daten["modus"] == ModePaiement.CARTE


def test_eigener_listenwert_wird_auf_modus_abgebildet():
    from apps.cotisations.models import ImportListenWert

    ImportListenWert.objects.create(
        liste="zahlungsart", bezeichnung="Lastschrift", modus="virement_sepa"
    )
    analyse = analyser_zahlungen(_xlsx([["15.03.2026", 10, "lastschrift", "", "", "", "", "", ""]]))
    assert _z(analyse)[2].daten["modus"] == ModePaiement.VIREMENT_SEPA


def test_api_listenwerte_crud_und_validierung(fin_client):
    url = reverse("cotisations:import-listenwert-list")
    liste = fin_client.get(url, {"liste": "zahlungsart"})
    assert liste.status_code == 200
    assert len(liste.data) == 4
    ohne_modus = fin_client.post(url, {"liste": "zahlungsart", "bezeichnung": "Scheck"})
    assert ohne_modus.status_code == 400
    neu = fin_client.post(
        url, {"liste": "zahlungsart", "bezeichnung": "Scheck", "modus": "especes"}
    )
    assert neu.status_code == 201, neu.data
    doppelt = fin_client.post(
        url, {"liste": "zahlungsart", "bezeichnung": "scheck", "modus": "especes"}
    )
    assert doppelt.status_code == 400
    zweck = fin_client.post(
        url, {"liste": "verwendungszweck", "bezeichnung": "Fanartikel", "modus": "paypal"}
    )
    assert zweck.status_code == 201 and zweck.data["modus"] == ""
    detail = reverse("cotisations:import-listenwert-detail", args=[neu.data["id"]])
    assert fin_client.patch(detail, {"aktiv": False}).status_code == 200
    assert fin_client.delete(detail).status_code == 204


def test_api_listenwerte_ohne_matrix_recht_verweigert():
    user = User.objects.create_user(
        email="rh-liste@example.de", password="Password123!", role=Role.RH, is_active=True
    )
    client = APIClient()
    client.force_authenticate(user=user)
    assert client.get(reverse("cotisations:import-listenwert-list")).status_code == 403
