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
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.membres.utils_http import xlsx_response

from .exports import construire_classeur_dashboard
from .pdf import generate_dashboard_pdf
from .permissions import StatsPermission
from .services import (
    TYPES_TRANSACTION,
    finances_liste,
    kpis_evenements,
    kpis_financier,
    kpis_membres,
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


def _type_transaction_depuis_requete(request):
    brut = request.query_params.get("type_transaction") or None
    if brut and brut not in TYPES_TRANSACTION:
        raise ValidationError({"type_transaction": "Type de transaction inconnu."})
    return brut


def _finances_depuis_requete(request):
    return finances_liste(
        annee=_annee_depuis_requete(request),
        type_transaction=_type_transaction_depuis_requete(request),
        tri=request.query_params.get("tri") or "date",
        ordre=request.query_params.get("ordre") or "desc",
        **BaseStatsView()._filtres_communs(request),
    )


class StatsFinancesView(BaseStatsView):
    def get(self, request):
        return Response({"results": _finances_depuis_requete(request)})


_LIBELLES_FILTRES = {
    "ville": "Ville",
    "statut": "Statut",
    "land": "Bundesland",
    "pays": "Pays",
    "date_adhesion_apres": "Adhésion après",
    "date_adhesion_avant": "Adhésion avant",
}


def _libelle_filtres(request) -> str:
    """Résumé textuel des filtres actifs, affiché en sous-titre du PDF (voir
    apps.stats.pdf.generate_dashboard_pdf) — construit ici plutôt que dans pdf.py, qui ne connaît
    pas les paramètres de requête bruts."""
    annee = _annee_depuis_requete(request)
    morceaux = [f"Année {annee}"] if annee else []
    for cle, valeur in BaseStatsView()._filtres_communs(request).items():
        if valeur:
            morceaux.append(f"{_LIBELLES_FILTRES[cle]} : {valeur}")
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
        )
        nom_fichier = f"dashboard_stats_{annee or ''}.xlsx".replace("__", "_")
        return xlsx_response(classeur, nom_fichier)


class StatsExportPdfView(BaseStatsView):
    def get(self, request):
        annee = _annee_depuis_requete(request)
        filtres = self._filtres_communs(request)
        pdf_bytes = generate_dashboard_pdf(
            kpis_financier=kpis_financier(annee=annee, **filtres),
            kpis_membres=kpis_membres(**filtres),
            kpis_evenements=kpis_evenements(annee=annee, **filtres),
            user=request.user,
            filtres_affiches=_libelle_filtres(request),
        )
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = 'attachment; filename="dashboard_stats.pdf"'
        return response
