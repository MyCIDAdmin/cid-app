from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    """Entièrement en lecture seule côté API — une notification n'est jamais créée ni modifiée
    par un appel client, seulement par `services.notifier` (voir son docstring), à l'exception du
    champ `lu` que `marquer-lue`/`tout-marquer-lu` (views.py) mettent à jour directement en base
    (pas via ce serializer, pour ne pas ouvrir PATCH sur le reste des champs)."""

    class Meta:
        model = Notification
        fields = [
            "id",
            "type_notification",
            "titre",
            "message",
            "lien",
            "lu",
            "created_at",
        ]
        read_only_fields = fields
