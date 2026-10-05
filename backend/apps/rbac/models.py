"""
Modèles — app rbac (ajouté le 2026-09-23, demande utilisateur : "Im Modul Rollenverwaltung einen
Tab hinzufügen um [...] Rollen definieren [...] Zugriff auf Module erteilen [...] Modul
Verwaltung").

Ce module est strictement ADDITIF par rapport au système de rôles existant
(`apps.accounts.models.Role`, `ROLE_LEVELS`, `User.role`) — voir apps.py pour la justification
complète du découpage en app séparée. Aucun champ existant de `User` n'est modifié, aucune
`permissions.py` bespoke des 10 apps métier n'est réécrite : ce module ajoute une porte
supplémentaire (la matrice), jamais un remplacement de la logique déjà en place.

Vue d'ensemble des 4 modèles :
  - `RoleDefinition` : les rôles eux-mêmes, désormais admin-définissables. Les 5 rôles système
    existants (membre/rh/bureau_admin/dir_financier/super_admin) y sont représentés comme des
    lignes protégées (`is_system=True`, slug figé = valeur de `accounts.Role`) — leur
    comportement spécial (2FA obligatoire, IsRHOrAbove, etc.) continue de vivre exactement comme
    avant dans apps.accounts, piloté par le CharField `User.role` legacy, jamais par ce modèle.
  - `UserRoleAssignment` : table d'association User × RoleDefinition — permet à un utilisateur
    d'avoir PLUSIEURS rôles (nouveauté demandée), sans toucher au schéma de `users` (table la plus
    sensible du projet : chiffrement, 2FA, JWT). `on_delete=PROTECT` empêche de supprimer un rôle
    encore attribué à quelqu'un.
  - `RoleModulePermission` : la matrice proprement dite — pour chaque (rôle, module), un niveau
    d'accès parmi aucun/lecture/lecture_ecriture. Voir `registry.py` pour pourquoi le module est
    un simple CharField (auto-extension sans migration).
  - `ModuleVisibiliteMembre` : liste séparée, indépendante de la matrice ci-dessus (décision
    utilisateur confirmée) — quels modules apparaissent dans le menu spécifiquement pour le rôle
    système "Membre Normal". Un module que la matrice autorise en lecture pour "membre" peut très
    bien rester masqué ici (ex. Vote pas encore ouvert au grand public) et inversement.
"""

import uuid

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class RoleDefinition(models.Model):
    """Un rôle, système ou personnalisé. Voir docstring de module pour la distinction avec
    `accounts.models.Role` (l'enum figé qui pilote toujours `User.role` et la logique spéciale
    des 5 rôles historiques)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slug = models.SlugField(max_length=50, unique=True)
    nom = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    # Rôle système = un des 5 rôles historiques (accounts.Role) : slug figé, non éditable ni
    # supprimable via l'API rbac (voir permissions/views) — sa logique spéciale vit ailleurs.
    is_system = models.BooleanField(default=False)
    # Ordre d'affichage uniquement (ex. dans la matrice) — PAS une hiérarchie/niveau comme
    # ROLE_LEVELS : un rôle personnalisé n'a pas de notion de "niveau", seulement les accès
    # module par module que la matrice lui accorde explicitement.
    ordre = models.PositiveSmallIntegerField(default=0)
    actif = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "rbac_role_definitions"
        verbose_name = _("Rôle")
        verbose_name_plural = _("Rôles")
        ordering = ["ordre", "nom"]

    def __str__(self):
        return self.nom


class UserRoleAssignment(models.Model):
    """Association User × RoleDefinition — remplace la notion "un seul rôle par utilisateur"
    (jusqu'ici portée uniquement par le CharField `User.role`) par une relation many-to-many,
    SANS toucher au schéma de `users`. Voir services.get_user_role_slugs : le CharField legacy
    fait toujours partie de l'ensemble effectif des rôles d'un utilisateur, avec ou sans ligne
    ici — garantit qu'un compte jamais passé par la nouvelle UI d'attribution continue de se
    comporter exactement comme avant."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="role_assignments"
    )
    role = models.ForeignKey(
        RoleDefinition, on_delete=models.PROTECT, related_name="user_assignments"
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "rbac_user_role_assignments"
        verbose_name = _("Attribution de rôle")
        verbose_name_plural = _("Attributions de rôle")
        constraints = [
            models.UniqueConstraint(fields=["user", "role"], name="une_seule_ligne_par_user_role")
        ]

    def __str__(self):
        return f"{self.user_id} — {self.role.slug}"


class NiveauAcces(models.TextChoices):
    AUCUN = "aucun", _("Aucun accès")
    LECTURE = "lecture", _("Lecture seule")
    LECTURE_ECRITURE = "lecture_ecriture", _("Lecture et écriture")


class RoleModulePermission(models.Model):
    """Une cellule de la matrice Rôle × Module (voir registry.MODULES pour la liste des modules
    valides — validée côté serializer, pas de `choices` DB, pour que l'ajout d'un module n'exige
    aucune migration). Une absence de ligne pour un (rôle, module) donné équivaut à `aucun` — voir
    services.user_has_module_access, qui applique ce défaut."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.ForeignKey(
        RoleDefinition, on_delete=models.CASCADE, related_name="module_permissions"
    )
    module = models.CharField(max_length=50)
    niveau_acces = models.CharField(
        max_length=20, choices=NiveauAcces.choices, default=NiveauAcces.AUCUN
    )
    updated_at = models.DateTimeField(auto_now=True)
    modifie_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "rbac_role_module_permissions"
        verbose_name = _("Permission de module")
        verbose_name_plural = _("Permissions de module")
        constraints = [
            models.UniqueConstraint(
                fields=["role", "module"], name="une_seule_cellule_par_role_module"
            )
        ]

    def __str__(self):
        return f"{self.role.slug} / {self.module} = {self.niveau_acces}"


class ModuleVisibiliteMembre(models.Model):
    """Liste d'affichage/masquage du menu, spécifique au rôle système "Membre Normal"
    (décision utilisateur confirmée : indépendante de RoleModulePermission, jamais dérivée de la
    matrice — un module lisible par "membre" dans la matrice peut très bien rester masqué ici).
    Une absence de ligne pour un module équivaut à `visible=True` (comportement actuel inchangé
    tant que l'Admin App ne masque rien explicitement) — voir services/views, même principe de
    complétion par défaut que RoleModulePermission."""

    id = models.AutoField(primary_key=True)
    module = models.CharField(max_length=50, unique=True)
    visible = models.BooleanField(default=True)
    # Point 9 (2026-10-05) : 2e colonne pour un utilisateur connecté mais pas (encore) membre
    # actif. NULL = défaut de registry.VISIBILITE_NON_MEMBRE_DEFAUT (pas de migration de données
    # nécessaire, comportement voulu dès le déploiement).
    visible_non_membre = models.BooleanField(
        null=True,
        blank=True,
        verbose_name=_("Visible pour non-membre"),
        help_text=_("Vide = valeur par défaut (visible pour 5 modules, voir registry)."),
    )
    updated_at = models.DateTimeField(auto_now=True)
    modifie_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "rbac_module_visibilite_membre"
        verbose_name = _("Visibilité de module (Membre Normal)")
        verbose_name_plural = _("Visibilité de modules (Membre Normal)")

    def __str__(self):
        return f"{self.module} : {'visible' if self.visible else 'masqué'}"
