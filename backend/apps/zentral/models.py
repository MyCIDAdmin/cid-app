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
