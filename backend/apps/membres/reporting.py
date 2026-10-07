"""Mitglieder-Reporting (Nutzerwunsch 2026-10-07) : Mitgliederliste mit Statushistorie und eine
gemeinsame Aktivitätenliste (Mitgliedschaften, Bestellungen, Teilnahmen, Beiträge, Projekt-
beiträge, Projektmitarbeit, Statuswechsel) mit Filtern. Nur lesend ; Zugriff ab Rolle RH
(reporting_views.py). Die Filter der Mitgliederliste (MembreFilter) gelten auch für die
Aktivitäten, damit beide Ansichten dieselbe Auswahl zeigen."""

from datetime import date
from decimal import Decimal

from django.db.models import Count, DecimalField, Exists, F, OuterRef, Sum, Value
from django.db.models.functions import Cast, Coalesce
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.adhesions.models import Souscription
from apps.boutique.models import Commande
from apps.cotisations.models import Cotisation
from apps.evenements.models import Inscription
from apps.projets.models import ProjetMitglied

from .filters import MembreFilter
from .models import HistoriqueStatutMembre, Membre

NULL = Decimal("0.00")
TYPEN = [
    "mitgliedschaft",
    "bestellung",
    "teilnahme",
    "beitrag",
    "projektbeitrag",
    "projektmitarbeit",
    "statuswechsel",
]
# Eintragsarten, die in "Aktivitäten gesamt" eines Mitglieds zählen (Statuswechsel sind
# Verwaltungs-Historie, keine Aktivität des Mitglieds).
AKTIVITAETS_TYPEN = [t for t in TYPEN if t != "statuswechsel"]
# Stati, deren Beträge nicht in die Summen zählen (storniert, offen, nicht bezahlt ...).
NICHT_GEZAEHLT = {
    "mitgliedschaft": {"brouillon", "annulee", "rabais_refuse"},
    "bestellung": {"annulee", "remboursee"},
    "teilnahme": {"annulee"},
    "beitrag": {"en_attente", "echouee", "remboursee", "annulee"},
    "projektbeitrag": {"en_attente", "echouee", "remboursee", "annulee"},
}
_BETRAG = DecimalField(max_digits=10, decimal_places=2)
# NULL mit Typ: `SUM(NULL)` ist in PostgreSQL mehrdeutig ("function sum(unknown) is not unique").
_KEIN_BETRAG = Cast(Value(None), output_field=_BETRAG)


def _quelle(typ):
    if typ == "mitgliedschaft":
        return Souscription.objects.select_related("membre", "offre", "campagne").annotate(
            _datum=F("date_souscription"), _betrag=F("prix_paye")
        )
    if typ == "bestellung":
        return Commande.objects.select_related("membre").annotate(
            _datum=F("created_at"), _betrag=F("montant_total")
        )
    if typ == "teilnahme":
        return Inscription.objects.select_related("membre", "evenement").annotate(
            _datum=F("created_at"), _betrag=F("montant_paye")
        )
    if typ in ("beitrag", "projektbeitrag"):
        qs = Cotisation.objects.select_related("membre", "projet").annotate(
            _datum=Coalesce("date_paiement", "created_at"), _betrag=F("montant")
        )
        return qs.filter(projet__isnull=(typ == "beitrag"))
    if typ == "projektmitarbeit":
        return ProjetMitglied.objects.select_related("membre", "projet").annotate(
            _datum=F("created_at"), _betrag=_KEIN_BETRAG
        )
    return HistoriqueStatutMembre.objects.select_related("membre").annotate(
        _datum=F("date_effet"), _betrag=_KEIN_BETRAG
    )


def _titel(typ, o):
    if typ == "mitgliedschaft":
        return f"{o.offre.nom} ({o.campagne.nom})"
    if typ == "bestellung":
        return o.numero_commande
    if typ == "teilnahme":
        return o.evenement.titre
    if typ == "beitrag":
        return o.libelle
    if typ == "projektbeitrag":
        return f"{o.libelle} — {o.projet.titre}" if o.projet_id else o.libelle
    if typ == "projektmitarbeit":
        return f"{o.projet.titre} ({o.rolle})"
    return f"{o.annee}: {o.statut} ({o.raison})"


def _statut(typ, o):
    return "" if typ == "projektmitarbeit" else o.statut


def _datum(wert, name):
    if not wert:
        return None
    try:
        return date.fromisoformat(wert)
    except ValueError as exc:
        raise ValidationError({name: "Datum im Format JJJJ-MM-TT erwartet."}) from exc


def _zahl(wert, name):
    if wert in (None, ""):
        return None
    try:
        return Decimal(str(wert))
    except Exception as exc:  # decimal.InvalidOperation
        raise ValidationError({name: "Zahl erwartet."}) from exc


def _liste(wert):
    return [w.strip() for w in (wert or "").split(",") if w.strip()]


def gewaehlte_typen(params, standard=TYPEN):
    typen = [t for t in _liste(params.get("typ")) if t in TYPEN]
    return typen or list(standard)


def mitglieder_queryset(params):
    """Mitglieder nach MembreFilter plus Historien-Filter (`historie_statut`, `historie_jahr`)."""
    qs = MembreFilter(params, queryset=Membre.objects.all()).qs
    statut, jahr = params.get("historie_statut"), params.get("historie_jahr")
    if statut or jahr:
        historie = HistoriqueStatutMembre.objects.filter(membre=OuterRef("pk"))
        if statut:
            historie = historie.filter(statut=statut)
        if jahr:
            try:
                historie = historie.filter(annee=int(jahr))
            except ValueError as exc:
                raise ValidationError({"historie_jahr": "Jahreszahl erwartet."}) from exc
        qs = qs.filter(Exists(historie))
    if params.get("membre"):
        qs = qs.filter(pk=params["membre"])
    return qs


def _aktivitaets_queryset(typ, mitglieder, params):
    qs = _quelle(typ).filter(membre__in=mitglieder.values("pk"))
    von, bis = _datum(params.get("von"), "von"), _datum(params.get("bis"), "bis")
    if von:
        qs = qs.filter(_datum__date__gte=von)
    if bis:
        qs = qs.filter(_datum__date__lte=bis)
    status = params.get("aktivitaet_status")
    if status:
        qs = qs.filter(statut=status) if typ != "projektmitarbeit" else qs.none()
    min_betrag, max_betrag = _zahl(params.get("min_betrag"), "min_betrag"), _zahl(
        params.get("max_betrag"), "max_betrag"
    )
    if min_betrag is not None:
        qs = qs.filter(_betrag__gte=min_betrag)
    if max_betrag is not None:
        qs = qs.filter(_betrag__lte=max_betrag)
    return qs


def _gezaehlt(typ, qs):
    ausgeschlossen = NICHT_GEZAEHLT.get(typ)
    return qs.exclude(statut__in=ausgeschlossen) if ausgeschlossen else qs


def aktivitaeten(params, seite=None, seitengroesse=50):
    """Gemeinsame Aktivitätenliste, neueste zuerst. `seite=None` liefert alle Zeilen (Export).
    Gibt (zeilen, anzahl, summen_je_typ) zurück."""
    mitglieder = mitglieder_queryset(params)
    typen = gewaehlte_typen(params)
    quellen = {typ: _aktivitaets_queryset(typ, mitglieder, params) for typ in typen}

    eintraege = []
    for typ, qs in quellen.items():
        eintraege.extend((datum, typ, str(pk)) for pk, datum in qs.values_list("pk", "_datum"))
    eintraege.sort(key=lambda e: (e[0], e[1], e[2]), reverse=True)

    summen = {}
    for typ, qs in quellen.items():
        werte = _gezaehlt(typ, qs).aggregate(summe=Sum("_betrag"))
        summen[typ] = {"anzahl": qs.count(), "betrag": werte["summe"] or NULL}

    anzahl = len(eintraege)
    if seite is not None:
        start = (seite - 1) * seitengroesse
        eintraege = eintraege[start : start + seitengroesse]
    ids = {}
    for _datum_, typ, pk in eintraege:
        ids.setdefault(typ, []).append(pk)
    objekte = {
        typ: {str(o.pk): o for o in quellen[typ].filter(pk__in=pks)} for typ, pks in ids.items()
    }
    zeilen = []
    for datum, typ, pk in eintraege:
        o = objekte[typ][pk]
        zeilen.append(
            {
                "typ": typ,
                "id": pk,
                "datum": timezone.localtime(datum).isoformat(),
                "membre_id": str(o.membre_id),
                "membre_name": f"{o.membre.prenom} {o.membre.nom}",
                "numero_membre": o.membre.numero_membre,
                "titel": _titel(typ, o),
                "betrag": o._betrag,
                "statut": _statut(typ, o),
            }
        )
    return zeilen, anzahl, summen


def mitglieder_liste(params):
    """Alle Mitglieder der Auswahl mit Historie und Aktivitätszahlen (ungeseitet, sortiert)."""
    mitglieder = mitglieder_queryset(params).prefetch_related("historique_statuts")
    typen = gewaehlte_typen(params, AKTIVITAETS_TYPEN)
    zaehler = {}
    for typ in AKTIVITAETS_TYPEN:
        qs = _gezaehlt(typ, _aktivitaets_queryset(typ, mitglieder, params))
        zaehler[typ] = {
            z["membre"]: (z["n"], z["summe"] or NULL)
            for z in qs.values("membre").annotate(n=Count("id"), summe=Sum("_betrag"))
        }

    min_aktivitaeten = int(params["min_aktivitaeten"]) if params.get("min_aktivitaeten") else None
    ohne = params.get("ohne_aktivitaet") == "1"
    nur_typen = bool(_liste(params.get("typ")))
    zeilen = []
    for m in mitglieder:
        je_typ = {t: zaehler[t].get(m.pk, (0, NULL))[0] for t in AKTIVITAETS_TYPEN}
        gesamt = sum(je_typ.values())
        betrag = sum((zaehler[t].get(m.pk, (0, NULL))[1] for t in AKTIVITAETS_TYPEN), NULL)
        if nur_typen and not any(je_typ[t] for t in typen if t in je_typ):
            continue
        if min_aktivitaeten is not None and gesamt < min_aktivitaeten:
            continue
        if ohne and gesamt:
            continue
        historie = sorted(m.historique_statuts.all(), key=lambda h: (h.annee, h.date_effet))
        zeilen.append(
            {
                "id": str(m.pk),
                "numero_membre": m.numero_membre,
                "prenom": m.prenom,
                "nom": m.nom,
                "email": m.email,
                "pays": m.pays,
                "ville": m.ville_de,
                "statut": m.statut,
                "date_adhesion": m.date_adhesion.isoformat(),
                "historie": [
                    {
                        "annee": h.annee,
                        "statut": h.statut,
                        "raison": h.raison,
                        "date_effet": timezone.localtime(h.date_effet).date().isoformat(),
                    }
                    for h in reversed(historie)
                ],
                "aktivitaeten": je_typ,
                "aktivitaeten_gesamt": gesamt,
                "betrag_gesamt": betrag,
            }
        )
    sortierung = {
        "nom": lambda z: (z["nom"].lower(), z["prenom"].lower()),
        "aktivitaeten": lambda z: (-z["aktivitaeten_gesamt"], z["nom"].lower()),
        "betrag": lambda z: (-z["betrag_gesamt"], z["nom"].lower()),
        "date_adhesion": lambda z: (z["date_adhesion"], z["nom"].lower()),
        "numero_membre": lambda z: z["numero_membre"],
    }
    zeilen.sort(key=sortierung.get(params.get("sortierung"), sortierung["nom"]))
    return zeilen
