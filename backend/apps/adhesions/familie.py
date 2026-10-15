"""Familienpaket (Release 34) — Plätze, Preis und Kinder.

Kinder sind keine Mitglieder (siehe models.FamilienKind). Erwachsene im Paket werden in
Release 35 über eine Einladung eigene Mitglieder.
"""

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import FamilienKind, OffreAdhesion, Souscription

EINWILLIGUNG_VERSION = "2026-10-v1"
MAX_ALTER_KIND = 17
_NAME_MAX = 100


def pruefe_plaetze(offre: OffreAdhesion, erwachsene: int, kinder: int) -> None:
    if not offre.ist_familienpaket:
        if erwachsene or kinder:
            raise ValidationError({"plaetze": "Dieses Angebot ist kein Familienpaket."})
        return
    if erwachsene > offre.max_erwachsene:
        raise ValidationError(
            {"plaetze_erwachsene": f"Höchstens {offre.max_erwachsene} weitere Erwachsene."}
        )
    if kinder > offre.max_kinder:
        raise ValidationError({"plaetze_kinder": f"Höchstens {offre.max_kinder} Kinder."})


def pruefe_kinder_passen(souscription: Souscription | None, kinder: int) -> None:
    """Beim Ändern der gebuchten Plätze dürfen nicht weniger Plätze bleiben als Kinder
    eingetragen sind."""
    if souscription is None:
        return
    eingetragen = souscription.kinder.count()
    if eingetragen > kinder:
        raise ValidationError(
            {
                "plaetze_kinder": (
                    f"Es sind bereits {eingetragen} Kinder eingetragen. "
                    "Entferne zuerst Kinder oder buche mehr Plätze."
                )
            }
        )


def _name(daten, feld: str) -> str:
    wert = daten.get(feld, "")
    if not isinstance(wert, str) or not wert.strip():
        raise ValidationError({feld: "Pflichtfeld."})
    wert = wert.strip()
    if len(wert) > _NAME_MAX:
        raise ValidationError({feld: f"Höchstens {_NAME_MAX} Zeichen."})
    return wert


def naechste_kartennummer(souscription: Souscription) -> str:
    vorhanden = 0
    for nummer in souscription.kinder.values_list("kartennummer", flat=True):
        try:
            vorhanden = max(vorhanden, int(nummer.rsplit("-J", 1)[-1]))
        except ValueError:
            continue
    return f"{souscription.membre.numero_membre}-J{vorhanden + 1}"


def kind_anlegen(souscription: Souscription, user, daten) -> FamilienKind:
    offre = souscription.offre
    if not offre.ist_familienpaket:
        raise ValidationError({"detail": "kein_familienpaket"})
    if souscription.kinder.count() >= souscription.plaetze_kinder:
        raise ValidationError({"detail": "keine_plaetze"})
    if daten.get("einwilligung") is not True:
        raise ValidationError({"einwilligung": "Die Einwilligung ist erforderlich."})
    vorname, nachname = _name(daten, "vorname"), _name(daten, "nachname")
    jahr = timezone.localdate().year
    try:
        geburtsjahr = int(daten.get("geburtsjahr"))
    except (TypeError, ValueError):
        raise ValidationError({"geburtsjahr": "Jahreszahl erwartet."})
    if not (jahr - MAX_ALTER_KIND <= geburtsjahr <= jahr):
        raise ValidationError({"geburtsjahr": "Kinder müssen unter 18 Jahre alt sein."})
    return FamilienKind.objects.create(
        souscription=souscription,
        vorname=vorname,
        nachname=nachname,
        geburtsjahr=geburtsjahr,
        kartennummer=naechste_kartennummer(souscription),
        einwilligung_von=user,
        einwilligung_version=EINWILLIGUNG_VERSION,
    )
