"""Regionen — Zuordnung von Personen, Mitgliederzahlen und Bearbeitungsrechte."""

from django.db.models import Q
from django.utils.text import slugify

from apps.membres.models import Membre, Pays, StatutMembre
from apps.rbac import services as rbac
from apps.rbac.models import NiveauAcces

from .models import RESERVIERTE_SLUGS, Region, RegionLand, RegionPays, Verantwortlicher

SEITE = "page_regionen"
# Länder außerhalb Deutschlands, die einem Sektor zugeordnet werden können (ohne „Autre“).
STAATEN = {code: str(name) for code, name in Pays.choices if code not in ("DE", "XX")}
_UMLAUTE = str.maketrans(
    {"ä": "ae", "ö": "oe", "ü": "ue", "Ä": "Ae", "Ö": "Oe", "Ü": "Ue", "ß": "ss"}
)


def region_von_land(land: str | None) -> Region | None:
    if not land:
        return None
    zuordnung = RegionLand.objects.filter(land=land, region__aktiv=True).select_related("region")
    treffer = zuordnung.first()
    return treffer.region if treffer else None


def region_von_pays(pays: str | None) -> Region | None:
    """Sektor für ein Land außerhalb Deutschlands (Deutschland selbst läuft über das Bundesland)."""
    if not pays or pays == Pays.ALLEMAGNE:
        return None
    treffer = RegionPays.objects.filter(pays=pays, region__aktiv=True).select_related("region")
    treffer = treffer.first()
    return treffer.region if treffer else None


def region_von_gebiet(pays: str | None, land: str | None) -> Region | None:
    """Wohnland und Bundesland → Sektor : in Deutschland zählt das Bundesland, sonst das Land."""
    if pays and pays != Pays.ALLEMAGNE:
        return region_von_pays(pays)
    return region_von_land(land)


def meine_region(user) -> Region | None:
    """Sektor aus Wohnland/Bundesland des Mitglieds- oder Fan-Profils ; sonst keiner."""
    membre = getattr(user, "membre", None)
    if membre is not None:
        return region_von_gebiet(membre.pays, membre.land_de)
    fan = getattr(user, "fan_profil", None)
    return region_von_gebiet(fan.pays, fan.land_de) if fan is not None else None


def gebiets_filter(region: Region, praefix: str = "") -> Q | None:
    """Q-Filter auf Membre/FanProfil (oder über `praefix`, z. B. „membre__“): Personen im Gebiet des
    Sektors – Bundesländer innerhalb Deutschlands oder Länder außerhalb.
    None = Sektor ohne Gebiet."""
    laender = list(region.laender.values_list("land", flat=True))
    staaten = list(region.staaten.values_list("pays", flat=True))
    bedingung = Q()
    if laender:
        bedingung |= Q(**{f"{praefix}pays": Pays.ALLEMAGNE, f"{praefix}land_de__in": laender})
    if staaten:
        bedingung |= Q(**{f"{praefix}pays__in": staaten})
    return bedingung if (laender or staaten) else None


def mitglieder_zahl(region: Region) -> int:
    bedingung = gebiets_filter(region)
    if bedingung is None:
        return 0
    return Membre.objects.filter(bedingung, statut=StatutMembre.ACTIF).count()


def ist_personenverwalter(user) -> bool:
    """Büro (Seite „Regionen“ mit Schreibrecht) und App Admin : Verantwortliche zuweisen und
    jede Regionsseite bearbeiten."""
    return rbac.has_admin_page_access(user, SEITE, NiveauAcces.LECTURE_ECRITURE)


def darf_berichte(user) -> bool:
    """Büro (Seite „Regionen“ mindestens lesend) und App Admin : Berichte über Fans und Regionen."""
    return rbac.has_admin_page_access(user, SEITE, NiveauAcces.LECTURE)


def darf_bearbeiten(user, region: Region) -> bool:
    if ist_personenverwalter(user):
        return True
    return Verantwortlicher.objects.filter(region=region, user=user).exists()


def eindeutiger_slug(name: str) -> str:
    umgeschrieben = name.translate(_UMLAUTE)
    basis = slugify(umgeschrieben)[:50] or "region"
    if basis in RESERVIERTE_SLUGS:
        basis = f"{basis}-region"
    slug, n = basis, 2
    while Region.objects.filter(slug=slug).exists():
        slug, n = f"{basis}-{n}", n + 1
    return slug


def anzeigename_von(user) -> str:
    person = getattr(user, "membre", None) or getattr(user, "fan_profil", None)
    return f"{person.prenom} {person.nom}".strip() if person is not None else ""


def buero_nutzer(ausser=None):
    """Aktive Konten, die Regionen verwalten dürfen (Empfänger für Freigaben)."""
    from apps.accounts.models import ROLE_LEVELS, Role, User

    stufe = ROLE_LEVELS[Role.BUREAU_ADMIN]
    rollen = [r for r, n in ROLE_LEVELS.items() if n >= stufe]
    kandidaten = User.objects.filter(role__in=rollen, is_active=True).exclude(pk=ausser)
    return [u for u in kandidaten if ist_personenverwalter(u)]


def naechste_veranstaltung(region: Region) -> dict | None:
    """Nächstes veröffentlichtes Treffen der Region (für die Übersicht aller Regionen)."""
    from django.utils import timezone

    v = region.veranstaltungen.filter(
        status="veroeffentlicht", datum__gte=timezone.localdate()
    ).first()
    if v is None:
        return None
    return {
        "id": str(v.id),
        "titel": v.titel,
        "datum": v.datum.isoformat(),
        "uhrzeit": v.uhrzeit.strftime("%H:%M") if v.uhrzeit else None,
        "ort": v.ort,
    }
