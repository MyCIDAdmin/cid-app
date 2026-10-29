from django.conf import settings
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health_check(request):
    """Endpoint de santé — utilisé par Docker healthcheck et Railway."""
    return JsonResponse({"status": "ok", "service": "cid-backend"})


urlpatterns = [
    path("health/", health_check, name="health-check"),
    path("admin/", admin.site.urls),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/membres/", include("apps.membres.urls")),
    path("api/v1/cotisations/", include("apps.cotisations.urls")),
    path("api/v1/aktionen/", include("apps.cotisations.urls_aktionen")),
    path("api/v1/adhesions/", include("apps.adhesions.urls")),
    path("api/v1/evenements/", include("apps.evenements.urls")),
    path("api/v1/reisen/", include("apps.reisen.urls")),
    path("api/v1/boutique/", include("apps.boutique.urls")),
    path("api/v1/notifications/", include("apps.notifications.urls")),
    path("api/v1/stats/", include("apps.stats.urls")),
    path("api/v1/finances/", include("apps.finances.urls")),
    path("api/v1/votes/", include("apps.vote.urls")),
    path("api/v1/communaute/", include("apps.communaute.urls")),
    path("api/v1/projets/", include("apps.projets.urls")),
    path("api/v1/umfragen/", include("apps.umfragen.urls")),
    path("api/v1/kalender/", include("apps.kalender.urls")),
    path("api/v1/kalender-oeffentlich/", include("apps.kalender.urls_oeffentlich")),
    path("api/v1/rbac/", include("apps.rbac.urls")),
    path("api/v1/aktivitaet/", include("apps.aktivitaet.urls")),
    path("api/v1/uebersetzungen/", include("apps.uebersetzung.urls")),
    path("api/v1/partenaires/", include("apps.partenaires.urls")),
    path("api/v1/regionen/", include("apps.regionen.urls")),
    path("api/v1/support/", include("apps.support.urls")),
    path("api/v1/eintritt/", include("apps.eintritt.urls")),
    path("api/v1/zentral/", include("apps.zentral.urls")),
]

if settings.DEBUG:
    import debug_toolbar

    urlpatterns += [path("__debug__/", include(debug_toolbar.urls))]
