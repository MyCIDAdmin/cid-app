"""
Backfill (ajouté le 2026-09-20, retour utilisateur : "Confirmer et payer" doit sauter
directement au paiement) — voir apps.evenements.services.synchroniser_cotisation, appelée depuis
ce jour à chaque transition de statut d'une Inscription, mais qui ne peut évidemment pas rattraper
les inscriptions déjà bloquées en `en_attente_paiement` sans Cotisation liée AVANT ce correctif.
Même principe que apps.adhesions.migrations.0003 (même jour de la veille, même diagnostic) —
duplique la logique de synchroniser_cotisation plutôt que de l'importer : une migration de
données ne doit jamais dépendre du code applicatif courant, qui peut changer après coup.
"""

from django.db import migrations


def creer_cotisations_manquantes(apps, schema_editor):
    Inscription = apps.get_model("evenements", "Inscription")
    Cotisation = apps.get_model("cotisations", "Cotisation")

    a_lier = Inscription.objects.filter(
        statut="en_attente_paiement", cotisation__isnull=True
    ).select_related("membre", "evenement")
    for inscription in a_lier:
        cotisation = Cotisation.objects.create(
            membre=inscription.membre,
            type_article="evenement",
            libelle=f"Inscription — {inscription.evenement.titre}",
            montant=inscription.montant_paye,
            statut="en_attente",
        )
        inscription.cotisation = cotisation
        inscription.save(update_fields=["cotisation"])


def revenir_en_arriere(apps, schema_editor):
    # Rien à défaire : une Cotisation "en_attente" laissée par cette migration en avant reste une
    # écriture financière valide (append-only) — même raison que apps.adhesions.migrations.0003.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("evenements", "0002_planifier_rappels_evenements"),
        ("cotisations", "0007_historiquestatutcotisation"),
    ]

    operations = [
        migrations.RunPython(creer_cotisations_manquantes, revenir_en_arriere),
    ]
