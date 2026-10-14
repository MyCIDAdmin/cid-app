"""Auffälligkeitsregeln des Aktivitäts-Protokolls (Release 22).

Jede Regel liest nur das Protokoll (`AuditLogEntry`) und liefert Funde. Dieselbe Auffälligkeit wird
dank `(regel, schluessel)` nur einmal gemeldet : ereignisbezogene Regeln nehmen die Eintrags-ID,
zählende Regeln die Stunde als Schlüssel. Schwellen stehen oben als Konstanten.
"""

from datetime import timedelta

from django.db.models import Count

from apps.accounts.models import AuditLogEntry, Role, User

from . import kategorien as kat
from .services import name_von

# Regel → (Gewicht, Text DE, Text FR) ; Platzhalter aus den Details des Fundes.
REGELN = {
    "bruteforce": (
        "warnung",
        "{n} fehlgeschlagene Anmeldungen von {ip} in {minuten} Minuten",
        "{n} échecs de connexion depuis {ip} en {minuten} minutes",
    ),
    "angriff_erfolg": (
        "wichtig",
        "Anmeldung von {name} erfolgreich nach {n} Fehlversuchen",
        "Connexion de {name} réussie après {n} échecs",
    ),
    "export_haeufung": (
        "warnung",
        "{name} hat {n} Exporte in {minuten} Minuten ausgeführt",
        "{name} a effectué {n} exports en {minuten} minutes",
    ),
    "massen_loeschung": (
        "wichtig",
        "{name} hat {n} Datensätze in {minuten} Minuten gelöscht",
        "{name} a supprimé {n} enregistrements en {minuten} minutes",
    ),
    "neuer_app_admin": (
        "wichtig",
        "{name} wurde zum App-Admin gemacht",
        "{name} est devenu·e administrateur·trice de l'application",
    ),
    "abschluss_geoeffnet": (
        "wichtig",
        "Finanzabschluss wurde von {name} wieder geöffnet",
        "La clôture financière a été rouverte par {name}",
    ),
    "totp_deaktiviert": (
        "warnung",
        "{name} hat die Authenticator-App deaktiviert",
        "{name} a désactivé l'application d'authentification",
    ),
    "server_fehler": (
        "warnung",
        "{n} Serverfehler in {minuten} Minuten",
        "{n} erreurs serveur en {minuten} minutes",
    ),
    "task_fehler": (
        "warnung",
        "Hintergrundjob fehlgeschlagen: {task}",
        "Tâche de fond en échec : {task}",
    ),
}

BRUTEFORCE_N, BRUTEFORCE_MIN = 10, 15
ANGRIFF_N, ANGRIFF_MIN = 5, 30
EXPORT_N, EXPORT_MIN = 3, 60
LOESCHEN_N, LOESCHEN_MIN = 10, 10
FEHLER_N, FEHLER_MIN = 5, 15
EREIGNIS_FENSTER_STD = 2  # ereignisbezogene Regeln schauen so weit zurück (dedupliziert)


def text_von(regel: str, details: dict) -> dict:
    _g, de, fr = REGELN[regel]
    try:
        return {"de": de.format(**details), "fr": fr.format(**details)}
    except (KeyError, IndexError):
        return {"de": regel, "fr": regel}


def _fund(regel, schluessel, user=None, ip=None, **details):
    if ip:
        details["ip"] = str(ip)
    return {
        "regel": regel,
        "schluessel": str(schluessel),
        "gewicht": REGELN[regel][0],
        "user": user,
        "ip": ip,
        "details": details,
    }


def _stunde(jetzt) -> int:
    return int(jetzt.timestamp() // 3600)


def _seit(jetzt, **kw):
    return AuditLogEntry.objects.filter(created_at__gte=jetzt - timedelta(**kw))


def _bruteforce(jetzt):
    zeilen = (
        _seit(jetzt, minutes=BRUTEFORCE_MIN)
        .filter(action__in=kat.LOGIN_FEHLER, ip_address__isnull=False)
        .values("ip_address")
        .annotate(n=Count("id"))
        .filter(n__gte=BRUTEFORCE_N)
    )
    for z in zeilen:
        ip = z["ip_address"]
        yield _fund("bruteforce", f"{ip}:{_stunde(jetzt)}", ip=ip, n=z["n"], minuten=BRUTEFORCE_MIN)


def _angriff_erfolg(jetzt):
    for e in _seit(jetzt, minutes=ANGRIFF_MIN).filter(
        action__in=kat.LOGIN_ERFOLG, user__isnull=False
    ):
        n = AuditLogEntry.objects.filter(
            user=e.user,
            action__in=kat.LOGIN_FEHLER,
            created_at__gte=e.created_at - timedelta(minutes=ANGRIFF_MIN),
            created_at__lte=e.created_at,
        ).count()
        if n >= ANGRIFF_N:
            yield _fund(
                "angriff_erfolg", e.pk, user=e.user, ip=e.ip_address, name=name_von(e.user), n=n
            )


def _gruppiert(jetzt, aktionen, minuten, schwelle, regel):
    zeilen = (
        _seit(jetzt, minutes=minuten)
        .filter(action__in=aktionen, user__isnull=False)
        .values("user")
        .annotate(n=Count("id"))
        .filter(n__gte=schwelle)
    )
    for z in zeilen:
        user = User.objects.filter(pk=z["user"]).first()
        if user is not None:
            yield _fund(
                regel,
                f"{user.pk}:{_stunde(jetzt)}",
                user=user,
                name=name_von(user),
                n=z["n"],
                minuten=minuten,
            )


def _exporte(jetzt):
    aktionen = [
        a for a in kat.AKTIONEN if a.endswith("_export") and kat.kategorie_von(a) == "export"
    ]
    yield from _gruppiert(jetzt, aktionen, EXPORT_MIN, EXPORT_N, "export_haeufung")


def _loeschungen(jetzt):
    aktionen = [a for a in kat.AKTIONEN if a.endswith("_geloescht")]
    yield from _gruppiert(jetzt, aktionen, LOESCHEN_MIN, LOESCHEN_N, "massen_loeschung")


def _neuer_app_admin(jetzt):
    for e in _seit(jetzt, hours=EREIGNIS_FENSTER_STD).filter(
        action="role_changed", metadata__nouveau_role=Role.SUPER_ADMIN
    ):
        if e.user is not None:
            yield _fund(
                "neuer_app_admin", e.pk, user=e.user, ip=e.ip_address, name=name_von(e.user)
            )


def _je_eintrag(jetzt, aktion, regel):
    for e in _seit(jetzt, hours=EREIGNIS_FENSTER_STD).filter(action=aktion):
        akteur = e.user
        yield _fund(
            regel,
            e.pk,
            user=akteur,
            ip=e.ip_address,
            name=name_von(akteur) if akteur is not None else "?",
        )


def _serverfehler(jetzt):
    n = _seit(jetzt, minutes=FEHLER_MIN).filter(action="server_fehler").count()
    if n >= FEHLER_N:
        yield _fund("server_fehler", _stunde(jetzt), n=n, minuten=FEHLER_MIN)


def _task_fehler(jetzt):
    gesehen = set()
    for e in _seit(jetzt, hours=EREIGNIS_FENSTER_STD).filter(action="task_fehlgeschlagen"):
        task = str(e.metadata.get("task", "?"))
        schluessel = f"{task}:{int(e.created_at.timestamp() // 3600)}"
        if schluessel not in gesehen:
            gesehen.add(schluessel)
            yield _fund("task_fehler", schluessel, task=task)


def pruefen(jetzt):
    """Alle Regeln auswerten ; liefert die Funde (noch nicht gespeichert)."""
    funde = []
    for regel in (
        _bruteforce,
        _angriff_erfolg,
        _exporte,
        _loeschungen,
        _neuer_app_admin,
        lambda j: _je_eintrag(j, "finances_wiedereroeffnet", "abschluss_geoeffnet"),
        lambda j: _je_eintrag(j, "totp_disabled", "totp_deaktiviert"),
        _serverfehler,
        _task_fehler,
    ):
        funde.extend(regel(jetzt))
    return funde
