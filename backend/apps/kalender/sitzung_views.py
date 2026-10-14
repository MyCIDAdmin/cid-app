"""Sitzungsmodus (Release 18).

  GET|PUT  /kalender/termine/{id}/sitzung/                      Tagesordnung + Protokoll
  POST     /kalender/termine/{id}/sitzung/beschluesse/          Beschluss anlegen
  PATCH|DELETE  /kalender/termine/{id}/sitzung/beschluesse/{b}/
  POST     /kalender/termine/{id}/sitzung/beschluesse/{b}/aufgabe/  Beschluss → Projekt-Aufgabe
  POST     /kalender/termine/{id}/sitzung/versenden/            Protokoll-Zusammenfassung senden

Lesen : jeder, der den Termin sieht (Tagesordnung) ; Protokoll und Beschlüsse nur Eingeladene und
Verwaltung. Bearbeiten : Schreibrecht auf die Seite „Kalender“ oder Ersteller des Termins.
"""

from django.db import transaction
from django.db.models import Max
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.projets.models import Aufgabe, Projet, StatutAufgabe

from .models import Beschluss, Protokoll, Tagesordnungspunkt
from .serializers import _name
from .services import ist_verwaltung, termine_fuer


def _termin(request, termin_id):
    return get_object_or_404(termine_fuer(request.user), pk=termin_id)


def darf_bearbeiten(user, termin) -> bool:
    return ist_verwaltung(user, schreiben=True) or termin.erstellt_von_id == user.pk


def darf_protokoll_sehen(user, termin) -> bool:
    return darf_bearbeiten(user, termin) or termin.einladungen.filter(user=user).exists()


def _bearbeiten_oder_403(request, termin):
    if not darf_bearbeiten(request.user, termin):
        raise PermissionDenied("Dafür fehlt die Berechtigung.")


def _beschluss_dict(b: Beschluss) -> dict:
    return {
        "id": str(b.pk),
        "top": str(b.top_id) if b.top_id else None,
        "text": b.text,
        "verantwortlich": str(b.verantwortlich_id) if b.verantwortlich_id else None,
        "verantwortlich_name": _name(b.verantwortlich) if b.verantwortlich_id else "",
        "frist": b.frist,
        "aufgabe": str(b.aufgabe_id) if b.aufgabe_id else None,
        "projekt": str(b.aufgabe.projet_id) if b.aufgabe_id else None,
    }


def sitzung_dict(user, termin) -> dict:
    sehen = darf_protokoll_sehen(user, termin)
    protokoll = getattr(termin, "protokoll", None) if sehen else None
    beschluesse = termin.beschluesse.select_related("verantwortlich", "aufgabe") if sehen else []
    return {
        "darf_bearbeiten": darf_bearbeiten(user, termin),
        "darf_protokoll_sehen": sehen,
        "tops": [
            {"id": str(t.pk), "nr": t.nr, "titel": t.titel, "beschreibung": t.beschreibung}
            for t in termin.tops.all()
        ],
        "protokoll": protokoll.text if protokoll else "",
        "versendet_am": protokoll.versendet_am if protokoll else None,
        "beschluesse": [_beschluss_dict(b) for b in beschluesse],
        "projekt": str(termin.projekt_id) if termin.projekt_id else None,
    }


def _verantwortlich(wert):
    if not wert:
        return None
    user = User.objects.filter(pk=wert, is_active=True).first()
    if user is None:
        raise ValidationError({"verantwortlich": "Person nicht gefunden."})
    return user


def _frist(wert):
    if not wert:
        return None
    tag = parse_date(str(wert))
    if tag is None:
        raise ValidationError({"frist": "Ungültiges Datum."})
    return tag


class SitzungView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, termin_id):
        return Response(sitzung_dict(request.user, _termin(request, termin_id)))

    @transaction.atomic
    def put(self, request, termin_id):
        termin = _termin(request, termin_id)
        _bearbeiten_oder_403(request, termin)
        if "tops" in request.data:
            vorhanden = {str(t.pk): t for t in termin.tops.all()}
            behalten = set()
            for nr, eintrag in enumerate(request.data["tops"], start=1):
                titel = str(eintrag.get("titel") or "").strip()
                if not titel:
                    continue
                daten = {
                    "nr": nr,
                    "titel": titel[:200],
                    "beschreibung": eintrag.get("beschreibung") or "",
                }
                top = vorhanden.get(str(eintrag.get("id")))
                if top is None:
                    top = Tagesordnungspunkt.objects.create(termin=termin, **daten)
                else:
                    for feld, wert in daten.items():
                        setattr(top, feld, wert)
                    top.save()
                behalten.add(str(top.pk))
            termin.tops.exclude(pk__in=behalten).delete()
        if "protokoll" in request.data:
            protokoll, _ = Protokoll.objects.get_or_create(termin=termin)
            protokoll.text = str(request.data["protokoll"] or "")
            protokoll.geaendert_von = request.user
            protokoll.save()
        termin = _termin(request, termin_id)
        return Response(sitzung_dict(request.user, termin))


class BeschlussView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, termin_id):
        termin = _termin(request, termin_id)
        _bearbeiten_oder_403(request, termin)
        text = str(request.data.get("text") or "").strip()
        if not text:
            raise ValidationError({"text": "Bitte den Beschluss eintragen."})
        top = None
        if request.data.get("top"):
            top = get_object_or_404(termin.tops, pk=request.data["top"])
        beschluss = Beschluss.objects.create(
            termin=termin,
            top=top,
            text=text,
            verantwortlich=_verantwortlich(request.data.get("verantwortlich")),
            frist=_frist(request.data.get("frist")),
        )
        return Response(_beschluss_dict(beschluss), status=status.HTTP_201_CREATED)

    def patch(self, request, termin_id, beschluss_id):
        termin = _termin(request, termin_id)
        _bearbeiten_oder_403(request, termin)
        beschluss = get_object_or_404(termin.beschluesse, pk=beschluss_id)
        if "text" in request.data:
            text = str(request.data["text"] or "").strip()
            if not text:
                raise ValidationError({"text": "Bitte den Beschluss eintragen."})
            beschluss.text = text
        if "verantwortlich" in request.data:
            beschluss.verantwortlich = _verantwortlich(request.data["verantwortlich"])
        if "frist" in request.data:
            beschluss.frist = _frist(request.data["frist"])
        beschluss.save()
        return Response(_beschluss_dict(beschluss))

    def delete(self, request, termin_id, beschluss_id):
        termin = _termin(request, termin_id)
        _bearbeiten_oder_403(request, termin)
        get_object_or_404(termin.beschluesse, pk=beschluss_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class BeschlussAufgabeView(APIView):
    """Ein Klick : der Beschluss wird zur Aufgabe im Projekt (Verantwortlicher + Frist)."""

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, termin_id, beschluss_id):
        from apps.notifications.models import TypeNotification
        from apps.notifications.services import notifier

        termin = _termin(request, termin_id)
        _bearbeiten_oder_403(request, termin)
        beschluss = get_object_or_404(termin.beschluesse, pk=beschluss_id)
        if beschluss.aufgabe_id:
            raise ValidationError({"aufgabe": "Aus diesem Beschluss gibt es schon eine Aufgabe."})
        projekt_id = request.data.get("projekt") or termin.projekt_id
        if not projekt_id:
            raise ValidationError({"projekt": "Bitte ein Projekt wählen."})
        projekt = get_object_or_404(Projet, pk=projekt_id)
        if "verantwortlich" in request.data:
            beschluss.verantwortlich = _verantwortlich(request.data["verantwortlich"])
        if "frist" in request.data:
            beschluss.frist = _frist(request.data["frist"])
        verantwortlicher = beschluss.verantwortlich
        ordre = projekt.aufgaben.filter(status=StatutAufgabe.OFFEN).aggregate(m=Max("ordre"))["m"]
        wann = timezone.localtime(termin.beginn).strftime("%d.%m.%Y")
        beschluss.aufgabe = Aufgabe.objects.create(
            projet=projekt,
            titel=beschluss.text.strip().splitlines()[0][:200],
            beschreibung=f"Beschluss aus „{termin.titel}“ vom {wann}.\n\n{beschluss.text}",
            verantwortlich=getattr(verantwortlicher, "membre", None),
            frist=beschluss.frist,
            ordre=(ordre or 0) + 1,
            created_by=getattr(request.user, "membre", None),
        )
        beschluss.save()
        if verantwortlicher and verantwortlicher.pk != request.user.pk:
            notifier(
                verantwortlicher,
                TypeNotification.EVENEMENT_INVITATION,
                titre=f"Neue Aufgabe: {beschluss.aufgabe.titel}",
                message=f"Aus der Sitzung „{termin.titel}“ ist dir eine Aufgabe zugeteilt worden.",
                lien=f"/projets/{projekt.pk}",
            )
        return Response(_beschluss_dict(beschluss), status=status.HTTP_201_CREATED)


class ProtokollVersendenView(APIView):
    """Protokoll und Beschlüsse als Zusammenfassung an alle Eingeladenen (E-Mail + Hinweis)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, termin_id):
        from django.conf import settings

        from apps.notifications.email_cid import Texte, envoyer_email_cid
        from apps.notifications.models import TypeNotification
        from apps.notifications.services import notifier

        termin = _termin(request, termin_id)
        _bearbeiten_oder_403(request, termin)
        protokoll = getattr(termin, "protokoll", None)
        beschluesse = list(termin.beschluesse.select_related("verantwortlich"))
        if (protokoll is None or not protokoll.text.strip()) and not beschluesse:
            raise ValidationError(
                {"protokoll": "Es gibt noch kein Protokoll und keine Beschlüsse."}
            )
        empfaenger = {e.user for e in termin.einladungen.select_related("user")}
        empfaenger.add(termin.erstellt_von)
        wann = timezone.localtime(termin.beginn).strftime("%d.%m.%Y")
        absaetze = [
            p.strip() for p in (protokoll.text if protokoll else "").split("\n\n") if p.strip()
        ]
        details = []
        for b in beschluesse:
            wer = _name(b.verantwortlich) if b.verantwortlich_id else "–"
            bis = b.frist.strftime("%d.%m.%Y") if b.frist else "–"
            details.append((b.text[:300], f"{wer} · {bis}"))
        texte = {
            "de": Texte(
                titre=f"Protokoll: {termin.titel}",
                paragraphes=[f"Sitzung vom {wann}."] + absaetze[:20],
                details=details,
                cta="Im Kalender öffnen",
            ),
            "fr": Texte(
                titre=f"Procès-verbal : {termin.titel}",
                paragraphes=[f"Réunion du {wann}."] + absaetze[:20],
                details=details,
                cta="Ouvrir dans le calendrier",
            ),
        }
        for user in empfaenger:
            if user.email:
                langue = user.langue_preferee if user.langue_preferee in texte else "de"
                envoyer_email_cid(
                    sujet=f"Protokoll: {termin.titel}",
                    destinataire=user.email,
                    textes={k: v for k, v in texte.items() if k in ("de", langue)},
                    lien=f"{settings.FRONTEND_URL}/kalender",
                    fail_silently=True,
                )
            notifier(
                user,
                TypeNotification.EVENEMENT_INVITATION,
                titre=f"Protokoll: {termin.titel}",
                message=f"Das Protokoll der Sitzung vom {wann} wurde verschickt.",
                lien="/kalender",
            )
        protokoll, _ = Protokoll.objects.get_or_create(termin=termin)
        protokoll.versendet_am = timezone.now()
        protokoll.save()
        return Response({"versendet_an": len(empfaenger), "versendet_am": protokoll.versendet_am})
