"""Familienpaket (Release 34/35) : Kombination bestehender Angebote, Familienrabatt, Personen mit
Beziehung, Einladung der Erwachsenen, Finanzen, Büro, Anonymisierung, Übernahme, Bericht."""

import datetime
from decimal import Decimal

import pytest
from django.core import mail
from django.urls import reverse
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.adhesions import familie
from apps.adhesions.models import (
    EinladungStatus,
    FamilienErwachsener,
    FamilienKind,
    Souscription,
    StatutSouscription,
)
from apps.adhesions.tasks import anonymisiere_familiendaten, sende_familien_erinnerungen
from apps.adhesions.tests.factories import (
    CampagneAdhesionFactory,
    OffreAdhesionFactory,
    RabaisOffreFactory,
    SouscriptionFactory,
)
from apps.membres.models import StatutMembre
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db

SOUSCRIRE = "adhesions:souscription-souscrire"
JAHR = timezone.localdate().year


def _client(user=None):
    c = APIClient()
    if user is not None:
        c.force_authenticate(user)
    return c


def _person(role=Role.MEMBRE, email="haupt@example.de", statut=StatutMembre.ACTIF):
    user = User.objects.create_user(email=email, password="Password123!", is_active=True, role=role)
    membre = MembreFactory(user=user, email=email, cin="12345678", statut=statut)
    return user, membre


class Aufbau:
    """Kampagne mit CID-PLUS (50), CID-JUNIOR (10) und einem Familienpaket (Rabatt 10 %)."""

    def __init__(self, rabatt="10", max_alter=17, annee=JAHR, **kw):
        self.kampagne = CampagneAdhesionFactory(annee=annee, familie_max_alter_kind=max_alter)
        self.plus = OffreAdhesionFactory(
            campagne=self.kampagne, nom="CID-PLUS", prix_plein=Decimal("50.00")
        )
        self.junior = OffreAdhesionFactory(
            campagne=self.kampagne, nom="CID-JUNIOR", prix_plein=Decimal("10.00")
        )
        werte = dict(
            campagne=self.kampagne,
            nom="Familie",
            prix_plein=Decimal("50.00"),
            ist_familienpaket=True,
            familie_rabatt_pct=Decimal(rabatt),
            familie_angebot_hauptperson=self.plus,
            familie_angebot_erwachsene=self.plus,
            familie_angebot_kinder=self.junior,
            max_erwachsene=2,
            max_kinder=4,
        )
        werte.update(kw)
        self.paket = OffreAdhesionFactory(**werte)


def _erw(email="partner@example.de", **kw):
    return {
        "vorname": "Nora",
        "nachname": "Muster",
        "email": email,
        "beziehung": "ehepartner",
        **kw,
    }


def _kind(jahr=None, **kw):
    return {
        "vorname": "Lina",
        "nachname": "Muster",
        "geburtsjahr": JAHR - 8 if jahr is None else jahr,
        "beziehung": "kind",
        "einwilligung": True,
        **kw,
    }


def _buchen(user, offre, erwachsene=(), kinder=(), **extra):
    return _client(user).post(
        reverse(SOUSCRIRE),
        {"offre": str(offre.id), "erwachsene": list(erwachsene), "kinder": list(kinder), **extra},
        format="json",
    )


def _bezahlen(souscription_id, capture):
    s = Souscription.objects.get(pk=souscription_id)
    with capture(execute=True):
        s.statut = StatutSouscription.PAYEE
        s.save()
    return s


def _paket_zahlen(a, capture, erwachsene=None, kinder=2, email="haupt@example.de"):
    user, membre = _person(email=email)
    erw = [_erw()] if erwachsene is None else list(erwachsene)
    antwort = _buchen(user, a.paket, erw, [_kind(vorname=f"K{i}") for i in range(kinder)])
    assert antwort.status_code == 200, antwort.data
    s = _bezahlen(antwort.data["id"], capture)
    return user, membre, s


def _an(adresse):
    return [m for m in mail.outbox if adresse in m.to]


# --- Konfiguration ---------------------------------------------------------------------------


def test_konfiguration_braucht_zugewiesene_angebote():
    a = Aufbau(familie_angebot_hauptperson=None, familie_angebot_erwachsene=None)
    with pytest.raises(ValidationError):
        familie.pruefe_konfiguration(a.paket)


def test_konfiguration_kinderangebot_pflicht_wenn_kinder_erlaubt():
    a = Aufbau(familie_angebot_kinder=None)
    with pytest.raises(ValidationError):
        familie.pruefe_konfiguration(a.paket)
    a.paket.max_kinder = 0
    familie.pruefe_konfiguration(a.paket)


def test_konfiguration_nur_normale_angebote_derselben_kampagne():
    a = Aufbau()
    a.paket.familie_angebot_kinder = OffreAdhesionFactory(prix_plein=Decimal("5.00"))
    with pytest.raises(ValidationError):
        familie.pruefe_konfiguration(a.paket)
    a.paket.familie_angebot_kinder = a.paket
    with pytest.raises(ValidationError):
        familie.pruefe_konfiguration(a.paket)


def test_api_lehnt_unvollstaendiges_familienpaket_ab():
    a = Aufbau()
    admin = User.objects.create_user(
        email="admin@example.de", password="x", is_active=True, role=Role.SUPER_ADMIN
    )
    url = reverse("adhesions:offre-detail", args=[a.junior.id])
    assert _client(admin).patch(url, {"ist_familienpaket": True}, format="json").status_code == 400


# --- Preis aus Angeboten minus Familienrabatt -------------------------------------------------


def test_preis_ist_summe_der_angebote_minus_rabatt_prozent():
    paket = familie.berechne_paket(Aufbau().paket, 1, 2)
    assert paket.liste_gesamt == Decimal("120.00")  # 50 + 50 + 10 + 10
    assert paket.gesamt == Decimal("108.00")
    assert [p.anteil for p in paket.positionen] == [
        Decimal("45.00"),
        Decimal("45.00"),
        Decimal("9.00"),
        Decimal("9.00"),
    ]


def test_hauptperson_ohne_eigene_zuweisung_erhaelt_das_erwachsenenangebot():
    a = Aufbau(familie_angebot_hauptperson=None)
    assert familie.berechne_paket(a.paket, 0, 0).positionen[0].angebot == a.plus


def test_buchen_berechnet_preis_auf_dem_server_und_legt_personen_an():
    a = Aufbau()
    user, _ = _person()
    antwort = _buchen(user, a.paket, [_erw()], [_kind(), _kind(vorname="Ben")])
    assert antwort.status_code == 200, antwort.data
    assert antwort.data["prix_paye"] == "108.00"
    assert antwort.data["plaetze_erwachsene"] == 1 and antwort.data["plaetze_kinder"] == 2
    assert [k["kartennummer"][-2:] for k in antwort.data["kinder"]] == ["J1", "J2"]
    assert {k["angebot"] for k in antwort.data["kinder"]} == {"CID-JUNIOR"}
    erw = antwort.data["erwachsene"][0]
    assert erw["status"] == EinladungStatus.OFFEN  # vor der Zahlung keine Einladung
    assert erw["preis_anteil"] == "45.00"
    assert antwort.data["familien_info"]["gesamtpreis"] == "108.00"
    assert not _an("partner@example.de")
    kind = FamilienKind.objects.first()
    assert kind.einwilligung_von == user and kind.einwilligung_version


def test_erneutes_buchen_ersetzt_die_personen():
    a = Aufbau()
    user, _ = _person()
    _buchen(user, a.paket, [_erw()], [_kind()])
    antwort = _buchen(user, a.paket, [], [_kind(), _kind(vorname="Ben")])
    assert antwort.status_code == 200
    assert antwort.data["prix_paye"] == "63.00"  # (50 + 10 + 10) − 10 %
    assert FamilienErwachsener.objects.count() == 0
    assert FamilienKind.objects.count() == 2


def test_familienpaket_ohne_weitere_person_wird_abgelehnt():
    user, _ = _person()
    assert _buchen(user, Aufbau().paket).status_code == 400
    assert Souscription.objects.count() == 0


def test_ungueltige_person_bricht_die_ganze_buchung_ab():
    user, _ = _person()
    antwort = _buchen(user, Aufbau().paket, [_erw(email="keine-mail")], [_kind()])
    assert antwort.status_code == 400
    assert Souscription.objects.count() == 0 and FamilienKind.objects.count() == 0


def test_mehr_personen_als_erlaubt_wird_abgelehnt():
    a = Aufbau(max_erwachsene=1, max_kinder=1)
    user, _ = _person()
    assert _buchen(user, a.paket, [_erw(), _erw("b@example.de")]).status_code == 400
    assert _buchen(user, a.paket, [], [_kind(), _kind()]).status_code == 400


def test_rabais_auf_familienpaket_wird_abgelehnt():
    a = Aufbau()
    rabais = RabaisOffreFactory(
        offre=a.paket,
        montant_reduction=None,
        pct_reduction=Decimal("10"),
        justificatif_requis=False,
    )
    user, _ = _person()
    assert _buchen(user, a.paket, [_erw()], rabais=str(rabais.id)).status_code == 400


def test_bezahltes_paket_bleibt_unveraendert(django_capture_on_commit_callbacks):
    a = Aufbau()
    user, _, _ = _paket_zahlen(a, django_capture_on_commit_callbacks)
    assert _buchen(user, a.paket, [_erw("x@example.de")]).status_code == 403


def test_doppelte_oder_eigene_email_wird_abgelehnt():
    a = Aufbau()
    user, _ = _person()
    assert _buchen(user, a.paket, [_erw(), _erw()]).status_code == 400
    assert _buchen(user, a.paket, [_erw("haupt@example.de")]).status_code == 400


def test_beziehung_pflicht_und_nur_erlaubte_werte():
    a = Aufbau()
    user, _ = _person()
    assert _buchen(user, a.paket, [_erw(beziehung="")]).status_code == 400
    assert _buchen(user, a.paket, [_erw(beziehung="freund")]).status_code == 400
    assert _buchen(user, a.paket, [], [_kind(beziehung="elternteil")]).status_code == 400
    for beziehung in ("ehepartner", "kind", "geschwister", "elternteil"):
        assert _buchen(user, a.paket, [_erw(beziehung=beziehung)]).status_code == 200
    assert _buchen(user, a.paket, [], [_kind(beziehung="geschwister")]).status_code == 200


def test_kindernamen_pflicht_einwilligung_und_laenge():
    a = Aufbau()
    user, _ = _person()
    assert _buchen(user, a.paket, [], [_kind(vorname=" ")]).status_code == 400
    assert _buchen(user, a.paket, [], [_kind(nachname="x" * 101)]).status_code == 400
    assert _buchen(user, a.paket, [], [_kind(einwilligung=False)]).status_code == 400
    assert _buchen(user, a.paket, [], [_kind(einwilligung="ja")]).status_code == 400
    assert FamilienKind.objects.count() == 0


def test_hoechstalter_gilt_je_kampagne():
    a = Aufbau(max_alter=12)
    user, _ = _person()
    jahr = a.kampagne.annee
    assert _buchen(user, a.paket, [], [_kind(jahr - 13)]).status_code == 400
    assert _buchen(user, a.paket, [], [_kind(jahr + 1)]).status_code == 400
    assert _buchen(user, a.paket, [], [_kind("abc")]).status_code == 400
    assert _buchen(user, a.paket, [], [_kind(jahr - 12)]).status_code == 200
    b = Aufbau(max_alter=17, annee=JAHR + 1)
    assert _buchen(user, b.paket, [], [_kind(b.kampagne.annee - 17)]).status_code == 200


def test_kinder_sind_keine_mitglieder():
    from apps.membres.models import Membre

    user, _ = _person()
    a = Aufbau()
    vorher = Membre.objects.count()
    _buchen(user, a.paket, [], [_kind()])
    assert Membre.objects.count() == vorher


# --- Einladung --------------------------------------------------------------------------------


def test_einladung_geht_erst_nach_der_zahlung_raus(django_capture_on_commit_callbacks):
    _paket_zahlen(Aufbau(), django_capture_on_commit_callbacks)
    e = FamilienErwachsener.objects.get()
    assert e.status == EinladungStatus.EINGELADEN and e.eingeladen_am
    gesendet = _an("partner@example.de")
    assert len(gesendet) == 1
    assert e.token in gesendet[0].body or e.token in str(gesendet[0].alternatives)


def test_einladung_ist_idempotent(django_capture_on_commit_callbacks):
    _, _, s = _paket_zahlen(Aufbau(), django_capture_on_commit_callbacks)
    familie.versende_einladungen(s.id)
    assert len(_an("partner@example.de")) == 1


def test_vorhandenes_konto_wartet_auf_zustimmung(django_capture_on_commit_callbacks):
    _person(email="partner@example.de")
    _paket_zahlen(Aufbau(), django_capture_on_commit_callbacks)
    e = FamilienErwachsener.objects.get()
    assert e.status == EinladungStatus.ZUSTIMMUNG_OFFEN
    assert e.membre is None  # nichts wird still verknüpft


def test_oeffentliche_einladungsseite_zeigt_nur_das_noetige(django_capture_on_commit_callbacks):
    _paket_zahlen(Aufbau(), django_capture_on_commit_callbacks)
    e = FamilienErwachsener.objects.get()
    antwort = _client().get(reverse("adhesions:einladung", args=[e.token]))
    assert antwort.status_code == 200
    assert antwort.data["angebot"] == "CID-PLUS" and antwort.data["bezahlt"] is True
    assert antwort.data["konto_vorhanden"] is False
    assert "preis_anteil" not in antwort.data
    assert _client().get(reverse("adhesions:einladung", args=["falsch"])).status_code == 404


def test_annehmen_macht_die_person_zum_mitglied_mit_zugewiesenem_angebot(
    django_capture_on_commit_callbacks,
):
    a = Aufbau()
    partner, pm = _person(email="partner@example.de", statut=StatutMembre.EN_ATTENTE)
    _, _, s = _paket_zahlen(a, django_capture_on_commit_callbacks)
    e = FamilienErwachsener.objects.get()
    antwort = _client(partner).post(reverse("adhesions:einladung-annehmen", args=[e.token]))
    assert antwort.status_code == 200, antwort.data
    e.refresh_from_db()
    assert e.status == EinladungStatus.ANGENOMMEN and e.membre == pm
    pm.refresh_from_db()
    assert pm.statut == StatutMembre.ACTIF
    sub = Souscription.objects.get(membre=pm, campagne=a.kampagne)
    assert sub.statut == StatutSouscription.PAYEE
    assert sub.offre == a.plus and sub.bezahlt_ueber_id == s.id
    assert sub.prix_paye == Decimal("45.00")
    assert _an("haupt@example.de")  # Antwort an die Hauptperson


def test_finanzen_summe_der_souscriptions_ist_der_bezahlte_betrag(
    django_capture_on_commit_callbacks,
):
    from apps.stats.services import kpis_financier

    a = Aufbau()
    partner, _ = _person(email="partner@example.de")
    _, _, s = _paket_zahlen(a, django_capture_on_commit_callbacks)
    e = FamilienErwachsener.objects.get()
    vor = kpis_financier(annee=a.kampagne.annee)
    _client(partner).post(reverse("adhesions:einladung-annehmen", args=[e.token]))
    s.refresh_from_db()
    assert s.familien_gesamtpreis == Decimal("108.00")
    assert s.prix_paye == Decimal("63.00")  # eigener Anteil 45 + zwei Kinder à 9
    summe = sum(
        x.prix_paye
        for x in Souscription.objects.filter(campagne=a.kampagne, statut=StatutSouscription.PAYEE)
    )
    assert summe == Decimal("108.00")
    nach = kpis_financier(annee=a.kampagne.annee)
    assert nach["revenus_adhesions"] == vor["revenus_adhesions"]
    assert nach["familienrabatt"] == Decimal("12.00")  # 120 Liste − 108 gezahlt


def test_annehmen_mit_fremder_email_oder_ohne_login_scheitert(django_capture_on_commit_callbacks):
    fremd, _ = _person(email="fremd@example.de")
    _paket_zahlen(Aufbau(), django_capture_on_commit_callbacks)
    e = FamilienErwachsener.objects.get()
    url = reverse("adhesions:einladung-annehmen", args=[e.token])
    assert _client(fremd).post(url).status_code == 403
    assert _client().post(url).status_code in (401, 403)
    e.refresh_from_db()
    assert e.status == EinladungStatus.EINGELADEN


def test_hauptperson_kann_die_eigene_einladung_nicht_annehmen(django_capture_on_commit_callbacks):
    a = Aufbau()
    user, _ = _person(email="haupt@example.de")
    antwort = _buchen(user, a.paket, [_erw()])
    _bezahlen(antwort.data["id"], django_capture_on_commit_callbacks)
    e = FamilienErwachsener.objects.get()
    e.email = "haupt@example.de"
    e.save()
    url = reverse("adhesions:einladung-annehmen", args=[e.token])
    assert _client(user).post(url).status_code == 400


def test_ablehnen_ist_oeffentlich_und_informiert_die_hauptperson(
    django_capture_on_commit_callbacks,
):
    _paket_zahlen(Aufbau(), django_capture_on_commit_callbacks)
    e = FamilienErwachsener.objects.get()
    antwort = _client().post(reverse("adhesions:einladung-ablehnen", args=[e.token]))
    assert antwort.status_code == 200
    e.refresh_from_db()
    assert e.status == EinladungStatus.ABGELEHNT
    assert _an("haupt@example.de")
    partner, _ = _person(email="partner@example.de")
    url = reverse("adhesions:einladung-annehmen", args=[e.token])
    assert _client(partner).post(url).status_code == 400


def test_bereits_bezahlte_eigene_mitgliedschaft_ergibt_konflikt(
    django_capture_on_commit_callbacks,
):
    a = Aufbau()
    partner, pm = _person(email="partner@example.de")
    SouscriptionFactory(
        membre=pm, offre=a.plus, campagne=a.kampagne, statut=StatutSouscription.PAYEE
    )
    _, _, s = _paket_zahlen(a, django_capture_on_commit_callbacks)
    e = FamilienErwachsener.objects.get()
    _client(partner).post(reverse("adhesions:einladung-annehmen", args=[e.token]))
    e.refresh_from_db()
    assert e.status == EinladungStatus.KONFLIKT
    assert Souscription.objects.get(membre=pm, campagne=a.kampagne).bezahlt_ueber_id is None
    s.refresh_from_db()
    assert s.prix_paye == Decimal("108.00")  # die Hauptperson zahlt weiter alles


def test_unbezahlte_eigene_anmeldung_wird_ersetzt(django_capture_on_commit_callbacks):
    a = Aufbau()
    partner, pm = _person(email="partner@example.de")
    SouscriptionFactory(
        membre=pm,
        offre=a.junior,
        campagne=a.kampagne,
        statut=StatutSouscription.EN_ATTENTE_PAIEMENT,
        prix_paye=Decimal("10.00"),
    )
    _paket_zahlen(a, django_capture_on_commit_callbacks)
    e = FamilienErwachsener.objects.get()
    _client(partner).post(reverse("adhesions:einladung-annehmen", args=[e.token]))
    sub = Souscription.objects.get(membre=pm, campagne=a.kampagne)
    assert sub.statut == StatutSouscription.PAYEE and sub.offre == a.plus


def test_meine_einladungen_zeigt_nur_offene_fuer_die_eigene_adresse(
    django_capture_on_commit_callbacks,
):
    partner, _ = _person(email="partner@example.de")
    fremd, _ = _person(email="fremd@example.de")
    _paket_zahlen(Aufbau(), django_capture_on_commit_callbacks)
    url = reverse("adhesions:meine-einladungen")
    liste = _client(partner).get(url).data
    assert len(liste) == 1 and liste[0]["hauptperson"]
    assert _client(fremd).get(url).data == []


# --- Registrierung über den Einladungslink ----------------------------------------------------


def _registrierung(email, token=""):
    return {
        "email": email,
        "password": "Password123!",
        "langue_preferee": "de",
        "consentement_rgpd": True,
        "prenom": "Nora",
        "nom": "Muster",
        "date_naissance": "1990-05-12",
        "cin": "98765432",
        "telephone": "+49123456789",
        "adresse_de": "Friedrichstr. 42",
        "ville_de": "Berlin",
        "einladung_token": token,
    }


def test_registrierung_mit_einladung_macht_nach_email_bestaetigung_zum_mitglied(
    django_capture_on_commit_callbacks,
):
    from apps.accounts import services

    a = Aufbau()
    _paket_zahlen(a, django_capture_on_commit_callbacks)
    e = FamilienErwachsener.objects.get()
    client = _client()
    antwort = client.post(
        reverse("accounts:register"), _registrierung("partner@example.de", e.token), format="json"
    )
    assert antwort.status_code == 201, antwort.data
    user = User.objects.get(email="partner@example.de")
    code = services.generate_email_otp(user, purpose="email_verification")
    bestaetigung = client.post(
        reverse("accounts:register-confirm"), {"email": user.email, "code": code}, format="json"
    )
    assert bestaetigung.status_code == 200
    e.refresh_from_db()
    assert e.status == EinladungStatus.ANGENOMMEN and e.membre == user.membre
    sub = Souscription.objects.get(membre=user.membre, campagne=a.kampagne)
    assert sub.statut == StatutSouscription.PAYEE and sub.offre == a.plus


def test_registrierung_mit_falscher_adresse_oder_token_scheitert(
    django_capture_on_commit_callbacks,
):
    _paket_zahlen(Aufbau(), django_capture_on_commit_callbacks)
    e = FamilienErwachsener.objects.get()
    url = reverse("accounts:register")
    falsche_adresse = _registrierung("andere@example.de", e.token)
    falscher_token = _registrierung("partner@example.de", "falsch")
    assert _client().post(url, falsche_adresse, format="json").status_code == 400
    assert _client().post(url, falscher_token, format="json").status_code == 400
    assert User.objects.filter(email="andere@example.de").count() == 0


def test_registrierung_ohne_einladung_bleibt_unveraendert():
    url = reverse("accounts:register")
    assert _client().post(url, _registrierung("neu@example.de"), format="json").status_code == 201


# --- Hauptperson verwaltet --------------------------------------------------------------------


def test_name_und_email_korrigieren_vor_annahme(django_capture_on_commit_callbacks):
    user, _, s = _paket_zahlen(Aufbau(), django_capture_on_commit_callbacks)
    e = FamilienErwachsener.objects.get()
    alter_token = e.token
    url = reverse("adhesions:familie-erwachsener", args=[s.id, e.id])
    daten = {"email": "richtig@example.de", "vorname": "Nina"}
    antwort = _client(user).patch(url, daten, format="json")
    assert antwort.status_code == 200, antwort.data
    e.refresh_from_db()
    assert e.email == "richtig@example.de" and e.vorname == "Nina"
    assert e.token != alter_token  # der alte Link ist ungültig
    assert e.status == EinladungStatus.EINGELADEN
    assert _an("richtig@example.de")
    assert _client().get(reverse("adhesions:einladung", args=[alter_token])).status_code == 404


def test_email_korrektur_darf_keine_doublette_erzeugen(django_capture_on_commit_callbacks):
    user, _, s = _paket_zahlen(Aufbau(), django_capture_on_commit_callbacks)
    e = FamilienErwachsener.objects.get()
    url = reverse("adhesions:familie-erwachsener", args=[s.id, e.id])
    assert _client(user).patch(url, {"email": "haupt@example.de"}, format="json").status_code == 400
    assert _client(user).patch(url, {"email": "kaputt"}, format="json").status_code == 400


def test_angenommene_einladung_ist_nicht_mehr_aenderbar(django_capture_on_commit_callbacks):
    partner, _ = _person(email="partner@example.de")
    user, _, s = _paket_zahlen(Aufbau(), django_capture_on_commit_callbacks)
    e = FamilienErwachsener.objects.get()
    _client(partner).post(reverse("adhesions:einladung-annehmen", args=[e.token]))
    url = reverse("adhesions:familie-erwachsener", args=[s.id, e.id])
    assert _client(user).patch(url, {"vorname": "X"}, format="json").status_code == 400


def test_einladung_erneut_senden_mit_mindestabstand(django_capture_on_commit_callbacks):
    user, _, s = _paket_zahlen(Aufbau(), django_capture_on_commit_callbacks)
    e = FamilienErwachsener.objects.get()
    url = reverse("adhesions:familie-einladung-senden", args=[s.id, e.id])
    assert _client(user).post(url).status_code == 429
    FamilienErwachsener.objects.filter(pk=e.pk).update(
        eingeladen_am=timezone.now() - datetime.timedelta(hours=2)
    )
    assert _client(user).post(url).status_code == 200
    assert len(_an("partner@example.de")) == 2


def test_fremde_erreichen_personen_anderer_nicht(django_capture_on_commit_callbacks):
    fremd, _ = _person(email="fremd@example.de")
    _, _, s = _paket_zahlen(Aufbau(), django_capture_on_commit_callbacks)
    e = FamilienErwachsener.objects.get()
    k = FamilienKind.objects.first()
    c = _client(fremd)
    patch = c.patch(
        reverse("adhesions:familie-erwachsener", args=[s.id, e.id]), {"vorname": "X"}, format="json"
    )
    assert patch.status_code == 404
    senden = c.post(reverse("adhesions:familie-einladung-senden", args=[s.id, e.id]))
    assert senden.status_code == 404
    assert c.delete(reverse("adhesions:familie-kind", args=[s.id, k.id])).status_code == 404
    assert FamilienKind.objects.count() == 2


def test_kind_entfernen(django_capture_on_commit_callbacks):
    user, _, s = _paket_zahlen(Aufbau(), django_capture_on_commit_callbacks)
    k = FamilienKind.objects.first()
    antwort = _client(user).delete(reverse("adhesions:familie-kind", args=[s.id, k.id]))
    assert antwort.status_code == 204 and FamilienKind.objects.count() == 1


def test_mes_souscriptions_zeigt_personen_und_den_anteil_der_eingeladenen(
    django_capture_on_commit_callbacks,
):
    partner, _ = _person(email="partner@example.de")
    user, _, _ = _paket_zahlen(Aufbau(), django_capture_on_commit_callbacks)
    e = FamilienErwachsener.objects.get()
    _client(partner).post(reverse("adhesions:einladung-annehmen", args=[e.token]))
    url = reverse("adhesions:souscription-mes-souscriptions")

    def liste(u):
        daten = _client(u).get(url).data
        return daten["results"] if isinstance(daten, dict) else daten

    haupt = liste(user)[0]
    assert haupt["erwachsene"][0]["status"] == EinladungStatus.ANGENOMMEN
    assert haupt["familien_info"]["rolle"] == "hauptperson"
    info = liste(partner)[0]["familien_info"]
    assert info["rolle"] == "mitglied" and info["listenpreis"] == "50.00"
    assert info["anteil"] == "45.00"


# --- Erinnerungen -----------------------------------------------------------------------------


def test_erinnerung_erst_nach_sieben_tagen_und_hoechstens_dreimal(
    django_capture_on_commit_callbacks,
):
    _paket_zahlen(Aufbau(), django_capture_on_commit_callbacks)
    e = FamilienErwachsener.objects.get()
    assert sende_familien_erinnerungen() == {"einladungen": 0, "profile": 0, "altershinweise": 0}
    jetzt = timezone.now()
    for runde in range(1, 5):
        ergebnis = familie.sende_erinnerungen(heute=jetzt + datetime.timedelta(days=8 * runde))
        assert ergebnis["einladungen"] == (1 if runde <= 3 else 0)
    e.refresh_from_db()
    assert e.erinnerungen == 3


def test_profil_erinnerung_fuer_angenommene_ohne_ausweis(django_capture_on_commit_callbacks):
    partner, pm = _person(email="partner@example.de")
    pm.cin = ""
    pm.save()
    _paket_zahlen(Aufbau(), django_capture_on_commit_callbacks)
    e = FamilienErwachsener.objects.get()
    _client(partner).post(reverse("adhesions:einladung-annehmen", args=[e.token]))
    frueh = familie.sende_erinnerungen(heute=timezone.now() + datetime.timedelta(days=3))
    assert frueh == {"einladungen": 0, "profile": 0, "altershinweise": 0}
    spaet = familie.sende_erinnerungen(heute=timezone.now() + datetime.timedelta(days=15))
    assert spaet["profile"] == 1


def test_erinnerungs_job_ist_eingeplant():
    from django_celery_beat.models import PeriodicTask

    aufgabe = PeriodicTask.objects.get(name="adhesions.sende_familien_erinnerungen")
    assert aufgabe.task == "apps.adhesions.tasks.sende_familien_erinnerungen"
    assert aufgabe.enabled


# --- Büro ------------------------------------------------------------------------------------


def test_buero_uebersicht_zeigt_personen_status_und_rabatt(django_capture_on_commit_callbacks):
    a = Aufbau()
    _, membre, _ = _paket_zahlen(a, django_capture_on_commit_callbacks)
    rh, _ = _person(role=Role.RH, email="rh@example.de")
    daten = (
        _client(rh).get(reverse("adhesions:familienpakete"), {"campagne": str(a.kampagne.id)}).data
    )
    paket = daten["pakete"][0]
    assert paket["numero_membre"] == membre.numero_membre
    assert paket["gesamtpreis"] == "108.00" and paket["listenpreis"] == "120.00"
    assert paket["erwachsene"][0]["status"] == EinladungStatus.EINGELADEN
    assert paket["erwachsene"][0]["beziehung"] == "ehepartner"
    assert set(paket["kinder"][0]) == {
        "id",
        "name",
        "alter",
        "anonymisiert",
        "ueber_hoechstalter",
        "beziehung",
        "angebot",
        "angebot_id",
        "preis_liste",
        "preis_anteil",
    }
    z = daten["zusammenfassung"]
    assert z["pakete_bezahlt"] == 1 and z["erwachsene_offen"] == 1
    assert z["kinder_eingetragen"] == 2
    assert z["familienrabatt_gesamt"] == "12.00"


def test_buero_uebersicht_nicht_fuer_mitglieder():
    user, _ = _person()
    assert _client(user).get(reverse("adhesions:familienpakete")).status_code == 403
    assert _client().get(reverse("adhesions:familienpakete")).status_code in (401, 403)


def test_buero_kann_einer_person_ein_anderes_angebot_zuweisen(django_capture_on_commit_callbacks):
    a = Aufbau()
    partner, pm = _person(email="partner@example.de")
    _paket_zahlen(a, django_capture_on_commit_callbacks)
    e = FamilienErwachsener.objects.get()
    _client(partner).post(reverse("adhesions:einladung-annehmen", args=[e.token]))
    k = FamilienKind.objects.first()
    admin = User.objects.create_user(
        email="admin@example.de", password="x", is_active=True, role=Role.SUPER_ADMIN
    )
    c = _client(admin)
    url_k = reverse("adhesions:familie-person-angebot", args=["kind", k.id])
    assert c.patch(url_k, {"angebot": str(a.plus.id)}, format="json").status_code == 200
    k.refresh_from_db()
    assert k.angebot == a.plus and k.preis_anteil == Decimal("9.00")  # Preis bleibt
    url_e = reverse("adhesions:familie-person-angebot", args=["erwachsener", e.id])
    assert c.patch(url_e, {"angebot": str(a.junior.id)}, format="json").status_code == 200
    assert Souscription.objects.get(membre=pm, campagne=a.kampagne).offre == a.junior
    # Familienpaket, Angebote anderer Kampagnen und Unsinn sind nicht erlaubt.
    assert c.patch(url_k, {"angebot": str(a.paket.id)}, format="json").status_code == 400
    fremd = OffreAdhesionFactory()
    assert c.patch(url_k, {"angebot": str(fremd.id)}, format="json").status_code == 404
    assert c.patch(url_k, {"angebot": "kein-uuid"}, format="json").status_code == 400
    unbekannt = reverse("adhesions:familie-person-angebot", args=["xyz", k.id])
    assert c.patch(unbekannt, {}, format="json").status_code == 404


def test_zuweisung_nur_mit_schreibrecht(django_capture_on_commit_callbacks):
    a = Aufbau()
    _paket_zahlen(a, django_capture_on_commit_callbacks)
    k = FamilienKind.objects.first()
    rh, _ = _person(role=Role.RH, email="rh@example.de")
    mitglied, _ = _person(email="m@example.de")
    url = reverse("adhesions:familie-person-angebot", args=["kind", k.id])
    daten = {"angebot": str(a.plus.id)}
    assert _client(mitglied).patch(url, daten, format="json").status_code == 403
    assert _client().patch(url, daten, format="json").status_code in (401, 403)


# --- Anonymisierung --------------------------------------------------------------------------


def _alte_kampagne(tage=400):
    heute = timezone.localdate()
    return CampagneAdhesionFactory(
        annee=heute.year - 2,
        date_debut=datetime.date(heute.year - 2, 1, 1),
        date_fin=heute - datetime.timedelta(days=tage),
        familie_max_alter_kind=17,
    )


def test_abgelaufene_familiendaten_werden_anonymisiert_nicht_geloescht(settings):
    settings.FAMILIE_KINDER_AUFBEWAHRUNG_MONATE = 12
    heute = timezone.localdate()
    alt = _alte_kampagne()
    neu = CampagneAdhesionFactory(
        annee=heute.year,
        date_debut=datetime.date(heute.year, 1, 1),
        date_fin=heute + datetime.timedelta(days=100),
    )
    user, membre = _person()
    for kampagne, name in ((alt, "Alt"), (neu, "Neu")):
        offre = OffreAdhesionFactory(campagne=kampagne)
        s = SouscriptionFactory(membre=membre, offre=offre, campagne=kampagne, plaetze_kinder=1)
        FamilienKind.objects.create(
            souscription=s,
            vorname=name,
            nachname="X",
            geburtsjahr=heute.year - 5,
            kartennummer=f"{membre.numero_membre}-J1",
            einwilligung_von=user,
            einwilligung_version="v",
            preis_anteil=Decimal("9.00"),
        )
        FamilienErwachsener.objects.create(
            souscription=s,
            vorname=name,
            nachname="Y",
            email=f"{name.lower()}@example.de",
            beziehung="ehepartner",
            membre=membre,
            registrierung_user=user,
        )
    token_alt = FamilienErwachsener.objects.get(vorname="Alt").token
    ergebnis = anonymisiere_familiendaten()
    assert ergebnis == {"kinder": 1, "erwachsene": 1}
    assert FamilienKind.objects.count() == 2  # nichts gelöscht
    k = FamilienKind.objects.get(souscription__campagne=alt)
    assert (k.vorname, k.nachname, k.kartennummer) == ("", "", "")
    assert k.einwilligung_von is None and k.anonymisiert and k.anonymisiert_am
    assert k.geburtsjahr == heute.year - 5 and k.preis_anteil == Decimal("9.00")  # Historie bleibt
    e = FamilienErwachsener.objects.get(souscription__campagne=alt)
    assert (e.vorname, e.nachname, e.email) == ("", "", "")
    assert e.membre is None and e.registrierung_user is None and e.token != token_alt
    # Die laufende Kampagne bleibt unberührt ; ein zweiter Lauf ändert nichts.
    assert FamilienKind.objects.get(souscription__campagne=neu).vorname == "Neu"
    assert FamilienErwachsener.objects.get(souscription__campagne=neu).email == "neu@example.de"
    assert anonymisiere_familiendaten() == {"kinder": 0, "erwachsene": 0}


def test_anonymisiertes_paket_erscheint_weiter_im_bericht(settings):
    settings.FAMILIE_KINDER_AUFBEWAHRUNG_MONATE = 12
    kampagne = _alte_kampagne()
    angebot = OffreAdhesionFactory(campagne=kampagne, ist_familienpaket=True)
    _, membre = _person()
    s = SouscriptionFactory(
        membre=membre,
        offre=angebot,
        campagne=kampagne,
        statut=StatutSouscription.PAYEE,
        familien_gesamtpreis=Decimal("108.00"),
        haupt_preis_liste=Decimal("50.00"),
    )
    FamilienKind.objects.create(
        souscription=s,
        vorname="Lina",
        nachname="X",
        geburtsjahr=kampagne.annee - 8,
        einwilligung_version="v",
        preis_liste=Decimal("10.00"),
    )
    vorher = familie.bericht()[0]
    anonymisiere_familiendaten()
    nachher = familie.bericht()[0]
    assert nachher["kinder"] == 1 and nachher["kinder_anonymisiert"] == 1
    assert {k: v for k, v in nachher.items() if k != "kinder_anonymisiert"} == {
        k: v for k, v in vorher.items() if k != "kinder_anonymisiert"
    }


def test_anonymisierung_ist_eingeplant():
    from django_celery_beat.models import PeriodicTask

    assert not PeriodicTask.objects.filter(name="adhesions.loeschen_kinderdaten").exists()
    aufgabe = PeriodicTask.objects.get(name="adhesions.anonymisiere_familiendaten")
    assert aufgabe.task == "apps.adhesions.tasks.anonymisiere_familiendaten"
    assert aufgabe.enabled


def test_stornieren_eines_unbezahlten_familienpakets_raeumt_die_personen_auf():
    user, _ = _person()
    a = Aufbau()
    antwort = _buchen(user, a.paket, [_erw()], [_kind()])
    assert antwort.status_code == 200, antwort.data
    sid = antwort.data["id"]
    assert FamilienKind.objects.count() == 1 and FamilienErwachsener.objects.count() == 1
    stornieren = _client(user).post(reverse("adhesions:souscription-annuler", args=[sid]))
    assert stornieren.status_code == 200, stornieren.data
    s = Souscription.objects.get(pk=sid)
    assert s.statut == StatutSouscription.ANNULEE
    assert s.familien_gesamtpreis is None and s.plaetze_kinder == 0
    assert FamilienKind.objects.count() == 0 and FamilienErwachsener.objects.count() == 0


def test_anonymisierte_personen_sind_nicht_mehr_aenderbar(django_capture_on_commit_callbacks):
    user, _, s = _paket_zahlen(Aufbau(), django_capture_on_commit_callbacks)
    k, e = FamilienKind.objects.first(), FamilienErwachsener.objects.get()
    FamilienKind.objects.update(anonymisiert_am=timezone.now())
    FamilienErwachsener.objects.update(anonymisiert_am=timezone.now())
    c = _client(user)
    assert c.delete(reverse("adhesions:familie-kind", args=[s.id, k.id])).status_code == 404
    url = reverse("adhesions:familie-erwachsener", args=[s.id, e.id])
    assert c.patch(url, {"vorname": "Neu"}, format="json").status_code == 404
    senden = reverse("adhesions:familie-einladung-senden", args=[s.id, e.id])
    assert c.post(senden).status_code == 404


# --- Familie aus dem Vorjahr übernehmen -------------------------------------------------------


def _vorjahr_paket(membre, erwachsene=(), kinder=()):
    alt = CampagneAdhesionFactory(annee=JAHR - 1, familie_max_alter_kind=17)
    offre = OffreAdhesionFactory(campagne=alt, ist_familienpaket=True)
    s = SouscriptionFactory(
        membre=membre, offre=offre, campagne=alt, statut=StatutSouscription.PAYEE
    )
    for jahr, name in kinder:
        FamilienKind.objects.create(
            souscription=s,
            vorname=name,
            nachname="Muster",
            geburtsjahr=jahr,
            einwilligung_version="v",
        )
    for status, email in erwachsene:
        FamilienErwachsener.objects.create(
            souscription=s,
            vorname="Nora",
            nachname="Muster",
            email=email,
            beziehung="ehepartner",
            status=status,
        )
    return s


def test_vorjahr_schlaegt_personen_vor_und_trennt_zu_alte_kinder_ab():
    a = Aufbau(annee=JAHR)
    user, membre = _person()
    _vorjahr_paket(
        membre,
        erwachsene=[
            (EinladungStatus.ANGENOMMEN, "ja@example.de"),
            (EinladungStatus.ABGELEHNT, "nein@example.de"),
        ],
        kinder=[(JAHR - 8, "Lina"), (JAHR - 18, "Max")],
    )
    url = reverse("adhesions:familien-vorjahr")
    daten = _client(user).get(url, {"campagne": str(a.kampagne.id)}).data
    assert [e["email"] for e in daten["erwachsene"]] == ["ja@example.de"]
    assert [k["vorname"] for k in daten["kinder"]] == ["Lina"]
    assert [k["vorname"] for k in daten["aelter_geworden"]] == ["Max"]
    assert "einwilligung" not in daten["kinder"][0]  # neue Einwilligung nötig
    assert daten["quelle"]


def test_vorjahr_ohne_fruehere_buchung_und_ohne_anonymisierte_eintraege():
    a = Aufbau(annee=JAHR)
    user, membre = _person()
    url = reverse("adhesions:familien-vorjahr")
    leer = _client(user).get(url, {"campagne": str(a.kampagne.id)}).data
    assert leer["quelle"] is None and leer["kinder"] == []
    s = _vorjahr_paket(membre, kinder=[(JAHR - 8, "Lina")])
    FamilienKind.objects.filter(souscription=s).update(
        vorname="", nachname="", anonymisiert_am=timezone.now()
    )
    assert _client(user).get(url, {"campagne": str(a.kampagne.id)}).data["kinder"] == []


def test_vorjahr_zeigt_nur_die_eigene_familie_und_prueft_die_eingabe():
    a = Aufbau(annee=JAHR)
    _, fremd = _person(email="fremd@example.de")
    _vorjahr_paket(fremd, kinder=[(JAHR - 8, "Geheim")])
    user, _ = _person()
    url = reverse("adhesions:familien-vorjahr")
    assert _client(user).get(url, {"campagne": str(a.kampagne.id)}).data["kinder"] == []
    assert _client(user).get(url, {"campagne": "kein-uuid"}).status_code == 400
    assert _client().get(url, {"campagne": str(a.kampagne.id)}).status_code in (401, 403)


# --- Höchstalter-Hinweis ----------------------------------------------------------------------


def _kind_ueber_grenze(django_capture_on_commit_callbacks):
    a = Aufbau()
    user, membre, s = _paket_zahlen(a, django_capture_on_commit_callbacks, kinder=2)
    k = FamilienKind.objects.order_by("created_at").first()
    k.geburtsjahr = JAHR - 18
    k.save()
    return user, s, k


def test_kind_ueber_hoechstalter_wird_markiert_und_einmal_gemeldet(
    django_capture_on_commit_callbacks,
):
    user, s, k = _kind_ueber_grenze(django_capture_on_commit_callbacks)
    liste = _client(user).get(reverse("adhesions:souscription-mes-souscriptions")).data
    kinder = (liste["results"] if isinstance(liste, dict) else liste)[0]["kinder"]
    assert sorted(x["ueber_hoechstalter"] for x in kinder) == [False, True]
    mail.outbox.clear()
    assert familie.sende_altershinweise() == 1
    assert len(_an("haupt@example.de")) == 1 and k.vorname in _an("haupt@example.de")[0].body
    k.refresh_from_db()
    assert k.altershinweis_am is not None
    assert familie.sende_altershinweise() == 0  # nur einmal je Kind
    assert len(_an("haupt@example.de")) == 1


def test_altershinweis_nicht_nach_kampagnenende_und_nicht_fuer_unbezahlte(
    django_capture_on_commit_callbacks,
):
    _, s, k = _kind_ueber_grenze(django_capture_on_commit_callbacks)
    s.campagne.date_fin = timezone.localdate() - datetime.timedelta(days=1)
    s.campagne.save()
    assert familie.sende_altershinweise() == 0
    s.campagne.date_fin = timezone.localdate() + datetime.timedelta(days=30)
    s.campagne.save()
    Souscription.objects.filter(pk=s.pk).update(statut=StatutSouscription.EN_ATTENTE_PAIEMENT)
    assert familie.sende_altershinweise() == 0


def test_altershinweis_rechnet_mit_berliner_datum_nicht_utc(
    django_capture_on_commit_callbacks, monkeypatch
):
    """Regression : zwischen 22 und 24 Uhr UTC ist es in Berlin schon der nächste Tag ; die
    Kampagne vom Berliner Vortag darf dann keinen Hinweis mehr auslösen."""
    _, s, k = _kind_ueber_grenze(django_capture_on_commit_callbacks)
    fix = datetime.datetime(2026, 10, 16, 22, 30, tzinfo=datetime.timezone.utc)
    monkeypatch.setattr(timezone, "now", lambda: fix)
    s.campagne.date_fin = timezone.localdate() - datetime.timedelta(days=1)
    s.campagne.save()
    assert familie.sende_altershinweise() == 0


# --- Bericht ---------------------------------------------------------------------------------


def test_bericht_zaehlt_ohne_personenbezug(django_capture_on_commit_callbacks):
    a = Aufbau()
    _paket_zahlen(a, django_capture_on_commit_callbacks, kinder=2)
    k = FamilienKind.objects.order_by("created_at").first()
    k.geburtsjahr = JAHR - 2
    k.save()
    rh, _ = _person(role=Role.RH, email="rh@example.de")
    url = reverse("adhesions:familien-bericht")
    antwort = _client(rh).get(url, {"campagne": str(a.kampagne.id)})
    z = antwort.data["kampagnen"][0]
    assert z["pakete"] == 1 and z["kinder"] == 2 and z["erwachsene_offen"] == 1
    assert z["altersgruppen"] == {"0-5": 1, "6-11": 1, "12-17": 0, "18+": 0}
    assert z["listenpreis"] == "120.00" and z["gezahlt"] == "108.00"
    assert z["rabatt"] == "12.00" and z["rabatt_pct"] == "10.00"
    text = str(antwort.data)
    assert "haupt@example.de" not in text and "Muster" not in text


def test_bericht_csv_export_und_berechtigung(django_capture_on_commit_callbacks):
    a = Aufbau()
    _paket_zahlen(a, django_capture_on_commit_callbacks)
    rh, _ = _person(role=Role.RH, email="rh@example.de")
    url = reverse("adhesions:familien-bericht")
    antwort = _client(rh).get(url, {"export": "csv"})
    assert antwort.status_code == 200 and antwort["Content-Type"].startswith("text/csv")
    text = antwort.content.decode("utf-8")
    assert text.startswith("\ufeffKampagne;Jahr;Pakete") and "108,00" in text
    mitglied, _ = _person(email="m@example.de")
    assert _client(mitglied).get(url).status_code == 403
    assert _client().get(url).status_code in (401, 403)


def test_csv_schuetzt_vor_formeln():
    from apps.adhesions.familie_views import _csv_text

    assert _csv_text("=SUMME(A1)") == "'=SUMME(A1)" and _csv_text("CID 2026") == "CID 2026"
