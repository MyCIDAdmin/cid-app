"""
Vues API — app stats (FDD §5.3) :
  GET /stats/financier/   — ?annee=&ville=&statut=&land=&pays=
                             &date_adhesion_apres=&date_adhesion_avant=
  GET /stats/membres/     — ?ville=&statut=&land=&pays=
                             &date_adhesion_apres=&date_adhesion_avant=
  GET /stats/evenements/  — ?annee=&ville=&statut=&land=&pays=
                             &date_adhesion_apres=&date_adhesion_avant=
  GET /stats/finances/    — ?annee=&type_transaction=&tri=&ordre=&ville=&statut=&land=&pays=
                             &date_adhesion_apres=&date_adhesion_avant= (ajouté le 2026-09-25,
                             module "Statistiken & KPIs" : "Tab für alle Finanzdaten
                             (filterbar/sortierbar)")
  GET /stats/export/excel/ — mêmes filtres que ci-dessus, classeur .xlsx téléchargeable
  GET /stats/export/pdf/   — mêmes filtres, PDF résumé téléchargeable (demande utilisateur :
                              "Export als PDF/Excel-Dashboard")

land/pays/date_adhesion_apres/date_adhesion_avant ajoutés le 2026-09-19 (demande
utilisateur : "Bei ... Statistiken & KPIs füge mehr Filtermöglichten hinzu z.B.
Bundesland").

Pas de ModelViewSet : ce module n'a pas de modèle propre (voir models.py/services.py), seulement
des agrégations en lecture seule sur les modèles existants — de simples APIView suffisent, sans
pagination ni filtres DRF génériques (les filtres de la barre mockup #pg-stats sont des paramètres
de requête simples, traduits en arguments de services.py).
"""

from django.http import HttpResponse
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.finances.models import Depense
from apps.membres.utils_http import xlsx_response

from .bilan import bilan_annuel, ecritures_comptables
from .exports import construire_classeur_dashboard
from .exports_bilan import construire_classeur_bilan, construire_csv_buchungen
from .i18n import langue_aus_anfrage
from .pdf import generate_dashboard_pdf
from .pdf_bilan import generate_bilan_pdf
from .permissions import StatsPermission
from .pivot import (
    DIMENSIONEN,
    FILTER_MAX_WERTE,
    KENNZAHLEN,
    MAX_DIMENSIONEN,
    filter_optionen,
    pivot_berechnen,
    pivot_csv,
    pivot_excel,
)
from .services import (
    TYPES_TRANSACTION,
    finances_liste,
    kpis_evenements,
    kpis_financier,
    kpis_membres,
    kpis_projets,
)


def _annee_depuis_requete(request):
    brut = request.query_params.get("annee")
    if not brut:
        return None
    try:
        return int(brut)
    except ValueError as exc:
        raise ValidationError({"annee": "Doit être une année numérique."}) from exc


class BaseStatsView(APIView):
    permission_classes = [IsAuthenticated, StatsPermission]

    def _filtres_communs(self, request):
        # land/pays/date_adhesion_* ajoutés le 2026-09-19 (demande utilisateur : "Bei ...
        # Statistiken & KPIs füge mehr Filtermöglichten hinzu z.B. Bundesland") — voir
        # services._filtrer_par_membre.
        return {
            "ville": request.query_params.get("ville") or None,
            "statut": request.query_params.get("statut") or None,
            "land": request.query_params.get("land") or None,
            "pays": request.query_params.get("pays") or None,
            "date_adhesion_apres": request.query_params.get("date_adhesion_apres") or None,
            "date_adhesion_avant": request.query_params.get("date_adhesion_avant") or None,
        }


class StatsFinancierView(BaseStatsView):
    def get(self, request):
        return Response(
            kpis_financier(annee=_annee_depuis_requete(request), **self._filtres_communs(request))
        )


class StatsMembresView(BaseStatsView):
    def get(self, request):
        return Response(kpis_membres(**self._filtres_communs(request)))


class StatsEvenementsView(BaseStatsView):
    def get(self, request):
        return Response(
            kpis_evenements(annee=_annee_depuis_requete(request), **self._filtres_communs(request))
        )


class StatsProjetsView(BaseStatsView):
    """Projekt-Kennzahlen (2026-10-07) — Schnappschuss, ohne Jahres-/Mitgliederfilter."""

    def get(self, request):
        return Response(kpis_projets())


def _type_transaction_depuis_requete(request):
    brut = request.query_params.get("type_transaction") or None
    if brut and brut not in TYPES_TRANSACTION:
        raise ValidationError({"type_transaction": "Type de transaction inconnu."})
    return brut


def _mois_depuis_requete(request):
    brut = request.query_params.get("mois")
    if not brut:
        return None
    try:
        mois = int(brut)
    except ValueError as exc:
        raise ValidationError({"mois": "Doit être un nombre entre 1 et 12."}) from exc
    if not 1 <= mois <= 12:
        raise ValidationError({"mois": "Doit être un nombre entre 1 et 12."})
    return mois


def _finances_depuis_requete(request):
    return finances_liste(
        annee=_annee_depuis_requete(request),
        type_transaction=_type_transaction_depuis_requete(request),
        tri=request.query_params.get("tri") or "date",
        ordre=request.query_params.get("ordre") or "desc",
        mois=_mois_depuis_requete(request),
        **BaseStatsView()._filtres_communs(request),
    )


class StatsFinancesView(BaseStatsView):
    def get(self, request):
        return Response({"results": _finances_depuis_requete(request)})


_LIBELLES_FILTRES = {
    "de": {
        "jahr": "Jahr",
        "ville": "Stadt",
        "statut": "Status",
        "land": "Bundesland",
        "pays": "Land",
        "date_adhesion_apres": "Mitglied seit nach",
        "date_adhesion_avant": "Mitglied seit vor",
    },
    "fr": {
        "jahr": "Année",
        "ville": "Ville",
        "statut": "Statut",
        "land": "Bundesland",
        "pays": "Pays",
        "date_adhesion_apres": "Adhésion après",
        "date_adhesion_avant": "Adhésion avant",
    },
}


def _libelle_filtres(request, langue="de") -> str:
    """Textuelle Zusammenfassung der aktiven Filter (Untertitel des PDF) — hier statt in pdf.py,
    weil dort die rohen Abfrageparameter nicht bekannt sind."""
    lib = _LIBELLES_FILTRES[langue]
    annee = _annee_depuis_requete(request)
    morceaux = [f"{lib['jahr']} {annee}"] if annee else []
    for cle, valeur in BaseStatsView()._filtres_communs(request).items():
        if valeur:
            morceaux.append(f"{lib[cle]}: {valeur}")
    return " — ".join(morceaux) if morceaux else "—"


class StatsExportExcelView(BaseStatsView):
    def get(self, request):
        annee = _annee_depuis_requete(request)
        filtres = self._filtres_communs(request)
        classeur = construire_classeur_dashboard(
            kpis_financier=kpis_financier(annee=annee, **filtres),
            kpis_membres=kpis_membres(**filtres),
            kpis_evenements=kpis_evenements(annee=annee, **filtres),
            finances=finances_liste(annee=annee, **filtres),
            kpis_projets=kpis_projets(),
            langue=langue_aus_anfrage(request),
        )
        nom_fichier = f"dashboard_stats_{annee or ''}.xlsx".replace("__", "_")
        return xlsx_response(classeur, nom_fichier)


class StatsExportPdfView(BaseStatsView):
    def get(self, request):
        annee = _annee_depuis_requete(request)
        filtres = self._filtres_communs(request)
        langue = langue_aus_anfrage(request)
        pdf_bytes = generate_dashboard_pdf(
            kpis_financier=kpis_financier(annee=annee, **filtres),
            kpis_membres=kpis_membres(**filtres),
            kpis_evenements=kpis_evenements(annee=annee, **filtres),
            user=request.user,
            filtres_affiches=_libelle_filtres(request, langue),
            langue=langue,
            kpis_projets=kpis_projets(),
            finances=finances_liste(annee=annee, **filtres),
            mensuel=bilan_annuel(annee or timezone.localdate().year)["mensuel"],
        )
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = 'attachment; filename="dashboard_stats.pdf"'
        return response


def _annee_obligatoire(request):
    return _annee_depuis_requete(request) or timezone.localdate().year


class StatsBilanView(BaseStatsView):
    """GET /stats/bilan/?annee= — Jahresbilanz (recettes, dépenses par catégorie, Budget vs.
    Ist, courbe mensuelle, résultat par événement/projet). Pas de filtres membre : le bilan
    est celui de l'association entière."""

    def get(self, request):
        return Response(bilan_annuel(_annee_obligatoire(request)))


class StatsExportBilanExcelView(BaseStatsView):
    def get(self, request):
        annee = _annee_obligatoire(request)
        depenses = Depense.objects.filter(date_depense__year=annee).select_related(
            "categorie", "evenement", "projet", "saisie_par", "decide_par"
        )
        classeur = construire_classeur_bilan(
            bilan_annuel(annee), depenses, langue_aus_anfrage(request)
        )
        return xlsx_response(classeur, f"jahresbilanz_{annee}.xlsx")


class StatsExportBilanPdfView(BaseStatsView):
    def get(self, request):
        annee = _annee_obligatoire(request)
        pdf_bytes = generate_bilan_pdf(
            bilan=bilan_annuel(annee), user=request.user, langue=langue_aus_anfrage(request)
        )
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="jahresbilanz_{annee}.pdf"'
        return response


class StatsExportBuchungenCsvView(BaseStatsView):
    """GET /stats/export/buchungen-csv/?annee= — Buchungsliste für den Steuerberater."""

    def get(self, request):
        annee = _annee_obligatoire(request)
        langue = langue_aus_anfrage(request)
        contenu = construire_csv_buchungen(ecritures_comptables(annee, langue), langue)
        response = HttpResponse(contenu, content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="buchungen_{annee}.csv"'
        return response


def _liste(q, name):
    return [w.strip() for w in (q.get(name) or "").split(",") if w.strip()]


def _pivot_aus_anfrage(request):
    q = request.query_params
    zeilen = _liste(q, "zeilen") or ["kategorie"]
    spalten = _liste(q, "spalten")
    kennzahlen = _liste(q, "kennzahlen") or ["einnahmen", "ausgaben", "saldo"]
    alle = zeilen + spalten
    if any(d not in DIMENSIONEN for d in alle):
        raise ValidationError({"zeilen": "Unbekannte Dimension."})
    if len(set(alle)) != len(alle):
        raise ValidationError({"zeilen": "Eine Dimension kann nur einmal verwendet werden."})
    if len(zeilen) > MAX_DIMENSIONEN or len(spalten) > MAX_DIMENSIONEN:
        raise ValidationError({"zeilen": f"Höchstens {MAX_DIMENSIONEN} Dimensionen je Achse."})
    if any(k not in KENNZAHLEN for k in kennzahlen):
        raise ValidationError({"kennzahlen": "Unbekannte Kennzahl."})
    jahr_von, jahr_bis = _zeitraum(q)
    # Filter: f_<dimension>=wert1,wert2
    filter_ = {d: _liste(q, f"f_{d}")[:FILTER_MAX_WERTE] for d in DIMENSIONEN}
    filter_ = {d: w for d, w in filter_.items() if w}
    langue = langue_aus_anfrage(request)
    return (
        pivot_berechnen(
            zeilen_dims=zeilen,
            spalten_dims=spalten,
            kennzahlen=kennzahlen,
            jahr_von=jahr_von,
            jahr_bis=jahr_bis,
            langue=langue,
            filter_=filter_,
        ),
        langue,
    )


def _zeitraum(q):
    heute = timezone.localdate().year
    try:
        jahr_bis = int(q.get("jahr_bis") or heute)
        jahr_von = int(q.get("jahr_von") or jahr_bis - 2)
    except ValueError as exc:
        raise ValidationError({"jahr_von": "Jahre müssen Zahlen sein."}) from exc
    if jahr_von > jahr_bis or jahr_bis - jahr_von > 9:
        raise ValidationError({"jahr_von": "Zeitraum ungültig (höchstens 10 Jahre)."})
    return jahr_von, jahr_bis


class StatsPivotOptionenView(BaseStatsView):
    """GET /stats/pivot/optionen/?jahr_von=&jahr_bis= — Auswahlwerte für die Pivot-Filter."""

    def get(self, request):
        jahr_von, jahr_bis = _zeitraum(request.query_params)
        return Response(filter_optionen(jahr_von, jahr_bis, langue_aus_anfrage(request)))


class StatsPivotView(BaseStatsView):
    """GET /stats/pivot/?zeilen=a,b&spalten=c&kennzahlen=einnahmen,ausgaben&jahr_von=&jahr_bis=
    &f_<dimension>=w1,w2 — dynamische Auswertung der Buchungen (Einnahmen + freigegebene
    Ausgaben) nach frei gewählten Dimensionen, Kennzahlen und Filtern."""

    def get(self, request):
        ergebnis, _ = _pivot_aus_anfrage(request)
        return Response(ergebnis)


class StatsExportPivotView(BaseStatsView):
    """GET /stats/export/pivot/?datei=xlsx|csv — dieselben Parameter wie StatsPivotView."""

    def get(self, request):
        ergebnis, langue = _pivot_aus_anfrage(request)
        name = f"pivot_{ergebnis['jahr_von']}-{ergebnis['jahr_bis']}"
        if request.query_params.get("datei") == "csv":
            antwort = HttpResponse(
                pivot_csv(ergebnis, langue), content_type="text/csv; charset=utf-8"
            )
            antwort["Content-Disposition"] = f'attachment; filename="{name}.csv"'
            return antwort
        return xlsx_response(pivot_excel(ergebnis, langue), f"{name}.xlsx")
