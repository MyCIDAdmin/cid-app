"""Modelle des Moduls „Reisen & Fahrgemeinschaften“ (Konzept 2026-10-29).

Grundsätze : Jede Person reist für sich (Etappen, Unterkunft je Person) ; persönliche Angaben sind
standardmäßig privat und werden nur nach Freigabe geteilt (siehe `services.sichtbar_fuer`) ; kein
Geld in der App (Kosten nur als Rechnung)."""

import secrets
import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone


def _token() -> str:
    return secrets.token_urlsafe(24)


class Sichtbarkeit(models.TextChoices):
    EINGELADEN = "eingeladen", "Nur Eingeladene"
    MITGLIEDER = "mitglieder", "Alle Mitglieder"
    KONTO = "konto", "Alle mit Konto"


class Beitritt(models.TextChoices):
    OFFEN = "offen", "Offen"
    GENEHMIGUNG = "genehmigung", "Mit Genehmigung"
    EINLADUNG = "einladung", "Nur Einladung"


class Phase(models.TextChoices):
    INTERESSE = "interesse", "Interesse"
    PLANUNG = "planung", "Planung"
    BUCHUNG = "buchung", "Buchung"
    REISE = "reise", "Reise"
    RUECKBLICK = "rueckblick", "Rückblick"


class Reise(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    titel = models.CharField(max_length=200)
    beschreibung = models.TextField(blank=True)
    ziel_ort = models.CharField(max_length=200, blank=True)
    land = models.CharField(max_length=100, blank=True)
    stadion = models.CharField(max_length=200, blank=True)
    start = models.DateField(null=True, blank=True)
    ende = models.DateField(null=True, blank=True)
    phase = models.CharField(max_length=12, choices=Phase.choices, default=Phase.INTERESSE)
    abgesagt = models.BooleanField(default=False)

    sichtbarkeit = models.CharField(
        max_length=12, choices=Sichtbarkeit.choices, default=Sichtbarkeit.EINGELADEN
    )
    beitritt = models.CharField(max_length=12, choices=Beitritt.choices, default=Beitritt.OFFEN)
    min_teilnehmer = models.PositiveIntegerField(null=True, blank=True)
    max_teilnehmer = models.PositiveIntegerField(null=True, blank=True)
    interessen_frist = models.DateField(null=True, blank=True)
    anmelde_frist = models.DateField(null=True, blank=True)
    einladungs_token = models.CharField(max_length=64, unique=True, default=_token, editable=False)
    vorschau_oeffentlich = models.BooleanField(default=False)
    vorschlaege_erlaubt = models.BooleanField(default=True)
    # Obergrenzen je Baustein, z. B. {"unterkunft": "60.00"} (nur Markierung, keine Sperre).
    budget_grenzen = models.JSONField(default=dict, blank=True)

    # Feste Infos (formatierter Text, serverseitig bereinigt)
    stadion_infos = models.TextField(blank=True)
    laenderinfo = models.TextField(blank=True)
    regeln = models.TextField(blank=True)

    rencontre = models.ForeignKey(
        "communaute.RencontreCalendrier",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reisen",
    )
    evenement = models.ForeignKey(
        "evenements.Evenement",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reisen",
    )
    chat_gruppe = models.ForeignKey(
        "communaute.GroupeChat",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    erstellt_von = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "reisen_reise"
        ordering = ["start", "-created_at"]

    def __str__(self):
        return self.titel


class Rolle(models.TextChoices):
    ORGANISATOR = "organisator", "Organisator"
    VERTRETER = "vertreter", "Vertreter"
    TEILNEHMER = "teilnehmer", "Teilnehmer"


class TStatus(models.TextChoices):
    EINGELADEN = "eingeladen", "Eingeladen"
    ANGEFRAGT = "angefragt", "Angefragt"
    INTERESSIERT = "interessiert", "Interessiert"
    DABEI = "dabei", "Dabei"
    WARTELISTE = "warteliste", "Warteliste"
    ABGELEHNT = "abgelehnt", "Abgelehnt"
    ABGESAGT = "abgesagt", "Abgesagt"


class Freigabe(models.TextChoices):
    PRIVAT = "privat", "Nur ich und Organisation"
    ALLE = "alle", "Alle Teilnehmenden"


class ReiseTeilnehmer(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reise = models.ForeignKey(Reise, on_delete=models.CASCADE, related_name="teilnehmer")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reisen_teilnahmen",
    )
    rolle = models.CharField(max_length=12, choices=Rolle.choices, default=Rolle.TEILNEHMER)
    status = models.CharField(max_length=12, choices=TStatus.choices, default=TStatus.EINGELADEN)
    nachricht = models.CharField(max_length=500, blank=True)
    entschieden_von = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    begleitpersonen = models.PositiveSmallIntegerField(default=0)
    zuletzt_gesehen = models.DateTimeField(null=True, blank=True)

    # Freigabe je Block (Standard privat)
    freigabe_hin = models.CharField(max_length=8, choices=Freigabe.choices, default=Freigabe.PRIVAT)
    freigabe_rueck = models.CharField(
        max_length=8, choices=Freigabe.choices, default=Freigabe.PRIVAT
    )
    freigabe_unterkunft = models.CharField(
        max_length=8, choices=Freigabe.choices, default=Freigabe.PRIVAT
    )
    # Auch vor Organisator und Vertreter nur grobe Angaben (Ziel, Tag, gebucht ja/nein).
    verbergen_vor_orga = models.BooleanField(default=False)

    # Unterkunft : gewählt, „eigene“ oder keine Angabe
    unterkunft = models.ForeignKey(
        "Unterkunft",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="belegung",
    )
    unterkunft_eigen = models.CharField(max_length=200, blank=True)
    unterkunft_gebucht = models.BooleanField(default=False)

    # Haken und private Notiz
    stadionkarte = models.BooleanField(default=False)
    dokument_gueltig = models.BooleanField(default=False)
    regeln_bestaetigt_am = models.DateTimeField(null=True, blank=True)
    notiz = models.CharField(max_length=500, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "reisen_teilnehmer"
        constraints = [
            models.UniqueConstraint(fields=["reise", "user"], name="reisen_teilnehmer_unique")
        ]

    @property
    def ist_orga(self) -> bool:
        return self.rolle in (Rolle.ORGANISATOR, Rolle.VERTRETER)


class Art(models.TextChoices):
    FLUG = "flug", "Flug"
    ZUG = "zug", "Zug"
    BUS = "bus", "Bus"
    AUTO = "auto", "Auto"
    SONSTIGES = "sonstiges", "Sonstiges"


class EStatus(models.TextChoices):
    OFFEN = "offen", "Offen"
    GEPLANT = "geplant", "Geplant"
    GEBUCHT = "gebucht", "Gebucht"
    SELBST = "selbst", "Organisiere ich selbst"


class Richtung(models.TextChoices):
    HIN = "hin", "Hinreise"
    RUECK = "rueck", "Rückreise"
    ZWISCHEN = "zwischen", "Zwischenstopp"


class Etappe(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    teilnehmer = models.ForeignKey(
        ReiseTeilnehmer, on_delete=models.CASCADE, related_name="etappen"
    )
    richtung = models.CharField(max_length=10, choices=Richtung.choices, default=Richtung.HIN)
    art = models.CharField(max_length=10, choices=Art.choices, default=Art.FLUG)
    von_ort = models.CharField(max_length=200)
    von_code = models.CharField(max_length=10, blank=True)
    nach_ort = models.CharField(max_length=200)
    nach_code = models.CharField(max_length=10, blank=True)
    abfahrt = models.DateTimeField(null=True, blank=True)
    ankunft = models.DateTimeField(null=True, blank=True)
    anbieter = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=10, choices=EStatus.choices, default=EStatus.OFFEN)
    referenz = models.CharField(max_length=120, blank=True)  # privat, nie für andere

    class Meta:
        db_table = "reisen_etappe"
        ordering = ["abfahrt", "id"]


class Unterkunft(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reise = models.ForeignKey(Reise, on_delete=models.CASCADE, related_name="unterkuenfte")
    name = models.CharField(max_length=200)
    adresse = models.CharField(max_length=300, blank=True)
    entfernung = models.CharField(max_length=120, blank=True)
    link = models.URLField(max_length=500, blank=True)

    class Meta:
        db_table = "reisen_unterkunft"
        ordering = ["name"]


class Baustein(models.TextChoices):
    FLUG = "flug", "Flug"
    TRANSPORT = "transport", "Zug, Bus, Auto"
    UNTERKUNFT = "unterkunft", "Unterkunft"
    TICKETS = "tickets", "Stadionkarten"
    PROGRAMM = "programm", "Programm"
    SONSTIGES = "sonstiges", "Sonstiges"


class EntscheidungTyp(models.TextChoices):
    AUSWAHL = "auswahl", "Auswahl"
    EMPFEHLUNG = "empfehlung", "Empfehlung"
    TERMIN = "termin", "Terminfindung"
    STIMMUNG = "stimmung", "Stimmungsbild"


class EntStatus(models.TextChoices):
    OFFEN = "offen", "Offen"
    BESCHLOSSEN = "beschlossen", "Beschlossen"


class Entscheidung(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reise = models.ForeignKey(Reise, on_delete=models.CASCADE, related_name="entscheidungen")
    typ = models.CharField(max_length=12, choices=EntscheidungTyp.choices)
    baustein = models.CharField(max_length=12, choices=Baustein.choices, default=Baustein.SONSTIGES)
    titel = models.CharField(max_length=200)
    beschreibung = models.TextField(blank=True)
    mehrfach = models.BooleanField(default=False)
    frist = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=12, choices=EntStatus.choices, default=EntStatus.OFFEN)
    beschluss_option = models.ForeignKey(
        "Option", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    begruendung = models.CharField(max_length=500, blank=True)
    beschlossen_am = models.DateTimeField(null=True, blank=True)
    beschlossen_von = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    erstellt_von = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "reisen_entscheidung"
        ordering = ["frist", "created_at"]

    @property
    def geschlossen(self) -> bool:
        if self.status == EntStatus.BESCHLOSSEN:
            return True
        return self.frist is not None and self.frist <= timezone.now()


class Option(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entscheidung = models.ForeignKey(
        Entscheidung, on_delete=models.CASCADE, related_name="optionen"
    )
    titel = models.CharField(max_length=200)
    beschreibung = models.CharField(max_length=500, blank=True)
    link = models.URLField(max_length=500, blank=True)
    preis = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    preis_einheit = models.CharField(max_length=10, blank=True)  # person | nacht | gesamt
    entfernung = models.CharField(max_length=120, blank=True)
    von_datum = models.DateField(null=True, blank=True)  # Terminfindung
    bis_datum = models.DateField(null=True, blank=True)
    ist_selbst = models.BooleanField(default=False)  # „Ich organisiere selbst“
    vorgeschlagen_von = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "reisen_option"
        ordering = ["created_at"]


class Wert(models.TextChoices):
    JA = "ja", "Ja / passt"
    VIELLEICHT = "vielleicht", "Vielleicht"
    NEIN = "nein", "Nein / passt nicht"


class Stimme(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entscheidung = models.ForeignKey(Entscheidung, on_delete=models.CASCADE, related_name="stimmen")
    option = models.ForeignKey(Option, on_delete=models.CASCADE, related_name="stimmen")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    wert = models.CharField(max_length=12, choices=Wert.choices, default=Wert.JA)
    created_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "reisen_stimme"
        constraints = [models.UniqueConstraint(fields=["option", "user"], name="reisen_stimme_uq")]


class ReiseInfo(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reise = models.ForeignKey(Reise, on_delete=models.CASCADE, related_name="infos")
    titel = models.CharField(max_length=200)
    text = models.TextField(blank=True)
    wichtig = models.BooleanField(default=False)
    gueltig_bis = models.DateField(null=True, blank=True)
    gelesen_pflicht = models.BooleanField(default=False)
    erstellt_von = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "reisen_info"
        ordering = ["-wichtig", "-created_at"]


class ReiseInfoGelesen(models.Model):
    info = models.ForeignKey(ReiseInfo, on_delete=models.CASCADE, related_name="gelesen")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "reisen_info_gelesen"
        constraints = [models.UniqueConstraint(fields=["info", "user"], name="reisen_gelesen_uq")]


class AStatus(models.TextChoices):
    OFFEN = "offen", "Offen"
    IN_ARBEIT = "in_arbeit", "In Arbeit"
    ERLEDIGT = "erledigt", "Erledigt"


class Aufgabe(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reise = models.ForeignKey(Reise, on_delete=models.CASCADE, related_name="aufgaben")
    titel = models.CharField(max_length=200)
    beschreibung = models.TextField(blank=True)
    verantwortlich = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    frist = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=AStatus.choices, default=AStatus.OFFEN)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "reisen_aufgabe"
        ordering = ["status", "frist", "created_at"]


class Kostenposten(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reise = models.ForeignKey(Reise, on_delete=models.CASCADE, related_name="kosten")
    bezeichnung = models.CharField(max_length=200)
    betrag = models.DecimalField(max_digits=9, decimal_places=2)
    bezahlt_von = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "reisen_kostenposten"
        ordering = ["created_at"]


class KostenAnteil(models.Model):
    posten = models.ForeignKey(Kostenposten, on_delete=models.CASCADE, related_name="anteile")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    gewicht = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal(1))

    class Meta:
        db_table = "reisen_kostenanteil"
        constraints = [models.UniqueConstraint(fields=["posten", "user"], name="reisen_anteil_uq")]


class ErinnerungRegel(models.TextChoices):
    H24 = "h24", "24 Stunden vor Fristende"
    H2 = "h2", "2 Stunden vor Fristende"


class ReiseErinnerung(models.Model):
    """Protokoll : je Entscheidung, Person und Regel wird nur einmal erinnert."""

    entscheidung = models.ForeignKey(Entscheidung, on_delete=models.CASCADE, related_name="+")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    regel = models.CharField(max_length=4, choices=ErinnerungRegel.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "reisen_erinnerung"
        constraints = [
            models.UniqueConstraint(
                fields=["entscheidung", "user", "regel"], name="reisen_erinnerung_uq"
            )
        ]


class StadionVorschlag(models.Model):
    """Stadion und Stadt liefert der Spielplan nicht : einmal eingetragen, wird es je Gegner
    als Vorschlag gemerkt."""

    gegner = models.CharField(max_length=200, unique=True)
    stadion = models.CharField(max_length=200, blank=True)
    stadt = models.CharField(max_length=200, blank=True)
    land = models.CharField(max_length=100, blank=True)

    class Meta:
        db_table = "reisen_stadion_vorschlag"
