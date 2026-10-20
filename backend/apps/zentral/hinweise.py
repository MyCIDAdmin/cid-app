"""Automatische Hinweise für das Modul „Übersicht“ (2026-10-20).

Wählt aus Veranstaltungen, regionalen Veranstaltungen, Aktionen/Projekten und Shop-Artikeln die
wenigen, die jetzt zum Handeln motivieren: Termin/Frist bald, freie Plätze knapp, Artikel fast
ausverkauft. Schwellen und Höchstanzahl stehen in `ZentraleEinstellungen` (App-Administrator).

Die Texte entstehen im Frontend (DE/FR) aus den hier gelieferten Zahlen — der Server liefert nur
Fakten, nie formulierte Sätze. Es erscheint nur, was der Benutzer auch sehen und nutzen darf
(Menü-Sichtbarkeit/Nicht-Mitglieder-Barriere) und wofür er sich nicht schon angemeldet hat.
"""

from datetime import timedelta

from django.db.models import Count, Sum
from django.utils import timezone

from apps.evenements.models import Evenement, Inscription, StatutEvenement, StatutInscription
from apps.rbac.services import acces_cle_menu, est_membre_actif, visibilite_effective

from .models import ZentraleEinstellungen


def _tage_bis(datum, heute) -> int:
    return (datum - heute).days


def _plaetze_knapp(frei: int, gesamt: int, e: ZentraleEinstellungen) -> bool:
    return frei > 0 and (
        frei <= e.hinweis_plaetze_absolut or frei * 100 <= gesamt * e.hinweis_plaetze_prozent
    )


def _hinweis(art, objekt_id, titel, link, gruende, **werte):
    return {
        "id": f"{art}:{objekt_id}",
        "art": art,
        "titel": titel,
        "link": link,
        "gruende": gruende,
        "plaetze_frei": werte.get("plaetze_frei"),
        "plaetze_gesamt": werte.get("plaetze_gesamt"),
        "tage": werte.get("tage"),
        "bestand": werte.get("bestand"),
    }


def _sortierschluessel(hinweis):
    """Wichtigste zuerst: Plätze knapp UND Termin nah > Plätze knapp / Bestand knapp > nur Termin/
    Frist ; innerhalb davon: weniger Tage, dann weniger freie Plätze/Stück."""
    gruende = set(hinweis["gruende"])
    knapp = bool(gruende & {"plaetze", "bestand"})
    nah = bool(gruende & {"termin", "frist"})
    rang = 0 if (knapp and nah) else 1 if knapp else 2
    tage = hinweis["tage"] if hinweis["tage"] is not None else 999
    menge = hinweis["plaetze_frei"] if hinweis["plaetze_frei"] is not None else hinweis["bestand"]
    return (rang, tage, menge if menge is not None else 999, hinweis["titel"])


def _veranstaltungen(user, e, heute):

    mitglied = est_membre_actif(user)
    membre = getattr(user, "membre", None)
    angemeldet = set()
    if membre is not None:
        angemeldet = set(
            Inscription.objects.filter(membre=membre)
            .exclude(statut=StatutInscription.ANNULEE)
            .values_list("evenement_id", flat=True)
        )
    grenze = heute + timedelta(days=e.hinweis_tage_vorher)
    qs = Evenement.objects.filter(statut=StatutEvenement.PUBLIE, date_evenement__gte=heute)
    if not mitglied:
        qs = qs.filter(visible_public=True)
    ergebnis = []
    for ev in qs:
        if ev.pk in angemeldet:
            continue
        gruende, frei = [], None
        if ev.places_max is not None:
            frei = ev.places_restantes
            if frei is not None and frei <= 0:
                continue  # ausgebucht — nichts mehr zu sichern
            if frei is not None and _plaetze_knapp(frei, ev.places_max, e):
                gruende.append("plaetze")
        tage = _tage_bis(ev.date_evenement, heute)
        if ev.date_evenement <= grenze:
            gruende.append("termin")
        if not gruende:
            continue
        ergebnis.append(
            _hinweis(
                "evenement",
                ev.pk,
                ev.titre,
                f"/evenements?evenement={ev.pk}",
                gruende,
                plaetze_frei=frei if "plaetze" in gruende else None,
                plaetze_gesamt=ev.places_max if "plaetze" in gruende else None,
                tage=tage,
            )
        )
    return ergebnis


def _regionale_veranstaltungen(user, e, heute):
    from apps.regionen.models import Veranstaltung, VeranstaltungStatus

    grenze = heute + timedelta(days=e.hinweis_tage_vorher)
    qs = (
        Veranstaltung.objects.filter(status=VeranstaltungStatus.VEROEFFENTLICHT, datum__gte=heute)
        .select_related("region")
        .annotate(teilnehmer=Count("teilnahmen"))
    )
    meine = set(Veranstaltung.objects.filter(teilnahmen__user=user).values_list("pk", flat=True))
    ergebnis = []
    for v in qs:
        if v.pk in meine:
            continue
        gruende, frei = [], None
        if v.max_teilnehmer is not None:
            frei = v.max_teilnehmer - v.teilnehmer
            if frei <= 0:
                continue
            if _plaetze_knapp(frei, v.max_teilnehmer, e):
                gruende.append("plaetze")
        if v.datum <= grenze:
            gruende.append("termin")
        if not gruende:
            continue
        ergebnis.append(
            _hinweis(
                "veranstaltung",
                v.pk,
                v.titel,
                f"/regionen/{v.region.slug}",
                gruende,
                plaetze_frei=frei if "plaetze" in gruende else None,
                plaetze_gesamt=v.max_teilnehmer if "plaetze" in gruende else None,
                tage=_tage_bis(v.datum, heute),
            )
        )
    return ergebnis


def _projekte(user, e, heute):
    from apps.projets.models import ProjetMitglied, SichtbarkeitProjet, StatutProjet
    from apps.projets.permissions import sichtbare_projekte

    grenze = heute + timedelta(days=e.hinweis_tage_vorher)
    eigene = set()
    membre = getattr(user, "membre", None)
    if membre is not None:
        eigene = set(
            ProjetMitglied.objects.filter(membre=membre).values_list("projet_id", flat=True)
        )
    qs = sichtbare_projekte(user).filter(
        statut=StatutProjet.EN_COURS,
        sichtbarkeit=SichtbarkeitProjet.VEROEFFENTLICHT,
        date_limite__gte=heute,
        date_limite__lte=grenze,
    )
    return [
        _hinweis(
            "projekt",
            p.pk,
            p.titre,
            f"/projets/{p.pk}",
            ["frist"],
            tage=_tage_bis(p.date_limite, heute),
        )
        for p in qs
        if p.pk not in eigene
    ]


def _artikel(user, e, jetzt):
    from apps.boutique.models import PanierReservierung, Produit, StatutProduit, TypeProduit

    mitglied = est_membre_actif(user)
    gehalten = {
        zeile["variante__produit_id"]: zeile["menge"]
        for zeile in PanierReservierung.objects.filter(expire_le__gt=jetzt)
        .values("variante__produit_id")
        .annotate(menge=Sum("quantite"))
    }
    grenze = jetzt + timedelta(days=e.hinweis_tage_vorher)
    qs = (
        Produit.objects.filter(statut=StatutProduit.PUBLIE)
        .exclude(type_produit=TypeProduit.BON_ACHAT)
        .annotate(lager=Sum("variantes__stock"))
    )
    ergebnis = []
    for p in qs:
        if p.nur_mitglieder and not mitglied:
            continue
        frei = max((p.lager or 0) - gehalten.get(p.pk, 0), 0)
        if frei <= 0:
            continue
        gruende, tage = [], None
        if frei <= e.hinweis_lager_menge:
            gruende.append("bestand")
        if p.reservierung_frist and jetzt <= p.reservierung_frist <= grenze:
            gruende.append("frist")
            tage = _tage_bis(timezone.localtime(p.reservierung_frist).date(), jetzt.date())
        if not gruende:
            continue
        ergebnis.append(
            _hinweis(
                "artikel",
                p.pk,
                p.nom,
                f"/boutique/{p.pk}",
                gruende,
                bestand=frei if "bestand" in gruende else None,
                tage=tage,
            )
        )
    return ergebnis


def hinweise_fuer(user) -> list[dict]:
    """Die wichtigsten Hinweise für `user`, höchstens `hinweis_max_anzahl`."""
    e = ZentraleEinstellungen.get_solo()
    jetzt = timezone.now()
    heute = timezone.localdate()
    sichtbar = visibilite_effective(user)

    def offen(schluessel: str) -> bool:
        return acces_cle_menu(user, schluessel) and sichtbar.get(schluessel, True)

    alle: list[dict] = []
    if offen("evenements"):
        alle += _veranstaltungen(user, e, heute)
    if offen("regionen"):
        alle += _regionale_veranstaltungen(user, e, heute)
    if offen("projets"):
        alle += _projekte(user, e, heute)
    if offen("boutique"):
        alle += _artikel(user, e, jetzt)
    alle.sort(key=_sortierschluessel)
    return alle[: e.hinweis_max_anzahl]
