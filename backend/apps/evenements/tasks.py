"""
Tâches Celery — app evenements (Phase 2B, RICEFW W-004/W-005 — différées lors de la Phase 2A,
voir docstring de models.py).

W-004 (invitation événement) : déclenchée par `EvenementViewSet.publier` (views.py), une seule
fois, au moment où l'événement passe de brouillon à publié.
W-005 (rappel J-3/J-1) : planifiée par Celery Beat, une fois par jour à 10h00 (voir la migration
0002_planifier_rappels_evenements, même principe que apps.cotisations 0003).

`envoyer_annulation_evenement` (ajoutée le 2026-09-16, demande utilisateur : "Baue notification wo
du siehst, dass es Sinn macht") : déclenchée par `EvenementViewSet.annuler`, à chaque inscrit non
annulé (même portée que `envoyer_rappels_evenements` ci-dessous) — même principe de broadcast que
`envoyer_invitations_evenement`.

Comme apps.cotisations.tasks (voir son docstring), chaque envoi email individuel est protégé
(`fail_silently`/try-except) pour qu'un échec isolé n'interrompe jamais la boucle sur les membres
suivants — et la notification in-app est créée indépendamment de l'email, jamais conditionnée à
son succès (contrairement à la relance cotisation, où seul un envoi réussi consomme le verrou
d'idempotence : ici il n'y a pas de verrou équivalent à contourner).

`evenement.description` contient désormais du HTML (éditeur "word-like" TipTap côté
AdminEventsPage, demande utilisateur du 2026-09-27 point 11.3 — même principe que
apps.adhesions.tasks.envoyer_annonce_campagne) — ces emails restent des `send_mail` texte brut
(pas de version HTML), donc `strip_tags` avant interpolation, sinon les balises brutes
apparaîtraient telles quelles dans la boîte de réception du membre. `strip_tags` sur une
ancienne description en texte brut (sans balises, créées avant ce changement) est un no-op,
donc rétro-compatible.
"""

import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone
from django.utils.html import strip_tags

from apps.membres.models import Membre, StatutMembre
from apps.notifications.email_cid import Texte, envoyer_email_cid
from apps.notifications.models import TypeNotification
from apps.notifications.services import email_module_actif, notifier

from .models import Evenement, Inscription, StatutEvenement, StatutInscription

logger = logging.getLogger(__name__)


def _details_evenement(evenement: Evenement) -> str:
    """Détails de l'événement (demande utilisateur du 2026-09-19 : "Füge zu den versendeten
    Mails mehr Details hinzu")."""
    cout = f"{evenement.cout} €" if evenement.cout else "Gratuit"
    return (
        f"{strip_tags(evenement.description).strip()}\n\n"
        f"Date : {evenement.date_evenement:%d/%m/%Y}\n"
        f"Lieu : {evenement.lieu}\n"
        f"Coût : {cout}"
    )


# --- E-Mails im CID-Layout (Demande du 2026-10-06, point 5) : eine Mail, drei Sprachen
# (DE Hauptsprache → FR → AR), siehe apps.notifications.email_cid.
_LABELS = {
    "de": {
        "datum": "Datum",
        "zeit": "Uhrzeit",
        "ort": "Ort",
        "rdv": "Treffpunkt",
        "kosten": "Kosten",
        "frist": "Zahlungsfrist",
        "gratis": "Kostenlos",
        "bis": "bis",
    },
    "fr": {
        "datum": "Date",
        "zeit": "Heure",
        "ort": "Lieu",
        "rdv": "Point de rendez-vous",
        "kosten": "Coût",
        "frist": "Date limite de paiement",
        "gratis": "Gratuit",
        "bis": "jusqu'au",
    },
    "ar": {
        "datum": "التاريخ",
        "zeit": "الوقت",
        "ort": "المكان",
        "rdv": "نقطة اللقاء",
        "kosten": "التكلفة",
        "frist": "آخر أجل للدفع",
        "gratis": "مجاني",
        "bis": "إلى",
    },
}


def _fmt_date(d, langue: str) -> str:
    return d.strftime("%d.%m.%Y" if langue == "de" else "%d/%m/%Y")


def _details_cid(evenement: Evenement, langue: str) -> list[tuple[str, str]]:
    lb = _LABELS[langue]
    datum = _fmt_date(evenement.date_evenement, langue)
    if evenement.date_fin and evenement.date_fin != evenement.date_evenement:
        datum += f" – {_fmt_date(evenement.date_fin, langue)}"
    details = [(lb["datum"], datum)]
    if evenement.heure:
        zeit = evenement.heure.strftime("%H:%M")
        if evenement.heure_fin:
            zeit += f" – {evenement.heure_fin.strftime('%H:%M')}"
        details.append((lb["zeit"], zeit))
    details.append((lb["ort"], evenement.lieu))
    if evenement.point_rdv:
        details.append((lb["rdv"], evenement.point_rdv))
    details.append(
        (
            lb["kosten"],
            lb["gratis"] if evenement.gratuit or not evenement.cout else f"{evenement.cout} €",
        )
    )
    if evenement.date_limite_paiement:
        details.append((lb["frist"], _fmt_date(evenement.date_limite_paiement, langue)))
    return details


def _textes_evenement(evenement: Evenement, modele: dict, **kw) -> dict[str, Texte]:
    """modele : {"de"|"fr"|"ar": (titre, [paragraphes], cta)} avec {titre}/{datum}/... remplis."""
    resultat = {}
    for langue, (titre, paragraphes, cta) in modele.items():
        ctx = {"titre": evenement.titre, "datum": _fmt_date(evenement.date_evenement, langue), **kw}
        paras = [p.format(**ctx) for p in paragraphes]
        if langue == "de":
            beschreibung = strip_tags(evenement.description).strip()
            if beschreibung:
                paras.append(beschreibung)
        resultat[langue] = Texte(
            titre=titre.format(**ctx),
            paragraphes=paras,
            details=_details_cid(evenement, langue),
            cta=cta,
        )
    return resultat


_MODELE_INVITATION = {
    "de": (
        "Neue Veranstaltung: {titre}",
        ["Eine neue Veranstaltung wurde veröffentlicht. Melde dich jetzt an!"],
        "Zur Veranstaltung",
    ),
    "fr": (
        "Nouvel événement : {titre}",
        ["Un nouvel événement vient d'être publié. Inscrivez-vous dès maintenant !"],
        "Voir l'événement",
    ),
    "ar": ("فعالية جديدة: {titre}", ["تم نشر فعالية جديدة. سجّل الآن!"], "عرض الفعالية"),
}
_MODELE_RAPPEL = {
    "de": (
        "Erinnerung: {titre}",
        [
            "Die Veranstaltung findet am {datum} statt. Du bist für {places} Platz/Plätze angemeldet."  # noqa: E501
        ],
        "Zur Veranstaltung",
    ),
    "fr": (
        "Rappel : {titre}",
        ["L'événement a lieu le {datum}. Vous êtes inscrit(e) pour {places} place(s)."],
        "Voir l'événement",
    ),
    "ar": (
        "تذكير: {titre}",
        ["تقام الفعالية بتاريخ {datum}. أنت مسجّل لعدد {places} مكان."],
        "عرض الفعالية",
    ),
}
_MODELE_ANNULATION = {
    "de": (
        "Veranstaltung abgesagt: {titre}",
        [
            "Die Veranstaltung am {datum} wurde leider abgesagt. Gebuchte Plätze: {places}, bezahlt: {paye} €. Bitte melde dich beim Verein, falls eine Rückerstattung nötig ist."  # noqa: E501
        ],
        "Zu den Veranstaltungen",
    ),
    "fr": (
        "Événement annulé : {titre}",
        [
            "L'événement du {datum} a malheureusement été annulé. Places réservées : {places}, montant payé : {paye} €. Contactez l'association pour un éventuel remboursement."  # noqa: E501
        ],
        "Voir les événements",
    ),
    "ar": (
        "تم إلغاء الفعالية: {titre}",
        [
            "تم إلغاء الفعالية بتاريخ {datum} للأسف. الأماكن المحجوزة: {places}، المبلغ المدفوع: {paye} €. يرجى التواصل مع الجمعية لاسترجاع المبلغ عند الحاجة."  # noqa: E501
        ],
        "عرض الفعاليات",
    ),
}
_MODELE_PAIEMENT = {
    "de": (
        "Zahlungserinnerung: {titre}",
        [
            "Deine Teilnahme ist noch nicht bezahlt ({montant} €). Bitte zahle bis spätestens {frist}, damit dein Platz gesichert bleibt."  # noqa: E501
        ],
        "Jetzt bezahlen",
    ),
    "fr": (
        "Rappel de paiement : {titre}",
        [
            "Votre participation n'est pas encore réglée ({montant} €). Merci de payer au plus tard le {frist} pour conserver votre place."  # noqa: E501
        ],
        "Payer maintenant",
    ),
    "ar": (
        "تذكير بالدفع: {titre}",
        ["مشاركتك لم تُسدَّد بعد ({montant} €). يرجى الدفع في أجل أقصاه {frist} للحفاظ على مكانك."],
        "ادفع الآن",
    ),
}


@shared_task
def envoyer_invitations_evenement(evenement_id) -> int:
    """W-004 — invitation email + notification in-app à tous les membres actifs, déclenchée à la
    publication d'un événement. Retourne le nombre d'invitations envoyées avec succès."""
    try:
        evenement = Evenement.objects.get(id=evenement_id)
    except Evenement.DoesNotExist:
        return 0

    membres = Membre.objects.filter(statut=StatutMembre.ACTIF).select_related("user")
    # Corrigé le 2026-09-19 (retour utilisateur, clic sur notification sans effet) :
    # "/evenements/{id}" ne correspond à aucune route du frontend (pas de page de détail par
    # événement, voir App.tsx) — ?evenement= permet à EvenementsPage de retrouver et mettre en
    # évidence la carte correspondante (voir useDeepLinkCible côté frontend).
    lien = f"/evenements?evenement={evenement.id}"
    envoyes = 0

    for membre in membres:
        user = membre.user
        if not user or not user.email:
            continue
        if email_module_actif("evenements"):
            try:
                envoyer_email_cid(
                    sujet=f"Neue Veranstaltung · Nouvel événement : {evenement.titre}",
                    destinataire=user.email,
                    textes=_textes_evenement(evenement, _MODELE_INVITATION),
                    lien=lien,
                )
                envoyes += 1
            except (
                Exception
            ):  # noqa: BLE001 — un échec d'envoi isolé ne doit jamais bloquer la boucle
                logger.warning(
                    "envoyer_invitations_evenement: échec d'envoi pour user=%s evenement=%s",
                    user.id,
                    evenement_id,
                )
        notifier(
            user,
            TypeNotification.EVENEMENT_INVITATION,
            titre=f"Nouvel événement : {evenement.titre}",
            message=f"Un nouvel événement a été publié le {evenement.date_evenement:%d/%m/%Y}.",
            lien=lien,
        )

    return envoyes


@shared_task
def envoyer_annulation_evenement(evenement_id) -> int:
    """Email + notification in-app à chaque inscrit non annulé, déclenchée à l'annulation d'un
    événement (ajouté le 2026-09-16). Retourne le nombre d'annulations notifiées avec succès."""
    try:
        evenement = Evenement.objects.get(id=evenement_id)
    except Evenement.DoesNotExist:
        return 0

    inscriptions = evenement.inscriptions.exclude(statut=StatutInscription.ANNULEE).select_related(
        "membre__user"
    )
    lien = f"/evenements?evenement={evenement.id}"  # voir envoyer_invitations_evenement
    envoyes = 0

    for inscription in inscriptions:
        user = inscription.membre.user
        if not user or not user.email:
            continue
        if email_module_actif("evenements"):
            try:
                envoyer_email_cid(
                    sujet=f"Veranstaltung abgesagt · Événement annulé : {evenement.titre}",
                    destinataire=user.email,
                    textes=_textes_evenement(
                        evenement,
                        _MODELE_ANNULATION,
                        places=inscription.places,
                        paye=inscription.montant_paye,
                    ),
                    lien="/evenements",
                )
                envoyes += 1
            except Exception:  # noqa: BLE001 — voir docstring de module
                logger.warning(
                    "envoyer_annulation_evenement: échec d'envoi pour user=%s evenement=%s",
                    user.id,
                    evenement_id,
                )
        notifier(
            user,
            TypeNotification.EVENEMENT_ANNULE,
            titre=f"Événement annulé : {evenement.titre}",
            message=f"{evenement.titre} ({evenement.date_evenement:%d/%m/%Y}) a été annulé.",
            lien=lien,
        )

    return envoyes


@shared_task
def envoyer_rappels_evenements(today=None) -> int:
    """
    W-005 — rappel J-3/J-1, Celery Beat quotidien 10h00. Scanne les événements publiés dont la
    date tombe dans exactement 3 ou 1 jour(s) et relance chaque inscrit actif (statut != annulée).
    Retourne le nombre de rappels envoyés avec succès.
    """
    today = today or timezone.now().date()
    envoyes = 0

    for decalage, label in ((3, "J-3"), (1, "J-1")):
        date_cible = today + timedelta(days=decalage)
        evenements = Evenement.objects.filter(
            statut=StatutEvenement.PUBLIE, date_evenement=date_cible
        )
        for evenement in evenements:
            inscriptions = evenement.inscriptions.exclude(
                statut=StatutInscription.ANNULEE
            ).select_related("membre__user")
            lien = f"/evenements?evenement={evenement.id}"  # voir envoyer_invitations_evenement
            for inscription in inscriptions:
                membre = inscription.membre
                user = membre.user
                if not user or not user.email:
                    continue
                if email_module_actif("evenements"):
                    try:
                        envoyer_email_cid(
                            sujet=f"Erinnerung · Rappel ({label}) : {evenement.titre}",
                            destinataire=user.email,
                            textes=_textes_evenement(
                                evenement, _MODELE_RAPPEL, places=inscription.places
                            ),
                            lien=lien,
                        )
                        envoyes += 1
                    except Exception:  # noqa: BLE001 — voir docstring de module
                        logger.warning(
                            "envoyer_rappels_evenements: échec d'envoi pour user=%s evenement=%s",
                            user.id,
                            evenement.id,
                        )
                notifier(
                    user,
                    TypeNotification.EVENEMENT_RAPPEL,
                    titre=f"Rappel — {evenement.titre}",
                    message=f"{evenement.titre} a lieu le {evenement.date_evenement:%d/%m/%Y}.",
                    lien=lien,
                )

    return envoyes


@shared_task
def envoyer_rappels_paiement_evenements(today=None) -> int:
    """Demande utilisateur du 2026-10-06 (point 2.3) — rappel email unique aux inscrits dont la
    participation n'est pas encore payée (statut en_attente_paiement) quand l'échéance
    `date_limite_paiement` tombe dans les 3 jours à venir (J-3 … J0). Idempotent via
    `Inscription.rappel_paiement_envoye_le`. Retourne le nombre de rappels envoyés."""
    today = today or timezone.now().date()
    envoyes = 0
    inscriptions = Inscription.objects.filter(
        statut=StatutInscription.EN_ATTENTE_PAIEMENT,
        rappel_paiement_envoye_le__isnull=True,
        evenement__statut=StatutEvenement.PUBLIE,
        evenement__date_limite_paiement__isnull=False,
        evenement__date_limite_paiement__gte=today,
        evenement__date_limite_paiement__lte=today + timedelta(days=3),
    ).select_related("evenement", "membre__user")
    for inscription in inscriptions:
        user = inscription.membre.user
        evenement = inscription.evenement
        if not user or not user.email:
            continue
        lien = f"/evenements?evenement={evenement.id}"
        if email_module_actif("evenements"):
            try:
                kw = {"montant": inscription.montant_paye, "frist": None}
                textes = {}
                for langue, modele in _MODELE_PAIEMENT.items():
                    kw["frist"] = _fmt_date(evenement.date_limite_paiement, langue)
                    textes.update(_textes_evenement(evenement, {langue: modele}, **kw))
                envoyer_email_cid(
                    sujet=f"Zahlungserinnerung · Rappel de paiement : {evenement.titre}",
                    destinataire=user.email,
                    textes=textes,
                    lien=lien,
                )
                envoyes += 1
            except Exception:  # noqa: BLE001 — voir docstring de module
                logger.warning(
                    "envoyer_rappels_paiement_evenements: échec d'envoi user=%s evenement=%s",
                    user.id,
                    evenement.id,
                )
                continue
        inscription.rappel_paiement_envoye_le = today
        inscription.save(update_fields=["rappel_paiement_envoye_le", "updated_at"])
        notifier(
            user,
            TypeNotification.EVENEMENT_RAPPEL,
            titre=f"Zahlung fällig — {evenement.titre}",
            message=f"{evenement.titre} : paiement attendu avant le "
            f"{evenement.date_limite_paiement:%d/%m/%Y}.",
            lien=lien,
        )
    return envoyes
