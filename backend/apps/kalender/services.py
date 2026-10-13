"""Zugriffsregeln, Sichtbarkeit, Wiederholungen und Übersetzungen des Kalenders."""

from datetime import datetime, time, timedelta

from dateutil.relativedelta import relativedelta
from django.contrib.contenttypes.models import ContentType
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import ROLE_LEVELS, Role
from apps.membres.models import StatutMembre
from apps.projets.models import Aufgabe, ProjetMitglied, StatutAufgabe
from apps.rbac.models import NiveauAcces
from apps.rbac.services import has_admin_page_access
from apps.uebersetzung.models import Uebersetzung
from apps.uebersetzung.services import felder_von, hash_von

from .models import Kreis, Sichtbarkeit, Termin, TerminEinladung, TerminStatus, Wiederholung

MAX_VORKOMMEN = 400


def _membre(user):
    return getattr(user, "membre", None) if user is not None else None


def ist_aktives_mitglied(user) -> bool:
    membre = _membre(user)
    return membre is not None and membre.statut == StatutMembre.ACTIF


def ist_verwaltung(user, schreiben: bool = False) -> bool:
    """Seite „Kalender“ der Rollenverwaltung : Lesen = Büro-Kalender komplett sehen, Schreiben =
    Termine anlegen, freigeben und bearbeiten. Das Bureau und höher hat Schreibrechte (Seed)."""
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    required = NiveauAcces.LECTURE_ECRITURE if schreiben else NiveauAcces.LECTURE
    return has_admin_page_access(user, "page_kalender", required=required)


def darf_vorschlagen(user) -> bool:
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    return ist_verwaltung(user, schreiben=True) or has_admin_page_access(
        user, "page_kalender_vorschlag"
    )


def projekt_ids(user) -> set:
    membre = _membre(user)
    if membre is None:
        return set()
    return set(ProjetMitglied.objects.filter(membre=membre).values_list("projet_id", flat=True))


def ist_aufgabentraeger(user) -> bool:
    """Automatisch : Teammitglied eines Projekts (auch Stelleninhaber), zugewiesene offene Aufgabe
    oder Einladung zu einem Termin. Dazu jeder mit Verwaltungszugang."""
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    if ist_verwaltung(user) or ROLE_LEVELS.get(user.role, 0) >= ROLE_LEVELS[Role.BUREAU_ADMIN]:
        return True
    membre = _membre(user)
    if membre is not None:
        if ProjetMitglied.objects.filter(membre=membre).exists():
            return True
        if (
            Aufgabe.objects.filter(verantwortlich=membre)
            .exclude(status=StatutAufgabe.ERLEDIGT)
            .exists()
        ):
            return True
    return TerminEinladung.objects.filter(user=user).exists()


def zugang(user) -> dict:
    verw = ist_verwaltung(user)
    return {
        "verein": ist_aktives_mitglied(user) or verw,
        "buero": ist_aufgabentraeger(user),
        "schreiben": ist_verwaltung(user, schreiben=True),
        "vorschlagen": darf_vorschlagen(user),
        "verwaltung": verw,
    }


def sichtbare_termine(user, ansicht: str):
    """Queryset der für `user` sichtbaren Termine in der Ansicht `verein`, `buero` oder `meine`
    (Entwürfe/Vorschläge nur für Verfasser und Verwaltung)."""
    freigegeben = Q(status=TerminStatus.FREIGEGEBEN)
    if user is None or not getattr(user, "is_authenticated", False):
        return Termin.objects.filter(freigegeben, sichtbarkeit=Sichtbarkeit.OEFFENTLICH)
    verw = ist_verwaltung(user)
    mitglied = ist_aktives_mitglied(user) or verw
    eigene = Q(erstellt_von=user) | Q(einladungen__user=user)

    if ansicht == "verein":
        stufen = [Sichtbarkeit.OEFFENTLICH] + ([Sichtbarkeit.MITGLIEDER] if mitglied else [])
        return Termin.objects.filter(freigegeben, sichtbarkeit__in=stufen)

    meine_projekte = projekt_ids(user)
    projekt_kreis = Q(
        sichtbarkeit=Sichtbarkeit.KREIS, kreis=Kreis.PROJEKT, projekt_id__in=meine_projekte
    )
    if ansicht == "meine":
        return Termin.objects.filter(eigene | (freigegeben & projekt_kreis)).distinct()

    # buero
    if verw or ROLE_LEVELS.get(user.role, 0) >= ROLE_LEVELS[Role.BUREAU_ADMIN]:
        alle = Q(status__in=[TerminStatus.FREIGEGEBEN, TerminStatus.VORGESCHLAGEN])
        return Termin.objects.filter(alle | eigene).distinct()
    stufen = [Sichtbarkeit.OEFFENTLICH, Sichtbarkeit.MITGLIEDER, Sichtbarkeit.AUFGABENTRAEGER]
    return Termin.objects.filter(
        (freigegeben & (Q(sichtbarkeit__in=stufen) | projekt_kreis)) | eigene
    ).distinct()


def kann_termin_sehen(user, termin) -> bool:
    return any(
        sichtbare_termine(user, ansicht).filter(pk=termin.pk).exists()
        for ansicht in ("verein", "buero", "meine")
    )


# --- Wiederholungen -------------------------------------------------------------------------
def _naechster(beginn, wiederholung, schritt: int):
    if wiederholung == Wiederholung.WOECHENTLICH:
        return beginn + timedelta(weeks=schritt)
    if wiederholung == Wiederholung.ZWEIWOECHENTLICH:
        return beginn + timedelta(weeks=2 * schritt)
    return beginn + relativedelta(months=schritt)


def vorkommen(termin, von, bis):
    """Alle (beginn, ende) des Termins im Zeitraum [von, bis)."""
    dauer = (termin.ende - termin.beginn) if termin.ende else None
    ergebnis = []
    if termin.wiederholung == Wiederholung.KEINE:
        starts = [termin.beginn]
    else:
        grenze = bis
        if termin.wiederholung_bis:
            ende_tag = timezone.make_aware(
                datetime.combine(termin.wiederholung_bis + timedelta(days=1), time.min)
            )
            grenze = min(bis, ende_tag)
        starts = []
        for i in range(MAX_VORKOMMEN):
            start = _naechster(termin.beginn, termin.wiederholung, i)
            if start >= grenze:
                break
            starts.append(start)
    for start in starts:
        ende = start + dauer if dauer is not None else None
        if start < bis and (ende or start) >= von:
            ergebnis.append((start, ende))
    return ergebnis


def naechster_start(termin, ab):
    """Nächster Beginn des Termins ab `ab` (für Erinnerungen) oder None."""
    for start, _ende in vorkommen(termin, ab, ab + timedelta(days=370)):
        if start >= ab:
            return start
    return None


# --- Übersetzungen ---------------------------------------------------------------------------
def uebersetzungen_fuer(objekte) -> dict[str, dict]:
    """{objekt-id: {feld: {sprache: text}}} für beliebige registrierte Objekte, EINE Abfrage."""
    objekte = [o for o in objekte if felder_von(o)]
    if not objekte:
        return {}
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
