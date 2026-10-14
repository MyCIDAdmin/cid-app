"""Datenpflege (Release 25) : alte Protokoll- und Hilfsdaten automatisch oder manuell löschen.

Gelöscht werden ausschließlich technische Daten (Protokoll, Auswertungen, gelesene Hinweise,
abgelaufene Sitzungen). Geschäftsdaten — Mitglieder, Beiträge, Zahlungen, Inhalte, Rollen —
sind nicht enthalten und werden hier nie angefasst. Jede Datenart hat einen Standard und eine
Mindestfrist, die sich nicht unterschreiten lässt ; offene Auffälligkeiten und offene
Rechteprüfungen werden nie gelöscht.
"""

from datetime import timedelta
from zoneinfo import ZoneInfo

from django.contrib.sessions.models import Session
from django.db import transaction
from django.db.models import Min, Q
from django.utils import timezone

from apps.accounts.models import AuditLogEntry
from apps.notifications.models import Notification

from . import kategorien as kat
from .models import Auffaelligkeit, Monatsbericht, Nutzung, Pflegeeinstellung, RechteReview

BERLIN = ZoneInfo("Europe/Berlin")
MAXIMUM_TAGE = 3650  # zehn Jahre
GRUPPEN = ("journal", "auswertungen", "hinweise", "technik")

# Mindestfristen des Journals je Kategorie ; alles andere : mindestens ein Jahr.
_JOURNAL_MINIMUM = {"anmeldung": 30, "betrieb": 30, "konto": 90, "sonstige": 90}
_JOURNAL_MINIMUM_STANDARD = 365


class Art:
    """Eine löschbare Datenart. Unterklassen legen fest, welche Datensätze betroffen sind."""

    gruppe = "technik"
    fest = False  # True : keine einstellbare Frist (nur abgelaufene Daten)
    datum = False  # True : Zeitfeld ist ein Datum, kein Zeitpunkt

    def __init__(self, key, de, fr, info_de, info_fr, standard, minimum, zeitfeld):
        self.key = key
        self.de, self.fr = de, fr
        self.info_de, self.info_fr = info_de, info_fr
        self.standard, self.minimum = standard, minimum
        self.zeitfeld = zeitfeld

    def basis(self):
        raise NotImplementedError

    def grenze(self, jetzt, tage):
        if self.datum:
            return timezone.localdate(jetzt, BERLIN) - timedelta(days=tage)
        return jetzt - timedelta(days=tage)

    def kandidaten(self, jetzt, tage):
        return self.basis().filter(**{f"{self.zeitfeld}__lt": self.grenze(jetzt, tage)})

    def gesamt(self):
        return self.basis().count()

    def aeltester(self):
        return self.basis().aggregate(wert=Min(self.zeitfeld))["wert"]

    def betroffen(self, jetzt, tage):
        return self.kandidaten(jetzt, tage).count()

    def entfernen(self, jetzt, tage):
        return self.kandidaten(jetzt, tage).delete()[0]


class JournalArt(Art):
    gruppe = "journal"

    def __init__(self, kategorie):
        de, fr, tage = kat.KATEGORIEN[kategorie]
        super().__init__(
            f"journal.{kategorie}",
            de,
            fr,
            "Protokolleinträge dieser Kategorie.",
            "Entrées du journal de cette catégorie.",
            tage,
            _JOURNAL_MINIMUM.get(kategorie, _JOURNAL_MINIMUM_STANDARD),
            "created_at",
        )
        self.kategorie = kategorie

    def basis(self):
        qs = AuditLogEntry.objects.all()
        if self.kategorie == "sonstige":
            return qs.exclude(action__in=list(kat.AKTIONEN))
        return qs.filter(action__in=kat.aktionen_von(self.kategorie))


class IpArt(Art):
    """IP-Adresse und Browserkennung werden früh entfernt, der Eintrag selbst bleibt."""

    gruppe = "journal"

    def basis(self):
        return AuditLogEntry.objects.filter(Q(ip_address__isnull=False) | ~Q(user_agent=""))

    def entfernen(self, jetzt, tage):
        grenze = self.grenze(jetzt, tage)
        n = self.kandidaten(jetzt, tage).update(ip_address=None, user_agent="")
        n += Auffaelligkeit.objects.filter(erkannt_am__lt=grenze, ip_address__isnull=False).update(
            ip_address=None
        )
        return n

    def betroffen(self, jetzt, tage):
        return (
            self.kandidaten(jetzt, tage).count()
            + Auffaelligkeit.objects.filter(
                erkannt_am__lt=self.grenze(jetzt, tage), ip_address__isnull=False
            ).count()
        )


class QuerysetArt(Art):
    """Datenart über eine Basis-Abfrage (Funktion), die nur löschbare Zeilen enthält."""

    def __init__(self, *args, basis, gruppe, datum=False, fest=False):
        super().__init__(*args)
        self._basis = basis
        self.gruppe = gruppe
        self.datum = datum
        self.fest = fest

    def basis(self):
        return self._basis()


def _axes_log():
    from axes.models import AccessLog

    return AccessLog.objects.all()


class AxesFehlerArt(Art):
    """django-axes : Protokoll fehlgeschlagener Anmeldungen und überholte Zähler."""

    gruppe = "technik"

    def basis(self):
        from axes.models import AccessFailureLog

        return AccessFailureLog.objects.all()

    def entfernen(self, jetzt, tage):
        from axes.models import AccessAttempt

        n = super().entfernen(jetzt, tage)
        n += AccessAttempt.objects.filter(attempt_time__lt=self.grenze(jetzt, tage)).delete()[0]
        return n

    def betroffen(self, jetzt, tage):
        from axes.models import AccessAttempt

        return (
            super().betroffen(jetzt, tage)
            + AccessAttempt.objects.filter(attempt_time__lt=self.grenze(jetzt, tage)).count()
        )


def _arten() -> dict:
    liste = [JournalArt(k) for k in kat.KATEGORIEN]
    liste.append(
        IpArt(
            "ip",
            "IP-Adressen & Browserkennung",
            "Adresses IP et navigateur",
            "Nur diese Angaben werden aus alten Einträgen entfernt ; die Einträge bleiben.",
            "Seules ces données sont retirées des anciennes entrées ; les entrées restent.",
            kat.IP_AUFBEWAHRUNG_TAGE,
            7,
            "created_at",
        )
    )
    liste += [
        QuerysetArt(
            "auffaelligkeiten",
            "Erledigte Auffälligkeiten",
            "Anomalies traitées",
            "Offene Auffälligkeiten werden nie gelöscht.",
            "Les anomalies ouvertes ne sont jamais supprimées.",
            kat.KATEGORIEN["audit"][2],
            90,
            "erkannt_am",
            basis=lambda: Auffaelligkeit.objects.filter(status=Auffaelligkeit.Status.ERLEDIGT),
            gruppe="auswertungen",
        ),
        QuerysetArt(
            "nutzung",
            "Nutzungsstatistik",
            "Statistiques d'utilisation",
            "Zähler je Person, Tag und Modul ; die Monatsberichte bleiben davon unberührt.",
            "Compteurs par personne, jour et module ; les rapports mensuels ne sont pas touchés.",
            kat.NUTZUNG_AUFBEWAHRUNG_TAGE,
            100,
            "tag",
            basis=lambda: Nutzung.objects.all(),
            gruppe="auswertungen",
            datum=True,
        ),
        QuerysetArt(
            "berichte",
            "Monatsberichte",
            "Rapports mensuels",
            "Gespeicherte Monatsberichte (nur Summen).",
            "Rapports mensuels enregistrés (sommes uniquement).",
            1095,
            400,
            "erstellt_am",
            basis=lambda: Monatsbericht.objects.all(),
            gruppe="auswertungen",
        ),
        QuerysetArt(
            "reviews",
            "Abgeschlossene Rechteprüfungen",
            "Revues des droits terminées",
            "Nachweis der Prüfungen ; offene Prüfungen werden nie gelöscht.",
            "Preuve des revues ; les revues ouvertes ne sont jamais supprimées.",
            1095,
            730,
            "abgeschlossen_am",
            basis=lambda: RechteReview.objects.filter(status=RechteReview.Status.ABGESCHLOSSEN),
            gruppe="auswertungen",
        ),
        QuerysetArt(
            "hinweise_gelesen",
            "Gelesene Benachrichtigungen",
            "Notifications lues",
            "Glocken-Hinweise, die bereits gelesen wurden.",
            "Notifications de la cloche déjà lues.",
            180,
            30,
            "created_at",
            basis=lambda: Notification.objects.filter(lu=True),
            gruppe="hinweise",
        ),
        QuerysetArt(
            "hinweise_ungelesen",
            "Ungelesene Benachrichtigungen",
            "Notifications non lues",
            "Sehr alte Hinweise, die nie geöffnet wurden.",
            "Très anciennes notifications jamais ouvertes.",
            730,
            180,
            "created_at",
            basis=lambda: Notification.objects.filter(lu=False),
            gruppe="hinweise",
        ),
        AxesFehlerArt(
            "axes_fehler",
            "Fehlversuch-Protokoll der Sperre",
            "Journal des échecs du blocage",
            "Technisches Protokoll der Anmeldesperre (django-axes) und überholte Zähler.",
            "Journal technique du blocage de connexion (django-axes) et compteurs obsolètes.",
            90,
            30,
            "attempt_time",
        ),
        QuerysetArt(
            "axes_log",
            "Anmelde-Protokoll der Sperre",
            "Journal des connexions du blocage",
            "Technisches Anmelde-Protokoll von django-axes.",
            "Journal technique des connexions de django-axes.",
            90,
            30,
            "attempt_time",
            basis=_axes_log,
            gruppe="technik",
        ),
        QuerysetArt(
            "sitzungen",
            "Abgelaufene Sitzungen",
            "Sessions expirées",
            "Technische Sitzungen, deren Gültigkeit abgelaufen ist (keine Frist nötig).",
            "Sessions techniques expirées (aucun délai nécessaire).",
            0,
            0,
            "expire_date",
            basis=lambda: Session.objects.all(),
            gruppe="technik",
            fest=True,
        ),
    ]
    return {a.key: a for a in liste}


ARTEN = _arten()


def einstellung() -> Pflegeeinstellung:
    obj, _ = Pflegeeinstellung.objects.get_or_create(pk=1)
    return obj


def frist(art: Art, einst: Pflegeeinstellung | None = None) -> int:
    """Wirksame Frist in Tagen : Einstellung, begrenzt auf Mindest- und Höchstwert."""
    if art.fest:
        return 0
    einst = einst or einstellung()
    wert = einst.fristen.get(art.key, art.standard)
    try:
        wert = int(wert)
    except (TypeError, ValueError):
        wert = art.standard
    return max(art.minimum, min(MAXIMUM_TAGE, wert))


def journal_frist(kategorie: str, einst: Pflegeeinstellung | None = None) -> int:
    return frist(ARTEN[f"journal.{kategorie}"], einst)


def art_dict(art: Art, jetzt, einst: Pflegeeinstellung) -> dict:
    tage = frist(art, einst)
    return {
        "key": art.key,
        "gruppe": art.gruppe,
        "label": {"de": art.de, "fr": art.fr},
        "info": {"de": art.info_de, "fr": art.info_fr},
        "frist": tage,
        "standard": art.standard,
        "minimum": art.minimum,
        "maximum": MAXIMUM_TAGE,
        "fest": art.fest,
        "gesamt": art.gesamt(),
        "betroffen": art.betroffen(jetzt, tage),
        "aeltester": art.aeltester(),
    }


def vorschau(jetzt=None) -> list[dict]:
    jetzt = jetzt or timezone.now()
    einst = einstellung()
    return [art_dict(a, jetzt, einst) for a in ARTEN.values()]


def ausfuehren(schluessel=None, jetzt=None, einst=None) -> dict:
    """Löscht je gewählter Datenart (Standard : alle) die Daten jenseits der Frist. Gibt
    `{Datenart: Anzahl}` zurück. Jede Datenart läuft in einer eigenen Transaktion."""
    jetzt = jetzt or timezone.now()
    einst = einst or einstellung()
    ergebnis = {}
    for key in schluessel if schluessel is not None else ARTEN:
        art = ARTEN[key]
        with transaction.atomic():
            ergebnis[key] = art.entfernen(jetzt, frist(art, einst))
    return ergebnis


def lauf(modus: str, user=None, schluessel=None, jetzt=None) -> dict:
    """Führt die Pflege aus und merkt sich das Ergebnis (`modus` : automatisch | manuell)."""
    jetzt = jetzt or timezone.now()
    einst = einstellung()
    ergebnis = ausfuehren(schluessel, jetzt, einst)
    einst.letzter_lauf_am = jetzt
    einst.letzter_lauf_modus = modus
    einst.letzter_lauf_von = user
    einst.letzter_lauf_ergebnis = {k: v for k, v in ergebnis.items() if v}
    einst.save(
        update_fields=[
            "letzter_lauf_am",
            "letzter_lauf_modus",
            "letzter_lauf_von",
            "letzter_lauf_ergebnis",
        ]
    )
    return ergebnis


def summe(ergebnis: dict) -> int:
    return sum(ergebnis.values())
