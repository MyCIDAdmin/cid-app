import magic
from rest_framework import serializers

from apps.membres.models import Membre, StatutMembre

from . import services
from .models import (
    AmtPerson,
    Bekanntmachung,
    Entscheidung,
    KandidatPerson,
    Kandidatur,
    KandidaturStatus,
    Nachweis,
    Wahl,
)

MAX_NACHWEIS = 5 * 1024 * 1024
MAX_FOTO = 3 * 1024 * 1024
MIME_NACHWEIS = {"application/pdf", "image/jpeg", "image/png"}
MIME_FOTO = {"image/jpeg", "image/png", "image/webp"}


def pruefe_datei(datei, erlaubt: set[str], maximal: int):
    if datei.size > maximal:
        raise serializers.ValidationError("Die Datei ist zu groß.")
    kopf = datei.read(4096)
    datei.seek(0)
    if magic.from_buffer(kopf, mime=True) not in erlaubt:
        raise serializers.ValidationError("Dieser Dateityp ist nicht erlaubt.")
    return datei


class WahlSchreibenSerializer(serializers.ModelSerializer):
    class Meta:
        model = Wahl
        fields = [
            "titel", "beschreibung", "form", "mehrheit", "listen_groesse", "posten",
            "unterstuetzungen_noetig", "zustimmungen_noetig", "ankuendigung_am",
            "kandidatur_von", "kandidatur_bis", "pruefung_bis", "kampagne_bis",
            "wahl_von", "wahl_bis", "einspruch_bis", "uebergabe_bis",
        ]  # fmt: skip

    def validate(self, attrs):
        wert = {**{f: getattr(self.instance, f, None) for f in self.fields}, **attrs}
        if self.instance and self.instance.vote_session_id:
            raise serializers.ValidationError("Die Wahl ist geöffnet und nicht mehr änderbar.")
        reihe = [
            wert["ankuendigung_am"], wert["kandidatur_von"], wert["kandidatur_bis"],
            wert["pruefung_bis"], wert["kampagne_bis"], wert["wahl_von"].date(),
            wert["wahl_bis"].date(), wert["einspruch_bis"], wert["uebergabe_bis"],
        ]  # fmt: skip
        if any(a > b for a, b in zip(reihe, reihe[1:])):
            raise serializers.ValidationError(
                "Die Termine müssen in der richtigen Reihenfolge liegen."
            )
        if (wert["wahl_bis"] - wert["wahl_von"]).days > 14:
            raise serializers.ValidationError("Die Wahl dauert höchstens 14 Tage.")
        return attrs


def person_dict(p: KandidatPerson, wahl: Wahl, mit_pruefung: bool):
    daten = {
        "id": str(p.id),
        "membre": str(p.membre_id),
        "name": f"{p.membre.prenom} {p.membre.nom}",
        "amt": p.amt,
        "foto": p.foto.url if p.foto else None,
    }
    if mit_pruefung:
        daten["waehlbarkeit"] = services.waehlbarkeit(wahl, p.membre, p.amt)
        daten["nachweise"] = [n.art for n in p.nachweise.all()]
    return daten


def kandidatur_oeffentlich(k: Kandidatur) -> dict:
    return {
        "id": str(k.id),
        "name": k.name,
        "leitsatz": k.leitsatz,
        "vorstellung": k.vorstellung,
        "programm": k.programm,
        "sprache": k.sprache,
        "status": k.status,
        "personen": [person_dict(p, k.wahl, False) for p in k.personen.all()],
    }


def kandidatur_dossier(k: Kandidatur, user) -> dict:
    wahl = k.wahl
    ausschuss = services.ausschuss_oder_verwaltung(user, wahl)
    daten = kandidatur_oeffentlich(k)
    daten.update(
        {
            "wahl": str(wahl.id),
            "eigene": k.einreicher.user_id == getattr(user, "id", None),
            "status": k.status,
            "einreicher": f"{k.einreicher.prenom} {k.einreicher.nom}",
            "rechte_foto": k.rechte_foto,
            "bestaetigt_wahlordnung": k.bestaetigt_wahlordnung,
            "bestaetigt_fairness": k.bestaetigt_fairness,
            "bestaetigt_datenschutz": k.bestaetigt_datenschutz,
            "unterstuetzungen": k.unterstuetzungen.count(),
            "unterstuetzungen_noetig": wahl.unterstuetzungen_noetig,
            "eingereicht_am": k.eingereicht_am,
            "nachbesserung_bis": k.nachbesserung_bis,
            "nachbesserungen": k.nachbesserungen,
            "begruendung": k.begruendung,
            "artikel": k.artikel,
            "fehlend": (
                services.fehlende_angaben(k)
                if k.status in (KandidaturStatus.ENTWURF, KandidaturStatus.RUECKFRAGE)
                else []
            ),
            "personen": [person_dict(p, wahl, True) for p in k.personen.all()],
            "nachweise": [
                {"id": str(n.id), "art": n.art, "person": str(n.person_id) if n.person_id else None}
                for n in k.nachweise.all()
            ],
        }
    )
    if ausschuss:
        daten["pruefpunkte"] = [
            {
                "schluessel": pp.schluessel,
                "automatisch": pp.automatisch,
                "ergebnis": pp.ergebnis,
                "notiz": pp.notiz,
            }
            for pp in k.pruefpunkte.all()
        ]
        offen = k.entscheidungen.filter(umgesetzt_am__isnull=True, verworfen=False).first()
        if offen:
            daten["entscheidung_offen"] = entscheidung_dict(offen)
        daten["entscheidungen"] = [
            entscheidung_dict(e) for e in k.entscheidungen.exclude(umgesetzt_am__isnull=True)
        ]
    return daten


def entscheidung_dict(e: Entscheidung) -> dict:
    return {
        "id": str(e.id),
        "art": e.art,
        "begruendung": e.begruendung,
        "artikel": e.artikel,
        "vorgeschlagen_von": e.vorgeschlagen_von_id,
        "zustimmungen": [z.user_id for z in e.zustimmungen.all()],
        "umgesetzt_am": e.umgesetzt_am,
        "created_at": e.created_at,
    }


class PersonEingabe(serializers.Serializer):
    membre = serializers.UUIDField()
    amt = serializers.ChoiceField(choices=AmtPerson.choices, default=AmtPerson.KANDIDAT)


class KandidaturSchreibenSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    leitsatz = serializers.CharField(max_length=80, required=False, allow_blank=True)
    vorstellung = serializers.CharField(max_length=600, required=False, allow_blank=True)
    programm = serializers.ListField(
        child=serializers.CharField(max_length=160, allow_blank=True), max_length=3, required=False
    )
    sprache = serializers.ChoiceField(choices=["de", "fr", "ar"], required=False)
    rechte_foto = serializers.BooleanField(required=False)
    bestaetigt_wahlordnung = serializers.BooleanField(required=False)
    bestaetigt_fairness = serializers.BooleanField(required=False)
    bestaetigt_datenschutz = serializers.BooleanField(required=False)
    personen = PersonEingabe(many=True, required=False)

    def validate_personen(self, werte):
        wahl: Wahl = self.context["wahl"]
        ids = [w["membre"] for w in werte]
        if len(set(ids)) != len(ids):
            raise serializers.ValidationError("Jede Person nur einmal.")
        if wahl.art == "liste" and len(werte) > wahl.listen_groesse:
            raise serializers.ValidationError("Zu viele Personen für diese Liste.")
        gefunden = Membre.objects.filter(id__in=ids, statut=StatutMembre.ACTIF)
        if gefunden.count() != len(ids):
            raise serializers.ValidationError("Nur aktive Mitglieder können antreten.")
        return werte


class NachweisSerializer(serializers.Serializer):
    art = serializers.ChoiceField(choices=Nachweis._meta.get_field("art").choices)
    person = serializers.UUIDField(required=False, allow_null=True)
    datei = serializers.FileField()

    def validate_datei(self, datei):
        return pruefe_datei(datei, MIME_NACHWEIS, MAX_NACHWEIS)


class FotoSerializer(serializers.Serializer):
    foto = serializers.ImageField()

    def validate_foto(self, datei):
        return pruefe_datei(datei, MIME_FOTO, MAX_FOTO)


class EntscheidungEingabe(serializers.Serializer):
    art = serializers.ChoiceField(choices=["zulassen", "rueckfrage", "ablehnen"])
    begruendung = serializers.CharField(required=False, allow_blank=True, max_length=1000)
    artikel = serializers.CharField(required=False, allow_blank=True, max_length=120)


class PruefpunktEingabe(serializers.Serializer):
    schluessel = serializers.CharField(max_length=40)
    ergebnis = serializers.ChoiceField(choices=["offen", "ok", "nein"])
    notiz = serializers.CharField(required=False, allow_blank=True, max_length=300)


def bekanntmachung_dict(bk: Bekanntmachung, user) -> dict:
    ausschuss = services.ausschuss_oder_verwaltung(user, bk.wahl)
    daten = {
        "id": str(bk.id),
        "schluessel": bk.schluessel,
        "versand_am": bk.versand_am,
        "kanaele": bk.kanaele,
        "status": bk.status,
        "gesendet_am": bk.gesendet_am,
    }
    if ausschuss:
        daten.update(
            {
                "texte": {s: bk.texte[s] for s in ("de", "fr", "ar") if s in bk.texte},
                "geprueft": {s: bool(bk.geprueft.get(s)) for s in ("fr", "ar")},
                "veraltet": bk.geprueft.get("_veraltet", []),
                "freigaben": [f.user_id for f in bk.freigaben.all()],
                "freigaben_noetig": bk.wahl.zustimmungen_noetig,
                "uebersetzung_moeglich": _deepl_aktiv(),
            }
        )
    return daten


def _deepl_aktiv() -> bool:
    from apps.uebersetzung import deepl

    return deepl.ist_aktiv()
