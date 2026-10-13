"""Tests — Spielplan und Fristen im Kalender (Release 17)."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.adhesions.tests.factories import CampagneAdhesionFactory
from apps.boutique.models import ReservierungsModus
from apps.boutique.tests.factories import CommandeFactory, ProduitFactory
from apps.communaute.models import Match, RencontreCalendrier, StatutRencontre
from apps.cotisations.models import ConfigurationRelance
from apps.cotisations.tests.factories import CotisationFactory
from apps.evenements.models import Evenement, StatutEvenement
from apps.projets.models import ProjetMitglied
from apps.projets.tests.factories import ProjetFactory

from .test_kalender import _eintraege, _titel, _user

pytestmark = pytest.mark.django_db


def _in(tage, stunde=18):
    basis = timezone.localtime() + timedelta(days=tage)
    return basis.replace(hour=stunde, minute=0, second=0, microsecond=0)


def _spiel(tage, nr="x1", **extra):
    daten = {
        "evenement_externe_id": nr,
        "competition": "Ligue 1",
        "equipe_domicile": "Club Africain",
        "equipe_exterieur": "ESS",
        "date_heure": _in(tage),
    }
    daten.update(extra)
    return RencontreCalendrier.objects.create(**daten)


def test_naechstes_spiel_aus_dem_spielplan_sichtbar():
    user, _m = _user()
    _spiel(4)
    antwort = _eintraege(user, "verein")
    assert "Club Africain – ESS" in _titel(antwort)
    eintrag = next(e for e in antwort.data if e["quelle"] == "spieltag")
    assert eintrag["link"] == "/live"


def test_spiel_abgesagt_fehlt_verschoben_gekennzeichnet():
    user, _m = _user()
    _spiel(3, "a", equipe_exterieur="Abgesagt", statut=StatutRencontre.ANNULEE)
    _spiel(5, "b", equipe_exterieur="Verschoben", statut=StatutRencontre.REPORTEE)
    titel = _titel(_eintraege(user, "verein"))
    assert not any("Abgesagt" in t for t in titel)
    assert "Club Africain – Verschoben (verschoben)" in titel


def test_live_match_nicht_doppelt_zum_spielplan():
    user, m = _user()
    _spiel(4)
    Match.objects.create(
        adversaire="ESS", date_heure=_in(4, 19), created_by=user  # selbes Spiel, 1 h später
    )
    Match.objects.create(adversaire="CSS", date_heure=_in(8), created_by=user)
    antwort = _eintraege(user, "verein")
    spiele = [e["titel"] for e in antwort.data if e["quelle"] == "spieltag"]
    assert sorted(spiele) == ["Club Africain – CSS", "Club Africain – ESS"]


def test_veranstaltungs_zahlungsfrist_fuer_alle():
    user, m = _user()
    Evenement.objects.create(
        titre="Fest",
        date_evenement=timezone.localdate() + timedelta(days=20),
        date_limite_paiement=timezone.localdate() + timedelta(days=6),
        statut=StatutEvenement.PUBLIE,
        created_by=m,
    )
    Evenement.objects.create(
        titre="Entwurf",
        date_evenement=timezone.localdate() + timedelta(days=20),
        date_limite_paiement=timezone.localdate() + timedelta(days=6),
        statut=StatutEvenement.BROUILLON,
        created_by=m,
    )
    titel = _titel(_eintraege(user, "verein"))
    assert "Zahlungsfrist: Fest" in titel
    assert "Zahlungsfrist: Entwurf" not in titel


def test_kampagne_und_shop_reservierung_fuer_alle():
    user, _m = _user()
    CampagneAdhesionFactory(
        nom="Beitritt 2027", date_limite_renouvellement=timezone.localdate() + timedelta(days=9)
    )
    ProduitFactory(
        nom="Trikot",
        reservierung_modus=ReservierungsModus.NUR_RESERVIEREN,
        reservierung_frist=_in(7),
    )
    ProduitFactory(nom="Ohne", reservierung_frist=_in(7))  # Modus AUS
    titel = _titel(_eintraege(user, "verein"))
    assert "Mitgliedschaft verlängern bis: Beitritt 2027" in titel
    assert "Reservierung bis: Trikot" in titel
    assert "Reservierung bis: Ohne" not in titel


def test_beitrag_nur_fuer_die_offene_person():
    offen, m_offen = _user(email="offen@example.de")
    bezahlt, m_bezahlt = _user(email="bezahlt@example.de")
    fremd, _ = _user(email="fremd@example.de")
    jahr = timezone.localdate().year
    ConfigurationRelance.objects.create(
        annee=jahr, date_echeance=timezone.localdate() + timedelta(days=5)
    )
    CotisationFactory(membre=m_bezahlt, annee=jahr)
    text = f"Mitgliedsbeitrag {jahr} fällig"
    assert text in _titel(_eintraege(offen, "verein"))
    assert text in _titel(_eintraege(offen, "meine"))
    assert text not in _titel(_eintraege(bezahlt, "verein"))


def test_shop_zahlung_nur_fuer_besteller():
    besteller, m = _user(email="b@example.de")
    anderer, _ = _user(email="a@example.de")
    CommandeFactory(membre=m, zahlung_bis=_in(3))
    assert "Shop: Zahlung fällig" in _titel(_eintraege(besteller, "meine"))
    assert "Shop: Zahlung fällig" not in _titel(_eintraege(anderer, "verein"))


def test_projekt_frist_nur_fuer_projektteam():
    mitglied, m = _user(email="p@example.de")
    fremd, _ = _user(email="q@example.de")
    projekt = ProjetFactory(titre="Bau", date_limite=timezone.localdate() + timedelta(days=8))
    ProjetMitglied.objects.create(projet=projekt, membre=m)
    titel = "Projekt-Frist: Bau"
    assert titel in _titel(_eintraege(mitglied, "meine"))
    assert titel not in _titel(_eintraege(fremd, "meine"))
    assert titel not in _titel(_eintraege(fremd, "verein"))


def test_wochenuebersicht_nur_mit_opt_in_und_inhalt(mailoutbox):
    from apps.kalender.tasks import wochenuebersicht

    an, _m = _user(email="an@example.de")
    aus, _m2 = _user(email="aus@example.de")
    leer, _m3 = _user(email="leer@example.de")
    leer.ui_praeferenzen = {"kalender_wochenmail": True}
    an.ui_praeferenzen = {"kalender_wochenmail": True}
    an.save()
    leer.save()
    aus.ui_praeferenzen = {"kalender_wochenmail": False}
    aus.save()
    _spiel(2)
    assert wochenuebersicht() == 2
    assert {m.to[0] for m in mailoutbox} == {"an@example.de", "leer@example.de"}
    assert "Club Africain – ESS" in mailoutbox[0].body


def test_wochenuebersicht_ohne_eintraege_keine_mail(mailoutbox):
    from apps.kalender.tasks import wochenuebersicht

    user, _m = _user(email="x@example.de")
    user.ui_praeferenzen = {"kalender_wochenmail": True}
    user.save()
    assert wochenuebersicht() == 0
    assert mailoutbox == []


def test_praeferenz_wochenmail_ueber_profil_setzen():
    from rest_framework.test import APIClient

    user, _m = _user(email="p2@example.de")
    c = APIClient()
    c.force_authenticate(user)
    antwort = c.patch(
        "/api/v1/auth/me/", {"ui_praeferenzen": {"kalender_wochenmail": True}}, format="json"
    )
    assert antwort.status_code == 200, antwort.data
    user.refresh_from_db()
    assert user.ui_praeferenzen["kalender_wochenmail"] is True


AUSBLENDEN = "/api/v1/kalender/ausblenden/"


def _ausblenden(user, spiel, ausgeblendet=True, quelle="spieltag"):
    from rest_framework.test import APIClient

    c = APIClient()
    c.force_authenticate(user)
    return c.post(
        AUSBLENDEN,
        {"quelle": quelle, "objekt_id": str(spiel.pk), "ausgeblendet": ausgeblendet},
        format="json",
    )


def test_spiel_ausblenden_und_wieder_einblenden():
    from apps.accounts.models import Role

    bureau, _b = _user(Role.BUREAU_ADMIN, "bureau@example.de")
    mitglied, _m = _user(email="mitglied@example.de")
    spiel = _spiel(4)
    titel = "Club Africain – ESS"

    assert _ausblenden(bureau, spiel).status_code == 200
    assert titel not in _titel(_eintraege(mitglied, "verein"))
    # Das Bureau sieht den Eintrag markiert und kann ihn wieder einblenden.
    eintrag = next(e for e in _eintraege(bureau, "verein").data if e["quelle"] == "spieltag")
    assert eintrag["ausgeblendet"] is True and eintrag["ausblendbar"] is True
    # Auch die öffentliche Seite zeigt ihn nicht.
    from .test_kalender import OEFFENTLICH, _client, _zeitraum

    assert titel not in {e["titel"] for e in _client().get(OEFFENTLICH, _zeitraum()).data}

    assert _ausblenden(bureau, spiel, ausgeblendet=False).status_code == 200
    assert titel in _titel(_eintraege(mitglied, "verein"))
    eintrag = next(e for e in _eintraege(bureau, "verein").data if e["quelle"] == "spieltag")
    assert eintrag["ausgeblendet"] is False


def test_ausblenden_nur_mit_schreibrecht_und_nur_feed_quellen():
    from apps.accounts.models import Role

    mitglied, _m = _user(email="mitglied@example.de")
    bureau, _b = _user(Role.BUREAU_ADMIN, "bureau@example.de")
    spiel = _spiel(4)
    assert _ausblenden(mitglied, spiel).status_code == 403
    assert _ausblenden(bureau, spiel, quelle="beitrag").status_code == 400
    antwort = _eintraege(mitglied, "verein")
    assert not any(e.get("ausblendbar") for e in antwort.data)


def test_ausgeblendetes_spiel_nicht_in_wochenmail(mailoutbox):
    from apps.accounts.models import Role
    from apps.kalender.tasks import wochenuebersicht

    bureau, _b = _user(Role.BUREAU_ADMIN, "bureau@example.de")
    bureau.ui_praeferenzen = {"kalender_wochenmail": True}
    bureau.save()
    spiel = _spiel(2)
    _ausblenden(bureau, spiel)
    assert wochenuebersicht() == 0
