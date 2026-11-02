import itertools
from datetime import timedelta

from django.utils import timezone

from apps.accounts.models import Role, User
from apps.cotisations.tests.factories import CotisationFactory
from apps.membres.tests.factories import MembreFactory
from apps.wahlen.models import AusschussMitglied, Wahl
from apps.wahlen.services import bekanntmachungen_anlegen

_zaehler = itertools.count()


def mitglied(rolle=Role.MEMBRE, jahre=4, beitrag=True):
    """Aktives Mitglied mit Konto, `jahre` Jahre dabei, Beitrag des laufenden Jahres bezahlt."""
    n = next(_zaehler)
    user = User.objects.create_user(
        email=f"wahl{n}@example.de", password="Password123!", role=rolle, is_active=True
    )
    heute = timezone.localdate()
    membre = MembreFactory(user=user, date_adhesion=heute - timedelta(days=365 * jahre + 30))
    if beitrag:
        CotisationFactory(membre=membre, annee=heute.year)
    return user, membre


def verwaltung():
    return mitglied(Role.BUREAU_ADMIN)[0]


def termine(phase="kandidatur"):
    """Termine so, dass die Phase `phase` (z. B. 'kandidatur') gerade läuft."""
    heute = timezone.localdate()
    tag = timedelta(days=1)
    start = {
        "ankuendigung": heute + 5 * tag,
        "kandidatur": heute - 2 * tag,
        "pruefung": heute - 12 * tag,
        "kampagne": heute - 20 * tag,
    }[phase]
    jetzt = timezone.now()
    kandidatur_bis = start + 10 * tag
    pruefung_bis = kandidatur_bis + 5 * tag
    kampagne_bis = pruefung_bis + 10 * tag
    wahl_von = jetzt + (kampagne_bis - heute) + tag
    wahl_bis = wahl_von + 7 * tag
    return {
        "ankuendigung_am": start - 3 * tag,
        "kandidatur_von": start,
        "kandidatur_bis": kandidatur_bis,
        "pruefung_bis": pruefung_bis,
        "kampagne_bis": kampagne_bis,
        "wahl_von": wahl_von,
        "wahl_bis": wahl_bis,
        "einspruch_bis": wahl_bis.date() + 5 * tag,
        "uebergabe_bis": wahl_bis.date() + 30 * tag,
    }


def neue_wahl(form="person", phase="kandidatur", ausschuss=3, aktiv=True, **extra):
    admin = verwaltung()
    daten = {
        "titel": "Wahl des Beispiel-Ausschusses",
        "form": form,
        "mehrheit": "relativ",
        "status": "aktiv" if aktiv else "entwurf",
        **termine(phase),
        **extra,
    }
    wahl = Wahl.objects.create(created_by=admin, **daten)
    bekanntmachungen_anlegen(wahl)
    mitglieder = []
    for _ in range(ausschuss):
        user, membre = mitglied()
        AusschussMitglied.objects.create(wahl=wahl, membre=membre)
        mitglieder.append(user)
    return wahl, mitglieder
