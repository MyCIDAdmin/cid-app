"""Vierteljährliche Rechteprüfung (Release 24).

Jedes Quartal wird eine Liste aller Konten mit erweiterten Rechten angelegt (Bureau Admin und
höher oder Zuweisung einer eigenen Rolle). Die App-Admins bestätigen jedes Konto oder markieren
„Rechte entziehen“. Die App ändert dabei **keine** Rollen : der Entzug geschieht bewusst im Reiter
„Zuweisung“ ; die Prüfung zeigt live, ob ein markiertes Konto noch erweiterte Rechte hat.
"""

from django.db import transaction
from django.utils import timezone
from django_otp.plugins.otp_totp.models import TOTPDevice

from apps.accounts.models import ROLE_LEVELS, Role, User
from apps.notifications.email_cid import Texte, envoyer_email_cid
from apps.notifications.models import TypeNotification
from apps.notifications.services import email_module_actif, notifier
from apps.rbac.models import UserRoleAssignment

from .models import RechtePosition, RechteReview
from .services import BERLIN, name_von

LINK = "/admin/roles?tab=aktivitaet&ansicht=review"
STUFE = ROLE_LEVELS[Role.BUREAU_ADMIN]
TEXT_DE = (
    "Bitte jedes Konto mit erweiterten Rechten bestätigen " "oder „Rechte entziehen“ markieren."
)


def quartal_von(jetzt=None) -> str:
    heute = timezone.localdate(jetzt or timezone.now(), BERLIN)
    return f"{heute.year}-Q{(heute.month - 1) // 3 + 1}"


def privilegierte_konten():
    """Aktive Konten mit Rolle ab Bureau Admin oder mit einer zugewiesenen eigenen Rolle."""
    rollen = [r for r, n in ROLE_LEVELS.items() if n >= STUFE]
    eigene = UserRoleAssignment.objects.filter(role__is_system=False, role__actif=True).values(
        "user_id"
    )
    from django.db.models import Q

    return (
        User.objects.filter(is_active=True)
        .filter(Q(role__in=rollen) | Q(pk__in=eigene))
        .select_related("membre")
        .distinct()
    )


def rollen_text(user) -> str:
    teile = [user.get_role_display()]
    teile += [
        a.role.nom
        for a in UserRoleAssignment.objects.filter(user=user, role__is_system=False).select_related(
            "role"
        )
    ]
    return ", ".join(dict.fromkeys(teile))[:300]


def hat_erweiterte_rechte(user) -> bool:
    return (
        user is not None and user.is_active and privilegierte_konten().filter(pk=user.pk).exists()
    )


@transaction.atomic
def anlegen(quartal: str | None = None) -> tuple[RechteReview, bool]:
    """Review des Quartals anlegen (idempotent) ; gibt `(review, neu)` zurück."""
    quartal = quartal or quartal_von()
    review, neu = RechteReview.objects.get_or_create(quartal=quartal)
    if not neu:
        return review, False
    konten = list(privilegierte_konten())
    mit_totp = set(
        TOTPDevice.objects.filter(confirmed=True, user_id__in=[u.pk for u in konten]).values_list(
            "user_id", flat=True
        )
    )
    RechtePosition.objects.bulk_create(
        [
            RechtePosition(
                review=review,
                user=u,
                name=name_von(u),
                email=u.email,
                rolle=rollen_text(u),
                totp=u.pk in mit_totp,
                letzte_anmeldung=u.last_successful_login,
            )
            for u in konten
        ]
    )
    return review, True


def melden(review: RechteReview) -> int:
    """App-Admins über die neue Prüfung informieren (Glocke immer, Mail wenn erlaubt)."""
    empfaenger = list(User.objects.filter(role=Role.SUPER_ADMIN, is_active=True))
    n = review.positionen.count()
    mail_an = email_module_actif("aktivitaet")
    for user in empfaenger:
        fr = getattr(user, "langue_preferee", "") == "fr"
        titel = (
            f"Revue des droits {review.quartal} : {n} comptes à vérifier"
            if fr
            else f"Rechteprüfung {review.quartal}: {n} Konten zu prüfen"
        )
        text = (
            "Confirmez chaque compte avec des droits étendus ou marquez « retirer les droits »."
            if fr
            else TEXT_DE
        )
        notifier(user, TypeNotification.AKTIVITAET_REVIEW, titre=titel, message=text, lien=LINK)
        if mail_an and user.email:
            textes = {
                "de": Texte(
                    titre=f"Rechteprüfung {review.quartal}: {n} Konten zu prüfen",
                    paragraphes=[TEXT_DE],
                    cta="Prüfung öffnen",
                )
            }
            if fr:
                textes["fr"] = Texte(titre=titel, paragraphes=[text], cta="Ouvrir la revue")
            envoyer_email_cid(
                sujet=f"[CID] Rechteprüfung {review.quartal}",
                destinataire=user.email,
                textes=textes,
                lien=LINK,
                fail_silently=True,
            )
    return len(empfaenger)


def position_dict(p: RechtePosition) -> dict:
    return {
        "id": str(p.id),
        "name": p.name,
        "email": p.email,
        "rolle": p.rolle,
        "totp": p.totp,
        "letzte_anmeldung": p.letzte_anmeldung,
        "entscheidung": p.entscheidung,
        "notiz": p.notiz,
        "entschieden_von": name_von(p.entschieden_von) if p.entschieden_von else None,
        "entschieden_am": p.entschieden_am,
        # live : hat das Konto heute noch erweiterte Rechte? (Entzug erfolgt in „Zuweisung“)
        "aktuell_erweitert": hat_erweiterte_rechte(p.user),
    }


def review_dict(r: RechteReview, mit_positionen=False) -> dict:
    positionen = list(r.positionen.select_related("user", "entschieden_von"))
    daten = {
        "id": str(r.id),
        "quartal": r.quartal,
        "status": r.status,
        "erstellt_am": r.erstellt_am,
        "abgeschlossen_am": r.abgeschlossen_am,
        "abgeschlossen_von": name_von(r.abgeschlossen_von) if r.abgeschlossen_von else None,
        "anzahl": len(positionen),
        "offen": sum(p.entscheidung == RechtePosition.Entscheidung.OFFEN for p in positionen),
        "entziehen": sum(
            p.entscheidung == RechtePosition.Entscheidung.ENTZIEHEN for p in positionen
        ),
    }
    if mit_positionen:
        daten["positionen"] = [position_dict(p) for p in positionen]
    return daten
