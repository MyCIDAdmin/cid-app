"""Tests — Umfragen (Release 11)."""

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.communaute.models import Publication
from apps.membres.models import StatutMembre
from apps.membres.tests.factories import MembreFactory
from apps.umfragen.models import Umfrage, UmfrageAntwort

pytestmark = pytest.mark.django_db

LISTE = "umfragen:umfrage-list"


def _user(role=Role.MEMBRE, email="u@example.de", mitglied=True):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    membre = MembreFactory(user=user, statut=StatutMembre.ACTIF) if mitglied else None
    return user, membre


def _client(user=None):
    client = APIClient()
    if user is not None:
        client.force_authenticate(user)
    return client


def _daten(**extra):
    daten = {
        "titel": "Sommerfest",
        "beschreibung": "Wann passt es?",
        "zielgruppe": "mitglieder",
        "anonym": True,
        "ergebnis_modus": "live",
        "frist": (timezone.now() + timedelta(days=7)).isoformat(),
        "fragen": [
            {
                "text": "Welcher Tag?",
                "typ": "einzel",
                "optionen": [{"text": "Samstag"}, {"text": "Sonntag"}],
            },
            {
                "text": "Was bringst du mit?",
                "typ": "mehrfach",
                "pflicht": False,
                "optionen": [{"text": "Salat"}, {"text": "Kuchen"}, {"text": "Getränke"}],
            },
            {"text": "Sonstiges", "typ": "freitext", "pflicht": False},
        ],
    }
    daten.update(extra)
    return daten


@pytest.fixture
def admin():
    return _user(Role.SUPER_ADMIN, "admin@example.de", mitglied=False)[0]


def _anlegen(admin, veroeffentlichen=True, **extra):
    antwort = _client(admin).post(reverse(LISTE), _daten(**extra), format="json")
    assert antwort.status_code == 201, antwort.json()
    umfrage = Umfrage.objects.get(id=antwort.json()["id"])
    if veroeffentlichen:
        res = _client(admin).post(reverse("umfragen:umfrage-veroeffentlichen", args=[umfrage.id]))
        assert res.status_code == 200
        umfrage.refresh_from_db()
    return umfrage


def _antworten(umfrage, tag=0, mit=(1,), text="Gern"):
    f1, f2, f3 = list(umfrage.fragen.all())
    o1 = list(f1.optionen.all())
    o2 = list(f2.optionen.all())
    return {
        "antworten": [
            {"frage": str(f1.id), "optionen": [str(o1[tag].id)]},
            {"frage": str(f2.id), "optionen": [str(o2[i].id) for i in mit]},
            {"frage": str(f3.id), "text": text},
        ]
    }


def _teilnehmen(client, umfrage, **kw):
    return client.post(
        reverse("umfragen:umfrage-teilnehmen", args=[umfrage.id]),
        _antworten(umfrage, **kw),
        format="json",
    )


def test_nur_verwaltung_legt_an_und_validiert(admin):
    mitglied, _ = _user(email="m@example.de")
    assert _client(mitglied).post(reverse(LISTE), _daten(), format="json").status_code == 403
    assert _client().post(reverse(LISTE), _daten(), format="json").status_code == 401
    vergangen = _daten(frist=(timezone.now() - timedelta(days=1)).isoformat())
    assert _client(admin).post(reverse(LISTE), vergangen, format="json").status_code == 400
    ohne_optionen = _daten(fragen=[{"text": "?", "typ": "einzel", "optionen": [{"text": "A"}]}])
    assert _client(admin).post(reverse(LISTE), ohne_optionen, format="json").status_code == 400
    assert _client(admin).post(reverse(LISTE), _daten(), format="json").status_code == 201


def test_entwuerfe_sind_nur_fuer_verwaltung_sichtbar(admin):
    umfrage = _anlegen(admin, veroeffentlichen=False)
    mitglied, _ = _user(email="m@example.de")
    assert _client(mitglied).get(reverse(LISTE)).json() == []
    assert len(_client(admin).get(reverse(LISTE)).json()) == 1
    _client(admin).post(reverse("umfragen:umfrage-veroeffentlichen", args=[umfrage.id]))
    assert len(_client(mitglied).get(reverse(LISTE)).json()) == 1


def test_zielgruppe_mitglieder_sperrt_nicht_mitglieder_aber_konten_nicht(admin):
    nur_mitglieder = _anlegen(admin, titel="Intern")
    offen = _anlegen(admin, titel="Offen", zielgruppe="konten")
    konto, _ = _user(email="konto@example.de", mitglied=False)
    titel = [u["titel"] for u in _client(konto).get(reverse(LISTE)).json()]
    assert titel == ["Offen"]
    assert _teilnehmen(_client(konto), nur_mitglieder).status_code == 404
    assert _teilnehmen(_client(konto), offen).status_code == 201
    assert _teilnehmen(_client(), offen).status_code == 401


def test_oeffentliche_minimalansicht_ohne_anmeldung(admin):
    umfrage = _anlegen(admin)
    antwort = _client().get(reverse("umfragen:umfrage-oeffentlich", args=[umfrage.id]))
    assert antwort.status_code == 200
    assert antwort.json()["titel"] == "Sommerfest" and "fragen" not in antwort.json()
    entwurf = _anlegen(admin, veroeffentlichen=False)
    assert (
        _client().get(reverse("umfragen:umfrage-oeffentlich", args=[entwurf.id])).status_code == 404
    )


def test_teilnahme_einmal_pro_konto_und_validierung(admin):
    umfrage = _anlegen(admin)
    mitglied, _ = _user(email="m@example.de")
    client = _client(mitglied)
    f1 = umfrage.fragen.first()
    ohne_pflicht = {"antworten": [{"frage": str(f1.id), "optionen": []}]}
    url = reverse("umfragen:umfrage-teilnehmen", args=[umfrage.id])
    assert client.post(url, ohne_pflicht, format="json").status_code == 400
    zwei = [str(o.id) for o in f1.optionen.all()]
    assert (
        client.post(
            url, {"antworten": [{"frage": str(f1.id), "optionen": zwei}]}, format="json"
        ).status_code
        == 400
    )
    assert _teilnehmen(client, umfrage).status_code == 201
    assert _teilnehmen(client, umfrage).status_code == 400
    assert umfrage.einreichungen.count() == 1


def test_frist_abgelaufen_blockiert_teilnahme(admin):
    umfrage = _anlegen(admin)
    Umfrage.objects.filter(id=umfrage.id).update(frist=timezone.now() - timedelta(minutes=1))
    mitglied, _ = _user(email="m@example.de")
    assert _teilnehmen(_client(mitglied), umfrage).status_code == 400


def test_anonyme_umfrage_speichert_keinen_nutzer_bei_den_antworten(admin):
    umfrage = _anlegen(admin, anonym=True)
    mitglied, _ = _user(email="m@example.de")
    _teilnehmen(_client(mitglied), umfrage)
    assert umfrage.einreichungen.get().user is None
    assert umfrage.teilnahmen.filter(user=mitglied).exists()
    ergebnisse = (
        _client(admin).get(reverse("umfragen:umfrage-ergebnisse", args=[umfrage.id])).json()
    )
    assert "einreichungen" not in ergebnisse and ergebnisse["teilnehmende"] == 1


def test_namentliche_umfrage_zeigt_der_verwaltung_wer_was_antwortete(admin):
    umfrage = _anlegen(admin, anonym=False)
    mitglied, membre = _user(email="m@example.de")
    _teilnehmen(_client(mitglied), umfrage, tag=1, text="Ich komme")
    daten = _client(admin).get(reverse("umfragen:umfrage-ergebnisse", args=[umfrage.id])).json()
    eintrag = daten["einreichungen"][0]
    assert eintrag["name"] == f"{membre.prenom} {membre.nom}"
    assert {"frage": "Welcher Tag?", "werte": ["Sonntag"]} in eintrag["antworten"]
    # Teilnehmende ohne Verwaltungsrecht sehen nie Namen.
    eigene = _client(mitglied).get(reverse("umfragen:umfrage-ergebnisse", args=[umfrage.id])).json()
    assert "einreichungen" not in eigene


@pytest.mark.parametrize(
    ("modus", "abgelaufen", "erlaubt"),
    [
        ("admin", False, False),
        ("admin", True, False),
        ("nach_frist", False, False),
        ("nach_frist", True, True),
        ("live", False, True),
    ],
)
def test_ergebnis_modus_fuer_teilnehmende(admin, modus, abgelaufen, erlaubt):
    umfrage = _anlegen(admin, ergebnis_modus=modus)
    mitglied, _ = _user(email="m@example.de")
    andere, _ = _user(email="a@example.de")
    _teilnehmen(_client(mitglied), umfrage)
    if abgelaufen:
        Umfrage.objects.filter(id=umfrage.id).update(frist=timezone.now() - timedelta(minutes=1))
    url = reverse("umfragen:umfrage-ergebnisse", args=[umfrage.id])
    assert (_client(mitglied).get(url).status_code == 200) is erlaubt
    assert _client(andere).get(url).status_code == 403  # nicht teilgenommen
    assert _client(admin).get(url).status_code == 200  # Verwaltung sieht immer


def test_ergebnisse_zaehlen_optionen_und_freitexte(admin):
    umfrage = _anlegen(admin, ergebnis_modus="live")
    for i, tag in enumerate([0, 0, 1]):
        user, _ = _user(email=f"m{i}@example.de")
        _teilnehmen(_client(user), umfrage, tag=tag, mit=(0, 2), text=f"Text {i}")
    daten = _client(admin).get(reverse("umfragen:umfrage-ergebnisse", args=[umfrage.id])).json()
    einzel, mehrfach, frei = daten["fragen"]
    assert [(o["text"], o["anzahl"], o["anteil"]) for o in einzel["optionen"]] == [
        ("Samstag", 2, 67),
        ("Sonntag", 1, 33),
    ]
    assert sum(o["anzahl"] for o in mehrfach["optionen"]) == 6
    assert sorted(frei["freitexte"]) == ["Text 0", "Text 1", "Text 2"]
    assert UmfrageAntwort.objects.count() == 3 * 3 + 3


def test_fragen_nach_erster_teilnahme_gesperrt_und_loeschen_verboten(admin):
    umfrage = _anlegen(admin)
    mitglied, _ = _user(email="m@example.de")
    _teilnehmen(_client(mitglied), umfrage)
    url = reverse("umfragen:umfrage-detail", args=[umfrage.id])
    assert (
        _client(admin).patch(url, {"fragen": _daten()["fragen"]}, format="json").status_code == 400
    )
    assert _client(admin).patch(url, {"anonym": False}, format="json").status_code == 400
    assert _client(admin).patch(url, {"titel": "Neu"}, format="json").status_code == 200
    assert _client(admin).delete(url).status_code == 400


def test_ankuendigen_erstellt_wichtige_neuigkeit_einmalig(admin, monkeypatch):
    gesendet = []
    monkeypatch.setattr(
        "apps.umfragen.views.notifier_publication_importante.delay",
        lambda pid: gesendet.append(pid),
    )
    _, membre = _user(Role.SUPER_ADMIN, "chef@example.de")
    chef = membre.user
    umfrage = _anlegen(admin)
    url = reverse("umfragen:umfrage-ankuendigen", args=[umfrage.id])
    assert _client(admin).post(url).status_code == 400  # Admin ohne Mitgliedsakte
    antwort = _client(chef).post(url)
    assert antwort.status_code == 200 and antwort.json()["angekuendigt"] is True
    publikation = Publication.objects.get()
    assert publikation.important and f"/umfragen/{umfrage.id}" in publikation.contenu
    assert gesendet == [str(publikation.id)]
    assert _client(chef).post(url).status_code == 400


def test_veroeffentlichen_braucht_zukuenftige_frist(admin):
    umfrage = _anlegen(admin, veroeffentlichen=False)
    Umfrage.objects.filter(id=umfrage.id).update(frist=timezone.now() - timedelta(days=1))
    url = reverse("umfragen:umfrage-veroeffentlichen", args=[umfrage.id])
    assert _client(admin).post(url).status_code == 400


# --- Release 12: Themen, Freitext-Zusatz, Übersetzungen ------------------------------------
def _themen_daten():
    daten = _daten()
    daten["fragen"][0]["thema"] = "Termin"
    daten["fragen"][1].update(thema="Essen", freitext_zusatz=True)
    daten["fragen"][2].update(thema="Essen", freitext_zusatz=True)  # Freitext: Zusatz entfällt
    return daten


def test_thema_und_freitext_zusatz_werden_gespeichert(admin):
    res = _client(admin).post(reverse(LISTE), _themen_daten(), format="json")
    assert res.status_code == 201, res.json()
    f1, f2, f3 = res.json()["fragen"]
    assert (f1["thema"], f1["freitext_zusatz"]) == ("Termin", False)
    assert (f2["thema"], f2["freitext_zusatz"]) == ("Essen", True)
    assert f3["freitext_zusatz"] is False
    assert res.json()["uebersetzungen"] == {} and f1["uebersetzungen"] == {}


def test_antwort_mit_kommentar_zaehlt_nur_die_option(admin):
    umfrage = _anlegen(admin, fragen=_themen_daten()["fragen"])
    f1, f2, f3 = list(umfrage.fragen.all())
    o1 = list(f1.optionen.all())
    o2 = list(f2.optionen.all())
    for i, kommentar in enumerate(["Vegan bitte", "", "Ohne Nüsse"]):
        user, _ = _user(email=f"k{i}@example.de")
        res = _client(user).post(
            reverse("umfragen:umfrage-teilnehmen", args=[umfrage.id]),
            {
                "antworten": [
                    {"frage": str(f1.id), "optionen": [str(o1[0].id)], "text": "wird ignoriert"},
                    {"frage": str(f2.id), "optionen": [str(o2[0].id)], "text": kommentar},
                    {"frage": str(f3.id), "text": "x"},
                ]
            },
            format="json",
        )
        assert res.status_code == 201, res.json()
    daten = _client(admin).get(reverse("umfragen:umfrage-ergebnisse", args=[umfrage.id])).json()
    einzel, mehrfach, _ = daten["fragen"]
    assert einzel["thema"] == "Termin" and "freitexte" not in einzel
    assert mehrfach["beantwortet"] == 3
    assert mehrfach["optionen"][0]["anzahl"] == 3
    assert sorted(mehrfach["freitexte"]) == ["Ohne Nüsse", "Vegan bitte"]
    assert UmfrageAntwort.objects.filter(frage=f1, freitext="").count() == 3


def test_kommentar_allein_zaehlt_nur_bei_optionaler_frage(admin):
    umfrage = _anlegen(admin, fragen=_themen_daten()["fragen"])
    f1, f2, f3 = list(umfrage.fragen.all())
    o1 = list(f1.optionen.all())
    user, _ = _user(email="allein@example.de")
    res = _client(user).post(
        reverse("umfragen:umfrage-teilnehmen", args=[umfrage.id]),
        {
            "antworten": [
                {"frage": str(f1.id), "optionen": [str(o1[0].id)]},
                {"frage": str(f2.id), "text": "Nur ein Kommentar"},
            ]
        },
        format="json",
    )
    assert res.status_code == 201, res.json()
    assert UmfrageAntwort.objects.filter(frage=f2, option=None, freitext="Nur ein Kommentar")


def test_bearbeiten_behaelt_ids_und_uebersetzungen(admin):
    from apps.uebersetzung.services import manuell_speichern

    umfrage = _anlegen(admin, veroeffentlichen=False)
    f1 = umfrage.fragen.first()
    o1 = f1.optionen.first()
    manuell_speichern(umfrage, "titel", "fr", "Fête d'été")
    manuell_speichern(f1, "text", "fr", "Quel jour ?")
    manuell_speichern(o1, "text", "fr", "Samedi")
    daten = _client(admin).get(reverse("umfragen:umfrage-detail", args=[umfrage.id])).json()
    assert daten["uebersetzungen"]["titel"]["fr"] == "Fête d'été"
    assert daten["fragen"][0]["uebersetzungen"]["text"]["fr"] == "Quel jour ?"
    assert daten["fragen"][0]["optionen"][0]["uebersetzungen"]["text"]["fr"] == "Samedi"

    daten["fragen"][0]["thema"] = "Neues Thema"
    daten["fragen"][0]["optionen"].append({"text": "Montag"})
    res = _client(admin).patch(
        reverse("umfragen:umfrage-detail", args=[umfrage.id]),
        {"fragen": daten["fragen"]},
        format="json",
    )
    assert res.status_code == 200, res.json()
    f = res.json()["fragen"][0]
    assert f["id"] == str(f1.id) and f["thema"] == "Neues Thema"
    assert f["uebersetzungen"]["text"]["fr"] == "Quel jour ?"
    assert f["optionen"][0]["id"] == str(o1.id)
    assert f["optionen"][0]["uebersetzungen"]["text"]["fr"] == "Samedi"
    assert len(f["optionen"]) == 3 and f["optionen"][2]["uebersetzungen"] == {}
    # Text geändert -> alte Übersetzung passt nicht mehr und wird nicht mehr geliefert.
    daten2 = res.json()["fragen"]
    daten2[0]["text"] = "Welcher Wochentag?"
    res = _client(admin).patch(
        reverse("umfragen:umfrage-detail", args=[umfrage.id]), {"fragen": daten2}, format="json"
    )
    assert res.json()["fragen"][0]["uebersetzungen"] == {}


def test_ergebnisse_und_oeffentlich_liefern_uebersetzungen(admin):
    from apps.uebersetzung.services import manuell_speichern

    umfrage = _anlegen(admin)
    manuell_speichern(umfrage, "titel", "fr", "Fête d'été")
    manuell_speichern(umfrage.fragen.first(), "text", "fr", "Quel jour ?")
    res = _client().get(reverse("umfragen:umfrage-oeffentlich", args=[umfrage.id])).json()
    assert res["uebersetzungen"]["titel"]["fr"] == "Fête d'été"
    daten = _client(admin).get(reverse("umfragen:umfrage-ergebnisse", args=[umfrage.id])).json()
    assert daten["fragen"][0]["uebersetzungen"]["text"]["fr"] == "Quel jour ?"


# --- Release 13: PDF-Bericht ----------------------------------------------------------------
def test_bericht_ist_pdf_und_folgt_den_ergebnisregeln(admin):
    umfrage = _anlegen(admin, ergebnis_modus="nach_frist", fragen=_themen_daten()["fragen"])
    user, _ = _user(email="b@example.de")
    _teilnehmen(_client(user), umfrage)
    url = reverse("umfragen:umfrage-bericht", args=[umfrage.id])
    # Teilnehmende sehen vor Fristende nichts -> auch kein Bericht.
    assert _client(user).get(url).status_code == 403
    assert _client().get(url).status_code in (401, 403)
    antwort = _client(admin).get(url, {"lang": "fr"})
    assert antwort.status_code == 200
    assert antwort["Content-Type"] == "application/pdf"
    assert antwort.content.startswith(b"%PDF")
    assert "bericht_sommerfest.pdf" in antwort["Content-Disposition"]


def test_bericht_inhalt_in_berichtssprache(admin, monkeypatch):
    from apps.uebersetzung.services import manuell_speichern
    from apps.umfragen import pdf

    umfrage = _anlegen(admin, ergebnis_modus="live", anonym=False, fragen=_themen_daten()["fragen"])
    manuell_speichern(umfrage, "titel", "fr", "Fête d'été")
    manuell_speichern(umfrage.fragen.first(), "thema", "fr", "Date")
    _teilnehmen(_client(_user(email="c@example.de")[0]), umfrage)
    gesehen = {}
    original = pdf.render_to_string
    monkeypatch.setattr(pdf, "render_to_string", lambda n, k: gesehen.update(k) or original(n, k))
    res = _client(admin).get(reverse("umfragen:umfrage-bericht", args=[umfrage.id]), {"lang": "fr"})
    assert res.status_code == 200
    assert gesehen["titel"] == "Fête d'été"
    assert [g["thema"] for g in gesehen["gruppen"]] == ["Date", "Essen"]
    assert gesehen["einreichungen"] and gesehen["einreichungen"][0]["name"]
