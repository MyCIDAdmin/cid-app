import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0006_registration_decided_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="ui_praeferenzen",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="devicesession",
            name="user_agent",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="devicesession",
            name="ip_address",
            field=models.GenericIPAddressField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="devicesession",
            name="last_seen_at",
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
    ]
