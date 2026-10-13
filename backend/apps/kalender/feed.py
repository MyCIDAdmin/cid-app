"""Schreibgeschützte Kalendereinträge aus anderen Modulen (Release 15) : veröffentlichte
Veranstaltungen, eigene Aufgaben-Fristen, Umfragen-Fristen, Abstimmungen und Spieltage."""

from datetime import datetime, time

from django.db.models import Q
from django.utils import timezone

from apps.adhesions.models import CampagneAdhesion, StatutCampagne
from apps.boutique.models import (
    Commande,
    Produit,
    ReservierungsModus,
    StatutCommande,
    StatutProduit,
)
from apps.communaute.models import Match, RencontreCalendrier, StatutRencontre
from apps.cotisations.models import ConfigurationRelance, Cotisation, StatutCotisation, TypeArticle
from apps.evenements.models import Evenement, StatutEvenement
from apps.membres.models import StatutMembre
from apps.projets.models import Aufgabe, Projet, ProjetMitglied, StatutAufgabe, StatutProjet
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


def _spiel_eintraege(von, bis) -> list[dict]:
    """Spiele : der synchronisierte Spielplan (GOAL API) ; live gepflegte `Match`-Einträge nur,
    wenn der Plan zur selben Zeit kein Spiel enthält (sonst doppelt)."""
    ergebnis = []
    plan = list(
        RencontreCalendrier.objects.filter(date_heure__gte=von, date_heure__lt=bis).exclude(
            statut=StatutRencontre.ANNULEE
        )
    )
    for r in plan:
        titel = f"{r.equipe_domicile} – {r.equipe_exterieur}"
        if r.statut == StatutRencontre.REPORTEE:
            titel += " (verschoben)"
        ergebnis.append(
            _eintrag(
                "spieltag",
                r.pk,
                titel,
                r.date_heure,
                beschreibung=r.competition,
                kategorie="spieltag",
                link="/live",
            )
        )
    for m in Match.objects.filter(date_heure__gte=von, date_heure__lt=bis):
        if any(abs((r.date_heure - m.date_heure).total_seconds()) < 6 * 3600 for r in plan):
            continue
        ergebnis.append(
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
    return ergebnis


def _vereins_fristen(von, bis, tag_von, tag_bis) -> list[dict]:
    """Fristen für alle Mitglieder : Zahlungsfrist einer Veranstaltung, Verlängerungsfrist einer
    Mitgliedschaftskampagne, Reservierungsfrist eines Shop-Artikels."""
    ergebnis = []
    for e in Evenement.objects.filter(
        statut=StatutEvenement.PUBLIE,
        date_limite_paiement__gte=tag_von,
        date_limite_paiement__lt=tag_bis,
    ):
        ergebnis.append(
            _eintrag(
                "event_zahlung",
                e.pk,
                f"Zahlungsfrist: {e.titre}",
                _tag_start(e.date_limite_paiement),
                ganztaegig=True,
                kategorie="frist",
                link=f"/evenements?evenement={e.pk}",
            )
        )
    for k in CampagneAdhesion.objects.filter(
        statut=StatutCampagne.PUBLIEE,
        date_limite_renouvellement__gte=tag_von,
        date_limite_renouvellement__lt=tag_bis,
    ):
        ergebnis.append(
            _eintrag(
                "kampagne",
                k.pk,
                f"Mitgliedschaft verlängern bis: {k.nom}",
                _tag_start(k.date_limite_renouvellement),
                ganztaegig=True,
                kategorie="frist",
                link="/mon-adhesion",
            )
        )
    for p in Produit.objects.filter(
        statut=StatutProduit.PUBLIE, reservierung_frist__gte=von, reservierung_frist__lt=bis
    ).exclude(reservierung_modus=ReservierungsModus.AUS):
        ergebnis.append(
            _eintrag(
                "shop_reservierung",
                p.pk,
                f"Reservierung bis: {p.nom}",
                p.reservierung_frist,
                kategorie="frist",
                link="/boutique",
            )
        )
    return ergebnis


def _eigene_fristen(membre, tag_von, tag_bis) -> list[dict]:
    """Nur für die betroffene Person : eigener Mitgliedsbeitrag und eigene Shop-Zahlung."""
    ergebnis = []
    if membre.statut == StatutMembre.ACTIF:
        for c in ConfigurationRelance.objects.filter(
            date_echeance__gte=tag_von, date_echeance__lt=tag_bis
        ):
            bezahlt = Cotisation.objects.filter(
                membre=membre,
                type_article=TypeArticle.COTISATION,
                annee=c.annee,
                statut=StatutCotisation.PAYEE,
            ).exists()
            if not bezahlt:
                ergebnis.append(
                    _eintrag(
                        "beitrag",
                        c.pk,
                        f"Mitgliedsbeitrag {c.annee} fällig",
                        _tag_start(c.date_echeance),
                        ganztaegig=True,
                        kategorie="frist",
                        sichtbarkeit="meine",
                        link="/mon-adhesion",
                    )
                )
    von = _tag_start(tag_von)
    bis = _tag_start(tag_bis)
    for b in Commande.objects.filter(
        membre=membre, statut=StatutCommande.EN_ATTENTE, zahlung_bis__gte=von, zahlung_bis__lt=bis
    ):
        ergebnis.append(
            _eintrag(
                "bestellung_zahlung",
                b.pk,
                "Shop: Zahlung fällig",
                b.zahlung_bis,
                kategorie="frist",
                sichtbarkeit="meine",
                link="/boutique",
            )
        )
    return ergebnis


def _projekt_fristen(membre, tag_von, tag_bis) -> list[dict]:
    """Projekt-Fristen für Projektmitglieder und Verantwortliche."""
    eigene = ProjetMitglied.objects.filter(membre=membre).values("projet_id")
    projekte = Projet.objects.filter(
        date_limite__gte=tag_von,
        date_limite__lt=tag_bis,
        statut__in=[StatutProjet.EN_COURS, StatutProjet.EN_PREPARATION],
    ).filter(Q(pk__in=eigene) | Q(responsable=membre))
    return [
        _eintrag(
            "projekt",
            p.pk,
            f"Projekt-Frist: {p.titre}",
            _tag_start(p.date_limite),
            ganztaegig=True,
            kategorie="projekt",
            sichtbarkeit="meine",
            link=f"/projets/{p.pk}",
        )
        for p in projekte
    ]


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
        eintraege.extend(_spiel_eintraege(von, bis))
        eintraege.extend(_vereins_fristen(von, bis, tag_von, tag_bis))
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
        eintraege.extend(_eigene_fristen(membre, tag_von, tag_bis))
        eintraege.extend(_projekt_fristen(membre, tag_von, tag_bis))
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
