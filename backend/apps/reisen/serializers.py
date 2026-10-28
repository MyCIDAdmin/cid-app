"""Eingabe-Serializer (Validierung). Die Ausgabe baut `ausgabe.py` per Hand, weil sie von der
Rolle und den Freigaben der anfragenden Person abhängt."""

from rest_framework import serializers

from .models import (
    Aufgabe,
    Entscheidung,
    Etappe,
    Option,
    Reise,
    ReiseInfo,
    ReiseTeilnehmer,
    Unterkunft,
)

REISE_FELDER = [
    "titel",
    "beschreibung",
    "ziel_ort",
    "land",
    "stadion",
    "start",
    "ende",
    "phase",
    "abgesagt",
    "sichtbarkeit",
    "beitritt",
    "min_teilnehmer",
    "max_teilnehmer",
    "interessen_frist",
    "anmelde_frist",
    "vorschau_oeffentlich",
    "vorschlaege_erlaubt",
    "budget_grenzen",
    "stadion_infos",
    "laenderinfo",
    "regeln",
]


class ReiseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reise
        fields = REISE_FELDER

    def validate(self, attrs):
        start = attrs.get("start", getattr(self.instance, "start", None))
        ende = attrs.get("ende", getattr(self.instance, "ende", None))
        if start and ende and ende < start:
            raise serializers.ValidationError({"ende": "Das Ende liegt vor dem Beginn."})
        mini = attrs.get("min_teilnehmer", getattr(self.instance, "min_teilnehmer", None))
        maxi = attrs.get("max_teilnehmer", getattr(self.instance, "max_teilnehmer", None))
        if mini and maxi and maxi < mini:
            raise serializers.ValidationError(
                {"max_teilnehmer": "Die Höchstzahl liegt unter der Mindestzahl."}
            )
        return attrs

    def validate_budget_grenzen(self, wert):
        if not isinstance(wert, dict):
            raise serializers.ValidationError("Erwartet: Baustein → Betrag.")
        for baustein, betrag in wert.items():
            try:
                if float(betrag) < 0:
                    raise ValueError
            except (TypeError, ValueError) as exc:
                raise serializers.ValidationError(f"Ungültiger Betrag für {baustein}.") from exc
        return wert


class EtappeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Etappe
        fields = [
            "richtung",
            "art",
            "von_ort",
            "von_code",
            "nach_ort",
            "nach_code",
            "abfahrt",
            "ankunft",
            "anbieter",
            "status",
            "referenz",
        ]

    def validate(self, attrs):
        ab, an = attrs.get("abfahrt"), attrs.get("ankunft")
        if ab and an and an < ab:
            raise serializers.ValidationError({"ankunft": "Die Ankunft liegt vor der Abfahrt."})
        return attrs


class UnterkunftSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unterkunft
        fields = ["name", "adresse", "entfernung", "link"]


class MeineAngabenSerializer(serializers.ModelSerializer):
    unterkunft = serializers.PrimaryKeyRelatedField(
        queryset=Unterkunft.objects.all(), allow_null=True, required=False
    )

    class Meta:
        model = ReiseTeilnehmer
        fields = [
            "begleitpersonen",
            "freigabe_hin",
            "freigabe_rueck",
            "freigabe_unterkunft",
            "verbergen_vor_orga",
            "unterkunft",
            "unterkunft_eigen",
            "unterkunft_gebucht",
            "stadionkarte",
            "dokument_gueltig",
            "notiz",
        ]

    def validate_unterkunft(self, wert):
        if wert is not None and wert.reise_id != self.instance.reise_id:
            raise serializers.ValidationError("Diese Unterkunft gehört zu einer anderen Reise.")
        return wert


class OptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Option
        fields = [
            "titel",
            "beschreibung",
            "link",
            "preis",
            "preis_einheit",
            "entfernung",
            "von_datum",
            "bis_datum",
        ]

    def validate(self, attrs):
        von, bis = attrs.get("von_datum"), attrs.get("bis_datum")
        if von and bis and bis < von:
            raise serializers.ValidationError({"bis_datum": "Das Ende liegt vor dem Beginn."})
        return attrs


class EntscheidungSerializer(serializers.ModelSerializer):
    optionen = OptionSerializer(many=True, required=False)

    class Meta:
        model = Entscheidung
        fields = [
            "typ",
            "baustein",
            "titel",
            "beschreibung",
            "mehrfach",
            "frist",
            "optionen",
        ]

    def validate(self, attrs):
        typ = attrs.get("typ", getattr(self.instance, "typ", None))
        optionen = attrs.get("optionen")
        if self.instance is None:
            if typ in ("auswahl", "empfehlung") and not optionen:
                raise serializers.ValidationError(
                    {"optionen": "Mindestens ein Vorschlag ist nötig."}
                )
            if typ == "termin":
                if not optionen or any(not o.get("von_datum") for o in optionen):
                    raise serializers.ValidationError(
                        {"optionen": "Jeder Zeitraum braucht ein Anfangsdatum."}
                    )
        return attrs


class InfoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReiseInfo
        fields = ["titel", "text", "wichtig", "gueltig_bis", "gelesen_pflicht"]


class AufgabeSerializer(serializers.ModelSerializer):
    verantwortlich = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = Aufgabe
        fields = ["titel", "beschreibung", "verantwortlich", "frist", "status"]
