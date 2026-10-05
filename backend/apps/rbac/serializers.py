"""Serializers — app rbac (ajouté le 2026-09-23). Voir views.py pour le détail des endpoints."""

from rest_framework import serializers

from .models import NiveauAcces, RoleDefinition
from .registry import ALL_MODULES, MODULES, VISIBILITE_KEYS


def _valider_module_donnees(value: str) -> str:
    """Pour ModuleVisibiliteSetSerializer UNIQUEMENT — la visibilité de menu (rôle Membre Normal)
    ne concerne que les 10 modules de données, jamais les 13 pages de gestion de registry.
    PAGES_ADMIN (concept séparé, voir docstring de ModuleVisibiliteMembre)."""
    if value not in MODULES:
        raise serializers.ValidationError(f"Module inconnu : {value!r}.")
    return value


def _valider_module_matrice(value: str) -> str:
    """Pour RoleModulePermissionSetSerializer — la matrice couvre les 10 modules de données ET
    (depuis la Phase D) les 13 pages de gestion, voir registry.ALL_MODULES."""
    if value not in ALL_MODULES:
        raise serializers.ValidationError(f"Module inconnu : {value!r}.")
    return value


class RoleDefinitionSerializer(serializers.ModelSerializer):
    """CRUD des rôles. `is_system`/`slug` en lecture seule dans tous les cas (jamais modifiables
    via cette API, y compris à la création — un rôle créé via l'API est TOUJOURS `is_system=False`
    ; les 5 rôles système ne sont créés que par la migration de données, voir migrations/)."""

    class Meta:
        model = RoleDefinition
        fields = [
            "id",
            "slug",
            "nom",
            "description",
            "is_system",
            "ordre",
            "actif",
            "created_at",
            "updated_at",
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
    module = serializers.CharField(validators=[_valider_module_matrice])
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
    visible_non_membre = serializers.BooleanField()


def _valider_cle_visibilite(value: str) -> str:
    if value not in VISIBILITE_KEYS:
        raise serializers.ValidationError(f"Module inconnu : {value}")
    return value


class ModuleVisibiliteSetSerializer(serializers.Serializer):
    """Écriture d'une cellule de visibilité (`POST /rbac/visibilite-membre/set/`) — `groupe`
    choisit la colonne (point 9, 2026-10-05), "membre" par défaut (compatibilité)."""

    module = serializers.CharField(validators=[_valider_cle_visibilite])
    visible = serializers.BooleanField()
    groupe = serializers.ChoiceField(choices=["membre", "non_membre"], default="membre")


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
            raise serializers.ValidationError(
                f"Rôle(s) introuvable(s) ou inactif(s) : {manquants}."
            )
        return value
