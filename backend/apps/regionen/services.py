"""Regionen — Zuordnung von Personen, Mitgliederzahlen und Bearbeitungsrechte."""

from django.utils.text import slugify

from apps.membres.models import Membre, StatutMembre
from apps.rbac import services as rbac
from apps.rbac.models import NiveauAcces

from .models import RESERVIERTE_SLUGS, Region, RegionLand, Verantwortlicher

SEITE = "page_regionen"
_UMLAUTE = str.maketrans(
    {"ä": "ae", "ö": "oe", "ü": "ue", "Ä": "Ae", "Ö": "Oe", "Ü": "Ue", "ß": "ss"}
)


def region_von_land(land: str | None) -> Region | None:
    if not land:
        return None
    zuordnung = RegionLand.objects.filter(land=land, region__aktiv=True).select_related("region")
    treffer = zuordnung.first()
    return treffer.region if treffer else None


def meine_region(user) -> Region | None:
    """Region aus dem Bundesland des Mitglieds- oder Fan-Profils ; andere Konten haben keine."""
    membre = getattr(user, "membre", None)
    if membre is not None:
        return region_von_land(membre.land_de)
    fan = getattr(user, "fan_profil", None)
    return region_von_land(fan.land_de) if fan is not None else None


def mitglieder_zahl(region: Region) -> int:
    laender = list(region.laender.values_list("land", flat=True))
    if not laender:
        return 0
    return Membre.objects.filter(statut=StatutMembre.ACTIF, land_de__in=laender).count()


def ist_personenverwalter(user) -> bool:
    """Büro (Seite „Regionen“ mit Schreibrecht) und App Admin : Verantwortliche zuweisen und
    jede Regionsseite bearbeiten."""
    return rbac.has_admin_page_access(user, SEITE, NiveauAcces.LECTURE_ECRITURE)


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
