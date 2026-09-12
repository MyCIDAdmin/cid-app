"""Permissions API — app notifications. Aucune notion de rôle : chacun ne voit et ne modifie que
ses propres notifications (IDOR — SCD §2.3 A01, même défense en profondeur que
CotisationPermission/SouscriptionPermission/CommandePermission)."""

from rest_framework.permissions import BasePermission


class NotificationPermission(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        return obj.destinataire_id == request.user.id
