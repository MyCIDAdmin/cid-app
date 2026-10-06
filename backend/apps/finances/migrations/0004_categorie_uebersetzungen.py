from django.db import migrations, models

# Übersetzungen der beim Start angelegten Standardkategorien (Schlüssel = französischer Name).
UEBERSETZUNGEN = {
    "Location de salle / lieu": ("Raum- / Ortsmiete", "إيجار القاعة / المكان"),
    "Restauration / traiteur": ("Verpflegung / Catering", "الإطعام / خدمات الضيافة"),
    "Transport": ("Transport", "النقل"),
    "Matériel et fournitures": ("Material und Bedarf", "المعدات والمستلزمات"),
    "Communication / impression": ("Kommunikation / Druck", "الاتصال / الطباعة"),
    "Frais bancaires et de paiement": ("Bank- und Zahlungsgebühren", "الرسوم المصرفية ورسوم الدفع"),
    "Hébergement du site (technique)": ("Website-Hosting (technisch)", "استضافة الموقع (تقنية)"),
    "Assurance et frais administratifs": (
        "Versicherung und Verwaltungskosten",
        "التأمين والمصاريف الإدارية",
    ),
    "Autres": ("Sonstiges", "أخرى"),
}


def uebersetzungen_eintragen(apps, schema_editor):
    Kategorie = apps.get_model("finances", "CategorieDepense")
    for nom, (de, ar) in UEBERSETZUNGEN.items():
        # Nur leere Felder füllen — vom Admin bereits gepflegte Namen bleiben unberührt.
        Kategorie.objects.filter(nom=nom, nom_de="").update(nom_de=de)
        Kategorie.objects.filter(nom=nom, nom_ar="").update(nom_ar=ar)


class Migration(migrations.Migration):
    dependencies = [("finances", "0003_depense_aufgabe")]

    operations = [
        migrations.AddField(
            model_name="categoriedepense",
            name="nom_de",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
        migrations.AddField(
            model_name="categoriedepense",
            name="nom_ar",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
        migrations.RunPython(uebersetzungen_eintragen, migrations.RunPython.noop),
    ]
