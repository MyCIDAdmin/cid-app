from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from apps.membres.models import Bundesland, Membre, Pays, Sexe, StatutMembre

from .models import Role

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """Représentation du User renvoyée par /auth/login/, /auth/2fa/verify/ et
    /auth/me/. prenom/nom (AHM-52) viennent de la fiche Membre liée quand
    elle existe — un compte sans fiche (superuser, RH créé hors
    auto-inscription) renvoie simplement des chaînes vides, à charge du
    frontend de retomber sur l'email dans ce cas (cf DashboardPage).

    statut_membre (ajouté le 2026-09-26, plan "Öffentliche mycid.org-Startseite" section A) :
    le statut ACTIF/EN_ATTENTE/INACTIF de la fiche Membre liée — permet à HomeRoute.tsx de
    décider si un utilisateur connecté doit voir la nouvelle page d'accueil publique (statut
    non-actif, traité comme un visiteur) ou son tableau de bord habituel (statut actif). `None`
    pour un compte sans fiche Membre (superuser, RH créé hors auto-inscription) — HomeRoute
    traite ce cas comme un accès non restreint (voir docstring frontend), jamais comme un
    visiteur, pour ne pas priver un compte de gestion de la sidebar."""

    prenom = serializers.SerializerMethodField()
    nom = serializers.SerializerMethodField()
    statut_membre = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "role",
            "langue_preferee",
            "is_active",
            "require_2fa",
            "created_at",
            "prenom",
            "nom",
            "statut_membre",
        ]
        read_only_fields = [
            "id",
            "role",
            "is_active",
            "require_2fa",
            "created_at",
            "prenom",
            "nom",
            "statut_membre",
        ]

    def get_prenom(self, obj):
        return obj.membre.prenom if hasattr(obj, "membre") else ""

    def get_nom(self, obj):
        return obj.membre.nom if hasattr(obj, "membre") else ""

    def get_statut_membre(self, obj):
        return obj.membre.statut if hasattr(obj, "membre") else None


class RegisterSerializer(serializers.Serializer):
    """
    Inscription membre (FDD §3.1, F-002, AHM-50) — reprend exactement les
    champs du mockup `#sc-register` : au-delà du compte de connexion, la
    fiche Membre complète (identité, CIN, contact, adresse) est saisie dès
    l'inscription et créée en même temps que le `User`, statut `en_attente`
    (RegistrationDecision.EN_ATTENTE côté User, StatutMembre.EN_ATTENTE côté
    Membre). Le compte reste inactif et non visible de RH tant que l'email
    n'est pas confirmé (voir RegisterConfirmSerializer) — l'activation
    définitive nécessite ensuite la validation d'un rôle RH ou Admin
    (AHM-48). L'inscription libre-service ne concerne que des membres
    résidant en Allemagne (mockup #sc-register n'a pas de sélecteur de
    pays) — `pays` est donc toujours DE ; conservation des données en cas
    de refus RH : voir apps.accounts.views.RefuseRegistrationView.
    """

    # --- Compte utilisateur ---
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, validators=[validate_password])
    langue_preferee = serializers.ChoiceField(
        choices=[("fr", "Français"), ("de", "Deutsch"), ("ar", "العربية")], default="fr"
    )
    consentement_rgpd = serializers.BooleanField(write_only=True)

    # --- Identité ---
    prenom = serializers.CharField(max_length=100)
    nom = serializers.CharField(max_length=100)
    date_naissance = serializers.DateField()
    sexe = serializers.ChoiceField(choices=Sexe.choices, default=Sexe.NON_RENSEIGNE, required=False)

    # --- Pièces d'identité (chiffrées au repos par Membre.cin/passeport) ---
    cin = serializers.CharField(max_length=50)
    passeport = serializers.CharField(max_length=50, required=False, allow_blank=True)

    # --- Contact ---
    telephone = serializers.CharField(max_length=30)

    # --- Adresse en Allemagne ---
    adresse_de = serializers.CharField(max_length=255)
    code_postal_de = serializers.CharField(max_length=10, required=False, allow_blank=True)
    ville_de = serializers.CharField(max_length=100)
    land_de = serializers.ChoiceField(choices=Bundesland.choices, required=False, allow_blank=True)

    # --- Origine Tunisie (facultatif) ---
    ville_origine_tn = serializers.CharField(max_length=100, required=False, allow_blank=True)
    gouvernorat_tn = serializers.CharField(max_length=100, required=False, allow_blank=True)

    _membre_fields = (
        "prenom",
        "nom",
        "date_naissance",
        "sexe",
        "cin",
        "passeport",
        "telephone",
        "adresse_de",
        "code_postal_de",
        "ville_de",
        "land_de",
        "ville_origine_tn",
        "gouvernorat_tn",
    )

    def validate_email(self, value):
        value = User.objects.normalize_email(value)
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Un compte existe déjà avec cet email.")
        return value

    def validate_consentement_rgpd(self, value):
        if not value:
            raise serializers.ValidationError(
                "Le consentement RGPD est requis pour créer un compte."
            )
        return value

    def create(self, validated_data):
        validated_data.pop("consentement_rgpd")
        password = validated_data.pop("password")
        # .pop(field, "") : les champs optionnels absents du payload
        # (passeport, code_postal_de, land_de, ville_origine_tn,
        # gouvernorat_tn) n'apparaissent pas du tout dans validated_data —
        # Membre.<champ> accepte blank="" (blank=True côté modèle).
        membre_data = {field: validated_data.pop(field, "") for field in self._membre_fields}

        user = User(
            email=validated_data["email"],
            langue_preferee=validated_data["langue_preferee"],
            role=Role.MEMBRE,
        )
        user.set_password(password)
        user.save()

        Membre.objects.create(
            user=user,
            email=user.email,
            pays=Pays.ALLEMAGNE,
            statut=StatutMembre.EN_ATTENTE,
            **membre_data,
        )
        return user


class RegisterConfirmSerializer(serializers.Serializer):
    """Confirmation du code à 6 chiffres reçu par email après l'inscription (AHM-50)."""

    email = serializers.EmailField()
    code = serializers.CharField(max_length=6, min_length=6)


class RegisterResendCodeSerializer(serializers.Serializer):
    email = serializers.EmailField()


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    device_fingerprint = serializers.CharField(required=False, allow_blank=True)
    # Distinct de `device_fingerprint` ci-dessus (qui sert uniquement à la détection "nouvel
    # appareil" du 2FA conditionnel, SCD §3.3, voir services.requires_2fa) — volontairement séparé
    # pour ne jamais interagir avec cette logique existante. `device_id` sert exclusivement à
    # "une seule session active par appareil" (task #218, 2026-09-24, voir
    # services.enforce_single_session_per_device). Un identifiant STABLE par navigateur
    # (généré une fois côté frontend et persisté), pas une empreinte technique.
    device_id = serializers.CharField(required=False, allow_blank=True)


class SendOTPSerializer(serializers.Serializer):
    login_ticket = serializers.CharField()


class Verify2FASerializer(serializers.Serializer):
    login_ticket = serializers.CharField()
    method = serializers.ChoiceField(choices=["totp", "email_otp"])
    code = serializers.CharField(max_length=6, min_length=6)


class TOTPSetupConfirmSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=6, min_length=6)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, validators=[validate_password])


class UserManagementSerializer(serializers.ModelSerializer):
    """
    Liste/recherche des comptes utilisateurs pour la gestion des rôles (SCD
    §4.2 : `GET /admin/rôles/`, réservé Admin App) — sert à retrouver un
    compte (ex. après inscription libre-service + validation RH) avant de
    lui changer de rôle via ChangeUserRoleView. prenom/nom viennent de la
    fiche Membre liée quand elle existe, comme UserSerializer.
    """

    prenom = serializers.SerializerMethodField()
    nom = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "email", "role", "is_active", "created_at", "prenom", "nom"]
        read_only_fields = fields

    def get_prenom(self, obj):
        return obj.membre.prenom if hasattr(obj, "membre") else ""

    def get_nom(self, obj):
        return obj.membre.nom if hasattr(obj, "membre") else ""


class ChangeRoleSerializer(serializers.Serializer):
    """Changement de rôle d'un utilisateur (SCD §4.2/§8.1 — journalisé, voir
    apps.accounts.views.ChangeUserRoleView)."""

    role = serializers.ChoiceField(choices=Role.choices)


class PendingRegistrationSerializer(serializers.ModelSerializer):
    """
    Inscription libre-service en attente de décision RH/Admin (AHM-48).
    Depuis AHM-50 le formulaire d'inscription crée la fiche Membre associée
    en même temps que le compte — prénom/nom/ville viennent de là pour que
    RH puisse identifier la demande sans ouvrir une deuxième page.
    """

    prenom = serializers.SerializerMethodField()
    nom = serializers.SerializerMethodField()
    ville = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "email", "langue_preferee", "created_at", "prenom", "nom", "ville"]
        read_only_fields = fields

    def get_prenom(self, obj):
        return obj.membre.prenom if hasattr(obj, "membre") else ""

    def get_nom(self, obj):
        return obj.membre.nom if hasattr(obj, "membre") else ""

    def get_ville(self, obj):
        return obj.membre.ville_de if hasattr(obj, "membre") else ""
