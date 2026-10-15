"""Familienpaket (Release 34) : Preis, Plätze, Kinder (Einwilligung, Datensparsamkeit), Büro."""

import datetime
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.adhesions.models import FamilienKind, StatutSouscription
from apps.adhesions.tasks import loeschen_kinderdaten
from apps.adhesions.tests.factories import (
    CampagneAdhesionFactory,
    OffreAdhesionFactory,
    RabaisOffreFactory,
    SouscriptionFactory,
)
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db

SOUSCRIRE = "adhesions:souscription-souscrire"


def _client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def _person(role=Role.MEMBRE, email="haupt@example.de"):
    user = User.objects.create_user(email=email, password="Password123!", is_active=True, role=role)
    membre = MembreFactory(user=user, cin="12345678")
    return user, membre


def _paket(**kw):
    werte = dict(
        nom="Familie",
        prix_plein=Decimal("60.00"),
        ist_familienpaket=True,
        preis_je_erwachsener=Decimal("20.00"),
        preis_je_kind=Decimal("5.00"),
        max_erwachsene=2,
        max_kinder=4,
    )
    werte.update(kw)
    return OffreAdhesionFactory(**werte)


def _souscrire(user, offre, **plaetze):
    return _client(user).post(
        reverse(SOUSCRIRE), {"offre": str(offre.id), **plaetze}, format="json"
    )


def _kind(souscription_id, user, **kw):
    daten = {
        "vorname": "Lina",
        "nachname": "Muster",
        "geburtsjahr": timezone.localdate().year - 8,
        "einwilligung": True,
        **kw,
    }
    return _client(user).post(
        reverse("adhesions:familie-kinder", args=[souscription_id]), daten, format="json"
    )


# --- Preis und Plätze ------------------------------------------------------------------------


def test_preis_ist_grundpreis_plus_zuschlaege():
    offre = _paket()
    assert offre.preis_fuer(1, 2) == Decimal("90.00")
    assert offre.preis_fuer(0, 0) == Decimal("60.00")


def test_normales_angebot_ignoriert_zuschlaege():
    offre = OffreAdhesionFactory(prix_plein=Decimal("50.00"), preis_je_kind=Decimal("5.00"))
    assert offre.preis_fuer(0, 3) == Decimal("50.00")


def test_souscrire_berechnet_paketpreis_auf_dem_server():
    offre = _paket()
    user, _ = _person()
    antwort = _souscrire(user, offre, plaetze_erwachsene=1, plaetze_kinder=2)
    assert antwort.status_code == 200, antwort.data
    assert antwort.data["prix_paye"] == "90.00"
    assert antwort.data["plaetze_erwachsene"] == 1
    assert antwort.data["plaetze_kinder"] == 2
    assert antwort.data["kinder"] == []


def test_rabatt_wirkt_auf_den_gesamtpreis():
    offre = _paket()
    rabais = RabaisOffreFactory(
        offre=offre, montant_reduction=None, pct_reduction=Decimal("10"), justificatif_requis=False
    )
    user, _ = _person()
    antwort = _client(user).post(
        reverse(SOUSCRIRE),
        {
            "offre": str(offre.id),
            "rabais": str(rabais.id),
            "plaetze_erwachsene": 1,
            "plaetze_kinder": 2,
        },
        format="json",
    )
    assert antwort.status_code == 200, antwort.data
    assert antwort.data["prix_paye"] == "81.00"


def test_mehr_plaetze_als_erlaubt_wird_abgelehnt():
    offre = _paket(max_erwachsene=1, max_kinder=2)
    user, _ = _person()
    assert _souscrire(user, offre, plaetze_erwachsene=2).status_code == 400
    assert _souscrire(user, offre, plaetze_kinder=3).status_code == 400
    assert _souscrire(user, offre, plaetze_kinder=-1).status_code == 400


def test_plaetze_bei_normalem_angebot_werden_abgelehnt():
    offre = OffreAdhesionFactory()
    user, _ = _person()
    assert _souscrire(user, offre, plaetze_kinder=1).status_code == 400
    assert _souscrire(user, offre).status_code == 200


def test_bezahlte_souscription_bleibt_unveraendert():
    offre = _paket()
    user, membre = _person()
    SouscriptionFactory(
        membre=membre, offre=offre, campagne=offre.campagne, statut=StatutSouscription.PAYEE
    )
    assert _souscrire(user, offre, plaetze_kinder=1).status_code == 403


def test_weniger_plaetze_als_eingetragene_kinder_wird_abgelehnt():
    offre = _paket()
    user, _ = _person()
    s = _souscrire(user, offre, plaetze_kinder=2).data
    assert _kind(s["id"], user).status_code == 201
    assert _kind(s["id"], user, vorname="Ben").status_code == 201
    assert _souscrire(user, offre, plaetze_kinder=1).status_code == 400
    assert _souscrire(user, offre, plaetze_kinder=3).status_code == 200


# --- Kinder ----------------------------------------------------------------------------------


def test_kind_eintragen_speichert_nur_notwendiges_und_die_einwilligung():
    offre = _paket()
    user, membre = _person()
    s = _souscrire(user, offre, plaetze_kinder=2).data
    antwort = _kind(s["id"], user)
    assert antwort.status_code == 201, antwort.data
    kind = FamilienKind.objects.get()
    assert (kind.vorname, kind.nachname) == ("Lina", "Muster")
    assert kind.kartennummer == f"{membre.numero_membre}-J1"
    assert kind.einwilligung_von == user
    assert kind.einwilligung_version
    assert kind.alter == 8
    eintrag = antwort.data["kinder"][0]
    assert set(eintrag) == {
        "id",
        "vorname",
        "nachname",
        "geburtsjahr",
        "alter",
        "kartennummer",
        "einwilligung_am",
    }
    zweites = _kind(s["id"], user, vorname="Ben").data["kinder"]
    assert [k["kartennummer"][-2:] for k in zweites] == ["J1", "J2"]


def test_kind_ohne_einwilligung_wird_abgelehnt():
    offre = _paket()
    user, _ = _person()
    s = _souscrire(user, offre, plaetze_kinder=1).data
    assert _kind(s["id"], user, einwilligung=False).status_code == 400
    assert _kind(s["id"], user, einwilligung="ja").status_code == 400
    assert FamilienKind.objects.count() == 0


def test_kind_muss_unter_18_sein():
    offre = _paket()
    user, _ = _person()
    s = _souscrire(user, offre, plaetze_kinder=3).data
    jahr = timezone.localdate().year
    assert _kind(s["id"], user, geburtsjahr=jahr - 18).status_code == 400
    assert _kind(s["id"], user, geburtsjahr=jahr + 1).status_code == 400
    assert _kind(s["id"], user, geburtsjahr="abc").status_code == 400
    assert _kind(s["id"], user, geburtsjahr=jahr - 17).status_code == 201


def test_kind_namen_pflicht_und_laenge():
    offre = _paket()
    user, _ = _person()
    s = _souscrire(user, offre, plaetze_kinder=2).data
    assert _kind(s["id"], user, vorname=" ").status_code == 400
    assert _kind(s["id"], user, nachname="x" * 101).status_code == 400


def test_nicht_mehr_kinder_als_gebuchte_plaetze():
    offre = _paket()
    user, _ = _person()
    s = _souscrire(user, offre, plaetze_kinder=1).data
    assert _kind(s["id"], user).status_code == 201
    antwort = _kind(s["id"], user, vorname="Ben")
    assert antwort.status_code == 400
    assert FamilienKind.objects.count() == 1


def test_kind_nur_bei_familienpaket():
    offre = OffreAdhesionFactory()
    user, _ = _person()
    s = _souscrire(user, offre).data
    assert _kind(s["id"], user).status_code == 400


def test_fremde_koennen_kinder_weder_sehen_noch_aendern():
    offre = _paket()
    user, _ = _person()
    fremd, _ = _person(email="fremd@example.de")
    s = _souscrire(user, offre, plaetze_kinder=2).data
    kind_id = _kind(s["id"], user).data["kinder"][0]["id"]
    assert _kind(s["id"], fremd).status_code == 404
    loeschen = _client(fremd).delete(reverse("adhesions:familie-kind", args=[s["id"], kind_id]))
    assert loeschen.status_code == 404
    # Auch das Büro trägt nichts für andere ein oder löscht.
    buero, _ = _person(role=Role.BUREAU_ADMIN, email="buero@example.de")
    assert _kind(s["id"], buero).status_code == 404
    assert FamilienKind.objects.count() == 1


def test_kind_entfernen():
    offre = _paket()
    user, _ = _person()
    s = _souscrire(user, offre, plaetze_kinder=2).data
    kind_id = _kind(s["id"], user).data["kinder"][0]["id"]
    antwort = _client(user).delete(reverse("adhesions:familie-kind", args=[s["id"], kind_id]))
    assert antwort.status_code == 204
    assert FamilienKind.objects.count() == 0


def test_mes_souscriptions_zeigt_kinder_der_hauptperson():
    offre = _paket()
    user, _ = _person()
    s = _souscrire(user, offre, plaetze_kinder=1).data
    _kind(s["id"], user)
    liste = _client(user).get(reverse("adhesions:souscription-mes-souscriptions")).data
    ergebnisse = liste["results"] if isinstance(liste, dict) else liste
    assert ergebnisse[0]["kinder"][0]["vorname"] == "Lina"


def test_kinder_sind_keine_mitglieder():
    from apps.membres.models import Membre

    offre = _paket()
    user, _ = _person()
    s = _souscrire(user, offre, plaetze_kinder=1).data
    vorher = Membre.objects.count()
    _kind(s["id"], user)
    assert Membre.objects.count() == vorher


# --- Büro ------------------------------------------------------------------------------------


def test_buero_uebersicht_zeigt_pakete_und_nur_name_und_alter():
    offre = _paket()
    user, membre = _person()
    s = _souscrire(user, offre, plaetze_erwachsene=1, plaetze_kinder=2).data
    _kind(s["id"], user)
    rh, _ = _person(role=Role.RH, email="rh@example.de")
    url = reverse("adhesions:familienpakete")
    daten = _client(rh).get(url, {"campagne": str(offre.campagne_id)}).data
    assert len(daten["pakete"]) == 1
    paket = daten["pakete"][0]
    assert paket["numero_membre"] == membre.numero_membre
    assert paket["plaetze_kinder"] == 2 and len(paket["kinder"]) == 1
    assert set(paket["kinder"][0]) == {"id", "name", "alter"}
    assert daten["zusammenfassung"]["pakete_bezahlt"] == 0  # noch nicht bezahlt


def test_buero_uebersicht_zaehlt_bezahlte_pakete():
    offre = _paket()
    user, membre = _person()
    s = _souscrire(user, offre, plaetze_erwachsene=1, plaetze_kinder=2).data
    _kind(s["id"], user)
    from apps.adhesions.models import Souscription

    Souscription.objects.filter(pk=s["id"]).update(statut=StatutSouscription.PAYEE)
    rh, _ = _person(role=Role.RH, email="rh@example.de")
    zusammenfassung = _client(rh).get(reverse("adhesions:familienpakete")).data["zusammenfassung"]
    assert zusammenfassung == {
        "pakete_bezahlt": 1,
        "plaetze_erwachsene": 1,
        "kinder_eingetragen": 1,
    }


def test_buero_uebersicht_nicht_fuer_mitglieder():
    user, _ = _person()
    assert _client(user).get(reverse("adhesions:familienpakete")).status_code == 403
    assert APIClient().get(reverse("adhesions:familienpakete")).status_code in (401, 403)


# --- Löschfrist ------------------------------------------------------------------------------


def test_abgelaufene_kinderdaten_werden_geloescht(settings):
    settings.FAMILIE_KINDER_AUFBEWAHRUNG_MONATE = 12
    heute = timezone.localdate()
    alt = CampagneAdhesionFactory(
        annee=2020,
        date_debut=datetime.date(2020, 1, 1),
        date_fin=heute - datetime.timedelta(days=400),
    )
    neu = CampagneAdhesionFactory(
        annee=2021,
        date_debut=datetime.date(2021, 1, 1),
        date_fin=heute + datetime.timedelta(days=100),
    )
    user, membre = _person()
    for kampagne, name in ((alt, "Alt"), (neu, "Neu")):
        offre = _paket(campagne=kampagne)
        s = SouscriptionFactory(membre=membre, offre=offre, campagne=kampagne, plaetze_kinder=1)
        FamilienKind.objects.create(
            souscription=s,
            vorname=name,
            nachname="X",
            geburtsjahr=heute.year - 5,
            einwilligung_version="v",
        )
    assert loeschen_kinderdaten() == 1
    assert list(FamilienKind.objects.values_list("vorname", flat=True)) == ["Neu"]


def test_loeschjob_ist_eingeplant():
    from django_celery_beat.models import PeriodicTask

    aufgabe = PeriodicTask.objects.get(name="adhesions.loeschen_kinderdaten")
    assert aufgabe.task == "apps.adhesions.tasks.loeschen_kinderdaten"
    assert aufgabe.enabled
