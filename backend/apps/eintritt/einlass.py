"""Einlass : Code prüfen, Personen einlassen, Eintrag zurücknehmen, Helfer verwalten.

Wer scannen darf : Büro (Seite „Veranstaltungsverwaltung“ mit Schreibrecht) bei Veranstaltungen,
Büro und Verantwortliche der Region bei Treffen, außerdem pro Veranstaltung benannte Helfer
(nur am Veranstaltungstag). Ein Ticket kann in mehreren Schritten eingelassen werden, aber nie
mit mehr Personen als gebucht.
"""

from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.evenements.models import Evenement, StatutEvenement
from apps.notifications.models import TypeNotification
from apps.notifications.services import notifier
from apps.rbac.models import NiveauAcces
from apps.rbac.services import has_admin_page_access
from apps.regionen import services as regionen_services
from apps.regionen.models import Veranstaltung, VeranstaltungStatus, Verantwortlicher

from . import services
from .models import Einlass, EinlassHelfer, Eintrittsticket

TYP_VERANSTALTUNG = "veranstaltung"
TYP_TREFFEN = "treffen"

#: Fehleintrag am Einlass : so lange darf er zurückgenommen werden.
RUECKNAHME_FRIST = timedelta(minutes=10)
#: Vorlauf, ab dem Verantwortliche und Helfer eine Veranstaltung in ihrer Liste sehen.
VORLAUF_TAGE = 30


# ---------------------------------------------------------------------------------------------
# Ziel und Rechte
# ---------------------------------------------------------------------------------------------


def ziel_holen(typ: str, pk):
    if typ == TYP_VERANSTALTUNG:
        return get_object_or_404(Evenement, pk=pk)
    if typ == TYP_TREFFEN:
        return get_object_or_404(Veranstaltung.objects.select_related("region"), pk=pk)
    raise NotFound()


def typ_von(ziel) -> str:
    return TYP_VERANSTALTUNG if isinstance(ziel, Evenement) else TYP_TREFFEN


def _tage(ziel) -> tuple:
    """Erster und letzter Tag der Veranstaltung."""
    if isinstance(ziel, Evenement):
        return ziel.date_evenement, ziel.date_fin or ziel.date_evenement
    return ziel.datum, ziel.datum


def ist_verantwortlich(user, ziel) -> bool:
    """Darf zusätzlich Helfer benennen und zu jeder Zeit scannen."""
    if isinstance(ziel, Evenement):
        return has_admin_page_access(user, "page_events", required=NiveauAcces.LECTURE_ECRITURE)
    return regionen_services.darf_bearbeiten(user, ziel.region)


def _helfer_filter(ziel):
    return {"evenement": ziel} if isinstance(ziel, Evenement) else {"veranstaltung": ziel}


def ist_helfer(user, ziel) -> bool:
    return EinlassHelfer.objects.filter(user=user, **_helfer_filter(ziel)).exists()


def darf_scannen(user, ziel) -> bool:
    """Prüft das Recht und, bei Helfern, das Zeitfenster. Wirft 403 mit Grund, sonst True."""
    if ist_verantwortlich(user, ziel):
        return True
    if not ist_helfer(user, ziel):
        raise PermissionDenied()
    von, bis = _tage(ziel)
    if not von <= timezone.localdate() <= bis:
        raise PermissionDenied("Der Einlass ist nur am Veranstaltungstag möglich.")
    return True


def _quelle_ist(ticket: Eintrittsticket, ziel) -> bool:
    if isinstance(ziel, Evenement):
        return bool(ticket.inscription_id and ticket.inscription.evenement_id == ziel.pk)
    return bool(ticket.teilnahme_id and ticket.teilnahme.veranstaltung_id == ziel.pk)


def tickets_von(ziel):
    basis = Eintrittsticket.objects.filter(gueltig=True)
    if isinstance(ziel, Evenement):
        return basis.filter(inscription__evenement=ziel).select_related(
            "inscription__evenement", "inscription__membre"
        )
    return basis.filter(teilnahme__veranstaltung=ziel).select_related(
        "teilnahme__veranstaltung", "teilnahme__user"
    )


# ---------------------------------------------------------------------------------------------
# Stand eines Tickets
# ---------------------------------------------------------------------------------------------


def eingelassen(ticket: Eintrittsticket) -> tuple[int, int]:
    erw = kin = 0
    for e in ticket.einlaesse.all():
        if not e.zurueckgenommen:
            erw += e.erwachsene
            kin += e.kinder
    return erw, kin


def stand(ticket: Eintrittsticket) -> dict:
    daten = services.anzeige(ticket)
    drin_e, drin_k = eingelassen(ticket)
    offen_e = max(daten["erwachsene"] - drin_e, 0)
    offen_k = max(daten["kinder"] - drin_k, 0)
    if offen_e + offen_k == 0:
        status = "vollstaendig"
    elif drin_e + drin_k > 0:
        status = "teilweise"
    else:
        status = "offen"
    return {
        "ticket": str(ticket.pk),
        "name": daten["name"],
        "gebucht_erwachsene": daten["erwachsene"],
        "gebucht_kinder": daten["kinder"],
        "drin_erwachsene": drin_e,
        "drin_kinder": drin_k,
        "offen_erwachsene": offen_e,
        "offen_kinder": offen_k,
        "status": status,
    }


def uebersicht(ziel) -> dict:
    tickets = list(tickets_von(ziel).prefetch_related("einlaesse"))
    personen = sorted((stand(t) for t in tickets), key=lambda p: p["name"].lower())
    summe = lambda feld: sum(p[feld] for p in personen)  # noqa: E731
    von, bis = _tage(ziel)
    return {
        "typ": typ_von(ziel),
        "id": str(ziel.pk),
        "titel": ziel.titre if isinstance(ziel, Evenement) else ziel.titel,
        "datum": von.isoformat(),
        "datum_bis": bis.isoformat(),
        "ticket_aktiv": ziel.ticket_aktiv,
        "zaehler": {
            "gebucht_erwachsene": summe("gebucht_erwachsene"),
            "gebucht_kinder": summe("gebucht_kinder"),
            "drin_erwachsene": summe("drin_erwachsene"),
            "drin_kinder": summe("drin_kinder"),
        },
        "personen": personen,
    }


# ---------------------------------------------------------------------------------------------
# Prüfen, einlassen, zurücknehmen
# ---------------------------------------------------------------------------------------------


def code_aus_scan(text: str) -> str:
    text = (text or "").strip()
    if text.startswith(services.QR_PRAEFIX):
        text = text[len(services.QR_PRAEFIX) :]
    return text


def pruefen(ziel, text: str) -> dict:
    """Schlägt den gescannten Code nach, ohne etwas zu buchen."""
    code = code_aus_scan(text)
    ticket = (
        Eintrittsticket.objects.select_related(
            "inscription__evenement",
            "inscription__membre",
            "teilnahme__veranstaltung",
            "teilnahme__user",
        )
        .prefetch_related("einlaesse")
        .filter(code=code)
        .first()
        if code
        else None
    )
    if ticket is None:
        return {"ergebnis": "unbekannt"}
    if not _quelle_ist(ticket, ziel):
        return {"ergebnis": "anderes_ereignis"}
    if not ticket.gueltig:
        return {"ergebnis": "ungueltig"}
    daten = stand(ticket)
    ergebnis = {"vollstaendig": "vollstaendig", "teilweise": "teilweise"}.get(
        daten["status"], "gueltig"
    )
    return {"ergebnis": ergebnis, "ticket": daten}


def _zahl(wert, feld: str) -> int:
    if isinstance(wert, bool) or not isinstance(wert, int) or wert < 0 or wert > 500:
        raise ValidationError({feld: "Ganze Zahl von 0 bis 500 erwartet."})
    return wert


@transaction.atomic
def einlassen(ziel, user, ticket_id, erwachsene, kinder) -> dict:
    erwachsene = _zahl(erwachsene, "erwachsene")
    kinder = _zahl(kinder, "kinder")
    if erwachsene + kinder == 0:
        raise ValidationError({"erwachsene": "Mindestens eine Person einlassen."})
    ticket = get_object_or_404(Eintrittsticket.objects.select_for_update(), pk=ticket_id)
    if not _quelle_ist(ticket, ziel):
        raise ValidationError({"ticket": "Das Ticket gehört zu einer anderen Veranstaltung."})
    if not ticket.gueltig:
        raise ValidationError({"ticket": "Das Ticket ist nicht mehr gültig."})
    aktuell = stand(ticket)
    if erwachsene > aktuell["offen_erwachsene"] or kinder > aktuell["offen_kinder"]:
        raise ValidationError(
            {"erwachsene": "Mehr Personen als gebucht. Bitte beim Büro nachmelden."}
        )
    Einlass.objects.create(ticket=ticket, geprueft_von=user, erwachsene=erwachsene, kinder=kinder)
    if ticket.teilnahme_id:
        ticket.teilnahme.anwesend = True
        ticket.teilnahme.save(update_fields=["anwesend"])
    return stand(Eintrittsticket.objects.prefetch_related("einlaesse").get(pk=ticket.pk))


@transaction.atomic
def ruecknahme(user, einlass_id) -> dict:
    eintrag = get_object_or_404(
        Einlass.objects.select_for_update().select_related("ticket"), pk=einlass_id
    )
    ticket = eintrag.ticket
    ziel = ticket.inscription.evenement if ticket.inscription_id else ticket.teilnahme.veranstaltung
    darf_scannen(user, ziel)
    if eintrag.zurueckgenommen:
        raise ValidationError({"einlass": "Dieser Eintrag wurde schon zurückgenommen."})
    if timezone.now() - eintrag.zeit > RUECKNAHME_FRIST:
        raise ValidationError({"einlass": "Die Rücknahme ist nur kurz nach dem Eintrag möglich."})
    eintrag.zurueckgenommen = True
    eintrag.zurueckgenommen_am = timezone.now()
    eintrag.zurueckgenommen_von = user
    eintrag.save(update_fields=["zurueckgenommen", "zurueckgenommen_am", "zurueckgenommen_von"])
    if ticket.teilnahme_id and not ticket.einlaesse.filter(zurueckgenommen=False).exists():
        ticket.teilnahme.anwesend = False
        ticket.teilnahme.save(update_fields=["anwesend"])
    return stand(Eintrittsticket.objects.prefetch_related("einlaesse").get(pk=ticket.pk))


def letzter_eintrag(user, ticket_id) -> Einlass | None:
    """Der jüngste, noch nicht zurückgenommene Eintrag dieses Prüfers (für „Rückgängig“)."""
    return (
        Einlass.objects.filter(ticket_id=ticket_id, geprueft_von=user, zurueckgenommen=False)
        .order_by("-zeit")
        .first()
    )


# ---------------------------------------------------------------------------------------------
# Helfer
# ---------------------------------------------------------------------------------------------


def helfer_liste(ziel) -> list[dict]:
    helfer = EinlassHelfer.objects.filter(**_helfer_filter(ziel)).select_related("user")
    return [
        {
            "id": str(h.pk),
            "name": regionen_services.anzeigename_von(h.user) or h.user.email,
            "email": h.user.email,
        }
        for h in helfer.order_by("created_at")
    ]


def helfer_benennen(ziel, benannt_von, email: str) -> EinlassHelfer:
    if not ist_verantwortlich(benannt_von, ziel):
        raise PermissionDenied()
    email = (email or "").strip()
    if not email:
        raise ValidationError({"email": "E-Mail-Adresse des Kontos angeben."})
    user = get_user_model().objects.filter(email__iexact=email, is_active=True).first()
    if user is None:
        raise ValidationError({"email": "Kein Konto mit dieser E-Mail-Adresse gefunden."})
    helfer, neu = EinlassHelfer.objects.get_or_create(
        user=user, defaults={"benannt_von": benannt_von}, **_helfer_filter(ziel)
    )
    if neu:
        titel = ziel.titre if isinstance(ziel, Evenement) else ziel.titel
        notifier(
            user,
            TypeNotification.TICKET_BEREIT,
            titre="Du bist Einlass-Helfer",
            message=f"Du darfst bei „{titel}“ am Einlass die Tickets scannen.",
            lien=f"/einlass/{typ_von(ziel)}/{ziel.pk}",
        )
    return helfer


def helfer_entfernen(ziel, benannt_von, helfer_id) -> None:
    if not ist_verantwortlich(benannt_von, ziel):
        raise PermissionDenied()
    get_object_or_404(EinlassHelfer, pk=helfer_id, **_helfer_filter(ziel)).delete()


# ---------------------------------------------------------------------------------------------
# Meine Einlass-Veranstaltungen
# ---------------------------------------------------------------------------------------------


def meine_ziele(user) -> list[dict]:
    heute = timezone.localdate()
    bis = heute + timedelta(days=VORLAUF_TAGE)
    eintraege: list[dict] = []

    ev_filter = Q(ticket_aktiv=True, date_evenement__lte=bis) & (
        Q(date_fin__gte=heute) | Q(date_fin__isnull=True, date_evenement__gte=heute)
    )
    evs = Evenement.objects.filter(ev_filter).exclude(statut=StatutEvenement.ANNULE)
    ev_verantwortlich = has_admin_page_access(
        user, "page_events", required=NiveauAcces.LECTURE_ECRITURE
    )
    ev_helfer = set(
        EinlassHelfer.objects.filter(user=user, evenement__isnull=False).values_list(
            "evenement_id", flat=True
        )
    )
    for ev in evs.order_by("date_evenement"):
        if ev_verantwortlich or ev.pk in ev_helfer:
            eintraege.append(
                _eintrag(TYP_VERANSTALTUNG, ev, ev.titre, ev.lieu, ev.heure, ev_verantwortlich)
            )

    verwalter = regionen_services.ist_personenverwalter(user)
    eigene_regionen = set(
        Verantwortlicher.objects.filter(user=user).values_list("region_id", flat=True)
    )
    ver_helfer = set(
        EinlassHelfer.objects.filter(user=user, veranstaltung__isnull=False).values_list(
            "veranstaltung_id", flat=True
        )
    )
    vers = Veranstaltung.objects.filter(
        ticket_aktiv=True,
        status=VeranstaltungStatus.VEROEFFENTLICHT,
        datum__gte=heute,
        datum__lte=bis,
    ).select_related("region")
    for v in vers.order_by("datum"):
        verantwortlich = verwalter or v.region_id in eigene_regionen
        if verantwortlich or v.pk in ver_helfer:
            eintraege.append(_eintrag(TYP_TREFFEN, v, v.titel, v.ort, v.uhrzeit, verantwortlich))
    eintraege.sort(key=lambda e: e["datum"])
    return eintraege


def _eintrag(typ, ziel, titel, ort, uhrzeit, verantwortlich) -> dict:
    von, bis = _tage(ziel)
    return {
        "typ": typ,
        "id": str(ziel.pk),
        "titel": titel,
        "datum": von.isoformat(),
        "datum_bis": bis.isoformat(),
        "uhrzeit": uhrzeit.strftime("%H:%M") if uhrzeit else None,
        "ort": ort,
        "rolle": "verantwortlich" if verantwortlich else "helfer",
        "heute": von <= timezone.localdate() <= bis,
    }
