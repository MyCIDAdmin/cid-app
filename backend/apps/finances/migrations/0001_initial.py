import uuid
from decimal import Decimal

import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

import apps.adhesions.storage
import apps.finances.models

CATEGORIES_PAR_DEFAUT = [
    "Location de salle / lieu",
    "Restauration / traiteur",
    "Transport",
    "Matériel et fournitures",
    "Communication / impression",
    "Frais bancaires et de paiement",
    "Hébergement du site (technique)",
    "Assurance et frais administratifs",
    "Autres",
]


def seed_categories(apps_registry, schema_editor):
    Categorie = apps_registry.get_model("finances", "CategorieDepense")
    for ordre, nom in enumerate(CATEGORIES_PAR_DEFAUT):
        Categorie.objects.get_or_create(nom=nom, defaults={"ordre": ordre})


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("evenements", "0008_covoiturage_lieu_rendez_vous_maps_url_and_more"),
        ("projets", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="CategorieDepense",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("nom", models.CharField(max_length=100, unique=True)),
                ("actif", models.BooleanField(default=True)),
                ("ordre", models.PositiveSmallIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "verbose_name": "Catégorie de dépense",
                "verbose_name_plural": "Catégories de dépense",
                "ordering": ["ordre", "nom"],
            },
        ),
        migrations.CreateModel(
            name="Depense",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("date_depense", models.DateField()),
                ("montant", models.DecimalField(decimal_places=2, max_digits=10, validators=[django.core.validators.MinValueValidator(Decimal("0.01"))])),
                ("fournisseur", models.CharField(max_length=200)),
                ("description", models.TextField(blank=True)),
                ("justificatif", models.FileField(blank=True, null=True, storage=apps.adhesions.storage.JustificatifsStorage(), upload_to=apps.finances.models.depense_justificatif_path)),
                ("statut", models.CharField(choices=[("en_attente", "En attente d'approbation"), ("approuvee", "Approuvée"), ("rejetee", "Rejetée")], default="en_attente", max_length=20)),
                ("date_decision", models.DateTimeField(blank=True, null=True)),
                ("motif_rejet", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("categorie", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="depenses", to="finances.categoriedepense")),
                ("decide_par", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="depenses_decidees", to=settings.AUTH_USER_MODEL)),
                ("evenement", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="depenses", to="evenements.evenement")),
                ("projet", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="depenses", to="projets.projet")),
                ("saisie_par", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="depenses_saisies", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-date_depense", "-created_at"]},
        ),
        migrations.CreateModel(
            name="BudgetAnnuel",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("annee", models.PositiveSmallIntegerField()),
                ("montant", models.DecimalField(decimal_places=2, max_digits=10, validators=[django.core.validators.MinValueValidator(Decimal("0.00"))])),
                ("categorie", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="budgets", to="finances.categoriedepense")),
            ],
            options={"ordering": ["annee", "categorie__ordre"]},
        ),
        migrations.AddIndex(
            model_name="depense",
            index=models.Index(fields=["date_depense", "statut"], name="finances_dep_date_statut_idx"),
        ),
        migrations.AddConstraint(
            model_name="budgetannuel",
            constraint=models.UniqueConstraint(fields=("annee", "categorie"), name="uniq_budget_annee_cat"),
        ),
        migrations.RunPython(seed_categories, migrations.RunPython.noop),
    ]
