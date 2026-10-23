"""Anwesenheit und Einlass : Code prüfen, Personen eintragen, Eintrag zurücknehmen, Liste,
Excel-Export, Helfer verwalten.

Die Liste gilt für jede Veranstaltung und jedes Treffen, auch ohne Tickets : Grundlage sind die
bestätigten Anmeldungen bzw. Teilnahmen. Ein Scan trägt genauso ein wie der Knopf in der Liste.

Wer scannen darf : Büro (Seite „Veranstaltungsverwaltung“ mit Schreibrecht) bei Veranstaltungen,
Büro und Verantwortliche der Region bei Treffen, außerdem pro Veranstaltung benannte Helfer
(nur am Veranstaltungstag). Ein Ticket kann in mehreren Schritten eingelassen werden, aber nie
mit mehr Personen als gebucht.
"""

from __future__ import annotations

import datetime
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.evenements.models import Evenement, Inscription, StatutEvenement, StatutInscription
from apps.notifications.models import TypeNotification
from apps.notifications.services import notifier
from apps.rbac.models import NiveauAcces
from apps.rbac.services import has_admin_page_access
from apps.regionen import services as regionen_services
from apps.regionen.models import Teilnahme, Veranstaltung, VeranstaltungStatus, Verantwortlicher

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


def quellen_von(ziel):
    """Alle Anmeldungen (bestätigt) bzw. Teilnahmen des Ziels, mit allem, was `stand` braucht."""
    if isinstance(ziel, Evenement):
        return Inscription.objects.filter(
            evenement=ziel, statut=StatutInscription.CONFIRMEE
        ).select_related("membre", "ticket")
    return Teilnahme.objects.filter(veranstaltung=ziel).select_related(
        "user", "user__membre", "ticket"
    )


def _gehoert_zu(quelle, ziel) -> bool:
    if isinstance(ziel, Evenement):
        return isinstance(quelle, Inscription) and quelle.evenement_id == ziel.pk
    return isinstance(quelle, Teilnahme) and quelle.veranstaltung_id == ziel.pk


def _daten(quelle) -> tuple[int, int, str]:
    """(Erwachsene, Kinder, Name) einer Anmeldung bzw. Teilnahme."""
    if isinstance(quelle, Inscription):
        name = f"{quelle.membre.prenom} {quelle.membre.nom}".strip()
        erw = quelle.places + quelle.nombre_accompagnants_adultes
        return erw, quelle.nombre_accompagnants_enfants, name
    return 1, 0, services._name_von_user(quelle.user)


def _ticket_von(quelle):
    return getattr(quelle, "ticket", None)


# ---------------------------------------------------------------------------------------------
# Stand einer Person
# ---------------------------------------------------------------------------------------------


def stand(quelle) -> dict:
    gebucht_e, gebucht_k, name = _daten(quelle)
    drin_e = drin_k = 0
    erste = None
    for e in quelle.einlaesse.all():
        if e.zurueckgenommen:
            continue
        drin_e += e.erwachsene
        drin_k += e.kinder
        if erste is None or e.zeit < erste:
            erste = e.zeit
    if isinstance(quelle, Teilnahme) and quelle.anwesend and drin_e + drin_k == 0:
        drin_e = 1  # von Hand abgehakt (Häkchen bei regionalen Treffen)
    offen_e = max(gebucht_e - drin_e, 0)
    offen_k = max(gebucht_k - drin_k, 0)
    if offen_e + offen_k == 0:
        status = "vollstaendig"
    elif drin_e + drin_k > 0:
        status = "teilweise"
    else:
        status = "offen"
    ticket = _ticket_von(quelle)
    return {
        "person": str(quelle.pk),
        "name": name,
        "gebucht_erwachsene": gebucht_e,
        "gebucht_kinder": gebucht_k,
        "drin_erwachsene": drin_e,
        "drin_kinder": drin_k,
        "offen_erwachsene": offen_e,
        "offen_kinder": offen_k,
        "status": status,
        "ticket": bool(ticket and ticket.gueltig),
        "anwesend_seit": timezone.localtime(erste).isoformat() if erste else None,
    }


def _titel(ziel) -> str:
    return ziel.titre if isinstance(ziel, Evenement) else ziel.titel


def uebersicht(ziel) -> dict:
    quellen = quellen_von(ziel).prefetch_related("einlaesse")
    personen = sorted((stand(q) for q in quellen), key=lambda p: p["name"].lower())
    summe = lambda feld: sum(p[feld] for p in personen)  # noqa: E731
    von, bis = _tage(ziel)
    return {
        "typ": typ_von(ziel),
        "id": str(ziel.pk),
        "titel": _titel(ziel),
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
# Prüfen, eintragen, zurücknehmen
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
        .filter(code=code)
        .first()
        if code
        else None
    )
    if ticket is None:
        return {"ergebnis": "unbekannt"}
    quelle = ticket.inscription or ticket.teilnahme
    if not _gehoert_zu(quelle, ziel):
        return {"ergebnis": "anderes_ereignis"}
    if not ticket.gueltig:
        return {"ergebnis": "ungueltig"}
    daten = stand(quelle)
    ergebnis = {"vollstaendig": "vollstaendig", "teilweise": "teilweise"}.get(
        daten["status"], "gueltig"
    )
    return {"ergebnis": ergebnis, "ticket": daten}


def _zahl(wert, feld: str) -> int:
    if isinstance(wert, bool) or not isinstance(wert, int) or wert < 0 or wert > 500:
        raise ValidationError({feld: "Ganze Zahl von 0 bis 500 erwartet."})
    return wert


def _quelle_holen(ziel, person_id, *, sperren=False):
    qs = quellen_von(ziel).filter(pk=person_id)
    if sperren:
        qs = qs.select_for_update(of=("self",))
    quelle = qs.first()
    if quelle is None:
        raise ValidationError(
            {"person": "Diese Person ist für die Veranstaltung nicht angemeldet."}
        )
    return quelle


@transaction.atomic
def einlassen(ziel, user, person_id, erwachsene, kinder) -> dict:
    erwachsene = _zahl(erwachsene, "erwachsene")
    kinder = _zahl(kinder, "kinder")
    if erwachsene + kinder == 0:
        raise ValidationError({"erwachsene": "Mindestens eine Person eintragen."})
    quelle = _quelle_holen(ziel, person_id, sperren=True)
    aktuell = stand(quelle)
    if erwachsene > aktuell["offen_erwachsene"] or kinder > aktuell["offen_kinder"]:
        raise ValidationError(
            {"erwachsene": "Mehr Personen als gebucht. Bitte beim Büro nachmelden."}
        )
    ticket = _ticket_von(quelle)
    Einlass.objects.create(
        ticket=ticket if ticket and ticket.gueltig else None,
        inscription=quelle if isinstance(quelle, Inscription) else None,
        teilnahme=quelle if isinstance(quelle, Teilnahme) else None,
        geprueft_von=user,
        erwachsene=erwachsene,
        kinder=kinder,
    )
    if isinstance(quelle, Teilnahme):
        quelle.anwesend = True
        quelle.save(update_fields=["anwesend"])
    return stand(quellen_von(ziel).prefetch_related("einlaesse").get(pk=quelle.pk))


@transaction.atomic
def ruecknahme(user, einlass_id) -> dict:
    eintrag = get_object_or_404(
        Einlass.objects.select_for_update(of=("self",)).select_related(
            "inscription__evenement", "teilnahme__veranstaltung"
        ),
        pk=einlass_id,
    )
    quelle = eintrag.inscription or eintrag.teilnahme
    ziel = quelle.evenement if isinstance(quelle, Inscription) else quelle.veranstaltung
    darf_scannen(user, ziel)
    if eintrag.zurueckgenommen:
        raise ValidationError({"einlass": "Dieser Eintrag wurde schon zurückgenommen."})
    if timezone.now() - eintrag.zeit > RUECKNAHME_FRIST:
        raise ValidationError({"einlass": "Die Rücknahme ist nur kurz nach dem Eintrag möglich."})
    eintrag.zurueckgenommen = True
    eintrag.zurueckgenommen_am = timezone.now()
    eintrag.zurueckgenommen_von = user
    eintrag.save(update_fields=["zurueckgenommen", "zurueckgenommen_am", "zurueckgenommen_von"])
    if (
        isinstance(quelle, Teilnahme)
        and not quelle.einlaesse.filter(zurueckgenommen=False).exists()
    ):
        quelle.anwesend = False
        quelle.save(update_fields=["anwesend"])
    return stand(quellen_von(ziel).prefetch_related("einlaesse").get(pk=quelle.pk))


def letzter_eintrag(user, person_id) -> Einlass | None:
    """Der jüngste, noch nicht zurückgenommene Eintrag dieses Prüfers (für „Rückgängig“)."""
    return (
        Einlass.objects.filter(geprueft_von=user, zurueckgenommen=False)
        .filter(Q(inscription_id=person_id) | Q(teilnahme_id=person_id))
        .order_by("-zeit")
        .first()
    )


# ---------------------------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------------------------

_STATUS_TEXT = {"offen": "Offen", "teilweise": "Teilweise anwesend", "vollstaendig": "Anwesend"}


def export_xlsx(ziel):
    """Excel-Liste (Name, Status, gebuchte und anwesende Personen, Ticket, erster Eintrag)."""
    from openpyxl import Workbook
    from openpyxl.styles import Font

    from apps.membres.utils_http import safe_zeile

    daten = uebersicht(ziel)
    blatt_titel = _titel(ziel)
    classeur = Workbook()
    blatt = classeur.active
    blatt.title = "Anwesenheit"
    blatt.append(safe_zeile([blatt_titel]))
    blatt.append([f"{daten['datum']}  ·  Stand {timezone.localtime():%d.%m.%Y %H:%M}"])
    blatt.append([])
    kopf = [
        "Name",
        "Status",
        "Erwachsene gebucht",
        "Kinder gebucht",
        "Erwachsene anwesend",
        "Kinder anwesend",
        "Ticket",
        "Erster Eintrag",
    ]
    blatt.append(kopf)
    for zelle in blatt[4]:
        zelle.font = Font(bold=True)
    blatt["A1"].font = Font(bold=True, size=14)
    for p in daten["personen"]:
        seit = p["anwesend_seit"]
        blatt.append(
            safe_zeile(
                [
                    p["name"],
                    _STATUS_TEXT[p["status"]],
                    p["gebucht_erwachsene"],
                    p["gebucht_kinder"],
                    p["drin_erwachsene"],
                    p["drin_kinder"],
                    "ja" if p["ticket"] else "nein",
                    (
                        datetime.datetime.fromisoformat(seit).strftime("%d.%m.%Y %H:%M")
                        if seit
                        else ""
                    ),
                ]
            )
        )
    z = daten["zaehler"]
    summe = [
        "Summe",
        "",
        z["gebucht_erwachsene"],
        z["gebucht_kinder"],
        z["drin_erwachsene"],
        z["drin_kinder"],
        "",
        "",
    ]
    blatt.append(summe)
    for zelle in blatt[blatt.max_row]:
        zelle.font = Font(bold=True)
    for spalte, breite in zip("ABCDEFGH", (32, 22, 18, 14, 20, 16, 8, 18)):
        blatt.column_dimensions[spalte].width = breite
    name = slugify(blatt_titel)[:40] or "veranstaltung"
    return classeur, f"anwesenheit_{name}_{timezone.localdate():%Y%m%d}.xlsx"


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

    ev_filter = Q(date_evenement__lte=bis) & (
        Q(date_fin__gte=heute) | Q(date_fin__isnull=True, date_evenement__gte=heute)
    )
    evs = Evenement.objects.filter(ev_filter, statut=StatutEvenement.PUBLIE)
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
        "ticket_aktiv": ziel.ticket_aktiv,
        "rolle": "verantwortlich" if verantwortlich else "helfer",
        "heute": von <= timezone.localdate() <= bis,
    }
