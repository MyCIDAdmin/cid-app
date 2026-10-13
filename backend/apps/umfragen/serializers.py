from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.communaute.validators import valider_et_reencoder_photo
from apps.uebersetzung.serializers import UebersetzungenField

from .models import FrageTyp, Umfrage, UmfrageFrage, UmfrageOption
from .services import ist_verwaltung, kann_ergebnisse_sehen, uebersetzungen_fuer_umfrage


class _UebersetzungenAusKontext(serializers.Field):
    """{feld: {sprache: text}} aus dem Cache, den `UmfrageSerializer` je Umfrage einmal füllt."""

    def __init__(self, **kwargs):
        kwargs.update(source="*", read_only=True)
        super().__init__(**kwargs)

    def to_representation(self, obj):
        return self.context.get("_ueb", {}).get(str(obj.pk), {})


class OptionSerializer(serializers.ModelSerializer):
    # `id` bleibt beim Bearbeiten erhalten, damit Übersetzungen nicht verloren gehen.
    id = serializers.UUIDField(required=False)
    uebersetzungen = _UebersetzungenAusKontext()

    class Meta:
        model = UmfrageOption
        fields = ["id", "text", "ordre", "uebersetzungen"]
        extra_kwargs = {"ordre": {"required": False}}


class FrageSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)
    optionen = OptionSerializer(many=True, required=False)
    uebersetzungen = _UebersetzungenAusKontext()

    class Meta:
        model = UmfrageFrage
        fields = [
            "id",
            "text",
            "thema",
            "typ",
            "pflicht",
            "freitext_zusatz",
            "ordre",
            "optionen",
            "uebersetzungen",
        ]
        extra_kwargs = {"ordre": {"required": False}}

    def validate(self, attrs):
        optionen = attrs.get("optionen", [])
        if attrs.get("typ") == FrageTyp.FREITEXT:
            attrs["optionen"] = []
            attrs["freitext_zusatz"] = False
        elif len(optionen) < 2:
            raise serializers.ValidationError("Mindestens zwei Antwortmöglichkeiten angeben.")
        return attrs


class UmfrageSerializer(serializers.ModelSerializer):
    fragen = FrageSerializer(many=True, required=False)
    bild = serializers.ImageField(read_only=True)
    abgelaufen = serializers.BooleanField(read_only=True)
    teilgenommen = serializers.SerializerMethodField()
    kann_ergebnisse_sehen = serializers.SerializerMethodField()
    anzahl_teilnahmen = serializers.SerializerMethodField()
    angekuendigt = serializers.SerializerMethodField()
    uebersetzungen = _UebersetzungenAusKontext()

    class Meta:
        model = Umfrage
        fields = [
            "id",
            "titel",
            "beschreibung",
            "uebersetzungen",
            "bild",
            "zielgruppe",
            "anonym",
            "ergebnis_modus",
            "frist",
            "veroeffentlicht",
            "abgelaufen",
            "fragen",
            "teilgenommen",
            "kann_ergebnisse_sehen",
            "anzahl_teilnahmen",
            "angekuendigt",
            "created_at",
        ]
        read_only_fields = ["id", "veroeffentlicht", "created_at"]

    def to_representation(self, instance):
        # Übersetzungen von Umfrage, Fragen und Optionen: eine Abfrage je Umfrage.
        self.context.setdefault("_ueb", {}).update(uebersetzungen_fuer_umfrage(instance))
        return super().to_representation(instance)

    # --- berechnete Felder -------------------------------------------------------------
    def _user(self):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return user if user is not None and user.is_authenticated else None

    def _teilgenommen_ids(self):
        if not hasattr(self, "_cache_teilgenommen"):
            user = self._user()
            ids = set()
            if user is not None:
                from .models import UmfrageTeilnahme

                ids = set(
                    UmfrageTeilnahme.objects.filter(user=user).values_list("umfrage_id", flat=True)
                )
            self._cache_teilgenommen = ids
        return self._cache_teilgenommen

    def get_teilgenommen(self, obj) -> bool:
        return obj.id in self._teilgenommen_ids()

    def get_kann_ergebnisse_sehen(self, obj) -> bool:
        return kann_ergebnisse_sehen(self._user(), obj, obj.id in self._teilgenommen_ids())

    def get_anzahl_teilnahmen(self, obj):
        user = self._user()
        if user is not None and ist_verwaltung(user):
            return obj.teilnahmen.count()
        return None

    def get_angekuendigt(self, obj) -> bool:
        return obj.publikation_id is not None

    # --- Validierung --------------------------------------------------------------------
    def validate_frist(self, frist):
        if (self.instance is None or frist != self.instance.frist) and frist <= timezone.now():
            raise serializers.ValidationError("Die Frist muss in der Zukunft liegen.")
        return frist

    def validate_fragen(self, fragen):
        if self.instance is None and not fragen:
            raise serializers.ValidationError("Mindestens eine Frage angeben.")
        if len(fragen) > 30:
            raise serializers.ValidationError("Höchstens 30 Fragen.")
        return fragen

    # --- Schreiben ----------------------------------------------------------------------
    @staticmethod
    def _optionen_schreiben(frage, optionen):
        vorhandene = {o.id: o for o in frage.optionen.all()}
        behalten = set()
        for j, daten in enumerate(optionen):
            option = vorhandene.get(daten.get("id"))
            if option is None:
                option = UmfrageOption.objects.create(frage=frage, text=daten["text"], ordre=j)
            elif (option.text, option.ordre) != (daten["text"], j):
                option.text, option.ordre = daten["text"], j
                option.save()
            behalten.add(option.id)
        for oid, option in vorhandene.items():
            if oid not in behalten:
                option.delete()

    @classmethod
    def _fragen_schreiben(cls, umfrage, fragen):
        """Legt Fragen an bzw. aktualisiert vorhandene anhand ihrer `id` (so bleiben die
        Übersetzungen erhalten) ; nicht mehr genannte Fragen werden gelöscht."""
        vorhandene = {f.id: f for f in umfrage.fragen.all()}
        behalten = set()
        for i, daten in enumerate(fragen):
            optionen = daten.pop("optionen", [])
            daten.pop("ordre", None)
            frage = vorhandene.get(daten.pop("id", None))
            if frage is None:
                frage = UmfrageFrage.objects.create(umfrage=umfrage, ordre=i, **daten)
            else:
                for feld, wert in daten.items():
                    setattr(frage, feld, wert)
                frage.ordre = i
                frage.save()
            behalten.add(frage.id)
            cls._optionen_schreiben(frage, optionen)
        for fid, frage in vorhandene.items():
            if fid not in behalten:
                frage.delete()

    @transaction.atomic
    def create(self, validated_data):
        fragen = validated_data.pop("fragen", [])
        umfrage = Umfrage.objects.create(**validated_data)
        self._fragen_schreiben(umfrage, fragen)
        return umfrage

    @transaction.atomic
    def update(self, instance, validated_data):
        fragen = validated_data.pop("fragen", None)
        if fragen is not None:
            if instance.einreichungen.exists():
                raise serializers.ValidationError(
                    {"fragen": "Fragen sind nach der ersten Teilnahme nicht mehr änderbar."}
                )
            self._fragen_schreiben(instance, fragen)
        # Zielgruppe/Anonymität dürfen nach der ersten Teilnahme nicht mehr wechseln.
        if instance.einreichungen.exists():
            for feld in ("anonym", "zielgruppe"):
                if feld in validated_data and validated_data[feld] != getattr(instance, feld):
                    raise serializers.ValidationError(
                        {feld: "Nach der ersten Teilnahme nicht mehr änderbar."}
                    )
        return super().update(instance, validated_data)


class BildSerializer(serializers.Serializer):
    bild = serializers.ImageField()

    def validate_bild(self, bild):
        return valider_et_reencoder_photo(bild)


class AntwortEingabeSerializer(serializers.Serializer):
    frage = serializers.UUIDField()
    optionen = serializers.ListField(child=serializers.UUIDField(), required=False, max_length=50)
    text = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class TeilnahmeEingabeSerializer(serializers.Serializer):
    antworten = AntwortEingabeSerializer(many=True)


class UmfrageOeffentlichSerializer(serializers.ModelSerializer):
    """Minimalansicht für nicht angemeldete Besucher (geteilter Link): kein Fragebogen."""

    bild = serializers.ImageField(read_only=True)
    abgelaufen = serializers.BooleanField(read_only=True)
    uebersetzungen = UebersetzungenField()

    class Meta:
        model = Umfrage
        fields = [
            "id",
            "titel",
            "beschreibung",
            "uebersetzungen",
            "bild",
            "zielgruppe",
            "anonym",
            "frist",
            "abgelaufen",
        ]
