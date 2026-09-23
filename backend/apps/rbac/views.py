"""
Vues API — app rbac (ajouté le 2026-09-23) :
  GET/POST         /rbac/roles/                        — lister / créer un rôle personnalisé
  PATCH/DELETE      /rbac/roles/{id}/                    — éditer / supprimer un rôle
  GET               /rbac/modules/                       — registre des modules (registry.MODULES)
  GET               /rbac/matrix/                        — matrice Rôle × Module (auto-complétée)
  POST              /rbac/matrix/set/                    — écrit UNE cellule de la matrice
  GET               /rbac/visibilite-membre/              — visibilité de menu, rôle Membre Normal
  POST              /rbac/visibilite-membre/set/          — écrit UNE ligne de visibilité
  GET               /rbac/visibilite-membre/effective/    — lecture publique (tout utilisateur
                                                             connecté) pour la Sidebar frontend
  GET/POST          /rbac/utilisateurs/{id}/roles/        — lit / remplace les rôles d'un user

Tout est réservé à l'Administrateur App (`IsSuperAdmin`, même classe que
`apps.accounts.views.ChangeUserRoleView`/`UsersListView`) SAUF `visibilite-membre/effective/`,
volontairement `IsAuthenticated` seul : c'est une lecture sans donnée sensible (juste des
booléens par module) dont TOUT utilisateur connecté a besoin pour construire sa propre barre de
navigation (voir Phase D / Sidebar.tsx). Chaque mutation est journalisée dans AuditLogEntry via
`apps.accounts.services.log_audit_event`, même convention que ChangeUserRoleView.
"""

from django.db import transaction
from django.db.models.deletion import ProtectedError
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import CursorPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from apps.accounts import services as accounts_services
from apps.accounts.models import ROLE_LEVELS, Role, User
from apps.accounts.permissions import IsSuperAdmin

from .exceptions import Conflict
from .models import ModuleVisibiliteMembre, NiveauAcces, RoleDefinition, RoleModulePermission, UserRoleAssignment
from .registry import MODULE_LABELS, MODULES
from .serializers import (
    ModuleVisibiliteSetSerializer,
    RoleDefinitionSerializer,
    RoleModulePermissionSetSerializer,
    UserRolesAssignSerializer,
)


def _client_ip(request) -> str:
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


# Niveau numérique par slug de rôle système — même valeurs que accounts.ROLE_LEVELS (clé Role
# enum), réindexées par chaîne pour comparer facilement aux slugs de RoleDefinition.
ROLE_LEVELS_PAR_SLUG = {role.value: niveau for role, niveau in ROLE_LEVELS.items()}


class RoleDefinitionCursorPagination(CursorPagination):
    """`CursorPagination.ordering` vaut "-created" par défaut dans DRF — RoleDefinition n'a pas
    ce champ (voir `created_at`), d'où ce sous-classement obligatoire (même convention que
    NotificationsCursorPagination et consorts, voir apps/notifications/views.py)."""

    page_size = 20
    ordering = ("ordre", "nom", "id")


class RoleDefinitionViewSet(ModelViewSet):
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    permission_classes = [IsSuperAdmin]
    serializer_class = RoleDefinitionSerializer
    queryset = RoleDefinition.objects.all()
    pagination_class = RoleDefinitionCursorPagination

    def perform_create(self, serializer):
        role = serializer.save()
        accounts_services.log_audit_event(
            "rbac_role_created",
            user=self.request.user,
            ip_address=_client_ip(self.request),
            role_id=str(role.id),
            slug=role.slug,
        )

    def perform_update(self, serializer):
        instance = serializer.instance
        if instance.is_system:
            raise PermissionDenied("Un rôle système n'est pas modifiable.")
        role = serializer.save()
        accounts_services.log_audit_event(
            "rbac_role_updated",
            user=self.request.user,
            ip_address=_client_ip(self.request),
            role_id=str(role.id),
            slug=role.slug,
        )

    def perform_destroy(self, instance):
        if instance.is_system:
            raise PermissionDenied("Un rôle système n'est pas supprimable.")
        role_id, slug = str(instance.id), instance.slug
        try:
            instance.delete()
        except ProtectedError as exc:
            raise Conflict(
                "Ce rôle est encore attribué à au moins un utilisateur — retirez-le d'abord."
            ) from exc
        accounts_services.log_audit_event(
            "rbac_role_deleted",
            user=self.request.user,
            ip_address=_client_ip(self.request),
            role_id=role_id,
            slug=slug,
        )


class ModulesListView(APIView):
    """Registre des modules — voir registry.py pour pourquoi c'est une constante Python plutôt
    qu'une table (auto-extension sans migration)."""

    permission_classes = [IsSuperAdmin]

    def get(self, request):
        return Response([{"slug": m, "label": MODULE_LABELS.get(m, m)} for m in MODULES])


def _matrice_completee() -> list[dict]:
    """Toutes les cellules (rôle actif × module) avec valeur par défaut "aucun" pour les couples
    sans ligne en base — voir docstring de RoleModulePermission."""
    existantes = {
        (str(p.role_id), p.module): p.niveau_acces
        for p in RoleModulePermission.objects.all()
    }
    cellules = []
    for role in RoleDefinition.objects.all():
        for module in MODULES:
            cellules.append(
                {
                    "role_id": role.id,
                    "module": module,
                    "niveau_acces": existantes.get((str(role.id), module), NiveauAcces.AUCUN),
                }
            )
    return cellules


class RoleModuleMatrixView(APIView):
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        roles = RoleDefinitionSerializer(RoleDefinition.objects.all(), many=True).data
        modules = [{"slug": m, "label": MODULE_LABELS.get(m, m)} for m in MODULES]
        return Response({"roles": roles, "modules": modules, "cells": _matrice_completee()})


class RoleModuleMatrixSetView(APIView):
    permission_classes = [IsSuperAdmin]

    def post(self, request):
        serializer = RoleModulePermissionSetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        role = get_object_or_404(RoleDefinition, id=data["role_id"])
        cellule, _created = RoleModulePermission.objects.update_or_create(
            role=role,
            module=data["module"],
            defaults={"niveau_acces": data["niveau_acces"], "modifie_par": request.user},
        )
        accounts_services.log_audit_event(
            "rbac_matrix_cell_set",
            user=request.user,
            ip_address=_client_ip(request),
            role_id=str(role.id),
            role_slug=role.slug,
            module=cellule.module,
            niveau_acces=cellule.niveau_acces,
        )
        return Response(
            {"role_id": role.id, "module": cellule.module, "niveau_acces": cellule.niveau_acces}
        )


class ModuleVisibiliteView(APIView):
    """Voir docstring de ModuleVisibiliteMembre — liste séparée de la matrice, spécifique au
    rôle système "Membre Normal"."""

    permission_classes = [IsSuperAdmin]

    def get(self, request):
        existantes = {v.module: v.visible for v in ModuleVisibiliteMembre.objects.all()}
        return Response(
            [{"module": m, "visible": existantes.get(m, True)} for m in MODULES]
        )


class ModuleVisibiliteSetView(APIView):
    permission_classes = [IsSuperAdmin]

    def post(self, request):
        serializer = ModuleVisibiliteSetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        ligne, _created = ModuleVisibiliteMembre.objects.update_or_create(
            module=data["module"],
            defaults={"visible": data["visible"], "modifie_par": request.user},
        )
        accounts_services.log_audit_event(
            "rbac_module_visibilite_set",
            user=request.user,
            ip_address=_client_ip(request),
            module=ligne.module,
            visible=ligne.visible,
        )
        return Response({"module": ligne.module, "visible": ligne.visible})


class ModuleVisibiliteEffectiveView(APIView):
    """Lecture publique (tout utilisateur connecté, voir docstring de module) — pas de donnée
    sensible, juste les booléens de visibilité déjà renvoyés par ModuleVisibiliteView."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        existantes = {v.module: v.visible for v in ModuleVisibiliteMembre.objects.all()}
        return Response({m: existantes.get(m, True) for m in MODULES})


class UserRolesView(APIView):
    """GET/POST /rbac/utilisateurs/{id}/roles/ — lit/remplace l'ensemble des rôles d'un
    utilisateur. `ChangeUserRoleView` (apps.accounts.views) reste inchangée en parallèle, chemin
    de repli sûr — voir docstring de module pour le détail de la synchronisation avec le
    CharField `user.role` legacy (2FA obligatoire, IsRHOrAbove, etc. en dépendent toujours)."""

    permission_classes = [IsSuperAdmin]

    def get(self, request, pk):
        target = get_object_or_404(User, pk=pk)
        role_ids = list(
            target.role_assignments.filter(role__actif=True).values_list("role_id", flat=True)
        )
        return Response({"user_id": target.id, "role_ids": role_ids, "role_primaire": target.role})

    def post(self, request, pk):
        target = get_object_or_404(User, pk=pk)
        if target.id == request.user.id:
            raise ValidationError("Vous ne pouvez pas modifier vos propres rôles.")

        serializer = UserRolesAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        nouveaux_ids = set(serializer.validated_data["role_ids"])

        # Le plancher "Membre Normal" est toujours présent (demande utilisateur : "Ein neuer
        # Benutzer erhält [...] die Rolle Normales Mitglieder") — jamais retirable par cette API.
        role_membre = RoleDefinition.objects.filter(slug=Role.MEMBRE, is_system=True).first()
        if role_membre and role_membre.id not in nouveaux_ids:
            nouveaux_ids.add(role_membre.id)

        anciens_ids = set(
            target.role_assignments.values_list("role_id", flat=True)
        )
        ancien_role_primaire = target.role

        with transaction.atomic():
            UserRoleAssignment.objects.filter(
                user=target, role_id__in=(anciens_ids - nouveaux_ids)
            ).delete()
            for role_id in nouveaux_ids - anciens_ids:
                UserRoleAssignment.objects.get_or_create(
                    user=target, role_id=role_id, defaults={"assigned_by": request.user}
                )

            # Rôle "primaire" = le rôle système du plus haut niveau parmi ceux attribués — c'est
            # lui qui continue de piloter 2FA obligatoire/IsRHOrAbove/etc. via le CharField
            # legacy (voir docstring de module), donc il doit toujours refléter la sélection.
            slugs_systeme = set(
                RoleDefinition.objects.filter(id__in=nouveaux_ids, is_system=True).values_list(
                    "slug", flat=True
                )
            )
            nouveau_role_primaire = max(
                (s for s in slugs_systeme if s in ROLE_LEVELS_PAR_SLUG),
                key=lambda s: ROLE_LEVELS_PAR_SLUG[s],
                default=Role.MEMBRE,
            )
            if nouveau_role_primaire != target.role:
                target.role = nouveau_role_primaire
                target.save(update_fields=["role"])

        if nouveau_role_primaire != ancien_role_primaire:
            accounts_services.log_audit_event(
                "role_changed",
                user=target,
                ip_address=_client_ip(request),
                decided_by=str(request.user.id),
                ancien_role=ancien_role_primaire,
                nouveau_role=nouveau_role_primaire,
            )
        accounts_services.log_audit_event(
            "rbac_roles_changed",
            user=target,
            ip_address=_client_ip(request),
            decided_by=str(request.user.id),
            anciens_roles=sorted(str(i) for i in anciens_ids),
            nouveaux_roles=sorted(str(i) for i in nouveaux_ids),
        )
        return Response(
            {
                "user_id": target.id,
                "role_ids": sorted(nouveaux_ids, key=str),
                "role_primaire": target.role,
            },
            status=status.HTTP_200_OK,
        )
