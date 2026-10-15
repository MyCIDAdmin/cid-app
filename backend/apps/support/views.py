"""Support (Release 33) — API unter /api/v1/support/.

  GET  /support/faq/                    aktive Fragen (alle angemeldeten Konten)
  POST /support/faq/                    neue Frage (Büro)
  GET  /support/faq/verwaltung/         alle Fragen inkl. inaktive (Büro)
  PATCH|DELETE /support/faq/<id>/       Frage ändern / löschen (Büro)
  GET  /support/tickets/                eigene Tickets ; Büro : ?alle=1&status=&q=
  POST /support/tickets/                Ticket eröffnen {betreff, kategorie, text}
  GET  /support/tickets/<id>/           Ticket mit Nachrichten (Besitzer oder Büro)
  PATCH /support/tickets/<id>/          Büro : status, bearbeiter ; Besitzer : schliessen
  POST /support/tickets/<id>/nachrichten/  antworten {text} ; Büro zusätzlich {intern, status}
"""

from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User

from . import mails, services
from .models import AKTIVE_STATI, FaqEintrag, Ticket, TicketKategorie, TicketNachricht, TicketStatus

LISTE_MAX = 200
KATEGORIEN = {k for k, _ in TicketKategorie.choices}
STATI = {s for s, _ in TicketStatus.choices}


def _text(daten, feld, maximum, pflicht=True) -> str:
    wert = daten.get(feld, "")
    if wert is None:
        wert = ""
    if not isinstance(wert, str):
        raise ValidationError({feld: "Text erwartet."})
    wert = wert.strip()
    if pflicht and not wert:
        raise ValidationError({feld: "Pflichtfeld."})
    if len(wert) > maximum:
        raise ValidationError({feld: f"Höchstens {maximum} Zeichen."})
    return wert


def _faq_dict(f: FaqEintrag) -> dict:
    return {
        "id": f.pk,
        "frage_de": f.frage_de,
        "frage_fr": f.frage_fr,
        "antwort_de": f.antwort_de,
        "antwort_fr": f.antwort_fr,
        "kategorie": f.kategorie,
        "reihenfolge": f.reihenfolge,
        "aktiv": f.aktiv,
    }


def _ticket_dict(t: Ticket, *, buero: bool) -> dict:
    daten = {
        "id": t.pk,
        "betreff": t.betreff,
        "kategorie": t.kategorie,
        "status": t.status,
        "created_at": t.created_at.isoformat(),
        "updated_at": t.updated_at.isoformat(),
        "geschlossen_am": t.geschlossen_am.isoformat() if t.geschlossen_am else None,
    }
    if buero:
        daten.update(
            {
                "name": t.name,
                "art": services.art_der_person(t.user),
                "bearbeiter": (
                    {"id": str(t.bearbeiter_id), "name": services.anzeigename(t.bearbeiter)}
                    if t.bearbeiter_id
                    else None
                ),
            }
        )
    return daten


def _nachricht_dict(n: TicketNachricht) -> dict:
    return {
        "id": n.pk,
        "von_support": n.von_support,
        "intern": n.intern,
        "autor": services.anzeigename(n.autor) if n.von_support or n.intern else "",
        "text": n.text,
        "created_at": n.created_at.isoformat(),
    }


def _detail(t: Ticket, *, buero: bool) -> dict:
    nachrichten = t.nachrichten.select_related("autor")
    if not buero:
        nachrichten = nachrichten.filter(intern=False)
    daten = _ticket_dict(t, buero=buero)
    daten["nachrichten"] = [_nachricht_dict(n) for n in nachrichten]
    daten["kann_antworten"] = buero or t.status != TicketStatus.GESCHLOSSEN
    return daten


def _ticket_fuer(user, pk) -> tuple[Ticket, bool]:
    ticket = get_object_or_404(Ticket.objects.select_related("user", "bearbeiter"), pk=pk)
    buero = services.darf_verwalten(user)
    if not buero and ticket.user_id != user.pk:
        raise PermissionDenied()
    return ticket, buero


def _buero_pflicht(user) -> None:
    if not services.darf_verwalten(user):
        raise PermissionDenied()


# --- FAQ -------------------------------------------------------------------------------------


def _faq_felder(daten, eintrag: FaqEintrag | None = None) -> dict:
    neu = eintrag is None
    werte = {}
    for feld, maximum, pflicht in (
        ("frage_de", 200, True),
        ("frage_fr", 200, False),
        ("antwort_de", 3000, True),
        ("antwort_fr", 3000, False),
    ):
        if neu or feld in daten:
            werte[feld] = _text(daten, feld, maximum, pflicht)
    if neu or "kategorie" in daten:
        kategorie = daten.get("kategorie", TicketKategorie.SONSTIGES)
        if kategorie not in KATEGORIEN:
            raise ValidationError({"kategorie": "Unbekannte Kategorie."})
        werte["kategorie"] = kategorie
    if "reihenfolge" in daten:
        try:
            werte["reihenfolge"] = max(0, min(int(daten["reihenfolge"]), 100000))
        except (TypeError, ValueError):
            raise ValidationError({"reihenfolge": "Zahl erwartet."})
    if "aktiv" in daten:
        werte["aktiv"] = bool(daten["aktiv"])
    return werte


class FaqView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        eintraege = FaqEintrag.objects.filter(aktiv=True)
        return Response([_faq_dict(f) for f in eintraege])

    def post(self, request):
        _buero_pflicht(request.user)
        eintrag = FaqEintrag.objects.create(**_faq_felder(request.data))
        return Response(_faq_dict(eintrag), status=201)


class FaqVerwaltungView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _buero_pflicht(request.user)
        return Response([_faq_dict(f) for f in FaqEintrag.objects.all()])


class FaqDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        _buero_pflicht(request.user)
        eintrag = get_object_or_404(FaqEintrag, pk=pk)
        for feld, wert in _faq_felder(request.data, eintrag).items():
            setattr(eintrag, feld, wert)
        eintrag.save()
        return Response(_faq_dict(eintrag))

    def delete(self, request, pk):
        _buero_pflicht(request.user)
        get_object_or_404(FaqEintrag, pk=pk).delete()
        return Response(status=204)


# --- Tickets ---------------------------------------------------------------------------------


class TicketsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        buero = services.darf_verwalten(request.user)
        alle = buero and request.query_params.get("alle") == "1"
        tickets = Ticket.objects.select_related("user", "bearbeiter")
        if not alle:
            tickets = tickets.filter(user=request.user)
        else:
            status = request.query_params.get("status", "")
            if status == "aktiv":
                tickets = tickets.filter(status__in=AKTIVE_STATI)
            elif status in STATI:
                tickets = tickets.filter(status=status)
            suche = request.query_params.get("q", "").strip()
            if suche:
                bedingung = Q(betreff__icontains=suche) | Q(name__icontains=suche)
                if suche.lstrip("#").isdigit():
                    bedingung |= Q(pk=int(suche.lstrip("#")))
                tickets = tickets.filter(bedingung)
        tickets = tickets.annotate(
            _n=Count("nachrichten", filter=Q(nachrichten__intern=False))
        ).order_by("-updated_at")[:LISTE_MAX]
        daten = []
        for t in tickets:
            eintrag = _ticket_dict(t, buero=alle)
            eintrag["anzahl_nachrichten"] = t._n
            daten.append(eintrag)
        return Response(daten)

    @transaction.atomic
    def post(self, request):
        user = request.user
        grund = services.zu_viele_tickets(user)
        if grund:
            return Response({"detail": grund}, status=429)
        betreff = _text(request.data, "betreff", 150)
        text = _text(request.data, "text", 2000)
        kategorie = request.data.get("kategorie", TicketKategorie.SONSTIGES)
        if kategorie not in KATEGORIEN:
            raise ValidationError({"kategorie": "Unbekannte Kategorie."})
        ticket = Ticket.objects.create(
            user=user,
            name=services.anzeigename(user),
            betreff=betreff,
            kategorie=kategorie,
        )
        TicketNachricht.objects.create(ticket=ticket, autor=user, text=text)
        mails.buero_neues_ticket(ticket)
        return Response(_detail(ticket, buero=False), status=201)


class TicketDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        ticket, buero = _ticket_fuer(request.user, pk)
        return Response(_detail(ticket, buero=buero))

    @transaction.atomic
    def patch(self, request, pk):
        ticket, buero = _ticket_fuer(request.user, pk)
        daten = request.data
        alt = ticket.status
        if buero:
            if "status" in daten:
                if daten["status"] not in STATI:
                    raise ValidationError({"status": "Unbekannter Status."})
                ticket.status = daten["status"]
            if "bearbeiter" in daten:
                if daten["bearbeiter"] in (None, ""):
                    ticket.bearbeiter = None
                else:
                    kandidat = User.objects.filter(pk=daten["bearbeiter"], is_active=True).first()
                    if kandidat is None or not services.darf_verwalten(kandidat):
                        raise ValidationError(
                            {"bearbeiter": "Person darf Tickets nicht bearbeiten."}
                        )
                    ticket.bearbeiter = kandidat
        else:
            if daten.get("status") != TicketStatus.GESCHLOSSEN:
                raise ValidationError({"status": "Du kannst dein Ticket nur schliessen."})
            ticket.status = TicketStatus.GESCHLOSSEN
        if ticket.status in (TicketStatus.GESCHLOSSEN, TicketStatus.GELOEST):
            ticket.geschlossen_am = ticket.geschlossen_am or timezone.now()
        else:
            ticket.geschlossen_am = None
        ticket.save()
        if (
            buero
            and ticket.status != alt
            and ticket.status
            in (
                TicketStatus.GELOEST,
                TicketStatus.GESCHLOSSEN,
            )
        ):
            mails.person_status(ticket)
        return Response(_detail(ticket, buero=buero))


class TicketNachrichtView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        user = request.user
        ticket, buero = _ticket_fuer(user, pk)
        if not buero and ticket.status == TicketStatus.GESCHLOSSEN:
            raise ValidationError({"detail": "ticket_geschlossen"})
        text = _text(request.data, "text", 2000)
        eigenes = ticket.user_id == user.pk
        if buero and not eigenes:
            intern = bool(request.data.get("intern"))
            TicketNachricht.objects.create(
                ticket=ticket, autor=user, von_support=True, intern=intern, text=text
            )
            if not intern:
                status = request.data.get("status") or TicketStatus.WARTET
                if status not in STATI:
                    raise ValidationError({"status": "Unbekannter Status."})
                ticket.status = status
                if ticket.bearbeiter_id is None:
                    ticket.bearbeiter = user
                if status in (TicketStatus.GESCHLOSSEN, TicketStatus.GELOEST):
                    ticket.geschlossen_am = ticket.geschlossen_am or timezone.now()
                else:
                    ticket.geschlossen_am = None
            ticket.save()
            if not intern:
                mails.person_antwort(ticket)
        else:
            TicketNachricht.objects.create(ticket=ticket, autor=user, text=text)
            if ticket.status != TicketStatus.IN_BEARBEITUNG:
                ticket.status = TicketStatus.OFFEN
            ticket.geschlossen_am = None
            ticket.save()
            mails.buero_neues_ticket(ticket, antwort=True)
        return Response(_detail(ticket, buero=buero), status=201)
