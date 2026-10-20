from rest_framework import serializers

from .models import ZentraleEinstellungen


class ZentraleEinstellungenSerializer(serializers.ModelSerializer):
    """`modifie_par` wird von der View gesetzt, nie vom Client."""

    class Meta:
        model = ZentraleEinstellungen
        fields = [
            "warenkorb_reservierung_minuten",
            "event_zahlungsfrist_tage",
            "hinweis_tage_vorher",
            "hinweis_plaetze_absolut",
            "hinweis_plaetze_prozent",
            "hinweis_lager_menge",
            "hinweis_max_anzahl",
            "modifie_par",
            "updated_at",
        ]
        read_only_fields = ["modifie_par", "updated_at"]
