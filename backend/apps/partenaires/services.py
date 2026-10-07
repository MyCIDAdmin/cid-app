"""Hilfen, die andere Apps (Projekte, Veranstaltungen) nutzen, um Partner-Logos anzuzeigen."""

from django.db.models import Prefetch

from .models import PartnerStatus, PartnerVerknuepfung


def logo_verknuepfungen():
    """Verknüpfungen, deren Partner-Logo gezeigt werden soll (Haken gesetzt, Logo vorhanden,
    Partner nicht archiviert)."""
    return (
        PartnerVerknuepfung.objects.filter(logo_anzeigen=True)
        .exclude(partner__statut=PartnerStatus.ARCHIVIERT)
        .exclude(partner__logo="")
        .exclude(partner__logo__isnull=True)
        .select_related("partner")
        .order_by("partner__nom")
    )


def logo_prefetch():
    """Für `prefetch_related` in Listen (vermeidet eine Abfrage je Projekt/Veranstaltung)."""
    return Prefetch(
        "partner_verknuepfungen", queryset=logo_verknuepfungen(), to_attr="_partner_logos"
    )


def partner_logos(objekt, feld: str) -> list[dict]:
    """`feld` ist "projet" oder "evenement". Je Partner höchstens ein Eintrag."""
    verknuepfungen = getattr(objekt, "_partner_logos", None)
    if verknuepfungen is None:
        verknuepfungen = list(logo_verknuepfungen().filter(**{feld: objekt}))
    gesehen, ergebnis = set(), []
    for v in verknuepfungen:
        if v.partner_id in gesehen:
            continue
        gesehen.add(v.partner_id)
        ergebnis.append(
            {
                "id": str(v.partner_id),
                "nom": v.partner.nom,
                "logo_url": v.partner.logo.url,
                "website": v.partner.website,
                "rolle": v.rolle,
            }
        )
    return ergebnis
