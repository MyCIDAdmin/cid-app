"""Familienpaket (Release 34/35) — Preis, Personen, Einladung der Erwachsenen.

Ein Familienpaket ist eine Kombination bestehender Angebote der Kampagne : die Hauptperson, jede
weitere erwachsene Person und jedes Kind erhält das ihr zugewiesene Angebot. Der Gesamtpreis ist
die Summe der Angebotspreise minus Familienrabatt in Prozent ; der Rabatt wird auf alle Personen
verteilt, damit die Finanzen sehen, wer wie viel „bezahlt“ hat.

Kinder sind keine Mitglieder (models.FamilienKind). Erwachsene werden per Einladung eigene
Mitglieder (models.FamilienErwachsener) und zahlen nichts selbst : ihr Anteil steckt in der
Zahlung der Hauptperson.
"""

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import (
    Beziehung,
    EinladungStatus,
    FamilienErwachsener,
    FamilienKind,
    OffreAdhesion,
    Souscription,
    StatutSouscription,
)

EINWILLIGUNG_VERSION = "2026-10-v1"
_NAME_MAX = 100
_CENT = Decimal("0.01")
KIND_BEZIEHUNGEN = (Beziehung.KIND, Beziehung.GESCHWISTER)


def _geld(betrag: Decimal) -> Decimal:
    return betrag.quantize(_CENT, rounding=ROUND_HALF_UP)


# --- Preis ------------------------------------------------------------------------------------


@dataclass
class Position:
    rolle: str  # "haupt" | "erwachsener" | "kind"
    angebot: OffreAdhesion
    liste: Decimal
    anteil: Decimal


@dataclass
class Paket:
    positionen: list[Position] = field(default_factory=list)
    rabatt_pct: Decimal = Decimal("0.00")

    @property
    def liste_gesamt(self) -> Decimal:
        return sum((p.liste for p in self.positionen), Decimal("0.00"))

    @property
    def gesamt(self) -> Decimal:
        return sum((p.anteil for p in self.positionen), Decimal("0.00"))

    def rolle(self, rolle: str) -> list[Position]:
        return [p for p in self.positionen if p.rolle == rolle]


def zugewiesene_angebote(offre: OffreAdhesion):
    """(Hauptperson, Erwachsene, Kinder) — die Hauptperson erhält ohne eigene Zuweisung das
    Angebot der Erwachsenen."""
    erwachsene = offre.familie_angebot_erwachsene
    haupt = offre.familie_angebot_hauptperson or erwachsene
    return haupt, erwachsene, offre.familie_angebot_kinder


def pruefe_konfiguration(offre: OffreAdhesion) -> None:
    """Ein Familienpaket braucht zugewiesene, normale Angebote derselben Kampagne."""
    haupt, erwachsene, kinder = zugewiesene_angebote(offre)
    if haupt is None:
        raise ValidationError(
            {"familie_angebot_erwachsene": "Ein Familienpaket braucht ein Angebot für Erwachsene."}
        )
    if offre.max_erwachsene and erwachsene is None:
        raise ValidationError(
            {"familie_angebot_erwachsene": "Weitere Erwachsene brauchen ein zugewiesenes Angebot."}
        )
    if offre.max_kinder and kinder is None:
        raise ValidationError(
            {"familie_angebot_kinder": "Für Kinder muss ein Angebot zugewiesen sein."}
        )
    for feld, angebot in (
        ("familie_angebot_hauptperson", offre.familie_angebot_hauptperson),
        ("familie_angebot_erwachsene", erwachsene),
        ("familie_angebot_kinder", kinder),
    ):
        if angebot is None:
            continue
        if angebot.pk == offre.pk or angebot.ist_familienpaket:
            raise ValidationError({feld: "Es muss ein normales Angebot sein."})
        if angebot.campagne_id != offre.campagne_id:
            raise ValidationError({feld: "Das Angebot gehört zu einer anderen Kampagne."})


def berechne_paket(offre: OffreAdhesion, erwachsene: int, kinder: int) -> Paket:
    """Preise des Pakets (Server-Berechnung, das Frontend zeigt nur eine Vorschau)."""
    haupt, angebot_erw, angebot_kind = zugewiesene_angebote(offre)
    if haupt is None or (erwachsene and angebot_erw is None) or (kinder and angebot_kind is None):
        raise ValidationError({"detail": "familienpaket_nicht_konfiguriert"})
    faktor = Decimal("1") - offre.familie_rabatt_pct / Decimal("100")
    paket = Paket(rabatt_pct=offre.familie_rabatt_pct)
    reihe = [("haupt", haupt)]
    reihe += [("erwachsener", angebot_erw)] * erwachsene
    reihe += [("kind", angebot_kind)] * kinder
    for rolle, angebot in reihe:
        paket.positionen.append(
            Position(rolle, angebot, angebot.prix_plein, _geld(angebot.prix_plein * faktor))
        )
    return paket


def pruefe_plaetze(offre: OffreAdhesion, erwachsene: int, kinder: int) -> None:
    if not offre.ist_familienpaket:
        if erwachsene or kinder:
            raise ValidationError({"detail": "Dieses Angebot ist kein Familienpaket."})
        return
    if erwachsene > offre.max_erwachsene:
        raise ValidationError(
            {"erwachsene": f"Höchstens {offre.max_erwachsene} weitere Erwachsene."}
        )
    if kinder > offre.max_kinder:
        raise ValidationError({"kinder": f"Höchstens {offre.max_kinder} Kinder."})


# --- Personen erfassen ------------------------------------------------------------------------


def _text(daten, feld: str, wo: str) -> str:
    wert = daten.get(feld, "") if hasattr(daten, "get") else ""
    if not isinstance(wert, str) or not wert.strip():
        raise ValidationError({wo: f"„{feld}“ ist ein Pflichtfeld."})
    wert = wert.strip()
    if len(wert) > _NAME_MAX:
        raise ValidationError({wo: f"„{feld}“: höchstens {_NAME_MAX} Zeichen."})
    return wert


def _erwachsener_pruefen(daten, nr: int) -> dict:
    wo = "erwachsene"
    vorname, nachname = _text(daten, "vorname", wo), _text(daten, "nachname", wo)
    email = _text(daten, "email", wo).lower()
    try:
        validate_email(email)
    except DjangoValidationError:
        raise ValidationError({wo: f"Person {nr}: ungültige E-Mail-Adresse."})
    beziehung = daten.get("beziehung")
    if beziehung not in Beziehung.values:
        raise ValidationError({wo: f"Person {nr}: Beziehung fehlt."})
    return {"vorname": vorname, "nachname": nachname, "email": email, "beziehung": beziehung}


def _kind_pruefen(daten, nr: int, campagne) -> dict:
    wo = "kinder"
    vorname, nachname = _text(daten, "vorname", wo), _text(daten, "nachname", wo)
    beziehung = daten.get("beziehung") or Beziehung.KIND
    if beziehung not in KIND_BEZIEHUNGEN:
        raise ValidationError({wo: f"Kind {nr}: Beziehung Kind oder Geschwister erwartet."})
    if daten.get("einwilligung") is not True:
        raise ValidationError({wo: f"Kind {nr}: Die Einwilligung ist erforderlich."})
    try:
        geburtsjahr = int(daten.get("geburtsjahr"))
    except (TypeError, ValueError):
        raise ValidationError({wo: f"Kind {nr}: Geburtsjahr als Zahl erwartet."})
    hoechstens = campagne.familie_max_alter_kind
    if not (campagne.annee - hoechstens <= geburtsjahr <= campagne.annee):
        raise ValidationError(
            {
                wo: (
                    f"Kind {nr}: Kinder dürfen in {campagne.annee} höchstens "
                    f"{hoechstens} Jahre alt sein."
                )
            }
        )
    return {
        "vorname": vorname,
        "nachname": nachname,
        "geburtsjahr": geburtsjahr,
        "beziehung": beziehung,
    }


def buche_paket(
    souscription: Souscription, offre: OffreAdhesion, erwachsene_daten, kinder_daten, user
) -> Paket:
    """Setzt Personen, Preise und Plätze der Souscription ; ersetzt frühere Angaben (nur vor der
    Zahlung). Läuft in der Transaktion des Aufrufers."""
    erwachsene_daten = list(erwachsene_daten or [])
    kinder_daten = list(kinder_daten or [])
    pruefe_plaetze(offre, len(erwachsene_daten), len(kinder_daten))
    if not offre.ist_familienpaket:
        return Paket()
    pruefe_konfiguration(offre)
    if not erwachsene_daten and not kinder_daten:
        raise ValidationError({"detail": "Bitte mindestens eine weitere Person eintragen."})

    erwachsene = [_erwachsener_pruefen(d, i) for i, d in enumerate(erwachsene_daten, start=1)]
    eigene = {
        (souscription.membre.email or "").lower(),
        (getattr(user, "email", "") or "").lower(),
    } - {""}
    emails = [e["email"] for e in erwachsene]
    if len(set(emails)) != len(emails) or set(emails) & eigene:
        raise ValidationError({"erwachsene": "Jede E-Mail-Adresse darf nur einmal vorkommen."})
    kinder = [
        _kind_pruefen(d, i, souscription.campagne) for i, d in enumerate(kinder_daten, start=1)
    ]

    paket = berechne_paket(offre, len(erwachsene), len(kinder))
    haupt = paket.rolle("haupt")[0]

    souscription.kinder.all().delete()
    souscription.erwachsene.all().delete()
    for daten, pos in zip(erwachsene, paket.rolle("erwachsener")):
        FamilienErwachsener.objects.create(
            souscription=souscription,
            angebot=pos.angebot,
            preis_liste=pos.liste,
            preis_anteil=pos.anteil,
            **daten,
        )
    for nr, (daten, pos) in enumerate(zip(kinder, paket.rolle("kind")), start=1):
        FamilienKind.objects.create(
            souscription=souscription,
            angebot=pos.angebot,
            preis_liste=pos.liste,
            preis_anteil=pos.anteil,
            kartennummer=f"{souscription.membre.numero_membre}-J{nr}",
            einwilligung_von=user,
            einwilligung_version=EINWILLIGUNG_VERSION,
            **daten,
        )

    souscription.plaetze_erwachsene = len(erwachsene)
    souscription.plaetze_kinder = len(kinder)
    souscription.familien_gesamtpreis = paket.gesamt
    souscription.familienrabatt_pct = paket.rabatt_pct
    souscription.hauptperson_angebot = haupt.angebot
    souscription.haupt_preis_liste = haupt.liste
    souscription.haupt_preis_anteil = haupt.anteil
    souscription.prix_paye = paket.gesamt
    souscription.snapshot_avantages = haupt.angebot.avantages
    return paket


def leere_familie(souscription: Souscription) -> None:
    """Einzelangebot : keine Familiendaten."""
    souscription.plaetze_erwachsene = 0
    souscription.plaetze_kinder = 0
    souscription.familien_gesamtpreis = None
    souscription.familienrabatt_pct = Decimal("0.00")
    souscription.hauptperson_angebot = None
    souscription.haupt_preis_liste = None
    souscription.haupt_preis_anteil = None
    if souscription._state.adding is False:
        souscription.kinder.all().delete()
        souscription.erwachsene.all().delete()


def verteilung_aktualisieren(haupt: Souscription) -> None:
    """Hauptperson-`prix_paye` = Gesamtpreis minus Anteile der Erwachsenen, die bereits ein
    eigenes Mitglied sind (deren Anteil steht dann in ihrer eigenen Souscription) — so ergibt die
    Summe aller Souscriptions immer genau den bezahlten Betrag."""
    if haupt.familien_gesamtpreis is None:
        return
    uebernommen = sum(
        (
            s.prix_paye
            for s in Souscription.objects.filter(
                bezahlt_ueber=haupt, statut=StatutSouscription.PAYEE
            )
        ),
        Decimal("0.00"),
    )
    haupt.prix_paye = haupt.familien_gesamtpreis - uebernommen
    haupt.save(update_fields=["prix_paye", "updated_at"])


# --- Einladung --------------------------------------------------------------------------------


def _konto_zu(email: str):
    from apps.accounts.models import User

    user = User.objects.filter(email__iexact=email, is_active=True).first()
    return user if user is not None and hasattr(user, "membre") else None


def sende_einladung(e: FamilienErwachsener) -> None:
    """Einladung (erneut) senden. Gibt es zur Adresse schon ein Konto, wartet die Person auf die
    eigene Zustimmung (Hinweis in der App und Mail), sonst bekommt sie eine Mail mit Link zur
    Kontoerstellung. Nichts wird still verknüpft."""
    from . import mails

    konto = _konto_zu(e.email)
    e.status = EinladungStatus.ZUSTIMMUNG_OFFEN if konto else EinladungStatus.EINGELADEN
    e.eingeladen_am = timezone.now()
    e.save(update_fields=["status", "eingeladen_am"])
    mails.einladung(e, konto=konto)


def einladung_fuer_registrierung(token: str, email: str):
    """Offene Einladung zum Token, sofern die Adresse der Registrierung dazu passt."""
    e = FamilienErwachsener.objects.filter(token=token, status=EinladungStatus.EINGELADEN).first()
    if e is None or e.email.lower() != (email or "").strip().lower():
        return None
    return e


def einladungen_nach_registrierung(user, membre) -> None:
    """Nach bestätigter E-Mail : Einladungen annehmen, über die sich die Person registriert hat."""
    import logging

    for e in FamilienErwachsener.objects.filter(
        registrierung_user=user,
        status__in=(EinladungStatus.EINGELADEN, EinladungStatus.ZUSTIMMUNG_OFFEN),
    ):
        if e.email.lower() != (user.email or "").lower():
            continue
        try:
            einladung_annehmen(e, membre)
        except Exception:  # noqa: BLE001 — die Bestätigung der E-Mail darf nie scheitern
            logging.getLogger(__name__).exception("Einladung konnte nicht angenommen werden")


def versende_einladungen(souscription_id) -> None:
    """Nach der Zahlung : alle noch nicht eingeladenen Erwachsenen einladen (idempotent)."""
    s = Souscription.objects.filter(pk=souscription_id, statut=StatutSouscription.PAYEE).first()
    if s is None:
        return
    for e in s.erwachsene.filter(status=EinladungStatus.OFFEN):
        sende_einladung(e)


def einladung_annehmen(einladung: FamilienErwachsener, membre) -> FamilienErwachsener:
    """Die Person wird Mitglied mit dem zugewiesenen Angebot ; bezahlt ist über die Hauptperson."""
    from apps.membres.models import RaisonChangementStatut, StatutMembre
    from apps.membres.services import enregistrer_statut_annuel

    from . import mails
    from .services import synchroniser_cotisation

    with transaction.atomic():
        einladung = FamilienErwachsener.objects.select_for_update().get(pk=einladung.pk)
        if einladung.status == EinladungStatus.ANGENOMMEN:
            return einladung
        if einladung.status not in (EinladungStatus.EINGELADEN, EinladungStatus.ZUSTIMMUNG_OFFEN):
            raise ValidationError({"detail": "einladung_nicht_offen"})
        haupt = Souscription.objects.select_related("membre", "campagne").get(
            pk=einladung.souscription_id
        )
        if haupt.statut != StatutSouscription.PAYEE:
            raise ValidationError({"detail": "paket_nicht_bezahlt"})
        if membre.pk == haupt.membre_id:
            raise ValidationError({"detail": "einladung_eigene_person"})
        angebot = einladung.angebot
        if angebot is None:
            raise ValidationError({"detail": "angebot_fehlt"})

        eigene = Souscription.objects.filter(membre=membre, campagne=haupt.campagne).first()
        if eigene is not None and eigene.statut == StatutSouscription.PAYEE:
            einladung.status = EinladungStatus.KONFLIKT
            einladung.membre = membre
            einladung.save(update_fields=["status", "membre"])
            mails.antwort_an_hauptperson(einladung, angenommen=False, konflikt=True)
            return einladung
        if eigene is not None:
            # Noch unbezahlte eigene Anmeldung : zuerst stornieren (inkl. offener Cotisation).
            eigene.statut = StatutSouscription.ANNULEE
            eigene.save(update_fields=["statut", "updated_at"])
            synchroniser_cotisation(eigene)
            eigene.refresh_from_db()
        sub = eigene or Souscription(membre=membre, campagne=haupt.campagne)
        sub.offre = angebot
        sub.rabais = None
        sub.cotisation = None
        sub.prix_paye = einladung.preis_anteil
        sub.statut = StatutSouscription.PAYEE
        sub.snapshot_avantages = angebot.avantages
        sub.date_souscription = timezone.now()
        sub.bezahlt_ueber = haupt
        sub.save()
        enregistrer_statut_annuel(
            membre,
            haupt.campagne.annee,
            StatutMembre.ACTIF,
            RaisonChangementStatut.PAIEMENT_CONFIRME,
            date_effet=timezone.now(),
        )
        einladung.membre = membre
        einladung.status = EinladungStatus.ANGENOMMEN
        einladung.angenommen_am = timezone.now()
        einladung.save(update_fields=["membre", "status", "angenommen_am"])
        verteilung_aktualisieren(haupt)
    mails.antwort_an_hauptperson(einladung, angenommen=True)
    return einladung


def einladung_ablehnen(einladung: FamilienErwachsener) -> FamilienErwachsener:
    from . import mails

    if einladung.status in (EinladungStatus.EINGELADEN, EinladungStatus.ZUSTIMMUNG_OFFEN):
        einladung.status = EinladungStatus.ABGELEHNT
        einladung.save(update_fields=["status"])
        mails.antwort_an_hauptperson(einladung, angenommen=False)
    return einladung


# --- Erinnerungen -----------------------------------------------------------------------------

EINLADUNG_ERINNERUNG_TAGE = 7
PROFIL_ERINNERUNG_TAGE = 14
MAX_ERINNERUNGEN = 3


def _ausweis_fehlt(membre) -> bool:
    return not (membre.cin or "").strip() and not (membre.passeport or "").strip()


def sende_erinnerungen(heute=None) -> dict:
    """Erinnerungen in großen Abständen (höchstens dreimal) : offene Einladungen und fehlende
    Ausweisnummer angenommener Erwachsener. Die Hauptperson sieht den Stand in der App."""
    from datetime import timedelta

    from . import mails

    jetzt = heute or timezone.now()
    einladungen = profile = 0
    offen = FamilienErwachsener.objects.filter(
        status__in=(EinladungStatus.EINGELADEN, EinladungStatus.ZUSTIMMUNG_OFFEN),
        erinnerungen__lt=MAX_ERINNERUNGEN,
        souscription__statut=StatutSouscription.PAYEE,
    ).select_related("souscription__membre", "souscription__campagne", "angebot")
    for e in offen:
        letzte = e.letzte_erinnerung_am or e.eingeladen_am
        if letzte is None or jetzt - letzte < timedelta(days=EINLADUNG_ERINNERUNG_TAGE):
            continue
        mails.einladung(e, konto=_konto_zu(e.email), erinnerung=True)
        e.erinnerungen += 1
        e.letzte_erinnerung_am = jetzt
        e.save(update_fields=["erinnerungen", "letzte_erinnerung_am"])
        einladungen += 1
    angenommen = FamilienErwachsener.objects.filter(
        status=EinladungStatus.ANGENOMMEN,
        profil_erinnerungen__lt=MAX_ERINNERUNGEN,
        membre__isnull=False,
    ).select_related("membre", "membre__user")
    for e in angenommen:
        if not _ausweis_fehlt(e.membre):
            continue
        letzte = e.letzte_profil_erinnerung_am or e.angenommen_am
        if letzte is None or jetzt - letzte < timedelta(days=PROFIL_ERINNERUNG_TAGE):
            continue
        mails.profil_erinnerung(e)
        e.profil_erinnerungen += 1
        e.letzte_profil_erinnerung_am = jetzt
        e.save(update_fields=["profil_erinnerungen", "letzte_profil_erinnerung_am"])
        profile += 1
    return {"einladungen": einladungen, "profile": profile}
