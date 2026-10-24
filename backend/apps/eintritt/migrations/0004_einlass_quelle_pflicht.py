from django.db import migrations, models


class Migration(migrations.Migration):
    """Eigene Migration : die Bedingung wird erst nach dem Auffüllen in 0003 (und in einer
    eigenen Transaktion) angelegt, sonst blockieren offene Fremdschlüssel-Prüfungen das ALTER."""

    dependencies = [
        ("eintritt", "0003_anwesenheit_ohne_ticket"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="einlass",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    models.Q(("inscription__isnull", False), ("teilnahme__isnull", True)),
                    models.Q(("inscription__isnull", True), ("teilnahme__isnull", False)),
                    _connector="OR",
                ),
                name="eintritt_einlass_genau_eine_quelle",
            ),
        ),
    ]
