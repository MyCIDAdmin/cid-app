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


class SichtbarkeitProjet(models.TextChoices):
    """Sichtbarkeit (ajoutée le 2026-10-06, demande utilisateur : "Nur die veröffentlichten
    dürfen für User sichtbar sein") — INDÉPENDANTE du statut de travail ci-dessus : un projet
    "en cours" peut rester interne, un projet "en préparation" peut déjà être annoncé. Un
    brouillon n'est visible que de l'équipe du projet et des gestionnaires (voir
    apps.projets.permissions.sichtbare_projekte)."""

    ENTWURF = "entwurf", _("Brouillon")
    VEROEFFENTLICHT = "veroeffentlicht", _("Publié")


class RolleProjet(models.TextChoices):
    LEITUNG = "leitung", _("Direction")
    MITARBEIT = "mitarbeit", _("Collaboration")
    BEOBACHTER = "beobachter", _("Observateur")


class StatutAufgabe(models.TextChoices):
    OFFEN = "offen", _("Ouverte")
    IN_ARBEIT = "in_arbeit", _("En cours")
    REVIEW = "review", _("En revue")
    ERLEDIGT = "erledigt", _("Terminée")


class PrioritaetAufgabe(models.TextChoices):
    NIEDRIG = "niedrig", _("Basse")
    NORMAL = "normal", _("Normale")
    HOCH = "hoch", _("Haute")


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

    sichtbarkeit = models.CharField(
        max_length=20,
        choices=SichtbarkeitProjet.choices,
        default=SichtbarkeitProjet.ENTWURF,
        verbose_name=_("Visibilité"),
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

    # Planjahr für die Budgetprüfung (Projekttopf der Finanzen). Leer = Jahr der Frist, sonst
    # Erstellungsjahr — siehe `budget_jahr`. Änderbar nur über die Aktion `planjahr`, die den
    # Projekttopf des Zieljahres prüft.
    plan_jahr = models.PositiveSmallIntegerField(null=True, blank=True)

    # Historische Daten / Migration (Nutzerwunsch 2026-10-06) : ein vergangenes Projekt kann mit
    # manuell erfasstem Beitrag angelegt werden, ohne einzelne Cotisation-Buchungen. Der Betrag
    # zählt zu `montant_collecte`, die Anzahl zu `nb_contributeurs` ; `historisch_jahr` ordnet den
    # Betrag der Jahresbilanz zu (leer = Jahr der Frist, sonst Erstellungsjahr).
    historisch_betrag = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
        verbose_name=_("Manuell erfasster Beitrag (Historie)"),
    )
    historisch_beitragende = models.PositiveIntegerField(
        default=0, verbose_name=_("Anzahl Beitragende (Historie)")
    )
    historisch_jahr = models.PositiveSmallIntegerField(
        null=True, blank=True, verbose_name=_("Jahr des historischen Beitrags")
    )

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
        indexes = [
            models.Index(fields=["statut"]),
            models.Index(fields=["sichtbarkeit"], name="projets_proj_sichtbk_idx"),
        ]

    def __str__(self):
        return self.titre

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Le·la responsable fait toujours partie de l'équipe, avec le rôle Direction (ajouté le
        # 2026-10-06). Un ancien responsable reste dans l'équipe : le retirer est un geste
        # explicite de la Direction, jamais un effet de bord d'un changement de responsable.
        if self.responsable_id:
            ProjetMitglied.objects.update_or_create(
                projet=self,
                membre_id=self.responsable_id,
                defaults={"rolle": RolleProjet.LEITUNG},
            )

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
        return (total or Decimal("0.00")) + self.historisch_betrag

    @property
    def historisch_jahr_effektiv(self) -> int:
        if self.historisch_jahr:
            return self.historisch_jahr
        if self.date_limite:
            return self.date_limite.year
        return (self.created_at or timezone.now()).year

    @property
    def nb_contributeurs(self) -> int:
        from apps.cotisations.models import Cotisation, StatutCotisation

        return (
            Cotisation.objects.filter(projet=self, statut=StatutCotisation.PAYEE)
            .values("membre_id")
            .distinct()
            .count()
        ) + self.historisch_beitragende

    @property
    def budget_jahr(self) -> int:
        if self.plan_jahr:
            return self.plan_jahr
        if self.date_limite:
            return self.date_limite.year
        return (self.created_at or timezone.now()).year

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


class ProjetMitglied(models.Model):
    """Membre de l'équipe interne d'un projet (ajouté le 2026-10-06). Seule l'équipe (plus les
    gestionnaires) voit l'espace de travail — tâches, coûts — d'un projet."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    projet = models.ForeignKey(Projet, on_delete=models.CASCADE, related_name="team")
    membre = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="projekt_mitgliedschaften"
    )
    rolle = models.CharField(
        max_length=20, choices=RolleProjet.choices, default=RolleProjet.MITARBEIT
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "projets_team"
        verbose_name = _("Membre de l'équipe projet")
        verbose_name_plural = _("Équipes projet")
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(fields=["projet", "membre"], name="projets_team_unique_membre")
        ]

    def __str__(self):
        return f"{self.membre} — {self.projet} ({self.rolle})"


class Aufgabe(models.Model):
    """Tâche d'un projet, affichée sur un tableau Kanban (ajouté le 2026-10-06). `ordre` =
    position dans la colonne de son statut."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    projet = models.ForeignKey(Projet, on_delete=models.CASCADE, related_name="aufgaben")
    titel = models.CharField(max_length=200)
    beschreibung = models.TextField(blank=True)
    verantwortlich = models.ForeignKey(
        "membres.Membre",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="projekt_aufgaben",
    )
    frist = models.DateField(null=True, blank=True)
    prioritaet = models.CharField(
        max_length=10, choices=PrioritaetAufgabe.choices, default=PrioritaetAufgabe.NORMAL
    )
    status = models.CharField(
        max_length=12, choices=StatutAufgabe.choices, default=StatutAufgabe.OFFEN
    )
    ordre = models.PositiveIntegerField(default=0)
    erledigt_am = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        "membres.Membre", on_delete=models.SET_NULL, null=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "projets_aufgaben"
        verbose_name = _("Tâche de projet")
        verbose_name_plural = _("Tâches de projet")
        ordering = ["ordre", "created_at"]
        indexes = [models.Index(fields=["projet", "status"], name="projets_aufg_proj_status_idx")]

    def __str__(self):
        return self.titel

    @property
    def ueberfaellig(self) -> bool:
        return bool(
            self.frist
            and self.status != StatutAufgabe.ERLEDIGT
            and self.frist < timezone.now().date()
        )


class AufgabeKommentar(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    aufgabe = models.ForeignKey(Aufgabe, on_delete=models.CASCADE, related_name="kommentare")
    text = models.TextField()
    autor = models.ForeignKey(
        "membres.Membre", on_delete=models.SET_NULL, null=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "projets_aufgaben_kommentare"
        verbose_name = _("Commentaire de tâche")
        verbose_name_plural = _("Commentaires de tâche")
        ordering = ["created_at"]


class PlanKosten(models.Model):
    """Coût prévu d'un projet par catégorie de dépense (ajouté le 2026-10-06). Les coûts réels
    ("Ist") ne sont PAS dupliqués ici : ce sont les `finances.Depense` approuvées liées au
    projet — une seule source de vérité, comparée au plan par `kosten-uebersicht`."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    projet = models.ForeignKey(Projet, on_delete=models.CASCADE, related_name="plankosten")
    categorie = models.ForeignKey(
        "finances.CategorieDepense", on_delete=models.PROTECT, related_name="+"
    )
    betrag = models.DecimalField(
        max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal("0.00"))]
    )
    notiz = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "projets_plankosten"
        verbose_name = _("Coût prévu")
        verbose_name_plural = _("Coûts prévus")
        ordering = ["categorie__ordre", "categorie__nom"]
        constraints = [
            models.UniqueConstraint(
                fields=["projet", "categorie"], name="projets_plankosten_unique_categorie"
            )
        ]

    def __str__(self):
        return f"{self.projet} — {self.categorie}: {self.betrag}"


class AktionAktivitaet(models.TextChoices):
    AUFGABE_ERSTELLT = "aufgabe_erstellt", _("Tâche créée")
    AUFGABE_VERSCHOBEN = "aufgabe_verschoben", _("Tâche déplacée")
    AUFGABE_ZUGEWIESEN = "aufgabe_zugewiesen", _("Tâche assignée")
    AUFGABE_GELOESCHT = "aufgabe_geloescht", _("Tâche supprimée")
    AUFGABE_KOMMENTIERT = "aufgabe_kommentiert", _("Tâche commentée")
    TEAM_HINZUGEFUEGT = "team_hinzugefuegt", _("Membre ajouté")
    TEAM_ROLLE = "team_rolle", _("Rôle modifié")
    TEAM_ENTFERNT = "team_entfernt", _("Membre retiré")
    SICHTBARKEIT = "sichtbarkeit", _("Visibilité modifiée")
    PLAN_GESETZT = "plan_gesetzt", _("Coût prévu défini")
    PLAN_ENTFERNT = "plan_entfernt", _("Coût prévu retiré")
    PLANJAHR = "planjahr", _("Année de planification modifiée")
    KOSTEN_ERFASST = "kosten_erfasst", _("Coût saisi")
    KOSTEN_GELOESCHT = "kosten_geloescht", _("Coût supprimé")


class ProjetAktivitaet(models.Model):
    """Aktivitätsprotokoll eines Projekts (append-only, 2026-10-07) : wer hat wann was getan.
    `akteur_name` ist eine Momentaufnahme, damit der Eintrag auch nach dem Löschen des Mitglieds
    lesbar bleibt ; `objekt` (Titel/Name) und `detail` sind kurze, sprachneutrale Angaben — der
    Satz selbst wird im Frontend aus `aktion` übersetzt. Das Protokoll hängt am Projekt (CASCADE).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    projet = models.ForeignKey(Projet, on_delete=models.CASCADE, related_name="aktivitaeten")
    zeitpunkt = models.DateTimeField(auto_now_add=True)
    akteur = models.ForeignKey(
        "membres.Membre", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    akteur_name = models.CharField(max_length=200, blank=True)
    aktion = models.CharField(max_length=30, choices=AktionAktivitaet.choices)
    objekt = models.CharField(max_length=200, blank=True)
    detail = models.CharField(max_length=200, blank=True)

    class Meta:
        db_table = "projets_aktivitaeten"
        verbose_name = _("Activité du projet")
        verbose_name_plural = _("Activités du projet")
        ordering = ["-zeitpunkt", "id"]
        indexes = [models.Index(fields=["projet", "-zeitpunkt"], name="projets_akt_proj_zeit_idx")]

    def __str__(self):
        return f"{self.projet} — {self.aktion}"
