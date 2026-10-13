import uuid as uuid_mod

from django.db import transaction
from rest_framework import serializers

from apps.accounts.models import User
from apps.uebersetzung.serializers import UebersetzungenField

from .models import Dienst, Kreis, Sichtbarkeit, Termin, TerminEinladung
from .services import ist_verwaltung


def _name(user) -> str:
    membre = getattr(user, "membre", None)
    return f"{membre.prenom} {membre.nom}".strip() if membre else user.email


class TerminSerializer(serializers.ModelSerializer):
    einladen = serializers.ListField(
        child=serializers.UUIDField(), write_only=True, required=False, allow_empty=True
    )
    einladungen = serializers.SerializerMethodField()
    meine_antwort = serializers.SerializerMethodField()
    projekt_titel = serializers.CharField(source="projekt.titre", read_only=True, default="")
    evenement_titel = serializers.CharField(source="evenement.titre", read_only=True, default="")
    uebersetzungen = UebersetzungenField()

    class Meta:
        model = Termin
        fields = [
            "id",
            "titel",
            "beschreibung",
            "ort",
            "link",
            "kategorie",
            "beginn",
            "ende",
            "ganztaegig",
            "sichtbarkeit",
            "kreis",
            "projekt",
            "projekt_titel",
            "evenement",
            "evenement_titel",
            "wichtig",
            "wiederholung",
            "wiederholung_bis",
            "erinnerung_stunden",
            "status",
            "publikation",
            "einladen",
            "einladungen",
            "meine_antwort",
            "uebersetzungen",
        ]
        read_only_fields = ["id", "status", "publikation"]

    def get_einladungen(self, obj):
        user = self.context["request"].user
        if not ist_verwaltung(user) and obj.erstellt_von_id != user.id:
            return []
        return [
            {"user": str(e.user_id), "name": _name(e.user), "antwort": e.antwort}
            for e in obj.einladungen.select_related("user", "user__membre")
        ]

    def get_meine_antwort(self, obj):
        user = self.context["request"].user
        e = obj.einladungen.filter(user=user).first()
        return e.antwort if e else None

    def validate(self, daten):
        inst = self.instance
        beginn = daten.get("beginn", inst.beginn if inst else None)
        ende = daten.get("ende", inst.ende if inst else None)
        if ende and beginn and ende < beginn:
            raise serializers.ValidationError({"ende": "Das Ende liegt vor dem Beginn."})
        sicht = daten.get("sichtbarkeit", inst.sichtbarkeit if inst else Sichtbarkeit.KREIS)
        kreis = daten.get("kreis", inst.kreis if inst else "")
        projekt = daten.get("projekt", inst.projekt if inst else None)
        evenement = daten.get("evenement", inst.evenement if inst else None)
        if sicht == Sichtbarkeit.KREIS:
            if kreis not in set(Kreis.values):
                raise serializers.ValidationError({"kreis": "Bitte einen Kreis wählen."})
            if kreis == Kreis.PROJEKT and projekt is None:
                raise serializers.ValidationError({"projekt": "Bitte ein Projekt wählen."})
            if kreis == Kreis.EVENT_TEAM and evenement is None:
                raise serializers.ValidationError({"evenement": "Bitte eine Veranstaltung wählen."})
        else:
            daten["kreis"] = ""
        if sicht != Sichtbarkeit.KREIS or kreis != Kreis.PROJEKT:
            daten["projekt"] = None
        if sicht != Sichtbarkeit.KREIS or kreis != Kreis.EVENT_TEAM:
            daten["evenement"] = None
        return daten

    @transaction.atomic
    def create(self, validated_data):
        einladen = validated_data.pop("einladen", [])
        termin = Termin.objects.create(**validated_data)
        self._einladungen(termin, einladen)
        return termin

    @transaction.atomic
    def update(self, instance, validated_data):
        einladen = validated_data.pop("einladen", None)
        for feld, wert in validated_data.items():
            setattr(instance, feld, wert)
        if "beginn" in validated_data:
            instance.letzte_erinnerung = None
        instance.save()
        if einladen is not None:
            self._einladungen(instance, einladen)
        return instance

    def _einladungen(self, termin, user_ids):
        from apps.notifications.models import TypeNotification
        from apps.notifications.services import notifier

        gewollt = {uuid_mod.UUID(str(i)) for i in user_ids}
        bestehend = set(termin.einladungen.values_list("user_id", flat=True))
        termin.einladungen.exclude(user_id__in=gewollt).delete()
        for user in User.objects.filter(pk__in=gewollt - bestehend, is_active=True):
            TerminEinladung.objects.create(termin=termin, user=user)
            if termin.status == "freigegeben":
                notifier(
                    user,
                    TypeNotification.EVENEMENT_INVITATION,
                    titre=f"Termin: {termin.titel}",
                    message=f"Du wurdest zu „{termin.titel}“ eingeladen.",
                    lien="/kalender",
                )


class AntwortSerializer(serializers.Serializer):
    antwort = serializers.ChoiceField(choices=["zusage", "vielleicht", "absage"])


class DienstSerializer(serializers.ModelSerializer):
    besetzt = serializers.SerializerMethodField()
    frei = serializers.SerializerMethodField()
    ich_eingetragen = serializers.SerializerMethodField()
    eingetragen = serializers.SerializerMethodField()
    faehigkeit_name = serializers.CharField(
        source="faehigkeit.bezeichnung", read_only=True, default=""
    )
    termin_titel = serializers.CharField(source="termin.titel", read_only=True, default="")
    evenement_titel = serializers.CharField(source="evenement.titre", read_only=True, default="")

    class Meta:
        model = Dienst
        fields = [
            "id",
            "termin",
            "termin_titel",
            "evenement",
            "evenement_titel",
            "titel",
            "beschreibung",
            "beginn",
            "ende",
            "benoetigt",
            "faehigkeit",
            "faehigkeit_name",
            "austragen_bis",
            "erinnerung_stunden",
            "besetzt",
            "frei",
            "ich_eingetragen",
            "eingetragen",
        ]

    def _eintraege(self, obj):
        return list(obj.eintraege.all())

    def get_besetzt(self, obj):
        return len(self._eintraege(obj))

    def get_frei(self, obj):
        return max(obj.benoetigt - len(self._eintraege(obj)), 0)

    def get_ich_eingetragen(self, obj):
        user = self.context["request"].user
        return any(e.user_id == user.id for e in self._eintraege(obj))

    def get_eingetragen(self, obj):
        """Namen sehen nur Schreibberechtigte ; alle anderen sehen die Zahl der Besetzten."""
        from .services import ist_verwaltung

        if not ist_verwaltung(self.context["request"].user, schreiben=True):
            return []
        return [{"user": str(e.user_id), "name": _name(e.user)} for e in self._eintraege(obj)]

    def validate(self, daten):
        inst = self.instance
        termin = daten.get("termin", inst.termin if inst else None)
        evenement = daten.get("evenement", inst.evenement if inst else None)
        if (termin is None) == (evenement is None):
            raise serializers.ValidationError(
                "Entweder einen Termin oder eine Veranstaltung wählen."
            )
        beginn = daten.get("beginn", inst.beginn if inst else None)
        ende = daten.get("ende", inst.ende if inst else None)
        if ende and beginn and ende < beginn:
            raise serializers.ValidationError({"ende": "Das Ende liegt vor dem Beginn."})
        bis = daten.get("austragen_bis", inst.austragen_bis if inst else None)
        if bis and beginn and bis > beginn:
            raise serializers.ValidationError(
                {"austragen_bis": "Die Frist muss vor Beginn des Dienstes liegen."}
            )
        benoetigt = daten.get("benoetigt", inst.benoetigt if inst else 1)
        if benoetigt < 1 or benoetigt > 100:
            raise serializers.ValidationError({"benoetigt": "Zwischen 1 und 100 Personen."})
        if inst is not None and benoetigt < inst.eintraege.count():
            raise serializers.ValidationError(
                {"benoetigt": "Es sind bereits mehr Personen eingetragen."}
            )
        return daten
