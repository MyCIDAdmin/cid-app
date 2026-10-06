from rest_framework import serializers

from .services import uebersetzungen_von


class UebersetzungenField(serializers.Field):
    """Nur lesend : {feld: {sprache: text}} der gespeicherten Übersetzungen des Objekts. Die
    Oberfläche zeigt damit den Text in der gewählten Sprache und fällt sonst auf das Original
    zurück."""

    def __init__(self, **kwargs):
        kwargs.update(source="*", read_only=True)
        super().__init__(**kwargs)

    def to_representation(self, obj):
        return uebersetzungen_von(obj)
