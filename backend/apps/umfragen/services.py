"""Zugriffsregeln der Umfragen."""

from django.contrib.contenttypes.models import ContentType

from apps.membres.models import StatutMembre
from apps.rbac.models import NiveauAcces
from apps.rbac.services import has_admin_page_access
from apps.uebersetzung.models import Uebersetzung
from apps.uebersetzung.services import felder_von, hash_von

from .models import ErgebnisModus, Zielgruppe


def ist_aktives_mitglied(user) -> bool:
    membre = getattr(user, "membre", None) if user is not None else None
    return membre is not None and membre.statut == StatutMembre.ACTIF


def ist_verwaltung(user, schreiben: bool = False) -> bool:
    if user is None or not user.is_authenticated:
        return False
    niveau = NiveauAcces.LECTURE_ECRITURE if schreiben else NiveauAcces.LECTURE
    return has_admin_page_access(user, "page_quiz", required=niveau)


def darf_teilnehmen(user, umfrage) -> bool:
    if user is None or not user.is_authenticated:
        return False
    if umfrage.zielgruppe == Zielgruppe.KONTEN:
        return True
    return ist_aktives_mitglied(user)


def kann_ergebnisse_sehen(user, umfrage, teilgenommen: bool) -> bool:
    if user is None:
        return False
    if ist_verwaltung(user):
        return True
    if not teilgenommen:
        return False
    if umfrage.ergebnis_modus == ErgebnisModus.LIVE:
        return True
    return umfrage.ergebnis_modus == ErgebnisModus.NACH_FRIST and umfrage.abgelaufen


def uebersetzungen_fuer_umfrage(umfrage) -> dict[str, dict]:
    """{objekt-id: {feld: {sprache: text}}} für Umfrage, Fragen und Optionen mit EINER Abfrage
    (statt einer je Objekt). Nur Übersetzungen, die zum aktuellen Originaltext passen."""
    objekte = [umfrage]
    for frage in umfrage.fragen.all():
        objekte.append(frage)
        objekte.extend(frage.optionen.all())
    cts = {ContentType.objects.get_for_model(o).id for o in objekte}
    nach_objekt: dict[str, list] = {}
    for u in Uebersetzung.objects.filter(
        content_type_id__in=cts, objekt_id__in=[str(o.pk) for o in objekte]
    ):
        nach_objekt.setdefault(u.objekt_id, []).append(u)
    ergebnis: dict[str, dict] = {}
    for o in objekte:
        felder = felder_von(o)
        eintrag: dict = {}
        for u in nach_objekt.get(str(o.pk), []):
            if u.feld in felder and u.text:
                if u.quell_hash == hash_von((getattr(o, u.feld, "") or "").strip()):
                    eintrag.setdefault(u.feld, {})[u.sprache] = u.text
        ergebnis[str(o.pk)] = eintrag
    return ergebnis
