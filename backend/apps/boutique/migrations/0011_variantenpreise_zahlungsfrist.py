"""Release 6 (2026-10-12): Preis pro Variante, Zahlungsfrist für Reservierungen mit Zahlung,
planmäßiger Verfall unbezahlter Reservierungs-Bestellungen."""

import django.core.validators
from decimal import Decimal
from django.db import migrations, models

TASK_NAME = "boutique.verfallene_zahlungen_stornieren"


def planen(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    zeitplan, _ = CrontabSchedule.objects.get_or_create(
        minute="15",
        hour="*",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="Europe/Berlin",
    )
    PeriodicTask.objects.get_or_create(
        name=TASK_NAME,
        defaults={
            "task": "apps.boutique.tasks.verfallene_zahlungen_stornieren",
            "crontab": zeitplan,
            "enabled": True,
            "description": "Unbezahlte Reservierungs-Bestellungen nach Ablauf der Zahlungsfrist stornieren.",  # noqa: E501
        },
    )


def entplanen(apps, schema_editor):
    apps.get_model("django_celery_beat", "PeriodicTask").objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("boutique", "0010_produit_reservierung"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [
        migrations.AddField(
            model_name="varianteproduit",
            name="prix",
            field=models.DecimalField(
                blank=True, decimal_places=2, max_digits=8, null=True,
                validators=[django.core.validators.MinValueValidator(Decimal("0.00"))],
                help_text="Eigener Preis dieser Variante (Release 6); leer = Preis des Produkts.",
            ),
        ),
        migrations.AddField(
            model_name="varianteproduit",
            name="prix_membre",
            field=models.DecimalField(
                blank=True, decimal_places=2, max_digits=8, null=True,
                validators=[django.core.validators.MinValueValidator(Decimal("0.00"))],
                help_text="Eigener Mitgliederpreis dieser Variante; leer = siehe Produkt.",
            ),
        ),
        migrations.AddField(
            model_name="produit",
            name="reservierung_zahlungsfrist_tage",
            field=models.PositiveSmallIntegerField(
                blank=True, null=True,
                validators=[
                    django.core.validators.MinValueValidator(1),
                    django.core.validators.MaxValueValidator(90),
                ],
                help_text=(
                    "Nur Modus „Reservieren und bezahlen“ (Release 6): Tage bis zur Zahlung. Wird die "
                    "Bestellung bis dahin nicht bezahlt, verfällt sie automatisch und die Menge wird "
                    "freigegeben. Leer = kein automatischer Verfall."
                ),
            ),
        ),
        migrations.AddField(
            model_name="commande",
            name="zahlung_bis",
            field=models.DateTimeField(
                blank=True, null=True,
                help_text=(
                    "Release 6: Zahlungsfrist einer Reservierung (Modus „Reservieren und bezahlen“). "
                    "Unbezahlte Bestellungen werden danach automatisch storniert (Menge wird frei)."
                ),
            ),
        ),
        migrations.RunPython(planen, entplanen),
    ]
