"""
Modèles — app projets.

Module "Projets & Aktionen" (demande utilisateur du 2026-09-22) : des kacheln (tuiles) de
projets/actions associatives gérées par les admins (Bureau Admin+) et par le membre
"responsable" assigné à chaque projet — voir apps.projets.permissions.

Décisions de conception actées avec la demande :
  1. Kachel — carrousel d'images (ProjetImage, plusieurs par projet, rotation automatique
     côté frontend) + texte riche (description_html, saisi via un éditeur type Word côté
     frontend — voir docstring de champ ci-dessous pour ce qui est/n'est pas validé ici).
  2. Contribution libre — activable/désactivable par projet (`cagnote_active`). Réutilise le
     registre de paiement existant `apps.cotisations.Cotisation` (CLAUDE.md §8 : montant
     recalculé/validé côté serveur, jamais un nouveau système de paiement parallèle) via
     `TypeArticle.PROJET` et `Cotisation.projet` — voir apps.cotisations.models/serializers.
  3. Cagnote — `objectif_montant` (optionnel) est le SEUL champ stocké ici. Le montant
     ACTUELLEMENT collecté n'est JAMAIS dénormalisé/mis en cache : c'est une somme calculée à
     la volée sur le registre Cotisation (`Projet.montant_collecte`) pour qu'il ne puisse
     jamais diverger d'un paiement réellement confirmé — voir CotisationViewSet/
     notifier_paiement_confirme, qui ne connaissent d'ailleurs pas ce module (aucune cascade
     à maintenir ici).
  4. `date_limite` — échéance affichée côté frontend ; `echeance_depassee` ci-dessous est la
     seule règle serveur qui en dépend (bloque une nouvelle contribution, voir
     apps.cotisations.serializers.CotisationSerializer.validate).
  5. "Qui a contribué" (face arrière de la carte, demande utilisateur point 5) est dérivé de
     la même façon que le point 3 : `Cotisation.objects.filter(projet=X, statut=PAYEE)`,
     jamais un modèle de suivi séparé — voir apps.projets.serializers.ContributeurSerializer.
  6. Statut — voir StatutProjet ci-dessous.
  7. Rapport d'avancement — ProjetMiseAJour (+ProjetMiseAJourImage), "Was getan wurde".
  8. "Dynamique" — hors du périmètre des modèles (rendu/animations côté frontend).

Le texte riche (description du projet, contenu des mises à jour) est stocké en HTML tel que
produit par l'éditeur TipTap du frontend (contenu réservé aux admins/responsables — pas un
champ ouvert à tout membre) ; aucune sanitization HTML côté serveur dans cette première
version, à revisiter si ce module s'ouvre un jour à du contenu saisi par un rôle non
habilité (voir apps.communaute pour un précédent de contenu "riche" non admin, traité en
texte simple, pas HTML).
"""

import uuid
from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Sum
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from .storage import ProjetsStorage


def projet_image_upload_path(instance, filename):
    return f"kachel/{instance.projet_id}/{uuid.uuid4()}_{filename}"


def mise_a_jour_image_upload_path(instance, filename):
    return (
        f"mises-a-jour/{instance.mise_a_jour.projet_id}/{instance.mise_a_jour_id}/"
        f"{uuid.uuid4()}_{filename}"
    )


class StatutProjet(models.TextChoices):
    """Statut du projet/action — demande utilisateur point 6. `EN_PREPARATION` reste masqué
    aux membres normaux (voir ProjetPermission/ProjetViewSet.get_queryset), même principe que
    CampagneAdhesion.statut="brouillon" ou Produit.statut="brouillon"."""

    EN_PREPARATION = "en_preparation", _("En préparation")
    EN_COURS = "en_cours", _("En cours")
    TERMINE = "termine", _("Terminé")
    ANNULE = "annule", _("Annulé")


class Projet(models.Model):
    """Un projet/action — une "kachel" (demande utilisateur point 1)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    titre = models.CharField(max_length=200)
    # Texte riche saisi via l'éditeur type Word du frontend (demande utilisateur point 1.2) —
    # voir docstring de module.
    description_html = models.TextField(blank=True)

    statut = models.CharField(
        max_length=20, choices=StatutProjet.choices, default=StatutProjet.EN_PREPARATION
    )

    # Le·la responsable peut gérer les images/mises à jour de CE projet au même titre qu'un
    # Bureau Admin+ (demande utilisateur point 1.1 "Admin und der Verantwortliche") — voir
    # apps.projets.permissions. SET_NULL (jamais CASCADE) : un projet ne disparaît pas si le
    # membre responsable est supprimé.
    responsable = models.ForeignKey(
        "membres.Membre",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="projets_geres",
        verbose_name=_("Responsable"),
    )

    # Demande utilisateur point 2 : "Es muss möglich sein freie Beiträge pro Projekt zu
    # zahlen. Diese Option soll ein- und ausschaltbar sein."
    cagnote_active = models.BooleanField(
        default=False,
        verbose_name=_("Contributions libres activées"),
        help_text=_("Autorise les membres à verser une contribution libre à ce projet."),
    )
    # Demande utilisateur point 3 — objectif seul stocké, voir docstring de module pour le
    # montant collecté (jamais dénormalisé).
    objectif_montant = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.01"))],
        verbose_name=_("Objectif de la cagnote"),
        help_text=_("Optionnel — la barre de progression reste masquée si vide."),
    )
    # Demande utilisateur point 4.
    date_limite = models.DateField(null=True, blank=True, verbose_name=_("Date limite"))

    ordre = models.PositiveIntegerField(default=0)

    created_by = models.ForeignKey(
        "membres.Membre",
        on_delete=models.SET_NULL,
        null=True,
        related_name="projets_crees",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "projets_projets"
        verbose_name = _("Projet / Action")
        verbose_name_plural = _("Projets / Actions")
        ordering = ["ordre", "-created_at"]
        indexes = [models.Index(fields=["statut"])]

    def __str__(self):
        return self.titre

    @property
    def montant_collecte(self) -> Decimal:
        """Somme des contributions PAYÉES liées à ce projet — jamais dénormalisé, voir
        docstring de module point 3."""
        # Import différé : évite une dépendance circulaire au chargement des apps
        # (apps.cotisations importe déjà apps.projets pour son FK Cotisation.projet — voir
        # apps.cotisations.models).
        from apps.cotisations.models import Cotisation, StatutCotisation

        total = Cotisation.objects.filter(projet=self, statut=StatutCotisation.PAYEE).aggregate(
            total=Sum("montant")
        )["total"]
        return total or Decimal("0.00")

    @property
    def nb_contributeurs(self) -> int:
        from apps.cotisations.models import Cotisation, StatutCotisation

        return (
            Cotisation.objects.filter(projet=self, statut=StatutCotisation.PAYEE)
            .values("membre_id")
            .distinct()
            .count()
        )

    @property
    def echeance_depassee(self) -> bool:
        """Seule règle serveur dépendant de `date_limite` (demande utilisateur point 4) —
        bloque une nouvelle contribution, voir apps.cotisations.serializers.
        CotisationSerializer.validate (TypeArticle.PROJET)."""
        return bool(self.date_limite and self.date_limite < timezone.localdate())


class ProjetImage(models.Model):
    """Image de la kachel — plusieurs par projet, affichées en carrousel auto-rotatif côté
    frontend (demande utilisateur point 1.1)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    projet = models.ForeignKey(Projet, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to=projet_image_upload_path, storage=ProjetsStorage())
    ordre = models.PositiveIntegerField(default=0)
    uploaded_by = models.ForeignKey(
        "membres.Membre", on_delete=models.SET_NULL, null=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "projets_images"
        verbose_name = _("Image de projet")
        verbose_name_plural = _("Images de projet")
        ordering = ["ordre", "created_at"]


class ProjetMiseAJour(models.Model):
    """Une entrée du rapport d'avancement — "Was getan wurde" (demande utilisateur point 7)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    projet = models.ForeignKey(Projet, on_delete=models.CASCADE, related_name="mises_a_jour")
    titre = models.CharField(max_length=200)
    contenu_html = models.TextField(blank=True)
    created_by = models.ForeignKey(
        "membres.Membre", on_delete=models.SET_NULL, null=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "projets_mises_a_jour"
        verbose_name = _("Mise à jour de projet")
        verbose_name_plural = _("Mises à jour de projet")
        ordering = ["-created_at"]


class ProjetMiseAJourImage(models.Model):
    """Image jointe à une mise à jour du rapport (demande utilisateur point 7, "mit Bildern")."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    mise_a_jour = models.ForeignKey(
        ProjetMiseAJour, on_delete=models.CASCADE, related_name="images"
    )
    image = models.ImageField(upload_to=mise_a_jour_image_upload_path, storage=ProjetsStorage())
    ordre = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "projets_mises_a_jour_images"
        verbose_name = _("Image de mise à jour")
        verbose_name_plural = _("Images de mise à jour")
        ordering = ["ordre", "created_at"]
