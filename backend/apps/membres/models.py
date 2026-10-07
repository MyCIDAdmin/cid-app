"""
Modèles — app membres.

R1 P0 — CRUD membres, 5 rôles RBAC, chiffrement CIN/passeport AES-256, import Excel (FDD §3.1,
RICEFW C-001/W-008).

Périmètre de ce module (voir SDD §3.1, SCD §5.1) :
  - Un Membre porte les données personnelles étendues (identité, adresse, pièces d'identité).
    Le compte de connexion (email, mot de passe, rôle) reste sur apps.accounts.User — relation
    1-to-1, volontairement nullable : l'import initial (RICEFW C-001, ~300 lignes historiques)
    crée des fiches Membre avant que chaque personne n'ait un compte utilisateur.
  - cin/passeport sont chiffrés au repos (AES-256-GCM via django-encrypted-model-fields,
    SECRET_FIELD_KEY) — jamais stockés ou loggés en clair ailleurs que dans ces champs.
"""

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from encrypted_model_fields.fields import EncryptedCharField

from apps.membres.storage import MembrePhotoStorage

# Platzhalter-CIN für Mitglieder ohne bekannte Ausweisnummer (Import, Entscheidung vom
# 2026-10-07). Kein echter Identifikator: zählt weder als Duplikat noch als Treffer beim Zuordnen.
CIN_PLATZHALTER = "00000000"


class StatutMembre(models.TextChoices):
    """Statut associatif — formulaire fiche membre (mockup pg-admin-nouveau-membre)."""

    ACTIF = "actif", _("Actif")
    EN_ATTENTE = "en_attente", _("En attente")
    INACTIF = "inactif", _("Inactif")


class Sexe(models.TextChoices):
    HOMME = "homme", _("Homme")
    FEMME = "femme", _("Femme")
    NON_RENSEIGNE = "non_renseigne", _("Non renseigné")


class Bundesland(models.TextChoices):
    """16 Länder allemands — liste complète (le mockup n'en montre qu'un extrait à titre
    d'exemple UI, la donnée réelle doit couvrir tous les Länder)."""

    BADEN_WURTTEMBERG = "BW", _("Baden-Württemberg")
    BAYERN = "BY", _("Bayern")
    BERLIN = "BE", _("Berlin")
    BRANDENBURG = "BB", _("Brandenburg")
    BREMEN = "HB", _("Bremen")
    HAMBURG = "HH", _("Hamburg")
    HESSEN = "HE", _("Hessen")
    MECKLENBURG_VORPOMMERN = "MV", _("Mecklenburg-Vorpommern")
    NIEDERSACHSEN = "NI", _("Niedersachsen")
    NORDRHEIN_WESTFALEN = "NW", _("Nordrhein-Westfalen")
    RHEINLAND_PFALZ = "RP", _("Rheinland-Pfalz")
    SAARLAND = "SL", _("Saarland")
    SACHSEN = "SN", _("Sachsen")
    SACHSEN_ANHALT = "ST", _("Sachsen-Anhalt")
    SCHLESWIG_HOLSTEIN = "SH", _("Schleswig-Holstein")
    THUERINGEN = "TH", _("Thüringen")


class Pays(models.TextChoices):
    """Pays de résidence du membre — liste volontairement curatée (pas l'ISO 3166 complet) :
    l'association regroupe des supporters tunisiens principalement établis en Allemagne, avec
    une diaspora ponctuellement présente ailleurs en Europe (retour d'expérience terrain,
    2026-09). ALLEMAGNE reste la valeur par défaut : les fiches existantes et l'import Excel
    historique (RICEFW C-001) supposent toutes un membre résidant en Allemagne."""

    ALLEMAGNE = "DE", _("Allemagne")
    TUNISIE = "TN", _("Tunisie")
    FRANCE = "FR", _("France")
    AUTRICHE = "AT", _("Autriche")
    SUISSE = "CH", _("Suisse")
    BELGIQUE = "BE", _("Belgique")
    PAYS_BAS = "NL", _("Pays-Bas")
    ITALIE = "IT", _("Italie")
    ESPAGNE = "ES", _("Espagne")
    ROYAUME_UNI = "GB", _("Royaume-Uni")
    AUTRE = "XX", _("Autre")


def membre_photo_upload_path(instance, filename):
    return f"membres/{instance.id}/photo_{filename}"


def _aujourd_hui():
    """
    default= pour date_adhesion (DateField). `default=timezone.now` (un
    DateTimeField-aware datetime) paraît fonctionner à l'écriture — Django
    le convertit silencieusement lors du save() — mais l'attribut Python
    reste un datetime tant que l'instance n'est pas rechargée depuis la BDD,
    ce qui casse la sérialisation DRF (DateField refuse explicitement un
    datetime en entrée). On force ici un vrai `date`.
    """
    return timezone.now().date()


class Membre(models.Model):
    """Fiche membre — voir mockup #pg-admin-fiche-membre / #pg-admin-nouveau-membre."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="membre",
        help_text=_(
            "Compte de connexion associé. Vide pour un membre importé (RICEFW C-001) tant "
            "qu'il ne s'est pas inscrit / n'a pas été invité à créer son compte."
        ),
    )

    numero_membre = models.CharField(
        max_length=20,
        unique=True,
        editable=False,
        help_text=_("Généré automatiquement : CA-<année d'adhésion>-<compteur> (voir mockup)."),
    )

    # --- Identité (F-002 Inscription, F-003 Modifier profil) ---
    prenom = models.CharField(max_length=100)
    nom = models.CharField(max_length=100)
    date_naissance = models.DateField()
    sexe = models.CharField(
        max_length=20, choices=Sexe.choices, default=Sexe.NON_RENSEIGNE, blank=True
    )

    # --- Contact ---
    email = models.EmailField(
        help_text=_(
            "Email de contact du membre. Dupliqué depuis le compte utilisateur si lié — "
            "renseigné indépendamment pour les fiches importées sans compte."
        )
    )
    telephone = models.CharField(max_length=30, help_text=_("Format allemand attendu (+49…)."))

    # --- Pièces d'identité — chiffrées AES-256-GCM au repos (SCD §5.1, TDD §3.1) ---
    # cin est devenu blank=True/null=True le 2026-09-28 (retour utilisateur, point 5) : à
    # l'inscription, ni CIN ni passeport n'est individuellement obligatoire — la règle "au moins
    # l'un des deux" est appliquée en amont par RegisterSerializer.validate (accounts/
    # serializers.py), jamais au niveau du modèle lui-même (une fiche importée, par ex., peut
    # légitimement n'avoir que l'un des deux, ou aucun temporairement).
    cin = EncryptedCharField(max_length=50, blank=True, null=True)
    passeport = EncryptedCharField(max_length=50, blank=True, null=True)

    # --- Pays de résidence + adresse ---
    pays = models.CharField(
        max_length=2,
        choices=Pays.choices,
        default=Pays.ALLEMAGNE,
        verbose_name=_("Pays de résidence"),
        help_text=_(
            "Si différent de l'Allemagne, l'adresse allemande détaillée "
            "(rue, ville, Bundesland) n'est pas requise — seul le pays compte."
        ),
    )
    # adresse_de/ville_de : blank=True au niveau modèle (validation stricte déplacée dans
    # MembreSerializer.validate — requis seulement si pays == ALLEMAGNE, voir serializers.py).
    adresse_de = models.CharField(max_length=255, blank=True, verbose_name=_("Adresse (Allemagne)"))
    code_postal_de = models.CharField(max_length=10, blank=True)
    ville_de = models.CharField(max_length=100, blank=True, verbose_name=_("Ville (Allemagne)"))
    land_de = models.CharField(max_length=2, choices=Bundesland.choices, blank=True)

    # --- Origine Tunisie (facultatif) ---
    ville_origine_tn = models.CharField(
        max_length=100, blank=True, verbose_name=_("Ville d'origine (Tunisie)")
    )
    gouvernorat_tn = models.CharField(
        max_length=100, blank=True, verbose_name=_("Gouvernorat (Tunisie)")
    )

    # --- Statut associatif ---
    statut = models.CharField(
        max_length=20, choices=StatutMembre.choices, default=StatutMembre.EN_ATTENTE
    )
    date_adhesion = models.DateField(default=_aujourd_hui)
    rapprochement_ecarte = models.BooleanField(
        default=False,
        help_text=_(
            "RH/Admin a confirmé qu'aucune fiche importée ne correspond à ce compte "
            "— exclu de la liste de rapprochement."
        ),
    )

    photo = models.ImageField(
        upload_to=membre_photo_upload_path,
        storage=MembrePhotoStorage(),
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "membres"
        verbose_name = _("Membre")
        verbose_name_plural = _("Membres")
        ordering = ["nom", "prenom"]
        indexes = [
            models.Index(fields=["statut"]),
            models.Index(fields=["nom", "prenom"]),
            models.Index(fields=["ville_de"]),
        ]

    def __str__(self):
        return f"{self.numero_membre} — {self.prenom} {self.nom}"

    @property
    def age(self) -> int:
        """
        Âge en années révolues à la date du jour, calculé depuis date_naissance.
        Ajouté pour AHM-19 (adhésions) : les offres peuvent porter une condition d'âge
        (ex. tarif "moins de 26 ans") évaluée dynamiquement — jamais stockée, pour rester
        exacte au fil du temps (FDD §6.1).

        Utilise `timezone.localdate()` (date du jour dans settings.TIME_ZONE) plutôt que
        `timezone.now().date()` (qui donnerait la date UTC) : les deux divergent d'un jour
        pendant la fenêtre de décalage horaire (ex. 23h-minuit UTC en horaire d'été
        Europe/Berlin), ce qui rendait ce calcul incohérent selon l'heure d'exécution.
        """
        aujourd_hui = timezone.localdate()
        annees = aujourd_hui.year - self.date_naissance.year
        anniversaire_pas_encore_passe = (aujourd_hui.month, aujourd_hui.day) < (
            self.date_naissance.month,
            self.date_naissance.day,
        )
        if anniversaire_pas_encore_passe:
            annees -= 1
        return annees

    def save(self, *args, **kwargs):
        if not self.numero_membre:
            self.numero_membre = self._generate_numero_membre()
        super().save(*args, **kwargs)

    def _generate_numero_membre(self) -> str:
        """
        Format CA-<année>-<compteur 3 chiffres>, ex. CA-2022-001 (voir mockup fiche membre :
        "#CA-2022-001"). L'année utilisée est celle de date_adhesion, pas la date du jour, pour
        que l'import historique (C-001) reproduise fidèlement la numérotation d'origine.

        Note concurrence : en cas de créations strictement simultanées, deux fiches pourraient
        calculer le même prochain numéro avant l'écriture en base — la contrainte unique sur
        numero_membre empêche silencieusement une collision (IntegrityError explicite), mais
        ne la résout pas automatiquement. Sans impact réel ici : la création de membres est une
        opération administrative peu fréquente (RH/Bureau Admin), jamais un flux concurrent à
        haut volume. À revisiter avec un verrou (select_for_update) si l'import de masse (C-001)
        s'avère parallélisé.
        """
        annee = (self.date_adhesion or timezone.now().date()).year
        prefix = f"CA-{annee}-"
        last = (
            Membre.objects.filter(numero_membre__startswith=prefix)
            .order_by("-numero_membre")
            .first()
        )
        next_seq = 1
        if last:
            try:
                next_seq = int(last.numero_membre.rsplit("-", 1)[-1]) + 1
            except ValueError:
                next_seq = Membre.objects.filter(numero_membre__startswith=prefix).count() + 1
        return f"{prefix}{next_seq:03d}"


class RaisonChangementStatut(models.TextChoices):
    """Origine d'une entrée HistoriqueStatutMembre (demande utilisateur du 2026-09-19) — permet
    de distinguer, en consultation/audit, un changement automatique (paiement ou échéance) d'une
    correction manuelle par un Admin App."""

    PAIEMENT_CONFIRME = "paiement_confirme", _("Paiement confirmé")
    ECHEANCE_DEPASSEE = "echeance_depassee", _("Échéance dépassée")
    MANUEL = "manuel", _("Modification manuelle")
    NON_RENOUVELE = "non_renouvele", _("Adhésion non renouvelée")


class HistoriqueStatutMembre(models.Model):
    """
    Historique du statut associatif PAR ANNÉE DE COTISATION (demande utilisateur du 2026-09-19 :
    "ein Benutzer kann im 2024 Mitglieder sein, im 2025 nicht aber wieder in 2026 Mitglieder
    sein"). `Membre.statut` (ci-dessus) reste la seule source de vérité pour le statut COURANT —
    utilisée telle quelle partout ailleurs dans le code (éligibilité vote, accès communauté,
    inscription événements, statistiques...) — ce modèle ajoute, en plus, un enregistrement par
    année, consultable en tout temps via l'identifiant technique stable du membre (`Membre.id`/
    `numero_membre`, jamais réattribués ni recyclés — c'est cet identifiant qui sert de
    "technische MitgliederID" pour retrouver l'historique, comme demandé, plutôt que d'en
    introduire un second).

    Alimenté exclusivement par `apps.membres.services.enregistrer_statut_annuel` (jamais créé/
    modifié directement ailleurs) — voir sa docstring pour la logique de synchronisation avec
    `Membre.statut` et les 2 déclencheurs actuels, tous deux côté `apps.cotisations` :
      - paiement de la cotisation annuelle confirmé (manuellement par le Directeur Financier via
        `marquer_payee`, ou automatiquement par le webhook Stripe/PayPal) -> actif ;
      - échéance de paiement dépassée sans cotisation payée (checkpoint J+1 de la pipeline de
        relance AHM-18/AHM-54) -> inactif.
    Ne concerne que le type d'article "cotisation" (Jahresbeitrag/cotisation annuelle) — jamais
    "adhesion" (frais d'adhésion, ponctuel) ni "autre" (boutique, événements...).

    Rétroactif : la migration 0004 reconstruit une première version de cet historique à partir
    des `Cotisation` déjà existantes au moment de son introduction (demande utilisateur), sans
    jamais toucher au statut courant (`Membre.statut`) ni déclencher de notification/email —
    seuls les changements réels, à partir de maintenant, en déclenchent."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    membre = models.ForeignKey(Membre, on_delete=models.CASCADE, related_name="historique_statuts")
    annee = models.PositiveSmallIntegerField()
    statut = models.CharField(max_length=20, choices=StatutMembre.choices)
    raison = models.CharField(max_length=20, choices=RaisonChangementStatut.choices)
    date_effet = models.DateTimeField(
        help_text=_("Date/heure de l'événement à l'origine de ce statut (paiement ou échéance).")
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "historique_statuts_membre"
        verbose_name = _("Historique de statut membre")
        verbose_name_plural = _("Historiques de statut membre")
        ordering = ["-annee"]
        constraints = [
            models.UniqueConstraint(
                fields=["membre", "annee"], name="unique_historique_statut_par_membre_annee"
            )
        ]

    def __str__(self):
        return f"{self.membre.numero_membre} — {self.annee} : {self.get_statut_display()}"
