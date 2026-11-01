"""
Startseite nach der Anmeldung (Vorschlag B „Gemeinschaft“) : Zahlen zum Verein und „Neu dabei“.

- Die Zahlen sind reine Summen über aktive Mitglieder (Mitglieder, Bundesländer, Städte,
  Zuwachs im laufenden Monat). Sie enthalten keine Personenbezüge und sind für jedes Konto
  sichtbar, auch für Fan-Konten.
- „Neu dabei“ zeigt Vorname und Initial sowie den Sektor von Mitgliedern, die sich selbst dafür
  freigegeben haben (Einstellung `neu_dabei_zeigen` im Profil, standardmäßig AUS). Die Liste sehen
  nur aktive Mitglieder und das Büro ; Fan-Konten erhalten sie leer.
"""

from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import ROLE_LEVELS, Role
from apps.membres.models import Membre, StatutMembre

NEU_DABEI_MAX = 6
NEU_DABEI_TAGE = 60
PREFERENZ = "neu_dabei_zeigen"


def _sieht_neu_dabei(user) -> bool:
    """Aktive Mitglieder und alle Rollen oberhalb „Mitglied“ ; Fan-Konten nicht."""
    if ROLE_LEVELS.get(getattr(user, "role", ""), 0) > ROLE_LEVELS[Role.MEMBRE]:
        return True
    membre = getattr(user, "membre", None)
    return membre is not None and membre.statut == StatutMembre.ACTIF


def _initial(nachname: str) -> str:
    nachname = (nachname or "").strip()
    return f"{nachname[0].upper()}." if nachname else ""


def _sektor_name(membre: Membre) -> str:
    from apps.regionen import (
        services as regionen,  # lokal : regionen importiert membres
    )

    region = regionen.region_von_gebiet(membre.pays, membre.land_de)
    return region.name if region else ""


def neu_dabei(user, heute=None) -> list[dict]:
    if not _sieht_neu_dabei(user):
        return []
    heute = heute or timezone.localdate()
    seit = heute - timedelta(days=NEU_DABEI_TAGE)
    mitglieder = (
        Membre.objects.filter(
            statut=StatutMembre.ACTIF,
            date_adhesion__gte=seit,
            user__isnull=False,
            **{f"user__ui_praeferenzen__{PREFERENZ}": True},
        )
        .exclude(prenom="")
        .order_by("-date_adhesion", "-created_at")[:NEU_DABEI_MAX]
    )
    return [
        {
            "id": str(m.id),
            "vorname": m.prenom.strip(),
            "initial": _initial(m.nom),
            "sektor": _sektor_name(m),
        }
        for m in mitglieder
    ]


def zahlen(heute=None) -> dict:
    """Summen über aktive Mitglieder. Städte werden ohne Groß-/Kleinschreibung gezählt."""
    heute = heute or timezone.localdate()
    aktive = Membre.objects.filter(statut=StatutMembre.ACTIF)
    monatsbeginn = heute.replace(day=1)
    staedte = {
        ort.strip().casefold()
        for ort in aktive.exclude(Q(ville_de="")).values_list("ville_de", flat=True)
        if ort and ort.strip()
    }
    return {
        "mitglieder": aktive.count(),
        "bundeslaender": aktive.exclude(land_de="")
        .values("land_de")
        .distinct()
        .count(),
        "staedte": len(staedte),
        "neu_im_monat": aktive.filter(date_adhesion__gte=monatsbeginn).count(),
        "monat": heute.strftime("%Y-%m"),
    }


def uebersicht(user, heute=None) -> dict:
    return {**zahlen(heute), "neu_dabei": neu_dabei(user, heute)}
