"""
Modelle — App wahlen (Wahlen modernisieren, Vorschlag A „Geführter Wahlprozess“, Konzept v2.3).

Eine Wahl ist ein Projekt mit sieben Phasen (aus den Terminen abgeleitet), einem Wahlausschuss, den
Kandidaturen (Liste, Einzelperson oder Antrag) samt Dossier-Prüfung mit zwei Freigaben, und den
Bekanntmachungen, die der Ausschuss selbst schreibt. Die Stimmabgabe selbst bleibt beim Modul `vote`
(Echtzeit, anonym per HMAC): beim Öffnen der Wahl entsteht daraus eine `VoteSession`.
"""

import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from apps.adhesions.storage import JustificatifsStorage


class Wahlform(models.TextChoices):
    LISTE = "liste", "Liste"
    PERSON = "person", "Einzelkandidatur, ein Amt"
    MEHRFACH = "mehrfach", "Einzelkandidaturen, mehrere Posten"
    JA_NEIN = "ja_nein", "Ja/Nein-Antrag"
    RANG = "rang", "Rangfolge"


class Mehrheit(models.TextChoices):
    RELATIV = "relativ", "Relative Mehrheit"
    ABSOLUT = "absolut", "Absolute Mehrheit (mehr als 50 %)"
    ZWEI_DRITTEL = "zwei_drittel", "Zwei Drittel"


class Aufbewahrung(models.TextChoices):
    TAGE_30 = "30", "30 Tage nach Ende der Einspruchsfristen"
    TAGE_90 = "90", "90 Tage nach Ende der Einspruchsfristen"
    TAGE_365 = "365", "1 Jahr nach Ende der Einspruchsfristen"
    MANUELL = "manuell", "Nur von Hand löschen"


class WahlStatus(models.TextChoices):
    ENTWURF = "entwurf", "Entwurf"
    AKTIV = "aktiv", "Aktiv"
    ABGESCHLOSSEN = "abgeschlossen", "Abgeschlossen"


PHASEN = ("ankuendigung", "kandidatur", "pruefung", "kampagne", "wahl", "ergebnis", "uebergabe")


class Wahl(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    titel = models.CharField(max_length=200)
    beschreibung = models.TextField(blank=True)
    form = models.CharField(max_length=20, choices=Wahlform.choices, default=Wahlform.LISTE)
    mehrheit = models.CharField(max_length=20, choices=Mehrheit.choices, default=Mehrheit.ABSOLUT)
    listen_groesse = models.PositiveSmallIntegerField(
        default=3,
        validators=[MinValueValidator(1), MaxValueValidator(7)],
        help_text="Zahl der Ämter einer Liste (Vorgabe drei, vom Ausschuss je Wahl festgelegt).",
    )
    posten = models.PositiveSmallIntegerField(
        default=1,
        validators=[MinValueValidator(1), MaxValueValidator(20)],
        help_text="Zahl der zu besetzenden Posten (Mehrfachwahl).",
    )
    unterstuetzungen_noetig = models.PositiveSmallIntegerField(default=10)
    zustimmungen_noetig = models.PositiveSmallIntegerField(
        default=2, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    aufbewahrung = models.CharField(
        max_length=10, choices=Aufbewahrung.choices, default=Aufbewahrung.TAGE_90
    )

    # Zeitplan — die Phase ergibt sich aus diesen Terminen (siehe `phase`).
    ankuendigung_am = models.DateField()
    kandidatur_von = models.DateField()
    kandidatur_bis = models.DateField()
    pruefung_bis = models.DateField()
    kampagne_bis = models.DateField(help_text="Letzter Tag der Kampagne, Wahlbeginn danach.")
    wahl_von = models.DateTimeField()
    wahl_bis = models.DateTimeField()
    einspruch_bis = models.DateField()
    uebergabe_bis = models.DateField()

    status = models.CharField(max_length=20, choices=WahlStatus.choices, default=WahlStatus.ENTWURF)
    vote_session = models.OneToOneField(
        "vote.VoteSession",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="wahl",
    )
    geoeffnet_am = models.DateTimeField(null=True, blank=True)
    ergebnis_freigegeben_am = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Erst mit zwei Freigaben des Ausschusses wird das Ergebnis veröffentlicht.",
    )
    vorgaenger = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="folgewahlen",
        help_text="Bei einem weiteren Wahlgang: die Wahl, aus deren Ergebnis er entstanden ist.",
    )
    runde = models.PositiveSmallIntegerField(default=1, help_text="Nummer des Wahlgangs.")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="wahlen_angelegt"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "wahlen_wahl"
        ordering = ["-wahl_von"]
        verbose_name = "Wahl"
        verbose_name_plural = "Wahlen"

    def __str__(self):
        return self.titel

    @property
    def phase(self) -> int:
        """0 Ankündigung, 1 Kandidatur, 2 Prüfung, 3 Kampagne, 4 Wahl, 5 Ergebnis, 6 Übergabe."""
        heute = timezone.localdate()
        jetzt = timezone.now()
        if jetzt >= self.wahl_bis:
            if heute <= self.einspruch_bis:
                return 5
            return 6
        if jetzt >= self.wahl_von:
            return 4
        if heute > self.pruefung_bis:
            return 3
        if heute > self.kandidatur_bis:
            return 2
        if heute >= self.kandidatur_von:
            return 1
        return 0

    @property
    def phase_name(self) -> str:
        return PHASEN[self.phase]

    @property
    def ist_liste(self) -> bool:
        return self.form == Wahlform.LISTE

    @property
    def art(self) -> str:
        """Prüfpunkt-Art: liste, person oder antrag (siehe services.PRUEFPUNKTE)."""
        if self.form == Wahlform.LISTE:
            return "liste"
        if self.form in (Wahlform.PERSON, Wahlform.MEHRFACH):
            return "person"
        return "antrag"


class AusschussMitglied(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    wahl = models.ForeignKey(Wahl, on_delete=models.CASCADE, related_name="ausschuss")
    membre = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="wahl_ausschuss"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "wahlen_ausschuss"
        constraints = [
            models.UniqueConstraint(fields=["wahl", "membre"], name="wahlen_ausschuss_einmalig")
        ]


class KandidaturStatus(models.TextChoices):
    ENTWURF = "entwurf", "Entwurf"
    EINGEREICHT = "eingereicht", "Eingereicht"
    RUECKFRAGE = "rueckfrage", "Rückfrage"
    ZUGELASSEN = "zugelassen", "Zugelassen"
    ABGELEHNT = "abgelehnt", "Abgelehnt"
    ZURUECKGEZOGEN = "zurueckgezogen", "Zurückgezogen"


class Kandidatur(models.Model):
    """Eine Liste, eine Einzelperson oder ein Antrag — je nach `wahl.form`."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    wahl = models.ForeignKey(Wahl, on_delete=models.CASCADE, related_name="kandidaturen")
    einreicher = models.ForeignKey(
        "membres.Membre", on_delete=models.PROTECT, related_name="wahl_kandidaturen"
    )
    name = models.CharField(max_length=200, blank=True, help_text="Listenname oder Antragstitel.")
    leitsatz = models.CharField(max_length=80, blank=True)
    vorstellung = models.TextField(blank=True, max_length=600)
    programm = models.JSONField(default=list, blank=True)
    sprache = models.CharField(max_length=2, default="de")
    rechte_foto = models.BooleanField(default=False)
    bestaetigt_wahlordnung = models.BooleanField(default=False)
    bestaetigt_fairness = models.BooleanField(default=False)
    bestaetigt_datenschutz = models.BooleanField(default=False)

    status = models.CharField(
        max_length=20, choices=KandidaturStatus.choices, default=KandidaturStatus.ENTWURF
    )
    eingereicht_am = models.DateTimeField(null=True, blank=True)
    nachbesserung_bis = models.DateTimeField(null=True, blank=True)
    nachbesserungen = models.PositiveSmallIntegerField(default=0)
    begruendung = models.TextField(blank=True)
    artikel = models.CharField(max_length=120, blank=True)
    entschieden_am = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "wahlen_kandidatur"
        ordering = ["created_at"]

    def __str__(self):
        return self.name or str(self.id)


class AmtPerson(models.TextChoices):
    PRAESIDENT = "pres", "Präsident*in"
    VIZE = "vp", "Vizepräsident*in"
    SCHATZ = "fin", "Schatzmeister*in"
    WEITERE = "more", "Weiteres Mitglied"
    KANDIDAT = "cand", "Kandidat*in"


def foto_pfad(instanz, dateiname):
    endung = dateiname.rsplit(".", 1)[-1].lower() if "." in dateiname else "jpg"
    return f"wahlen/fotos/{instanz.kandidatur_id}/{uuid.uuid4().hex}.{endung}"


def nachweis_pfad(instanz, dateiname):
    endung = dateiname.rsplit(".", 1)[-1].lower() if "." in dateiname else "pdf"
    return f"wahlen/nachweise/{instanz.kandidatur_id}/{uuid.uuid4().hex}.{endung}"


class KandidatPerson(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kandidatur = models.ForeignKey(Kandidatur, on_delete=models.CASCADE, related_name="personen")
    membre = models.ForeignKey(
        "membres.Membre", on_delete=models.PROTECT, related_name="wahl_personen"
    )
    amt = models.CharField(max_length=10, choices=AmtPerson.choices, default=AmtPerson.KANDIDAT)
    reihenfolge = models.PositiveSmallIntegerField(default=0)
    foto = models.ImageField(upload_to=foto_pfad, storage=JustificatifsStorage(), blank=True)

    class Meta:
        db_table = "wahlen_person"
        ordering = ["reihenfolge"]
        constraints = [
            models.UniqueConstraint(fields=["kandidatur", "membre"], name="wahlen_person_einmalig")
        ]


class Unterstuetzung(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kandidatur = models.ForeignKey(
        Kandidatur, on_delete=models.CASCADE, related_name="unterstuetzungen"
    )
    membre = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="wahl_unterstuetzungen"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "wahlen_unterstuetzung"
        constraints = [
            models.UniqueConstraint(
                fields=["kandidatur", "membre"], name="wahlen_unterstuetzung_einmalig"
            )
        ]


class NachweisArt(models.TextChoices):
    ABSCHLUSS = "abschluss", "Hochschulabschluss"
    DEUTSCH_B2 = "b2", "Deutsch B2"
    EHRENERKLAERUNG = "ehrenerklaerung", "Ehrenerklärung zum Leumund"
    KEINE_VERWANDTSCHAFT = "verwandtschaft", "Erklärung: keine Verwandtschaft"


class Nachweis(models.Model):
    """Vertraulich: nur Wahlausschuss und Einreicher*in. Löschung nach `wahl.aufbewahrung`."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kandidatur = models.ForeignKey(Kandidatur, on_delete=models.CASCADE, related_name="nachweise")
    person = models.ForeignKey(
        KandidatPerson, null=True, blank=True, on_delete=models.CASCADE, related_name="nachweise"
    )
    art = models.CharField(max_length=20, choices=NachweisArt.choices)
    datei = models.FileField(upload_to=nachweis_pfad, storage=JustificatifsStorage())
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "wahlen_nachweis"
        ordering = ["created_at"]


class PruefErgebnis(models.TextChoices):
    OFFEN = "offen", "Offen"
    OK = "ok", "In Ordnung"
    NEIN = "nein", "Nicht in Ordnung"


class Pruefpunkt(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kandidatur = models.ForeignKey(Kandidatur, on_delete=models.CASCADE, related_name="pruefpunkte")
    schluessel = models.CharField(max_length=40)
    automatisch = models.BooleanField(default=False)
    ergebnis = models.CharField(
        max_length=10, choices=PruefErgebnis.choices, default=PruefErgebnis.OFFEN
    )
    notiz = models.CharField(max_length=300, blank=True)
    geprueft_von = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    geprueft_am = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "wahlen_pruefpunkt"
        constraints = [
            models.UniqueConstraint(
                fields=["kandidatur", "schluessel"], name="wahlen_pruefpunkt_einmalig"
            )
        ]


class EntscheidungArt(models.TextChoices):
    ZULASSEN = "zulassen", "Zulassen"
    RUECKFRAGE = "rueckfrage", "Rückfrage"
    ABLEHNEN = "ablehnen", "Ablehnen"


class Entscheidung(models.Model):
    """Vorschlag eines Ausschussmitglieds; wirksam erst mit genug Zustimmungen (Vier-Augen)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kandidatur = models.ForeignKey(
        Kandidatur, on_delete=models.CASCADE, related_name="entscheidungen"
    )
    art = models.CharField(max_length=12, choices=EntscheidungArt.choices)
    begruendung = models.TextField(blank=True)
    artikel = models.CharField(max_length=120, blank=True)
    vorgeschlagen_von = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    umgesetzt_am = models.DateTimeField(null=True, blank=True)
    verworfen = models.BooleanField(default=False)

    class Meta:
        db_table = "wahlen_entscheidung"
        ordering = ["-created_at"]


class EntscheidungZustimmung(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entscheidung = models.ForeignKey(
        Entscheidung, on_delete=models.CASCADE, related_name="zustimmungen"
    )
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "wahlen_entscheidung_zustimmung"
        constraints = [
            models.UniqueConstraint(
                fields=["entscheidung", "user"], name="wahlen_zustimmung_einmalig"
            )
        ]


class FreigabeArt(models.TextChoices):
    OEFFNEN = "oeffnen", "Wahl öffnen"
    SCHLIESSEN = "schliessen", "Wahl schließen"
    ERGEBNIS = "ergebnis", "Ergebnis veröffentlichen"


class WahlFreigabe(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    wahl = models.ForeignKey(Wahl, on_delete=models.CASCADE, related_name="freigaben")
    art = models.CharField(max_length=12, choices=FreigabeArt.choices)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "wahlen_freigabe"
        constraints = [
            models.UniqueConstraint(fields=["wahl", "art", "user"], name="wahlen_freigabe_einmalig")
        ]


class BekanntmachungStatus(models.TextChoices):
    ENTWURF = "entwurf", "Entwurf"
    WARTET = "wartet", "Wartet auf Freigabe"
    FREIGEGEBEN = "freigegeben", "Freigegeben"
    GESENDET = "gesendet", "Gesendet"


class Bekanntmachung(models.Model):
    """Text, den der Ausschuss selbst schreibt (Word-ähnlich, bereinigtes HTML je Sprache).
    Logo, Absender, Anschrift und Abmeldehinweis fügt CID beim Versand hinzu."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    wahl = models.ForeignKey(Wahl, on_delete=models.CASCADE, related_name="bekanntmachungen")
    schluessel = models.CharField(max_length=20)
    versand_am = models.DateTimeField()
    kanaele = models.JSONField(default=list)
    texte = models.JSONField(default=dict)
    geprueft = models.JSONField(default=dict)
    status = models.CharField(
        max_length=12, choices=BekanntmachungStatus.choices, default=BekanntmachungStatus.ENTWURF
    )
    gesendet_am = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "wahlen_bekanntmachung"
        ordering = ["versand_am"]
        constraints = [
            models.UniqueConstraint(fields=["wahl", "schluessel"], name="wahlen_bk_einmalig")
        ]


class BekanntmachungFreigabe(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bekanntmachung = models.ForeignKey(
        Bekanntmachung, on_delete=models.CASCADE, related_name="freigaben"
    )
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "wahlen_bekanntmachung_freigabe"
        constraints = [
            models.UniqueConstraint(
                fields=["bekanntmachung", "user"], name="wahlen_bk_freigabe_einmalig"
            )
        ]


class EinspruchArt(models.TextChoices):
    WAEHLBARKEIT = "waehlbarkeit", "Einspruch gegen die Wählbarkeit einer zugelassenen Kandidatur"
    ABLEHNUNG = "ablehnung", "Einspruch gegen die Ablehnung der eigenen Kandidatur"
    ERGEBNIS = "ergebnis", "Einspruch gegen das Ergebnis"


class EinspruchStatus(models.TextChoices):
    OFFEN = "offen", "Offen"
    STATTGEGEBEN = "stattgegeben", "Stattgegeben"
    ABGEWIESEN = "abgewiesen", "Abgewiesen"
    ZURUECKGEZOGEN = "zurueckgezogen", "Zurückgezogen"


class EinspruchEntscheidung(models.TextChoices):
    STATTGEBEN = "stattgeben", "Stattgeben"
    ABWEISEN = "abweisen", "Abweisen"


class Einspruch(models.Model):
    """Einspruch eines Mitglieds. Sichtbar nur für die einreichende Person, den Wahlausschuss und
    das Büro. Der Ausschuss entscheidet binnen fünf Tagen, ebenfalls mit zwei Freigaben."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    wahl = models.ForeignKey(Wahl, on_delete=models.CASCADE, related_name="einsprueche")
    art = models.CharField(max_length=14, choices=EinspruchArt.choices)
    kandidatur = models.ForeignKey(
        Kandidatur, null=True, blank=True, on_delete=models.CASCADE, related_name="einsprueche"
    )
    einreicher = models.ForeignKey(
        "membres.Membre", on_delete=models.PROTECT, related_name="wahl_einsprueche"
    )
    text = models.TextField(max_length=2000)
    status = models.CharField(
        max_length=14, choices=EinspruchStatus.choices, default=EinspruchStatus.OFFEN
    )
    created_at = models.DateTimeField(auto_now_add=True)
    entscheiden_bis = models.DateTimeField()

    # Vorschlag des Ausschusses (wirksam mit genug Zustimmungen)
    vorschlag = models.CharField(max_length=12, choices=EinspruchEntscheidung.choices, blank=True)
    vorschlag_begruendung = models.TextField(blank=True)
    vorgeschlagen_von = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    # Endgültige Entscheidung
    begruendung = models.TextField(blank=True)
    entschieden_am = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "wahlen_einspruch"
        ordering = ["-created_at"]


class EinspruchZustimmung(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    einspruch = models.ForeignKey(Einspruch, on_delete=models.CASCADE, related_name="zustimmungen")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "wahlen_einspruch_zustimmung"
        constraints = [
            models.UniqueConstraint(
                fields=["einspruch", "user"], name="wahlen_einspruch_zustimmung_einmalig"
            )
        ]


class Protokoll(models.Model):
    """Wahlprotokoll: wird mit der Veröffentlichung des Ergebnisses als unveränderlicher Stand
    festgehalten und von drei Ausschussmitgliedern unterschrieben."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    wahl = models.OneToOneField(Wahl, on_delete=models.CASCADE, related_name="protokoll")
    daten = models.JSONField(default=dict)
    erzeugt_am = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "wahlen_protokoll"


class ProtokollUnterschrift(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    protokoll = models.ForeignKey(
        Protokoll, on_delete=models.CASCADE, related_name="unterschriften"
    )
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "wahlen_protokoll_unterschrift"
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["protokoll", "user"], name="wahlen_protokoll_unterschrift_einmalig"
            )
        ]


class ReglementArt(models.TextChoices):
    WAHLORDNUNG = "wahlordnung", "Wahlordnung"
    SATZUNG = "satzung", "Satzungsauszug"
    FAIRNESS = "fairness", "Fairness-Kodex"
    DATENSCHUTZ = "datenschutz", "Datenschutz und Bildrechte"
    GESCHAEFTSORDNUNG = "geschaeftsordnung", "Geschäftsordnung des Ausschusses"


class Reglement(models.Model):
    """Dokument der Reglement-Bibliothek einer Wahl. Deutsch ist verbindlich; Französisch und
    Arabisch sind maschinell übersetzt (DeepL), bis ein Mensch sie als geprüft markiert."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    wahl = models.ForeignKey(Wahl, on_delete=models.CASCADE, related_name="reglemente")
    schluessel = models.CharField(max_length=20, choices=ReglementArt.choices)
    version = models.CharField(max_length=20, default="1")
    gueltig_ab = models.DateField(null=True, blank=True)
    texte = models.JSONField(default=dict)
    geprueft = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "wahlen_reglement"
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(fields=["wahl", "schluessel"], name="wahlen_reglement_einmalig")
        ]


class ReglementGelesen(models.Model):
    """Lesebestätigung eines Mitglieds für eine bestimmte Fassung (Version)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reglement = models.ForeignKey(Reglement, on_delete=models.CASCADE, related_name="gelesen")
    membre = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="wahl_reglement_gelesen"
    )
    version = models.CharField(max_length=20)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "wahlen_reglement_gelesen"
        constraints = [
            models.UniqueConstraint(
                fields=["reglement", "membre", "version"], name="wahlen_reglement_gelesen_einmalig"
            )
        ]


class UebergabePunkt(models.Model):
    """Von Hand abgehakter Punkt der Übergabe-Checkliste (Phase 7)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    wahl = models.ForeignKey(Wahl, on_delete=models.CASCADE, related_name="uebergabe_punkte")
    schluessel = models.CharField(max_length=30)
    erledigt_am = models.DateTimeField(null=True, blank=True)
    erledigt_von = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    notiz = models.CharField(max_length=300, blank=True)

    class Meta:
        db_table = "wahlen_uebergabe_punkt"
        constraints = [
            models.UniqueConstraint(fields=["wahl", "schluessel"], name="wahlen_uebergabe_einmalig")
        ]


class MitteilungArt(models.TextChoices):
    """Automatische Erinnerungen entlang des Ablaufs (Konzept 3.6). Die fünf Bekanntmachungen
    schreibt der Ausschuss selbst, sie liegen in `Bekanntmachung`."""

    KANDIDATUR_ENDET = "kandidatur_endet", "Kandidatur endet in 3 Tagen"
    RUECKFRAGE_FRIST = "rueckfrage_frist", "Rückfrage: noch 24 Stunden"
    EINSPRUCH_LISTEN = "einspruch_listen", "Einspruchsfrist (Zulassung) endet morgen"
    NICHTWAEHLER = "nichtwaehler", "Erinnerung: noch nicht abgestimmt"
    WAHL_ENDET = "wahl_endet", "Wahl endet in 2 Stunden"
    EINSPRUCH_ERGEBNIS = "einspruch_ergebnis", "Einspruchsfrist (Ergebnis) endet in 2 Tagen"


class MitteilungStatus(models.TextChoices):
    GEPLANT = "geplant", "Geplant"
    GESENDET = "gesendet", "Gesendet"
    UEBERSPRUNGEN = "uebersprungen", "Nicht gesendet"


class Mitteilung(models.Model):
    """Eine geplante automatische Erinnerung. Der Ausschuss sieht den Plan und kann die Kanäle
    abschalten, solange noch nichts gesendet wurde. Ein leerer Kanal-Satz heißt: nicht senden."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    wahl = models.ForeignKey(Wahl, on_delete=models.CASCADE, related_name="mitteilungen")
    art = models.CharField(max_length=24, choices=MitteilungArt.choices)
    bezug = models.CharField(
        max_length=40, blank=True, default="", help_text="z. B. die Kandidatur bei einer Rückfrage."
    )
    versand_am = models.DateTimeField()
    kanaele = models.JSONField(default=list)
    status = models.CharField(
        max_length=14, choices=MitteilungStatus.choices, default=MitteilungStatus.GEPLANT
    )
    gesendet_am = models.DateTimeField(null=True, blank=True)
    anzahl = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "wahlen_mitteilung"
        ordering = ["versand_am"]
        constraints = [
            models.UniqueConstraint(
                fields=["wahl", "art", "bezug"], name="wahlen_mitteilung_einmalig"
            )
        ]
