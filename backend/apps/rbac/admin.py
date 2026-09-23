from django.contrib import admin

from .models import ModuleVisibiliteMembre, RoleDefinition, RoleModulePermission, UserRoleAssignment


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


@admin.register(ModuleVisibiliteMembre)
class ModuleVisibiliteMembreAdmin(admin.ModelAdmin):
    list_display = ("module", "visible", "updated_at")
