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
    path("api/v1/adhesions/", include("apps.adhesions.urls")),
    path("api/v1/evenements/", include("apps.evenements.urls")),
    path("api/v1/boutique/", include("apps.boutique.urls")),
    path("api/v1/notifications/", include("apps.notifications.urls")),
    # Les routes suivantes sont ajoutées au fur et à mesure de leur implémentation :
    # path("api/v1/votes/", include("apps.vote.urls")),
    # path("api/v1/stats/", include("apps.stats.urls")),
]

if settings.DEBUG:
    import debug_toolbar

    urlpatterns += [path("__debug__/", include(debug_toolbar.urls))]
