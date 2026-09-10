from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import AuditLogEntry, EmailOTP, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    model = User
    ordering = ["-created_at"]
    list_display = ["email", "role", "is_active", "is_staff", "last_successful_login"]
    list_filter = ["role", "is_active", "is_staff"]
    search_fields = ["email"]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        (
            "Rôle & statut",
            {"fields": ("role", "is_active", "is_staff", "is_superuser", "require_2fa")},
        ),
        ("Préférences", {"fields": ("langue_preferee",)}),
        ("Sécurité", {"fields": ("last_known_ip", "last_successful_login")}),
        ("Permissions", {"fields": ("groups", "user_permissions")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "password1", "password2", "role")}),
    )
    readonly_fields = ["last_known_ip", "last_successful_login"]


@admin.register(AuditLogEntry)
class AuditLogEntryAdmin(admin.ModelAdmin):
    list_display = ["action", "user", "ip_address", "created_at"]
    list_filter = ["action"]
    search_fields = ["user__email", "ip_address"]
    readonly_fields = [f.name for f in AuditLogEntry._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(EmailOTP)
class EmailOTPAdmin(admin.ModelAdmin):
    list_display = ["user", "purpose", "created_at", "expires_at", "consumed_at"]
    readonly_fields = [f.name for f in EmailOTP._meta.fields]

    def has_add_permission(self, request):
        return False
