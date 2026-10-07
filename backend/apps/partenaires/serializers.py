import uuid

import magic
from rest_framework import serializers

from apps.communaute.validators import valider_et_reencoder_photo

from .models import (
    Angebot,
    Partner,
    PartnerBewertung,
    PartnerDokument,
    PartnerKategorie,
    PartnerKontakt,
    PartnerVerknuepfung,
    VerknuepfungRolle,
)

DOKUMENT_MIME = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
}
DOKUMENT_MAX_BYTES = 10 * 1024 * 1024
# Bei diesen Rollen ist das Logo auf der Projekt-/Veranstaltungsseite standardmäßig sichtbar.
LOGO_STANDARD_ROLLEN = {VerknuepfungRolle.SPONSOR, VerknuepfungRolle.KOOPERATION}


class PartnerKategorieSerializer(serializers.ModelSerializer):
    anzahl = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = PartnerKategorie
        fields = ["id", "nom", "nom_fr", "actif", "anzahl"]


class PartnerKontaktSerializer(serializers.ModelSerializer):
    class Meta:
        model = PartnerKontakt
        fields = ["id", "partner", "name", "funktion", "email", "telefon", "hauptkontakt"]
        read_only_fields = ["id"]

    def update(self, instance, validated_data):
        validated_data.pop("partner", None)  # ein Kontakt wechselt nie den Partner
        return super().update(instance, validated_data)


class PartnerVerknuepfungSerializer(serializers.ModelSerializer):
    ziel_typ = serializers.CharField(read_only=True)
    ziel_id = serializers.SerializerMethodField()
    ziel_label = serializers.CharField(read_only=True)

    class Meta:
        model = PartnerVerknuepfung
        fields = [
            "id",
            "ziel_typ",
            "ziel_id",
            "ziel_label",
            "rolle",
            "notiz",
            "logo_anzeigen",
            "created_at",
        ]
        read_only_fields = fields

    def get_ziel_id(self, obj):
        ziel = obj.ziel
        return str(ziel.pk) if ziel else None


class PartnerVerknuepfungUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = PartnerVerknuepfung
        fields = ["notiz", "logo_anzeigen"]


class PartnerVerknuepfungCreateSerializer(serializers.Serializer):
    ziel_typ = serializers.ChoiceField(choices=["projet", "evenement", "produit"])
    ziel_id = serializers.UUIDField()
    rolle = serializers.ChoiceField(
        choices=PartnerVerknuepfung._meta.get_field("rolle").choices, required=False
    )
    notiz = serializers.CharField(max_length=300, required=False, allow_blank=True)
    logo_anzeigen = serializers.BooleanField(required=False)


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


class PartnerDokumentSerializer(serializers.ModelSerializer):
    datei_url = serializers.SerializerMethodField()
    hochgeladen_von_name = serializers.SerializerMethodField()

    class Meta:
        model = PartnerDokument
        fields = [
            "id",
            "partner",
            "typ",
            "titel",
            "datei",
            "datei_url",
            "gueltig_bis",
            "notiz",
            "hochgeladen_von_name",
            "created_at",
        ]
        read_only_fields = ["id", "partner", "datei_url", "hochgeladen_von_name", "created_at"]
        extra_kwargs = {"datei": {"write_only": True, "required": False}}

    def get_datei_url(self, obj):
        return obj.datei.url if obj.datei else None

    def get_hochgeladen_von_name(self, obj):
        user = obj.hochgeladen_von
        if user is None:
            return ""
        membre = getattr(user, "membre", None)
        return f"{membre.prenom} {membre.nom}" if membre else user.email

    def validate_datei(self, datei):
        if datei.size > DOKUMENT_MAX_BYTES:
            raise serializers.ValidationError("Datei zu groß (max. 10 MB).")
        inhalt = datei.read(4096)
        datei.seek(0)
        endung = DOKUMENT_MIME.get(magic.from_buffer(inhalt, mime=True))
        if endung is None:
            raise serializers.ValidationError("Format nicht unterstützt (PDF, JPG, PNG, DOCX).")
        datei.name = f"{uuid.uuid4()}.{endung}"
        return datei

    def validate(self, attrs):
        if self.instance is None and "datei" not in attrs:
            raise serializers.ValidationError({"datei": "Bitte eine Datei auswählen."})
        return attrs

    def update(self, instance, validated_data):
        # Neues Vertragsende => Erinnerungen laufen erneut
        if (
            "gueltig_bis" in validated_data
            and validated_data["gueltig_bis"] != instance.gueltig_bis
        ):
            instance.erinnert_60 = False
            instance.erinnert_14 = False
        validated_data.pop(
            "datei", None
        )  # Datei bleibt unveränderlich (neu hochladen statt tauschen)
        return super().update(instance, validated_data)


class PartnerLogoSerializer(serializers.Serializer):
    logo = serializers.ImageField()

    def validate_logo(self, logo):
        return valider_et_reencoder_photo(logo)


class PartnerSerializer(serializers.ModelSerializer):
    kategorien = serializers.PrimaryKeyRelatedField(
        many=True, queryset=PartnerKategorie.objects.all(), required=False
    )
    kategorien_namen = serializers.SerializerMethodField()
    logo_url = serializers.SerializerMethodField()
    hauptkontakt_name = serializers.SerializerMethodField()
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
            "logo_url",
            "hauptkontakt_name",
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

    def get_logo_url(self, obj):
        return obj.logo.url if obj.logo else None

    def get_hauptkontakt_name(self, obj):
        kontakte = list(
            obj.kontakte.all()
        )  # prefetch_related("kontakte"), sortiert Hauptkontakt zuerst
        return kontakte[0].name if kontakte else ""


class PartnerDetailSerializer(PartnerSerializer):
    verknuepfungen = PartnerVerknuepfungSerializer(many=True, read_only=True)
    kontakte = PartnerKontaktSerializer(many=True, read_only=True)
    dokumente = PartnerDokumentSerializer(many=True, read_only=True)

    class Meta(PartnerSerializer.Meta):
        fields = PartnerSerializer.Meta.fields + ["verknuepfungen", "kontakte", "dokumente"]


class AngebotSerializer(serializers.ModelSerializer):
    partner_name = serializers.CharField(source="partner.nom", read_only=True)
    partner_note = serializers.SerializerMethodField()
    dokument_url = serializers.SerializerMethodField()

    class Meta:
        model = Angebot
        fields = [
            "id",
            "projet",
            "partner",
            "partner_name",
            "partner_note",
            "betrag",
            "gueltig_bis",
            "beschreibung",
            "dokument",
            "dokument_url",
            "status",
            "created_at",
        ]
        read_only_fields = ["id", "status", "created_at"]

    def get_partner_note(self, obj):
        note = getattr(obj, "partner_note", None)
        return round(note, 2) if note is not None else None

    def get_dokument_url(self, obj):
        return obj.dokument.datei.url if obj.dokument_id and obj.dokument.datei else None

    def validate(self, attrs):
        partner = attrs.get("partner", getattr(self.instance, "partner", None))
        dokument = attrs.get("dokument")
        if dokument is not None and partner is not None and dokument.partner_id != partner.pk:
            raise serializers.ValidationError(
                {"dokument": "Das Dokument gehört zu einem anderen Partner."}
            )
        return attrs

    def update(self, instance, validated_data):
        validated_data.pop("projet", None)  # Projekt und Partner bleiben fest
        validated_data.pop("partner", None)
        return super().update(instance, validated_data)
