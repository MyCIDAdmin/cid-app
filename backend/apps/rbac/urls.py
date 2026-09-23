from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    MesAccesView,
    ModulesListView,
    ModuleVisibiliteEffectiveView,
    ModuleVisibiliteSetView,
    ModuleVisibiliteView,
    RoleDefinitionViewSet,
    RoleModuleMatrixSetView,
    RoleModuleMatrixView,
    UserRolesView,
)

app_name = "rbac"

router = DefaultRouter()
router.register("roles", RoleDefinitionViewSet, basename="role")

urlpatterns = [
    path("modules/", ModulesListView.as_view(), name="modules-list"),
    path("matrix/", RoleModuleMatrixView.as_view(), name="matrix"),
    path("matrix/set/", RoleModuleMatrixSetView.as_view(), name="matrix-set"),
    path("visibilite-membre/", ModuleVisibiliteView.as_view(), name="visibilite-membre"),
    path("visibilite-membre/set/", ModuleVisibiliteSetView.as_view(), name="visibilite-membre-set"),
    path(
        "visibilite-membre/effective/",
        ModuleVisibiliteEffectiveView.as_view(),
        name="visibilite-membre-effective",
    ),
    path("utilisateurs/<uuid:pk>/roles/", UserRolesView.as_view(), name="user-roles"),
    path("mes-acces/", MesAccesView.as_view(), name="mes-acces"),
] + router.urls
