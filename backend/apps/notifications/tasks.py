"""Celery-Aufgaben der Benachrichtigungen (Release 32) : Telegram-Versand und Geburtstagsgruß."""

import calendar
import datetime
import logging

import requests
from celery import shared_task
from django.db import IntegrityError, transaction

from . import telegram
from .models import Geburtstagsgruss, Notification, TelegramVerknuepfung

logger = logging.getLogger(__name__)


@shared_task(
    autoretry_for=(requests.RequestException,),
    retry_backoff=30,
    retry_kwargs={"max_retries": 3},
)
def sende_telegram(notification_id: str) -> None:
    """Sendet eine Benachrichtigung in den verknüpften Telegram-Chat. Hat die Person den Bot
    blockiert, wird die Verknüpfung gelöst (sie kann sich im Profil neu verbinden)."""
    notification = Notification.objects.select_related("destinataire").filter(pk=notification_id)
    notification = notification.first()
    if notification is None or not telegram.bot_konfiguriert():
        return
    verknuepfung = TelegramVerknuepfung.objects.filter(
        user=notification.destinataire, chat_id__isnull=False
    ).first()
    if verknuepfung is None:
        return
    try:
        telegram.sende_text(verknuepfung.chat_id, telegram.text_fuer(notification))
    except telegram.TelegramGesperrt:
        telegram.trenne(verknuepfung)


def _gruss_texte(prenom: str):
    from .email_cid import Texte

    de = Texte(
        titre=f"Alles Gute zum Geburtstag, {prenom}! 🎂",
        paragraphes=[
            "Heute ist dein Tag, und der ganze Verein feiert mit dir.",
            "Wir wünschen dir Gesundheit, Glück und viele schöne Momente, "
            "gemeinsam und für dich allein.",
            "Danke, dass du Teil der Clubistes in Deutschland bist. Auf viele weitere Jahre!",
            "Keine Geburtstagsgrüße mehr? Du kannst sie unter „Mein Profil“ › „Einstellungen“ "
            "abschalten.",
        ],
        cta="Zur App",
    )
    fr = Texte(
        titre=f"Joyeux anniversaire, {prenom} ! 🎂",
        paragraphes=[
            "Aujourd’hui, c’est ton jour, et tout le club le fête avec toi.",
            "Nous te souhaitons santé, bonheur et plein de beaux moments, "
            "ensemble comme en solo.",
            "Merci de faire partie des Clubistes in Deutschland. À de nombreuses années encore !",
            "Plus de vœux d’anniversaire ? Tu peux les désactiver dans « Mon profil » › "
            "« Paramètres ».",
        ],
        cta="Ouvrir l’application",
    )
    ar = Texte(
        titre=f"عيد ميلاد سعيد يا {prenom}! 🎂",
        paragraphes=[
            "اليوم يومك، والنادي كله يحتفل معك.",
            "نتمنى لك الصحة والسعادة والكثير من اللحظات الجميلة.",
            "شكرًا لأنك جزء من Clubistes in Deutschland. إلى سنوات كثيرة قادمة!",
            "لا ترغب في تلقي التهاني؟ يمكنك إيقافها من «ملفي الشخصي» ‹ «الإعدادات».",
        ],
        cta="فتح التطبيق",
    )
    return {"de": de, "fr": fr, "ar": ar}


def _heute_faellig(heute: datetime.date):
    """Mitglieder mit Geburtstag heute ; der 29. Februar wird in Nichtschaltjahren am 28.
    gefeiert."""
    from django.db.models import Q

    from apps.membres.models import Membre, StatutMembre

    tage = Q(date_naissance__month=heute.month, date_naissance__day=heute.day)
    if heute.month == 2 and heute.day == 28 and not calendar.isleap(heute.year):
        tage |= Q(date_naissance__month=2, date_naissance__day=29)
    return (
        Membre.objects.filter(tage, statut=StatutMembre.ACTIF, user__is_active=True)
        .exclude(user__isnull=True)
        .select_related("user")
    )


@shared_task
def sende_geburtstagsgruesse(heute: str | None = None) -> int:
    """Schickt aktiven Mitgliedern an ihrem Geburtstag eine Glückwunsch-Mail (DE/FR/AR). Pro
    Konto und Jahr höchstens einmal ; ein Mailfehler stoppt die übrigen nicht. Gibt die Anzahl
    gesendeter Mails zurück."""
    from .email_cid import envoyer_email_cid
    from .services import email_module_actif

    if not email_module_actif("membres"):
        return 0
    tag = datetime.date.fromisoformat(heute) if heute else datetime.date.today()
    gesendet = 0
    for membre in _heute_faellig(tag):
        user = membre.user
        if not user.email or (user.ui_praeferenzen or {}).get("geburtstagsgruss") is False:
            continue
        try:
            with transaction.atomic():
                Geburtstagsgruss.objects.create(user=user, jahr=tag.year)
        except IntegrityError:
            continue
        try:
            envoyer_email_cid(
                sujet="Alles Gute zum Geburtstag! · Joyeux anniversaire !",
                destinataire=user.email,
                textes=_gruss_texte(membre.prenom),
                lien="/",
                fail_silently=False,
            )
            gesendet += 1
        except Exception:
            Geburtstagsgruss.objects.filter(user=user, jahr=tag.year).delete()
            logger.exception("Geburtstagsgruß nicht gesendet")
    return gesendet
