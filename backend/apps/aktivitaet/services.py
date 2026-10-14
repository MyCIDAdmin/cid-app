"""Auswertungen über das Protokoll (`AuditLogEntry`) : Übersicht, Journal-Filter, Bereinigung."""

import ipaddress
import uuid
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.db.models import Count, Max, Q
from django.db.models.functions import ExtractHour, ExtractIsoWeekDay, TruncDate
from django.utils import timezone
from django.utils.dateparse import parse_date
from django_otp.plugins.otp_totp.models import TOTPDevice

from apps.accounts.models import ROLE_LEVELS, AuditLogEntry, Role, User

from . import kategorien as kat
from .models import Auffaelligkeit

BERLIN = ZoneInfo("Europe/Berlin")
ERLAUBTE_TAGE = (7, 30, 90)
INAKTIV_TAGE = 90


def _datum(wert):
    try:
        return parse_date(wert or "")
    except ValueError:
        return None


def _ip(wert):
    try:
        return str(ipaddress.ip_address((wert or "").strip()))
    except ValueError:
        return None


def name_von(user) -> str:
    membre = getattr(user, "membre", None)
    if membre is not None:
        return f"{membre.prenom} {membre.nom}".strip() or user.email
    return user.email


def person_dict(user) -> dict | None:
    if user is None:
        return None
    return {"id": str(user.pk), "name": name_von(user), "email": user.email}


def eintrag_dict(e: AuditLogEntry) -> dict:
    de, fr = kat.label_von(e.action)
    return {
        "id": str(e.id),
        "zeit": e.created_at,
        "aktion": e.action,
        "label": {"de": de, "fr": fr},
        "kategorie": kat.kategorie_von(e.action),
        "gewicht": kat.gewicht_von(e.action),
        "user": (
            {"id": str(e.user_id), "name": name_von(e.user), "email": e.user.email}
            if e.user_id
            else None
        ),
        "ip": e.ip_address,
        "geraet": e.user_agent,
        "details": e.metadata or {},
    }


def journal_filtern(params):
    """Queryset des Journals nach den Query-Parametern (`von`, `bis`, `aktion`, `kategorie`,
    `gewicht`, `user`, `ip`, `q`)."""
    qs = AuditLogEntry.objects.select_related("user", "user__membre")
    von, bis = _datum(params.get("von")), _datum(params.get("bis"))
    if von:
        qs = qs.filter(created_at__date__gte=von)
    if bis:
        qs = qs.filter(created_at__date__lte=bis)
    aktionen = [a for a in (params.get("aktion") or "").split(",") if a]
    if aktionen:
        qs = qs.filter(action__in=aktionen)
    kategorie = params.get("kategorie")
    if kategorie == "sonstige":
        qs = qs.exclude(action__in=list(kat.AKTIONEN))
    elif kategorie in kat.KATEGORIEN:
        qs = qs.filter(action__in=kat.aktionen_von(kategorie))
    gewicht = params.get("gewicht")
    if gewicht in ("warnung", "wichtig"):
        qs = qs.filter(action__in=[a for a, v in kat.AKTIONEN.items() if v[1] == gewicht])
    user = params.get("user")
    if user:
        try:
            qs = qs.filter(user_id=uuid.UUID(user))
        except ValueError:
            qs = qs.none()
    if params.get("ip"):
        ip = _ip(params["ip"])
        qs = qs.filter(ip_address=ip) if ip else qs.none()
    q = (params.get("q") or "").strip()
    if q:
        qs = qs.filter(
            Q(user__email__icontains=q)
            | Q(user__membre__nom__icontains=q)
            | Q(user__membre__prenom__icontains=q)
        )
    return qs


def uebersicht(tage: int) -> dict:
    jetzt = timezone.now()
    seit = jetzt - timedelta(days=tage)
    im_zeitraum = AuditLogEntry.objects.filter(created_at__gte=seit).exclude(
        action__in=kat.aktionen_von("audit")
    )
    zaehler = {r["action"]: r["n"] for r in im_zeitraum.values("action").annotate(n=Count("id"))}

    def summe(*aktionen):
        return sum(zaehler.get(a, 0) for a in aktionen)

    def aktive(stunden):
        return (
            AuditLogEntry.objects.filter(
                action__in=kat.LOGIN_ERFOLG,
                created_at__gte=jetzt - timedelta(hours=stunden),
                user__isnull=False,
            )
            .values("user")
            .distinct()
            .count()
        )

    kacheln = {
        "logins": summe(*kat.LOGIN_ERFOLG),
        "fehlversuche": summe(*kat.LOGIN_FEHLER),
        "sperren": summe("login_locked_out"),
        "registrierungen": summe("register"),
        "freigaben": summe("registration_approved", "registration_refused"),
        "rollenaenderungen": summe(*kat.ROLLEN_AENDERUNG),
        "geraete_limit": summe("device_limit_reached"),
        "server_fehler": summe("server_fehler"),
        "auffaelligkeiten_offen": Auffaelligkeit.objects.filter(
            status=Auffaelligkeit.Status.OFFEN
        ).count(),
        "passwort": summe("password_reset_requested", "password_changed"),
        "aktive_nutzer": (
            im_zeitraum.filter(action__in=kat.LOGIN_ERFOLG, user__isnull=False)
            .values("user")
            .distinct()
            .count()
        ),
        "aktiv_24h": aktive(24),
        "aktiv_7d": aktive(24 * 7),
        "aktiv_30d": aktive(24 * 30),
    }

    # Verlauf pro Tag (Berliner Zeit), Lücken mit 0 füllen.
    heute = timezone.localdate(jetzt, BERLIN)
    tage_liste = [heute - timedelta(days=i) for i in range(tage - 1, -1, -1)]
    reihen = {t: {"logins": 0, "fehlversuche": 0} for t in tage_liste}
    zeilen = (
        im_zeitraum.filter(action__in=kat.LOGIN_ERFOLG + kat.LOGIN_FEHLER)
        .annotate(tag=TruncDate("created_at", tzinfo=BERLIN))
        .values("tag", "action")
        .annotate(n=Count("id"))
    )
    for z in zeilen:
        if z["tag"] in reihen:
            schluessel = "logins" if z["action"] in kat.LOGIN_ERFOLG else "fehlversuche"
            reihen[z["tag"]][schluessel] += z["n"]
    verlauf = [{"tag": t.isoformat(), **werte} for t, werte in reihen.items()]

    # Heatmap Wochentag (Mo=0) × Stunde der erfolgreichen Anmeldungen.
    heatmap = [[0] * 24 for _ in range(7)]
    for z in (
        im_zeitraum.filter(action__in=kat.LOGIN_ERFOLG)
        .annotate(
            wt=ExtractIsoWeekDay("created_at", tzinfo=BERLIN),
            std=ExtractHour("created_at", tzinfo=BERLIN),
        )
        .values("wt", "std")
        .annotate(n=Count("id"))
    ):
        heatmap[z["wt"] - 1][z["std"]] += z["n"]

    top_ips = [
        {"ip": z["ip_address"], "anzahl": z["n"], "zuletzt": z["zuletzt"]}
        for z in im_zeitraum.filter(action="login_failed", ip_address__isnull=False)
        .values("ip_address")
        .annotate(n=Count("id"), zuletzt=Max("created_at"))
        .order_by("-n")[:5]
    ]

    return {
        "tage": tage,
        "kacheln": kacheln,
        "verlauf": verlauf,
        "heatmap": heatmap,
        "top_ips": top_ips,
        **konten_sicht(jetzt),
    }


def konten_sicht(jetzt) -> dict:
    stufe = ROLE_LEVELS[Role.BUREAU_ADMIN]
    rollen = [r for r, n in ROLE_LEVELS.items() if n >= stufe]
    privilegierte = list(
        User.objects.filter(role__in=rollen, is_active=True)
        .select_related("membre")
        .order_by("-last_successful_login")
    )
    mit_totp = set(
        TOTPDevice.objects.filter(
            confirmed=True, user_id__in=[u.pk for u in privilegierte]
        ).values_list("user_id", flat=True)
    )
    aktive_konten = User.objects.filter(is_active=True)
    grenze = jetzt - timedelta(days=INAKTIV_TAGE)
    return {
        "privilegiert": [
            {
                "id": str(u.pk),
                "name": name_von(u),
                "email": u.email,
                "rolle": u.get_role_display(),
                "letzte_anmeldung": u.last_successful_login,
                "totp": u.pk in mit_totp,
            }
            for u in privilegierte
        ],
        "konten": {
            "aktiv": aktive_konten.count(),
            "inaktiv_90d": aktive_konten.filter(last_successful_login__lt=grenze).count(),
            "nie_angemeldet": aktive_konten.filter(last_successful_login__isnull=True).count(),
        },
    }


def bereinigen(jetzt=None) -> dict:
    """Aufbewahrungsfristen anwenden : alte Einträge je Kategorie löschen, IP-Adressen und
    Browserkennung nach `IP_AUFBEWAHRUNG_TAGE` Tagen entfernen. Gibt die Zahlen zurück."""
    jetzt = jetzt or timezone.now()
    geloescht = 0
    for schluessel in kat.KATEGORIEN:
        grenze = jetzt - timedelta(days=kat.aufbewahrung_tage(schluessel))
        qs = AuditLogEntry.objects.filter(created_at__lt=grenze)
        if schluessel == "sonstige":
            qs = qs.exclude(action__in=list(kat.AKTIONEN))
        else:
            qs = qs.filter(action__in=kat.aktionen_von(schluessel))
        geloescht += qs.delete()[0]
    geloescht += Auffaelligkeit.objects.filter(
        status=Auffaelligkeit.Status.ERLEDIGT,
        erkannt_am__lt=jetzt - timedelta(days=kat.KATEGORIEN["audit"][2]),
    ).delete()[0]
    Auffaelligkeit.objects.filter(
        erkannt_am__lt=jetzt - timedelta(days=kat.IP_AUFBEWAHRUNG_TAGE), ip_address__isnull=False
    ).update(ip_address=None)
    gekuerzt = (
        AuditLogEntry.objects.filter(
            created_at__lt=jetzt - timedelta(days=kat.IP_AUFBEWAHRUNG_TAGE)
        )
        .filter(Q(ip_address__isnull=False) | ~Q(user_agent=""))
        .update(ip_address=None, user_agent="")
    )
    return {"geloescht": geloescht, "ip_entfernt": gekuerzt}
