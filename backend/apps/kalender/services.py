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

from .models import (
    Dienst,
    DienstEintragung,
    Kreis,
    Sichtbarkeit,
    Termin,
    TerminEinladung,
    TerminStatus,
    Wiederholung,
)

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


PRIVAT = Q(sichtbarkeit=Sichtbarkeit.KREIS, kreis=Kreis.PRIVAT)


def event_ids(user) -> set:
    """Veranstaltungen, deren Event-Team `user` durch einen Dienst angehört."""
    zeilen = DienstEintragung.objects.filter(user=user).values_list(
        "dienst__evenement_id", "dienst__termin__evenement_id"
    )
    return {i for paar in zeilen for i in paar if i}


def team_nutzer(termin) -> set:
    """Event-Team eines Termins : alle mit einem Dienst an der Veranstaltung oder am Termin."""
    from apps.accounts.models import User

    q = Q(kalender_dienste__dienst__termin=termin)
    if termin.evenement_id:
        q |= Q(kalender_dienste__dienst__evenement_id=termin.evenement_id)
        q |= Q(kalender_dienste__dienst__termin__evenement_id=termin.evenement_id)
    return set(User.objects.filter(q, is_active=True).distinct())


def sichtbare_termine(user, ansicht: str):
    """Queryset der für `user` sichtbaren Termine in der Ansicht `verein`, `buero` oder `meine`
    (Vorschläge nur für Verfasser und Verwaltung ; „Privat“ nur für Verfasser und Eingeladene)."""
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
    team_kreis = Q(sichtbarkeit=Sichtbarkeit.KREIS, kreis=Kreis.EVENT_TEAM) & (
        Q(evenement_id__in=event_ids(user)) | Q(dienste__eintraege__user=user)
    )
    if ansicht == "meine":
        return Termin.objects.filter(
            eigene | (freigegeben & (projekt_kreis | team_kreis))
        ).distinct()

    # buero
    if verw or ROLE_LEVELS.get(user.role, 0) >= ROLE_LEVELS[Role.BUREAU_ADMIN]:
        alle = Q(status__in=[TerminStatus.FREIGEGEBEN, TerminStatus.VORGESCHLAGEN]) & ~PRIVAT
        return Termin.objects.filter(alle | eigene).distinct()
    stufen = [Sichtbarkeit.OEFFENTLICH, Sichtbarkeit.MITGLIEDER, Sichtbarkeit.AUFGABENTRAEGER]
    return Termin.objects.filter(
        (freigegeben & (Q(sichtbarkeit__in=stufen) | projekt_kreis | team_kreis)) | eigene
    ).distinct()


def sichtbare_dienste(user):
    """Dienste an sichtbaren Terminen ; Dienste an Veranstaltungen sehen alle aktiven Mitglieder
    (veröffentlichte Veranstaltungen) und die Verwaltung (alle)."""
    from apps.evenements.models import StatutEvenement

    ids = Q()
    for ansicht in ("verein", "buero", "meine"):
        ids |= Q(termin_id__in=sichtbare_termine(user, ansicht).values("pk"))
    if ist_verwaltung(user):
        ids |= Q(evenement__isnull=False)
    elif ist_aktives_mitglied(user):
        ids |= Q(evenement__statut=StatutEvenement.PUBLIE)
    return Dienst.objects.filter(ids).select_related("termin", "evenement", "faehigkeit")


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


def termine_fuer(user):
    """Alle Termine, die `user` sehen darf (in irgendeiner Sicht) — Grundlage für Detailzugriffe."""
    if ist_verwaltung(user, schreiben=True):
        # „Privat“ bleibt auch der Verwaltung verborgen (nur Verfasser und Eingeladene).
        eigene = Q(erstellt_von=user) | Q(einladungen__user=user)
        return (
            Termin.objects.select_related("projekt", "evenement")
            .filter(~PRIVAT | eigene)
            .distinct()
        )
    sichtbar = Q()
    for ansicht in ("verein", "buero", "meine"):
        sichtbar |= Q(pk__in=sichtbare_termine(user, ansicht).values("pk"))
    return Termin.objects.select_related("projekt", "evenement").filter(sichtbar).distinct()
