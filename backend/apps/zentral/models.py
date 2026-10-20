"""Zentrale Einstellungen (eine Zeile, pk=1) — Werte, die der App-Administrator ohne neues
Release ändern können soll (Wunsch vom 2026-10-20: „Dauer zentral umstellbar“)."""

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _


class ZentraleEinstellungen(models.Model):
    id = models.AutoField(primary_key=True)

    warenkorb_reservierung_minuten = models.PositiveSmallIntegerField(
        default=20,
        validators=[MinValueValidator(1), MaxValueValidator(1440)],
        verbose_name=_("Warenkorb-Reservierung (Minuten)"),
        help_text=_(
            "So lange sind Artikel im Warenkorb reserviert; jedes Hinzufügen setzt den "
            "Countdown zurück."
        ),
    )

    warenkorb_max_erneuerungen = models.PositiveSmallIntegerField(
        default=2,
        validators=[MaxValueValidator(10)],
        verbose_name=_("Warenkorb: erneute Reservierungen"),
        help_text=_(
            "Wie oft eine abgelaufene Reservierung per „Erneut reservieren“ verlängert werden "
            "darf. Läuft sie danach noch einmal ab, wird der Warenkorb geleert (0 = sofort)."
        ),
    )

    event_zahlungsfrist_tage = models.PositiveSmallIntegerField(
        default=2,
        validators=[MinValueValidator(1), MaxValueValidator(30)],
        verbose_name=_("Zahlungsfrist Veranstaltungen (Tage)"),
        help_text=_(
            "Bei Veranstaltungen mit begrenzter Teilnehmerzahl muss die Teilnahme innerhalb "
            "dieser Frist bezahlt werden, sonst wird die Anmeldung storniert und die Warteliste "
            "rückt nach."
        ),
    )

    # --- Hinweise im Modul „Übersicht“ (2026-10-20) — Schwellen, ab denen automatisch ein
    # motivierender Hinweis erscheint (Veranstaltung/Aktion bald, Plätze knapp, Artikel knapp).
    hinweis_tage_vorher = models.PositiveSmallIntegerField(
        default=7,
        validators=[MinValueValidator(1), MaxValueValidator(60)],
        verbose_name=_("Hinweis: Tage vor Termin/Frist"),
    )
    hinweis_plaetze_absolut = models.PositiveSmallIntegerField(
        default=5,
        validators=[MinValueValidator(1), MaxValueValidator(100)],
        verbose_name=_("Hinweis: höchstens so viele freie Plätze"),
    )
    hinweis_plaetze_prozent = models.PositiveSmallIntegerField(
        default=20,
        validators=[MinValueValidator(1), MaxValueValidator(100)],
        verbose_name=_("Hinweis: höchstens so viel Prozent freie Plätze"),
    )
    hinweis_lager_menge = models.PositiveSmallIntegerField(
        default=5,
        validators=[MinValueValidator(1), MaxValueValidator(100)],
        verbose_name=_("Hinweis: Artikel mit höchstens so vielen Stück"),
    )
    hinweis_max_anzahl = models.PositiveSmallIntegerField(
        default=3,
        validators=[MinValueValidator(1), MaxValueValidator(10)],
        verbose_name=_("Hinweis: maximale Anzahl gleichzeitig"),
    )

    modifie_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "zentral_einstellungen"
        verbose_name = _("Zentrale Einstellungen")
        verbose_name_plural = _("Zentrale Einstellungen")

    def __str__(self):
        return "Zentrale Einstellungen"

    @classmethod
    def get_solo(cls) -> "ZentraleEinstellungen":
        obj, _created = cls.objects.get_or_create(pk=1)
        return obj
