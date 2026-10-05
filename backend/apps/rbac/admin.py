from django import forms
from django.contrib import admin

from .models import ModuleVisibiliteMembre, RoleDefinition, RoleModulePermission, UserRoleAssignment
from .registry import VISIBILITE_KEYS, VISIBILITE_LABELS


@admin.register(RoleDefinition)
class RoleDefinitionAdmin(admin.ModelAdmin):
    list_display = ("nom", "slug", "is_system", "actif", "ordre")
    list_filter = ("is_system", "actif")
    search_fields = ("nom", "slug")


@admin.register(UserRoleAssignment)
class UserRoleAssignmentAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "assigned_at", "assigned_by")
    autocomplete_fields = ("user", "role", "assigned_by")


@admin.register(RoleModulePermission)
class RoleModulePermissionAdmin(admin.ModelAdmin):
    list_display = ("role", "module", "niveau_acces", "updated_at")
    list_filter = ("module", "niveau_acces")


class ModuleVisibiliteMembreForm(forms.ModelForm):
    module = forms.ChoiceField(choices=[(k, VISIBILITE_LABELS.get(k, k)) for k in VISIBILITE_KEYS])

    class Meta:
        model = ModuleVisibiliteMembre
        fields = ["module", "visible", "visible_non_membre"]


@admin.register(ModuleVisibiliteMembre)
class ModuleVisibiliteMembreAdmin(admin.ModelAdmin):
    form = ModuleVisibiliteMembreForm
    list_display = ("module", "visible", "visible_non_membre", "updated_at")
    list_editable = ("visible", "visible_non_membre")
