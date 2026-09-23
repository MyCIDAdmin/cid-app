"""Serializers — app rbac (ajouté le 2026-09-23). Voir views.py pour le détail des endpoints."""

from rest_framework import serializers

from .models import ModuleVisibiliteMembre, NiveauAcces, RoleDefinition, RoleModulePermission
from .registry import MODULES


def _valider_module(value: str) -> str:
    if value not in MODULES:
        raise serializers.ValidationError(f"Module inconnu : {value!r}.")
    return value


class RoleDefinitionSerializer(serializers.ModelSerializer):
    """CRUD des rôles. `is_system`/`slug` en lecture seule dans tous les cas (jamais modifiables
    via cette API, y compris à la création — un rôle créé via l'API est TOUJOURS `is_system=False`
    ; les 5 rôles système ne sont créés que par la migration de données, voir migrations/)."""

    class Meta:
        model = RoleDefinition
        fields = [
            "id", "slug", "nom", "description", "is_system", "ordre", "actif",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "is_system", "created_at", "updated_at"]

    def validate_slug(self, value):
        # Le slug n'est accepté qu'à la création (voir create() ci-dessous qui l'ignore de toute
        # façon en édition via read_only à l'update — cf. RoleDefinitionViewSet.perform_update).
        return value

    def create(self, validated_data):
        validated_data["is_system"] = False
        return super().create(validated_data)


class RoleModulePermissionCellSerializer(serializers.Serializer):
    """Une cellule de la matrice, en lecture (`GET /rbac/matrix/`) — inclut les cellules
    complétées par défaut (`aucun`) pour les couples (rôle, module) sans ligne en base, voir
    views.RoleModuleMatrixView."""

    role_id = serializers.UUIDField()
    module = serializers.CharField()
    niveau_acces = serializers.ChoiceField(choices=NiveauAcces.choices)


class RoleModulePermissionSetSerializer(serializers.Serializer):
    """Écriture d'une cellule (`POST /rbac/matrix/set/`)."""

    role_id = serializers.UUIDField()
    module = serializers.CharField(validators=[_valider_module])
    niveau_acces = serializers.ChoiceField(choices=NiveauAcces.choices)

    def validate_role_id(self, value):
        if not RoleDefinition.objects.filter(id=value).exists():
            raise serializers.ValidationError("Rôle introuvable.")
        return value


class ModuleVisibiliteCellSerializer(serializers.Serializer):
    """Une ligne de visibilité, en lecture — complétée par défaut (`visible=True`) pour les
    modules sans ligne en base, voir views.ModuleVisibiliteView."""

    module = serializers.CharField()
    visible = serializers.BooleanField()


class ModuleVisibiliteSetSerializer(serializers.Serializer):
    """Écriture d'une ligne de visibilité (`POST /rbac/visibilite-membre/set/`)."""

    module = serializers.CharField(validators=[_valider_module])
    visible = serializers.BooleanField()


class UserRolesAssignSerializer(serializers.Serializer):
    """Remplace intégralement l'ensemble des rôles d'un utilisateur
    (`POST /rbac/utilisateurs/{id}/roles/`)."""

    role_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)

    def validate_role_ids(self, value):
        trouves = set(
            RoleDefinition.objects.filter(id__in=value, actif=True).values_list("id", flat=True)
        )
        manquants = set(value) - trouves
        if manquants:
            raise serializers.ValidationError(f"Rôle(s) introuvable(s) ou inactif(s) : {manquants}.")
        return value
