"""Schreibgeschützte Kalendereinträge aus anderen Modulen (Release 15) : veröffentlichte
Veranstaltungen, eigene Aufgaben-Fristen, Umfragen-Fristen, Abstimmungen und Spieltage."""

from datetime import datetime, time

from django.utils import timezone

from apps.communaute.models import Match
from apps.evenements.models import Evenement, StatutEvenement
from apps.projets.models import Aufgabe, StatutAufgabe
from apps.umfragen.models import Umfrage
from apps.vote.models import StatutSession, VoteSession

from .models import DienstEintragung
from .services import ist_aktives_mitglied, ist_verwaltung


def _tag_start(tag):
    return timezone.make_aware(datetime.combine(tag, time.min))


def _eintrag(quelle, objekt_id, titel, beginn, **extra):
    eintrag = {
        "id": f"{quelle}:{objekt_id}",
        "quelle": quelle,
        "objekt_id": str(objekt_id),
        "titel": titel,
        "beschreibung": "",
        "ort": "",
        "link": "",
        "ende": None,
        "ganztaegig": False,
        "wichtig": False,
        "sichtbarkeit": "mitglieder",
        "wiederholung": "keine",
        "uebersetzungen": {},
        "beginn": beginn,
    }
    eintrag.update(extra)
    return eintrag


def _dienst_eintraege(user, von, bis) -> list[dict]:
    """Eigene Dienste (Release 16) als Einträge in „Meine Termine & Aufgaben“."""
    zeilen = (
        DienstEintragung.objects.filter(user=user, dienst__beginn__gte=von, dienst__beginn__lt=bis)
        .select_related("dienst", "dienst__termin", "dienst__evenement")
        .order_by("dienst__beginn")
    )
    ergebnis = []
    for z in zeilen:
        d = z.dienst
        ort = d.termin.ort if d.termin_id else d.evenement.lieu
        bezug = d.termin.titel if d.termin_id else d.evenement.titre
        ergebnis.append(
            _eintrag(
                "dienst",
                d.pk,
                f"Dienst: {d.titel}",
                d.beginn,
                ende=d.ende,
                ort=ort or "",
                beschreibung=bezug,
                kategorie="dienst",
                sichtbarkeit="meine",
                link="/kalender",
            )
        )
    return ergebnis


def feed_eintraege(user, von, bis, *, nur_oeffentlich=False) -> list[dict]:
    """Einträge im Zeitraum [von, bis) ; `nur_oeffentlich` für die Seite ohne Anmeldung."""
    mitglied = (not nur_oeffentlich) and (ist_aktives_mitglied(user) or ist_verwaltung(user))
    eintraege: list[dict] = []
    tag_von, tag_bis = timezone.localtime(von).date(), timezone.localtime(bis).date()

    events = Evenement.objects.filter(
        statut=StatutEvenement.PUBLIE, date_evenement__gte=tag_von, date_evenement__lt=tag_bis
    )
    if not mitglied:
        events = events.filter(visible_public=True)
    for e in events:
        beginn = _tag_start(e.date_evenement)
        if e.heure:
            beginn = timezone.make_aware(datetime.combine(e.date_evenement, e.heure))
        ende = None
        if e.date_fin or e.heure_fin:
            ende_tag = e.date_fin or e.date_evenement
            ende = timezone.make_aware(datetime.combine(ende_tag, e.heure_fin or time.max))
        eintraege.append(
            _eintrag(
                "event",
                e.pk,
                e.titre,
                beginn,
                ende=ende,
                ganztaegig=e.heure is None,
                ort=e.lieu,
                kategorie="veranstaltung",
                sichtbarkeit="oeffentlich" if e.visible_public else "mitglieder",
                link=f"/evenements/{e.pk}",
                _objekt=e,
            )
        )
    if nur_oeffentlich:
        return eintraege

    if mitglied:
        for m in Match.objects.filter(date_heure__gte=von, date_heure__lt=bis):
            eintraege.append(
                _eintrag(
                    "spieltag",
                    m.pk,
                    f"Club Africain – {m.adversaire}",
                    m.date_heure,
                    ort=m.lieu,
                    beschreibung=m.competition,
                    kategorie="spieltag",
                    link="/live",
                )
            )
        for u in Umfrage.objects.filter(veroeffentlicht=True, frist__gte=von, frist__lt=bis):
            eintraege.append(
                _eintrag(
                    "umfrage",
                    u.pk,
                    f"Umfrage endet: {u.titel}",
                    u.frist,
                    kategorie="frist",
                    link=f"/umfragen/{u.pk}",
                )
            )
        for v in VoteSession.objects.filter(
            statut=StatutSession.OUVERTE, date_fin__gte=von, date_fin__lt=bis
        ):
            eintraege.append(
                _eintrag(
                    "abstimmung",
                    v.pk,
                    f"Abstimmung endet: {v.titre}",
                    v.date_fin,
                    kategorie="frist",
                    link="/votes",
                )
            )

    if user is not None and getattr(user, "is_authenticated", False):
        eintraege.extend(_dienst_eintraege(user, von, bis))

    membre = getattr(user, "membre", None) if user is not None else None
    if membre is not None:
        aufgaben = (
            Aufgabe.objects.filter(verantwortlich=membre, frist__gte=tag_von, frist__lt=tag_bis)
            .exclude(status=StatutAufgabe.ERLEDIGT)
            .select_related("projet")
        )
        for a in aufgaben:
            eintraege.append(
                _eintrag(
                    "aufgabe",
                    a.pk,
                    f"Aufgabe: {a.titel}",
                    _tag_start(a.frist),
                    ganztaegig=True,
                    kategorie="projekt",
                    sichtbarkeit="meine",
                    beschreibung=a.projet.titre,
                    link=f"/projets/{a.projet_id}",
                )
            )
    return eintraege
