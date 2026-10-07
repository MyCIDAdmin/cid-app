from rest_framework import serializers

from .models import (
    Partner,
    PartnerBewertung,
    PartnerKategorie,
    PartnerVerknuepfung,
)


class PartnerKategorieSerializer(serializers.ModelSerializer):
    anzahl = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = PartnerKategorie
        fields = ["id", "nom", "nom_fr", "actif", "anzahl"]


class PartnerVerknuepfungSerializer(serializers.ModelSerializer):
    ziel_typ = serializers.CharField(read_only=True)
    ziel_id = serializers.SerializerMethodField()
    ziel_label = serializers.CharField(read_only=True)

    class Meta:
        model = PartnerVerknuepfung
        fields = ["id", "ziel_typ", "ziel_id", "ziel_label", "rolle", "notiz", "created_at"]
        read_only_fields = fields

    def get_ziel_id(self, obj):
        ziel = obj.ziel
        return str(ziel.pk) if ziel else None


class PartnerVerknuepfungCreateSerializer(serializers.Serializer):
    ziel_typ = serializers.ChoiceField(choices=["projet", "evenement", "produit"])
    ziel_id = serializers.UUIDField()
    rolle = serializers.ChoiceField(
        choices=PartnerVerknuepfung._meta.get_field("rolle").choices, required=False
    )
    notiz = serializers.CharField(max_length=300, required=False, allow_blank=True)


class PartnerBewertungSerializer(serializers.ModelSerializer):
    schnitt = serializers.FloatField(read_only=True)
    bewerter_name = serializers.SerializerMethodField()
    verknuepfung_label = serializers.SerializerMethodField()

    class Meta:
        model = PartnerBewertung
        fields = [
            "id",
            "verknuepfung",
            "verknuepfung_label",
            "qualitaet",
            "preis_leistung",
            "zuverlaessigkeit",
            "kommunikation",
            "schnitt",
            "kommentar",
            "bewerter_name",
            "created_at",
        ]
        read_only_fields = ["id", "schnitt", "bewerter_name", "verknuepfung_label", "created_at"]

    def get_bewerter_name(self, obj):
        user = obj.bewerter
        if user is None:
            return ""
        membre = getattr(user, "membre", None)
        return f"{membre.prenom} {membre.nom}" if membre else user.email

    def get_verknuepfung_label(self, obj):
        return obj.verknuepfung.ziel_label if obj.verknuepfung_id else ""

    def validate_verknuepfung(self, value):
        partner = self.context.get("partner")
        if value is not None and partner is not None and value.partner_id != partner.pk:
            raise serializers.ValidationError("Die Verknüpfung gehört zu einem anderen Partner.")
        return value


class PartnerSerializer(serializers.ModelSerializer):
    kategorien = serializers.PrimaryKeyRelatedField(
        many=True, queryset=PartnerKategorie.objects.all(), required=False
    )
    kategorien_namen = serializers.SerializerMethodField()
    bewertung_schnitt = serializers.FloatField(read_only=True)
    bewertung_anzahl = serializers.IntegerField(read_only=True)
    verknuepfungen_anzahl = serializers.IntegerField(read_only=True)

    class Meta:
        model = Partner
        fields = [
            "id",
            "nom",
            "typ",
            "statut",
            "bevorzugt",
            "kategorien",
            "kategorien_namen",
            "ansprechpartner",
            "email",
            "telefon",
            "website",
            "adresse",
            "code_postal",
            "ville",
            "pays",
            "ust_id",
            "zahlungsziel_tage",
            "notizen",
            "bewertung_schnitt",
            "bewertung_anzahl",
            "verknuepfungen_anzahl",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "statut",
            "created_at",
            "updated_at",
        ]

    def get_kategorien_namen(self, obj):
        return [k.nom for k in obj.kategorien.all()]


class PartnerDetailSerializer(PartnerSerializer):
    verknuepfungen = PartnerVerknuepfungSerializer(many=True, read_only=True)

    class Meta(PartnerSerializer.Meta):
        fields = PartnerSerializer.Meta.fields + ["verknuepfungen"]
