from rest_framework import serializers

from .models import ZentraleEinstellungen


class ZentraleEinstellungenSerializer(serializers.ModelSerializer):
    """`modifie_par` wird von der View gesetzt, nie vom Client."""

    class Meta:
        model = ZentraleEinstellungen
        fields = ["warenkorb_reservierung_minuten", "modifie_par", "updated_at"]
        read_only_fields = ["modifie_par", "updated_at"]
