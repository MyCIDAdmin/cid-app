"""R36 : Die tägliche Aufgabe löscht Kinderdaten nicht mehr, sondern anonymisiert die Personendaten
von Familienpaketen (Historie und Berichte bleiben). Benennt die geplante Aufgabe um und zeigt auf
die neue Celery-Aufgabe. Idempotent und umkehrbar."""

from django.db import migrations

ALT = ("adhesions.loeschen_kinderdaten", "apps.adhesions.tasks.loeschen_kinderdaten")
NEU = (
    "adhesions.anonymisiere_familiendaten",
    "apps.adhesions.tasks.anonymisiere_familiendaten",
    "Anonymisiert Personendaten von Familienpaketen nach Ablauf der Aufbewahrungsfrist.",
)


def vor(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name=ALT[0]).update(
        name=NEU[0], task=NEU[1], description=NEU[2]
    )


def zurueck(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name=NEU[0]).update(
        name=ALT[0],
        task=ALT[1],
        description="Löscht Kinderdaten von Familienpaketen nach Ablauf der Aufbewahrungsfrist.",
    )


class Migration(migrations.Migration):
    dependencies = [
        ("adhesions", "0012_familienpaket_v3"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]
    operations = [migrations.RunPython(vor, zurueck)]
