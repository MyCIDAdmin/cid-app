"""Tests — Ausbau Business Partner : Kontakte, Logo, Dokumente, Logos auf Seiten, Erinnerungen,
Angebotsvergleich, Import aus Ausgaben, Ausgaben je Partner."""

import datetime
import io
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.urls import reverse
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.evenements.tests.factories import EvenementFactory
from apps.finances.models import CategorieDepense, Depense, StatutDepense
from apps.notifications.models import Notification, TypeNotification
from apps.partenaires.models import (
    Angebot,
    AngebotStatus,
    DokumentTyp,
    Partner,
    PartnerDokument,
    PartnerKontakt,
    PartnerVerknuepfung,
    VerknuepfungRolle,
)
from apps.partenaires.tasks import erinnere_partner
from apps.projets.models import StatutProjet
from apps.projets.tests.factories import ProjetFactory

pytestmark = pytest.mark.django_db

PDF = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n"


def _client(role, email=None):
    user = User.objects.create_user(
        email=email or f"{role}@example.com", password="Password123!", role=role, is_active=True
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


@pytest.fixture
def bureau():
    return _client(Role.BUREAU_ADMIN)


def _partner(nom="Muster Catering", **kw):
    return Partner.objects.create(nom=nom, **kw)


def _png(name="logo.png"):
    buf = io.BytesIO()
    Image.new("RGB", (40, 40), "red").save(buf, format="PNG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")


def _pdf(name="vertrag.pdf"):
    return SimpleUploadedFile(name, PDF, content_type="application/pdf")


def _dokument(partner, **kw):
    kw.setdefault("typ", DokumentTyp.VERTRAG)
    kw.setdefault("titel", "Rahmenvertrag")
    return PartnerDokument.objects.create(
        partner=partner, datei=SimpleUploadedFile("v.pdf", PDF), **kw
    )


# --- Kontakte -------------------------------------------------------------------------------


def test_erster_kontakt_wird_hauptkontakt_und_wechsel(bureau):
    client, _ = bureau
    partner = _partner()
    url = reverse("partenaires:kontakt-list")
    a = client.post(url, {"partner": str(partner.pk), "name": "Anna"}, format="json")
    assert a.status_code == 201, a.data
    assert a.data["hauptkontakt"] is True
    b = client.post(
        url, {"partner": str(partner.pk), "name": "Ben", "hauptkontakt": True}, format="json"
    )
    assert b.status_code == 201
    assert PartnerKontakt.objects.get(name="Anna").hauptkontakt is False
    assert PartnerKontakt.objects.get(name="Ben").hauptkontakt is True
    # Hauptkontakt wechselt per PATCH zurück
    resp = client.patch(
        reverse("partenaires:kontakt-detail", args=[a.data["id"]]),
        {"hauptkontakt": True},
        format="json",
    )
    assert resp.status_code == 200
    assert PartnerKontakt.objects.filter(partner=partner, hauptkontakt=True).count() == 1
    assert PartnerKontakt.objects.get(name="Anna").hauptkontakt is True


def test_kontakt_loeschen_und_partner_zeigt_hauptkontakt(bureau):
    client, _ = bureau
    partner = _partner()
    PartnerKontakt.objects.create(partner=partner, name="Zoe", hauptkontakt=True)
    resp = client.get(reverse("partenaires:partner-detail", args=[partner.pk]))
    assert resp.status_code == 200
    assert resp.data["hauptkontakt_name"] == "Zoe"
    assert len(resp.data["kontakte"]) == 1
    kontakt = PartnerKontakt.objects.get()
    assert (
        client.delete(reverse("partenaires:kontakt-detail", args=[kontakt.pk])).status_code == 204
    )


def test_kontakt_suche_und_rh_darf_nicht_schreiben():
    client, _ = _client(Role.RH)
    partner = _partner()
    resp = client.post(
        reverse("partenaires:kontakt-list"),
        {"partner": str(partner.pk), "name": "X"},
        format="json",
    )
    assert resp.status_code == 403


def test_suche_findet_kontaktnamen(bureau):
    client, _ = bureau
    partner = _partner("Firma A")
    PartnerKontakt.objects.create(partner=partner, name="Hildegard Meier")
    _partner("Firma B")
    resp = client.get(reverse("partenaires:partner-list"), {"q": "hildegard"})
    assert [p["nom"] for p in resp.data] == ["Firma A"]


# --- Logo -----------------------------------------------------------------------------------


def test_logo_hochladen_und_entfernen(bureau):
    client, _ = bureau
    partner = _partner()
    url = reverse("partenaires:partner-logo", args=[partner.pk])
    resp = client.post(url, {"logo": _png()}, format="multipart")
    assert resp.status_code == 200, resp.data
    assert resp.data["logo_url"]
    partner.refresh_from_db()
    assert partner.logo
    assert client.delete(url).status_code == 200
    partner.refresh_from_db()
    assert not partner.logo


def test_logo_ungueltige_datei_abgelehnt(bureau):
    client, _ = bureau
    partner = _partner()
    url = reverse("partenaires:partner-logo", args=[partner.pk])
    falsch = SimpleUploadedFile("x.png", b"kein bild", content_type="image/png")
    assert client.post(url, {"logo": falsch}, format="multipart").status_code == 400


# --- Dokumente ------------------------------------------------------------------------------


def test_dokument_hochladen_patch_loeschen(bureau):
    client, user = bureau
    partner = _partner()
    url = reverse("partenaires:partner-dokumente", args=[partner.pk])
    resp = client.post(
        url,
        {
            "datei": _pdf(),
            "titel": "Rahmenvertrag 2027",
            "typ": "vertrag",
            "gueltig_bis": "2027-06-30",
        },
        format="multipart",
    )
    assert resp.status_code == 201, resp.data
    dok = PartnerDokument.objects.get()
    assert dok.hochgeladen_von == user
    assert resp.data["datei_url"]
    assert len(client.get(url).data) == 1

    dok.erinnert_60 = dok.erinnert_14 = True
    dok.save()
    detail = reverse("partenaires:dokument", args=[dok.pk])
    resp = client.patch(detail, {"gueltig_bis": "2028-01-31"}, format="json")
    assert resp.status_code == 200
    dok.refresh_from_db()
    assert dok.gueltig_bis == datetime.date(2028, 1, 31)
    assert dok.erinnert_60 is False and dok.erinnert_14 is False

    assert client.delete(detail).status_code == 204
    assert not PartnerDokument.objects.exists()


def test_dokument_falsches_format_und_ohne_datei(bureau):
    client, _ = bureau
    partner = _partner()
    url = reverse("partenaires:partner-dokumente", args=[partner.pk])
    exe = SimpleUploadedFile("x.pdf", b"MZ\x90\x00\x03\x00\x00\x00", content_type="application/pdf")
    assert client.post(url, {"datei": exe, "titel": "X"}, format="multipart").status_code == 400
    assert client.post(url, {"titel": "X"}, format="multipart").status_code == 400


# --- Verknüpfung: Logo-Haken ------------------------------------------------------------------


def test_verknuepfung_logo_standard_nach_rolle_und_patch(bureau):
    client, _ = bureau
    partner = _partner()
    projet = ProjetFactory()
    url = reverse("partenaires:partner-verknuepfen", args=[partner.pk])

    def verknuepfen(rolle, **extra):
        return client.post(
            url,
            {"ziel_typ": "projet", "ziel_id": str(projet.pk), "rolle": rolle, **extra},
            format="json",
        )

    sponsor = verknuepfen("sponsor")
    assert sponsor.status_code == 201, sponsor.data
    assert sponsor.data["logo_anzeigen"] is True
    assert verknuepfen("lieferant").data["logo_anzeigen"] is False
    explizit = verknuepfen("location", logo_anzeigen=True)
    assert explizit.data["logo_anzeigen"] is True

    resp = client.patch(
        reverse("partenaires:verknuepfung-loeschen", args=[sponsor.data["id"]]),
        {"logo_anzeigen": False},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["logo_anzeigen"] is False


def _mit_logo(partner):
    partner.logo.save("l.png", _png(), save=True)


def test_partner_logos_in_projekt_und_veranstaltung():
    sichtbar = _partner("Sichtbar GmbH")
    _mit_logo(sichtbar)
    versteckt = _partner("Versteckt AG")
    _mit_logo(versteckt)
    ohne_logo = _partner("Ohne Logo")
    archiviert = _partner("Archiv", statut="archiviert")
    _mit_logo(archiviert)
    projet = ProjetFactory()
    event = EvenementFactory()
    for partner, anzeigen in [
        (sichtbar, True),
        (versteckt, False),
        (ohne_logo, True),
        (archiviert, True),
    ]:
        for ziel in ({"projet": projet}, {"evenement": event}):
            PartnerVerknuepfung.objects.create(
                partner=partner, rolle=VerknuepfungRolle.SPONSOR, logo_anzeigen=anzeigen, **ziel
            )
    # zweite Verknüpfung desselben Partners erzeugt keinen doppelten Eintrag
    PartnerVerknuepfung.objects.create(
        partner=sichtbar, rolle=VerknuepfungRolle.KOOPERATION, logo_anzeigen=True, projet=projet
    )

    client, _ = _client(Role.MEMBRE, "mitglied@example.com")
    detail = client.get(reverse("projets:projet-detail", args=[projet.pk]))
    assert detail.status_code == 200, detail.data
    assert [p["nom"] for p in detail.data["partner_logos"]] == ["Sichtbar GmbH"]
    assert detail.data["partner_logos"][0]["logo_url"]

    ev = client.get(reverse("evenements:evenement-detail", args=[event.pk]))
    assert ev.status_code == 200, ev.data
    assert [p["nom"] for p in ev.data["partner_logos"]] == ["Sichtbar GmbH"]


# --- Erinnerungen ---------------------------------------------------------------------------


def _erinnerungen(typ):
    return Notification.objects.filter(type_notification=typ)


def test_vertragsende_erinnerung_60_und_14_tage(bureau):
    _, ersteller = bureau
    admin2, _u = _client(Role.DIR_FINANCIER, "fin@example.com")
    partner = _partner("Vertrag GmbH")
    heute = datetime.date(2026, 10, 7)
    dok = _dokument(partner, gueltig_bis=heute + datetime.timedelta(days=55))
    dok.hochgeladen_von = ersteller
    dok.save()

    ergebnis = erinnere_partner(today=heute)
    assert ergebnis["vertragsende"] == 1
    # Ersteller (= Bureau Admin) und Dir. Financier, je einmal
    assert _erinnerungen(TypeNotification.PARTNER_VERTRAGSENDE).count() == 2
    # am selben Tag nicht erneut
    assert erinnere_partner(today=heute)["vertragsende"] == 0
    # 14-Tage-Schwelle
    ergebnis = erinnere_partner(today=heute + datetime.timedelta(days=45))
    assert ergebnis["vertragsende"] == 1
    assert _erinnerungen(TypeNotification.PARTNER_VERTRAGSENDE).count() == 4
    assert erinnere_partner(today=heute + datetime.timedelta(days=46))["vertragsende"] == 0


def test_vertragsende_ignoriert_andere_typen_vergangene_und_archivierte(bureau):
    heute = datetime.date(2026, 10, 7)
    partner = _partner()
    _dokument(partner, typ=DokumentTyp.ANGEBOT, gueltig_bis=heute + datetime.timedelta(days=10))
    _dokument(partner, gueltig_bis=heute - datetime.timedelta(days=1))
    _dokument(partner, gueltig_bis=heute + datetime.timedelta(days=90))
    archiv = _partner("Archiv", statut="archiviert")
    _dokument(archiv, gueltig_bis=heute + datetime.timedelta(days=10))
    assert erinnere_partner(today=heute)["vertragsende"] == 0


def test_bewertungserinnerung_nach_veranstaltungsende(bureau):
    _, ersteller = bureau
    heute = datetime.date(2026, 10, 7)
    partner = _partner("Lecker GmbH")
    event = EvenementFactory(date_evenement=heute - datetime.timedelta(days=2))
    PartnerVerknuepfung.objects.create(
        partner=partner, evenement=event, rolle=VerknuepfungRolle.LIEFERANT, created_by=ersteller
    )
    assert erinnere_partner(today=heute)["bewertung"] == 1
    assert _erinnerungen(TypeNotification.PARTNER_BEWERTUNG).count() == 1
    assert erinnere_partner(today=heute)["bewertung"] == 0  # nur einmal


def test_bewertungserinnerung_nicht_bei_laufendem_altem_oder_bewertetem(bureau):
    heute = datetime.date(2026, 10, 7)
    partner = _partner()
    laufend = EvenementFactory(date_evenement=heute + datetime.timedelta(days=3))
    alt = EvenementFactory(date_evenement=heute - datetime.timedelta(days=60))
    bewertet = EvenementFactory(date_evenement=heute - datetime.timedelta(days=2))
    for ev in (laufend, alt, bewertet):
        v = PartnerVerknuepfung.objects.create(partner=partner, evenement=ev)
        if ev == bewertet:
            v.bewertungen.create(
                partner=partner,
                qualitaet=5,
                preis_leistung=5,
                zuverlaessigkeit=5,
                kommunikation=5,
            )
    assert erinnere_partner(today=heute)["bewertung"] == 0


def test_bewertungserinnerung_projekt_frist_ueberschritten(bureau):
    heute = datetime.date(2026, 10, 7)
    partner = _partner()
    projet = ProjetFactory(
        statut=StatutProjet.EN_COURS, date_limite=heute - datetime.timedelta(days=3)
    )
    PartnerVerknuepfung.objects.create(partner=partner, projet=projet)
    offen = ProjetFactory(statut=StatutProjet.EN_COURS, date_limite=None)
    PartnerVerknuepfung.objects.create(partner=partner, projet=offen)
    assert erinnere_partner(today=heute)["bewertung"] == 1


# --- Angebotsvergleich ----------------------------------------------------------------------


def _angebot(client, projet, partner, betrag, **kw):
    return client.post(
        reverse("partenaires:angebot-list"),
        {"projet": str(projet.pk), "partner": str(partner.pk), "betrag": betrag, **kw},
        format="json",
    )


def test_angebote_liste_sortiert_nach_betrag_mit_note(bureau):
    client, _ = bureau
    projet = ProjetFactory()
    teuer, billig = _partner("Teuer"), _partner("Billig")
    billig.bewertungen.create(qualitaet=4, preis_leistung=4, zuverlaessigkeit=4, kommunikation=4)
    assert _angebot(client, projet, teuer, "900.00").status_code == 201
    assert _angebot(client, projet, billig, "500.00", beschreibung="Basis").status_code == 201
    resp = client.get(reverse("partenaires:angebot-list"), {"projet": str(projet.pk)})
    assert resp.status_code == 200
    assert [a["partner_name"] for a in resp.data] == ["Billig", "Teuer"]
    assert resp.data[0]["partner_note"] == 4.0
    assert resp.data[1]["partner_note"] is None
    # Liste ohne Projekt ist ein Fehler
    assert client.get(reverse("partenaires:angebot-list")).status_code == 400


def test_zuschlag_markiert_lehnt_ab_und_verknuepft(bureau):
    client, _ = bureau
    projet = ProjetFactory()
    a, b = _partner("A"), _partner("B")
    ang_a = _angebot(client, projet, a, "100.00").data
    ang_b = _angebot(client, projet, b, "200.00").data
    resp = client.post(reverse("partenaires:angebot-zuschlag", args=[ang_a["id"]]))
    assert resp.status_code == 200, resp.data
    assert resp.data["status"] == AngebotStatus.ZUSCHLAG
    assert Angebot.objects.get(pk=ang_b["id"]).status == AngebotStatus.ABGELEHNT
    assert PartnerVerknuepfung.objects.filter(
        partner=a, projet=projet, rolle=VerknuepfungRolle.LIEFERANT
    ).exists()
    # Zuschlag erneut vergeben ist idempotent und erzeugt keine zweite Verknüpfung
    client.post(reverse("partenaires:angebot-zuschlag", args=[ang_b["id"]]))
    assert Angebot.objects.get(pk=ang_a["id"]).status == AngebotStatus.ABGELEHNT
    assert Angebot.objects.filter(projet=projet, status=AngebotStatus.ZUSCHLAG).count() == 1
    # Zurücksetzen
    client.post(reverse("partenaires:angebot-zuruecksetzen", args=[ang_b["id"]]))
    assert set(Angebot.objects.values_list("status", flat=True)) == {AngebotStatus.OFFEN}


def test_angebot_aendern_und_loeschen_regeln(bureau):
    client, _ = bureau
    projet = ProjetFactory()
    partner = _partner()
    ang = _angebot(client, projet, partner, "100.00").data
    detail = reverse("partenaires:angebot-detail", args=[ang["id"]])
    assert client.patch(detail, {"betrag": "90.00"}, format="json").status_code == 200
    client.post(reverse("partenaires:angebot-zuschlag", args=[ang["id"]]))
    assert client.patch(detail, {"betrag": "80.00"}, format="json").status_code == 400
    assert client.delete(detail).status_code == 400
    client.post(reverse("partenaires:angebot-zuruecksetzen", args=[ang["id"]]))
    assert client.delete(detail).status_code == 204


def test_angebot_dokument_muss_zum_partner_gehoeren(bureau):
    client, _ = bureau
    projet = ProjetFactory()
    a, b = _partner("A"), _partner("B")
    fremd = _dokument(b, typ=DokumentTyp.ANGEBOT)
    resp = _angebot(client, projet, a, "10.00", dokument=str(fremd.pk))
    assert resp.status_code == 400
    eigenes = _dokument(a, typ=DokumentTyp.ANGEBOT)
    assert _angebot(client, projet, a, "10.00", dokument=str(eigenes.pk)).status_code == 201


def test_nur_ein_zuschlag_je_projekt_in_der_datenbank():
    projet = ProjetFactory()
    a, b = _partner("A"), _partner("B")
    Angebot.objects.create(projet=projet, partner=a, betrag=Decimal("1"), status="zuschlag")
    with pytest.raises(IntegrityError), transaction.atomic():
        Angebot.objects.create(projet=projet, partner=b, betrag=Decimal("2"), status="zuschlag")


def test_rh_darf_angebote_lesen_nicht_schreiben():
    client, _ = _client(Role.RH)
    projet = ProjetFactory()
    partner = _partner()
    assert (
        client.get(reverse("partenaires:angebot-list"), {"projet": str(projet.pk)}).status_code
        == 200
    )
    assert _angebot(client, projet, partner, "5.00").status_code == 403


# --- Ausgaben je Partner + Import -----------------------------------------------------------


def _ausgabe(fournisseur="", partner=None, montant="20.00", **kw):
    return Depense.objects.create(
        date_depense=datetime.date(2026, 4, 2),
        montant=Decimal(montant),
        categorie=CategorieDepense.objects.filter(actif=True).first(),
        fournisseur=fournisseur,
        partner=partner,
        statut=StatutDepense.APPROUVEE,
        **kw,
    )


def test_import_vorschau_schreibt_nichts(bureau):
    client, _ = bureau
    _ausgabe("Druckerei Meier", montant="30.00")
    _ausgabe("Druckerei Meier", montant="5.00")
    _ausgabe("  druckerei   meier ", montant="5.00")
    _ausgabe("Catering Schmidt")
    _ausgabe("")
    resp = client.post(reverse("partenaires:import-ausgaben"), {}, format="json")
    assert resp.status_code == 200
    assert resp.data["bestaetigt"] is False
    gruppen = {g["name"]: g for g in resp.data["gruppen"]}
    assert len(gruppen) == 2
    assert gruppen["Druckerei Meier"]["anzahl"] == 3
    assert gruppen["Druckerei Meier"]["summe"] == 40.0
    assert all(g["neu"] for g in gruppen.values())
    assert not Partner.objects.exists()
    assert not Depense.objects.exclude(partner=None).exists()


def test_import_bestaetigen_legt_an_und_verknuepft_vorhandene(bureau):
    client, _ = bureau
    vorhanden = _partner("Catering Schmidt", typ="partner")
    _ausgabe("Druckerei Meier")
    _ausgabe("druckerei meier")
    _ausgabe("Catering Schmidt")
    resp = client.post(reverse("partenaires:import-ausgaben"), {"bestaetigen": True}, format="json")
    assert resp.status_code == 200, resp.data
    assert resp.data["partner_neu"] == 1
    assert resp.data["ausgaben_verknuepft"] == 3
    neu = Partner.objects.get(nom="Druckerei Meier")
    assert neu.typ == "lieferant"
    assert Depense.objects.filter(partner=neu).count() == 2
    assert Depense.objects.filter(partner=vorhanden).count() == 1
    # zweiter Lauf: nichts mehr zu tun
    again = client.post(
        reverse("partenaires:import-ausgaben"), {"bestaetigen": True}, format="json"
    )
    assert again.data["gruppen"] == []
    assert again.data["partner_neu"] == 0


def test_import_nur_ab_bureau_admin():
    client, _ = _client(Role.RH)
    resp = client.post(reverse("partenaires:import-ausgaben"), {}, format="json")
    assert resp.status_code == 403


def test_depense_mit_partner_uebernimmt_namen_und_pivot_nach_partner(bureau):
    partner = _partner("Druckerei Meier")
    ausgabe = _ausgabe("", partner=partner, montant="25.00")
    _ausgabe("Freitext AG", montant="5.00")
    assert ausgabe.partner == partner

    fin, _ = _client(Role.DIR_FINANCIER, "fin2@example.com")
    kategorie = CategorieDepense.objects.filter(actif=True).first()
    resp = fin.post(
        "/api/v1/finances/depenses/",
        {
            "date_depense": "2026-05-01",
            "montant": "12.50",
            "categorie": kategorie.pk,
            "partner": str(partner.pk),
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["fournisseur"] == "Druckerei Meier"
    assert resp.data["partner_name"] == "Druckerei Meier"
    # Weder Partner noch Lieferant => Fehler
    resp = fin.post(
        "/api/v1/finances/depenses/",
        {"date_depense": "2026-05-01", "montant": "1.00", "categorie": kategorie.pk},
        format="json",
    )
    assert resp.status_code == 400

    daten = fin.get(
        reverse("stats:pivot"),
        {"zeilen": "partner", "kennzahlen": "ausgaben", "jahr": 2026},
    ).json()
    labels = {z["label"] for z in daten["zeilen"]}
    assert "Druckerei Meier" in labels
    optionen = fin.get(reverse("stats:pivot-optionen")).json()
    assert "Druckerei Meier" in optionen["partner"]
