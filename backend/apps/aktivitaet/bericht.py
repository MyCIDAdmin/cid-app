"""Monatsbericht der App-Admins (Release 24).

`erstellen(jahr, monat)` fasst einen abgeschlossenen Monat zusammen (nur Summen, keine Personen),
`senden` benachrichtigt die App-Admins (Glocke immer, E-Mail nur wenn das Modul „Aktivität“ nicht
abgeschaltet ist). Das Erzeugen ist wiederholbar : ein bestehender Monat wird neu berechnet.
"""

from datetime import datetime, timedelta

from django.db.models import Count
from django.utils import timezone
from django_otp.plugins.otp_totp.models import TOTPDevice

from apps.accounts.models import ROLE_LEVELS, AuditLogEntry, Role, User
from apps.notifications.email_cid import Texte, envoyer_email_cid
from apps.notifications.models import TypeNotification
from apps.notifications.services import email_module_actif, notifier

from . import kategorien as kat
from . import nutzung
from .models import Auffaelligkeit, Monatsbericht, Nutzung, RechteReview
from .services import BERLIN, INAKTIV_TAGE

LINK = "/admin/roles?tab=aktivitaet&ansicht=berichte"
AENDERUNGS_KATEGORIEN = (
    "mitglieder",
    "zahlungen",
    "finanzen",
    "shop",
    "kalender",
    "inhalte",
    "einstellungen",
)


def zeitraum(jahr: int, monat: int):
    start = datetime(jahr, monat, 1, tzinfo=BERLIN)
    ende = datetime(jahr + (monat == 12), monat % 12 + 1, 1, tzinfo=BERLIN)
    return start, ende


def vormonat(jetzt=None) -> tuple[int, int]:
    heute = timezone.localdate(jetzt or timezone.now(), BERLIN)
    erster = heute.replace(day=1)
    letzter = erster - timedelta(days=1)
    return letzter.year, letzter.month


def _summe(zaehler: dict, aktionen) -> int:
    return sum(zaehler.get(a, 0) for a in aktionen)


def berechnen(jahr: int, monat: int) -> dict:
    start, ende = zeitraum(jahr, monat)
    eintraege = AuditLogEntry.objects.filter(created_at__gte=start, created_at__lt=ende)
    z = {r["action"]: r["n"] for r in eintraege.values("action").annotate(n=Count("id"))}

    aenderungen = {k: _summe(z, kat.aktionen_von(k)) for k in AENDERUNGS_KATEGORIEN}
    export_aktionen = [a for a in kat.AKTIONEN if a.endswith("_export")]
    import_aktionen = [a for a in kat.AKTIONEN if a.endswith("_import")]
    loesch_aktionen = [a for a in kat.AKTIONEN if a.endswith("_geloescht")]
    aenderungen.update(
        loeschungen=_summe(z, loesch_aktionen),
        exporte=_summe(z, export_aktionen),
        importe=_summe(z, import_aktionen),
    )

    funde = Auffaelligkeit.objects.filter(erkannt_am__gte=start, erkannt_am__lt=ende)
    nutzungen = Nutzung.objects.filter(tag__gte=start.date(), tag__lt=ende.date())
    pro_modul = {
        r["modul"]: r["nutzer"]
        for r in nutzungen.values("modul").annotate(nutzer=Count("user", distinct=True))
    }
    module = sorted(
        ((m, pro_modul.get(m, 0)) for m in nutzung.NUTZUNG_MODULE), key=lambda x: (-x[1], x[0])
    )

    stufe = ROLE_LEVELS[Role.BUREAU_ADMIN]
    privilegierte = list(
        User.objects.filter(
            role__in=[r for r, n in ROLE_LEVELS.items() if n >= stufe], is_active=True
        ).values_list("pk", flat=True)
    )
    mit_totp = (
        TOTPDevice.objects.filter(confirmed=True, user_id__in=privilegierte)
        .values("user_id")
        .distinct()
        .count()
    )
    aktive = User.objects.filter(is_active=True)
    return {
        "zeitraum": {"jahr": jahr, "monat": monat},
        "sicherheit": {
            "logins": _summe(z, kat.LOGIN_ERFOLG),
            "fehlversuche": _summe(z, kat.LOGIN_FEHLER),
            "sperren": _summe(z, ["login_locked_out"]),
            "registrierungen": _summe(z, ["register"]),
            "freigaben": _summe(z, ["registration_approved", "registration_refused"]),
            "rollenaenderungen": _summe(z, kat.ROLLEN_AENDERUNG),
            "passwort": _summe(z, ["password_reset_requested", "password_changed"]),
        },
        "aenderungen": aenderungen,
        "betrieb": {
            "server_fehler": _summe(z, ["server_fehler"]),
            "task_fehler": _summe(z, ["task_fehlgeschlagen"]),
            "mail_fehler": _summe(z, ["mail_fehler"]),
        },
        "auffaelligkeiten": {
            "neu": funde.count(),
            "wichtig": funde.filter(gewicht="wichtig").count(),
            "offen": Auffaelligkeit.objects.filter(status=Auffaelligkeit.Status.OFFEN).count(),
        },
        "nutzung": {
            "aktive": nutzungen.values("user").distinct().count(),
            "module": [{"modul": m, "nutzer": n} for m, n in module if n > 0][:5],
            "ungenutzt": [m for m, n in module if n == 0],
        },
        "konten": {
            "aktiv": aktive.count(),
            "privilegiert": len(privilegierte),
            "ohne_totp": len(privilegierte) - mit_totp,
            "inaktiv_90d": aktive.filter(
                last_successful_login__lt=timezone.now() - timedelta(days=INAKTIV_TAGE)
            ).count(),
            "review_offen": RechteReview.objects.filter(status=RechteReview.Status.OFFEN).count(),
        },
    }


def erstellen(jahr: int, monat: int) -> Monatsbericht:
    daten = berechnen(jahr, monat)
    bericht, _neu = Monatsbericht.objects.update_or_create(
        jahr=jahr, monat=monat, defaults={"daten": daten, "erstellt_am": timezone.now()}
    )
    return bericht


def zeilen(daten: dict, sprache: str) -> list[str]:
    """Kurzfassung für die E-Mail (Deutsch oder Französisch)."""
    s, a, b, f, n, k = (
        daten["sicherheit"],
        daten["aenderungen"],
        daten["betrieb"],
        daten["auffaelligkeiten"],
        daten["nutzung"],
        daten["konten"],
    )
    fr = sprache == "fr"
    top = ", ".join(
        f"{nutzung.NUTZUNG_MODULE[m['modul']][1 if fr else 0]} ({m['nutzer']})"
        for m in n["module"][:3]
    )
    if fr:
        return [
            f"Sécurité : {s['logins']} connexions, {s['fehlversuche']} échecs, "
            f"{s['sperren']} blocages, "
            f"{s['rollenaenderungen']} changements de rôles/droits.",
            f"Modifications : {sum(a[c] for c in AENDERUNGS_KATEGORIEN)} dans les modules, dont "
            f"{a['loeschungen']} suppressions ; {a['exporte']} exports, {a['importe']} imports.",
            f"Exploitation : {b['server_fehler']} erreurs serveur, "
            f"{b['task_fehler']} tâches en échec, "
            f"{b['mail_fehler']} e-mails non envoyés.",
            f"Anomalies : {f['neu']} nouvelles ({f['wichtig']} importantes), "
            f"{f['offen']} encore ouvertes.",
            f"Utilisation : {n['aktive']} personnes actives"
            + (f" ; modules : {top}." if top else "."),
            f"Comptes : {k['privilegiert']} avec droits étendus, dont {k['ohne_totp']} sans 2FA ; "
            f"{k['inaktiv_90d']} sans connexion depuis 90 jours.",
        ]
    return [
        f"Sicherheit: {s['logins']} Anmeldungen, {s['fehlversuche']} Fehlversuche, "
        f"{s['sperren']} Sperren, "
        f"{s['rollenaenderungen']} Rollen-/Rechteänderungen.",
        f"Änderungen: {sum(a[c] for c in AENDERUNGS_KATEGORIEN)} in den Modulen, davon "
        f"{a['loeschungen']} Löschungen; {a['exporte']} Exporte, {a['importe']} Importe.",
        f"Betrieb: {b['server_fehler']} Serverfehler, {b['task_fehler']} fehlgeschlagene Jobs, "
        f"{b['mail_fehler']} nicht versendete E-Mails.",
        f"Auffälligkeiten: {f['neu']} neu ({f['wichtig']} wichtig), {f['offen']} noch offen.",
        f"Nutzung: {n['aktive']} aktive Personen" + (f"; Module: {top}." if top else "."),
        f"Konten: {k['privilegiert']} mit erweiterten Rechten, davon {k['ohne_totp']} ohne 2FA; "
        f"{k['inaktiv_90d']} ohne Anmeldung seit 90 Tagen.",
    ]


def senden(bericht: Monatsbericht, empfaenger=None) -> int:
    """Bericht an die App-Admins (oder an `empfaenger`) : Glocke immer, Mail wenn erlaubt."""
    verteiler = empfaenger is None  # nur der reguläre Versand an alle gilt als „versendet“
    if verteiler:
        empfaenger = list(User.objects.filter(role=Role.SUPER_ADMIN, is_active=True))
    mail_an = email_module_actif("aktivitaet")
    for user in empfaenger:
        fr = getattr(user, "langue_preferee", "") == "fr"
        sprache = "fr" if fr else "de"
        titel = f"Rapport d'activité {bericht}" if fr else f"Aktivitäts-Monatsbericht {bericht}"
        text = zeilen(bericht.daten, sprache)
        notifier(
            user,
            TypeNotification.AKTIVITAET_BERICHT,
            titre=titel,
            message="\n".join(text),
            lien=LINK,
        )
        if mail_an and user.email:
            textes = {
                "de": Texte(
                    titre=f"Aktivitäts-Monatsbericht {bericht}",
                    paragraphes=zeilen(bericht.daten, "de"),
                    cta="Bericht öffnen",
                )
            }
            if fr:
                textes["fr"] = Texte(
                    titre=f"Rapport d'activité {bericht}",
                    paragraphes=zeilen(bericht.daten, "fr"),
                    cta="Ouvrir le rapport",
                )
            envoyer_email_cid(
                sujet=f"[CID] Aktivitäts-Monatsbericht {bericht}",
                destinataire=user.email,
                textes=textes,
                lien=LINK,
                fail_silently=True,
            )
    if verteiler:
        bericht.versendet_am = timezone.now()
        bericht.save(update_fields=["versendet_am"])
    return len(empfaenger)
