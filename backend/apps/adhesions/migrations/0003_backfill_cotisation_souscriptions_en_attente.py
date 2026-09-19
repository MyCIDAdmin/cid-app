"""
Backfill (ajouté le 2026-09-19, retour utilisateur : "Die Zahlung taucht nicht im Modul
Ausstehende Zahlungen") — voir apps.adhesions.services.synchroniser_cotisation, appelée depuis ce
jour à chaque transition de statut d'une Souscription, mais qui ne peut évidemment pas rattraper
les souscriptions déjà bloquées en `en_attente_paiement` sans Cotisation liée AVANT ce correctif
(ex. la souscription "CID PLUS"/Campagne 2027 signalée par l'utilisateur). Cette migration de
données crée, une fois, la Cotisation manquante pour chacune d'elles — même logique que
synchroniser_cotisation (montant/libellé), dupliquée ici plutôt qu'importée : une migration de
données ne doit jamais dépendre du code applicatif courant, qui peut changer après coup.
"""

from django.db import migrations


def creer_cotisations_manquantes(apps, schema_editor):
    Souscription = apps.get_model("adhesions", "Souscription")
    Cotisation = apps.get_model("cotisations", "Cotisation")

    a_lier = Souscription.objects.filter(
        statut="en_attente_paiement", cotisation__isnull=True
    ).select_related("membre", "offre", "campagne")
    for souscription in a_lier:
        cotisation = Cotisation.objects.create(
            membre=souscription.membre,
            type_article="adhesion",
            libelle=f"Adhésion {souscription.campagne.nom} — {souscription.offre.nom}",
            montant=souscription.prix_paye,
            statut="en_attente",
        )
        souscription.cotisation = cotisation
        souscription.save(update_fields=["cotisation"])


def revenir_en_arriere(apps, schema_editor):
    # Rien à défaire : une Cotisation "en_attente" laissée par cette migration en avant reste une
    # écriture financière valide (append-only, voir apps.cotisations.models.Cotisation) — la
    # supprimer au retour arrière romprait ce principe pour un simple no-op de migrate --backward.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("adhesions", "0002_justificatifrabais"),
        ("cotisations", "0007_historiquestatutcotisation"),
    ]

    operations = [
        migrations.RunPython(creer_cotisations_manquantes, revenir_en_arriere),
    ]
