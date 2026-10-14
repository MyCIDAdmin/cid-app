"""Tests — Dienste, Event-Team und private Termine (Release 16)."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import Role
from apps.evenements.models import Evenement, StatutEvenement
from apps.kalender.models import Dienst, DienstEintragung
from apps.kalender.tasks import termin_erinnerungen
from apps.membres.models import Faehigkeit, MembreFaehigkeit
from apps.notifications.models import Notification

from .test_kalender import EINTRAEGE, TERMINE, _client, _eintraege, _termin, _titel, _user

pytestmark = pytest.mark.django_db

DIENSTE = "/api/v1/kalender/dienste/"


@pytest.fixture
def bureau():
    return _user(Role.BUREAU_ADMIN, "bureau@example.de")[0]


def _event(membre, **extra):
    daten = {
        "titre": "Sommerfest",
        "date_evenement": timezone.localdate() + timedelta(days=10),
        "statut": StatutEvenement.PUBLIE,
        "created_by": membre,
    }
    daten.update(extra)
    return Evenement.objects.create(**daten)


def _dienst(user, termin=None, evenement=None, **extra):
    daten = {
        "titel": "Aufbau",
        "beginn": timezone.now() + timedelta(days=5),
        "benoetigt": 2,
        "erstellt_von": user,
    }
    if termin is None and evenement is None:
        raise AssertionError("Termin oder Veranstaltung nötig")
    daten.update(extra)
    return Dienst.objects.create(termin=termin, evenement=evenement, **daten)


def _bureau_membre():
    user, membre = _user(Role.BUREAU_ADMIN, "bm@example.de")
    return user, membre


def test_privat_nur_verfasser_und_eingeladene(bureau):
    eingeladen, _ = _user(email="e@example.de")
    fremd, _ = _user(email="f@example.de")
    chef = _user(Role.SUPER_ADMIN, "chef@example.de")[0]
    antwort = _client(bureau).post(
        TERMINE,
        {
            "titel": "Vertraulich",
            "kategorie": "sitzung",
            "beginn": (timezone.now() + timedelta(days=2)).isoformat(),
            "sichtbarkeit": "kreis",
            "kreis": "privat",
            "einladen": [str(eingeladen.pk)],
        },
        format="json",
    )
    assert antwort.status_code == 201, antwort.data
    tid = antwort.data["id"]
    assert "Vertraulich" in _titel(_eintraege(bureau, "buero"))
    assert "Vertraulich" in _titel(_eintraege(eingeladen, "meine"))
    assert "Vertraulich" not in _titel(_eintraege(chef, "buero"))
    assert "Vertraulich" not in _titel(_eintraege(fremd, "verein"))
    assert _client(chef).get(f"{TERMINE}{tid}/").status_code == 404
    assert _client(bureau).get(f"{TERMINE}{tid}/").status_code == 200


def test_event_team_braucht_veranstaltung(bureau):
    membre = bureau.membre
    basis = {
        "titel": "Briefing",
        "kategorie": "sitzung",
        "beginn": (timezone.now() + timedelta(days=2)).isoformat(),
        "sichtbarkeit": "kreis",
        "kreis": "event_team",
    }
    c = _client(bureau)
    assert c.post(TERMINE, basis, format="json").status_code == 400
    ev = _event(membre)
    assert c.post(TERMINE, {**basis, "evenement": str(ev.pk)}, format="json").status_code == 201


def test_helfer_sieht_nur_sein_event_team_nicht_das_buero(bureau):
    helfer, _ = _user(email="h@example.de")
    anderer, _ = _user(email="a@example.de")
    ev = _event(bureau.membre)
    _termin(bureau, titel="Team-Briefing", sichtbarkeit="kreis", kreis="event_team", evenement=ev)
    _termin(bureau, titel="Bureau intern", sichtbarkeit="kreis", kreis="bureau")
    dienst = _dienst(bureau, evenement=ev)
    assert "Team-Briefing" not in _titel(_eintraege(helfer, "meine"))
    assert _client(helfer).post(f"{DIENSTE}{dienst.pk}/eintragen/").status_code == 200
    assert _titel(_eintraege(helfer, "meine")) >= {"Team-Briefing", "Dienst: Aufbau"}
    assert "Bureau intern" not in _titel(_eintraege(helfer, "meine"))
    assert (
        _eintraege(helfer, "buero").status_code == 403
    )  # Eintragung macht nicht zum Aufgabenträger
    assert "Team-Briefing" not in _titel(_eintraege(anderer, "meine"))


def test_dienst_anlegen_nur_mit_schreibrecht_und_xor(bureau):
    mitglied, _ = _user(email="m@example.de")
    ev = _event(bureau.membre)
    t = _termin(bureau, sichtbarkeit="mitglieder")
    daten = {
        "evenement": str(ev.pk),
        "titel": "Kasse",
        "beginn": (timezone.now() + timedelta(days=3)).isoformat(),
        "benoetigt": 2,
    }
    assert _client(mitglied).post(DIENSTE, daten, format="json").status_code == 403
    assert _client(bureau).post(DIENSTE, daten, format="json").status_code == 201
    beide = {**daten, "termin": str(t.pk)}
    assert _client(bureau).post(DIENSTE, beide, format="json").status_code == 400
    keins = {k: v for k, v in daten.items() if k != "evenement"}
    assert _client(bureau).post(DIENSTE, keins, format="json").status_code == 400


def test_eintragen_voll_doppelt_und_namen_verborgen(bureau):
    a, _ = _user(email="a@example.de")
    b, _ = _user(email="b@example.de")
    c3, _ = _user(email="c@example.de")
    ev = _event(bureau.membre)
    d = _dienst(bureau, evenement=ev, benoetigt=2)
    url = f"{DIENSTE}{d.pk}/eintragen/"
    antwort = _client(a).post(url)
    assert antwort.status_code == 200
    assert antwort.data["besetzt"] == 1 and antwort.data["frei"] == 1
    assert antwort.data["ich_eingetragen"] is True
    assert antwort.data["eingetragen"] == []  # Namen sehen nur Schreibberechtigte
    assert _client(a).post(url).status_code == 400
    assert _client(b).post(url).status_code == 200
    assert _client(c3).post(url).status_code == 400
    namen = _client(bureau).get(f"{DIENSTE}{d.pk}/").data["eingetragen"]
    assert len(namen) == 2


def test_nicht_mitglied_kann_sich_nicht_eintragen(bureau):
    fremd, _ = _user(email="x@example.de", mitglied=False)
    d = _dienst(bureau, evenement=_event(bureau.membre))
    assert _client(fremd).post(f"{DIENSTE}{d.pk}/eintragen/").status_code in (403, 404)


def test_austragen_frist(bureau):
    a, _ = _user(email="a@example.de")
    d = _dienst(
        bureau,
        evenement=_event(bureau.membre),
        austragen_bis=timezone.now() - timedelta(hours=1),
        beginn=timezone.now() + timedelta(hours=5),
    )
    DienstEintragung.objects.create(dienst=d, user=a)
    assert _client(a).post(f"{DIENSTE}{d.pk}/austragen/").status_code == 400
    d2 = _dienst(
        bureau,
        evenement=_event(bureau.membre, titre="Zwei"),
        austragen_bis=timezone.now() + timedelta(days=1),
    )
    DienstEintragung.objects.create(dienst=d2, user=a)
    assert _client(a).post(f"{DIENSTE}{d2.pk}/austragen/").status_code == 200
    assert not d2.eintraege.exists()


def test_kurzfristig_frei_benachrichtigt_bureau(bureau):
    a, _ = _user(email="a@example.de")
    d = _dienst(
        bureau,
        evenement=_event(bureau.membre),
        benoetigt=1,
        beginn=timezone.now() + timedelta(hours=30),
    )
    DienstEintragung.objects.create(dienst=d, user=a)
    assert _client(a).post(f"{DIENSTE}{d.pk}/austragen/").status_code == 200
    assert Notification.objects.filter(
        destinataire=bureau, type_notification="kalender_dienst"
    ).exists()


def test_zuweisen_und_entfernen(bureau):
    a, _ = _user(email="a@example.de")
    d = _dienst(bureau, evenement=_event(bureau.membre), benoetigt=1)
    c = _client(bureau)
    assert _client(a).post(f"{DIENSTE}{d.pk}/zuweisen/", {"user": str(a.pk)}).status_code == 403
    assert (
        c.post(f"{DIENSTE}{d.pk}/zuweisen/", {"user": str(a.pk)}, format="json").status_code == 200
    )
    assert Notification.objects.filter(destinataire=a, type_notification="kalender_dienst").exists()
    assert (
        c.post(f"{DIENSTE}{d.pk}/zuweisen/", {"user": str(a.pk)}, format="json").status_code == 400
    )
    assert (
        c.post(f"{DIENSTE}{d.pk}/entfernen/", {"user": str(a.pk)}, format="json").status_code == 200
    )
    assert (
        c.post(f"{DIENSTE}{d.pk}/entfernen/", {"user": str(a.pk)}, format="json").status_code == 400
    )


def test_vorschlaege_aus_faehigkeiten_und_anschreiben(bureau):
    passend, m1 = _user(email="p@example.de")
    anders, _ = _user(email="q@example.de")
    f = Faehigkeit.objects.get(bezeichnung__iexact="Fotografie")
    MembreFaehigkeit.objects.create(membre=m1, faehigkeit=f, kommentar="Spiegelreflex")
    d = _dienst(bureau, evenement=_event(bureau.membre), faehigkeit=f)
    c = _client(bureau)
    treffer = c.get(f"{DIENSTE}{d.pk}/vorschlaege/").data
    assert [t["user"] for t in treffer] == [str(passend.pk)]
    assert _client(anders).get(f"{DIENSTE}{d.pk}/vorschlaege/").status_code == 403
    assert (
        c.post(
            f"{DIENSTE}{d.pk}/anschreiben/", {"user": str(passend.pk)}, format="json"
        ).status_code
        == 200
    )
    assert Notification.objects.filter(
        destinataire=passend, type_notification="kalender_dienst"
    ).exists()
    DienstEintragung.objects.create(dienst=d, user=passend)
    assert c.get(f"{DIENSTE}{d.pk}/vorschlaege/").data == []


def test_offene_dienste_nur_mit_freien_plaetzen(bureau):
    mitglied, _ = _user(email="m@example.de")
    ev = _event(bureau.membre)
    offen = _dienst(bureau, evenement=ev, titel="Offen", benoetigt=2)
    voll = _dienst(bureau, evenement=ev, titel="Voll", benoetigt=1)
    DienstEintragung.objects.create(dienst=voll, user=bureau)
    titel = {d["titel"] for d in _client(mitglied).get(DIENSTE + "offen/").data}
    assert titel == {"Offen"}
    assert offen.pk


def test_dienste_am_internen_termin_nur_fuer_berechtigte(bureau):
    mitglied, _ = _user(email="m@example.de")
    t = _termin(bureau, titel="Intern", sichtbarkeit="kreis", kreis="bureau")
    d = _dienst(bureau, termin=t)
    assert _client(mitglied).get(f"{DIENSTE}{d.pk}/").status_code == 404
    assert _client(bureau).get(f"{DIENSTE}{d.pk}/").status_code == 200


def test_dienst_erinnerung_einmalig(bureau):
    a, _ = _user(email="a@example.de")
    d = _dienst(
        bureau, evenement=_event(bureau.membre), beginn=timezone.now() + timedelta(hours=10)
    )
    DienstEintragung.objects.create(dienst=d, user=a)
    assert termin_erinnerungen() == 1
    assert (
        Notification.objects.filter(destinataire=a, type_notification="evenement_rappel").count()
        == 1
    )
    assert termin_erinnerungen() == 0
    fern = _dienst(
        bureau,
        evenement=_event(bureau.membre, titre="Fern"),
        titel="Spaeter",
        beginn=timezone.now() + timedelta(days=9),
    )
    assert termin_erinnerungen() == 0
    assert Dienst.objects.get(pk=fern.pk).letzte_erinnerung is None


def test_meine_ansicht_listet_eigene_dienste(bureau):
    a, _ = _user(email="a@example.de")
    d = _dienst(bureau, evenement=_event(bureau.membre))
    DienstEintragung.objects.create(dienst=d, user=a)
    antwort = _eintraege(a, "meine")
    assert "Dienst: Aufbau" in _titel(antwort)
    assert EINTRAEGE
