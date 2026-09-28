"""
Serializers — app membres.

Masquage CIN/passeport (SCD §2.3, A01/A02 — "Lecture CIN d'un autre membre
(IDOR)" listé comme risque critique) : par défaut, cin/passeport ne sont
renvoyés en clair par l'API que pour le rôle RH et au-dessus, ou pour le
membre consultant sa propre fiche. Dans tous les autres cas, seuls les 3
derniers caractères sont visibles (même convention que admin.py :
MembreAdmin.cin_masque).
"""

from rest_framework import serializers

from apps.accounts.models import ROLE_LEVELS, Role
from apps.communaute.validators import valider_et_reencoder_photo

from .models import Membre, Pays


def _mask(value):
    if not value:
        return None
    return f"•••••{value[-3:]}" if len(value) > 3 else "•••"


def _can_view_pii(user, membre) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if ROLE_LEVELS.get(user.role, 0) >= ROLE_LEVELS[Role.RH]:
        return True
    return membre.user_id == user.id


class MembreListSerializer(serializers.ModelSerializer):
    """Vue liste — champs allégés (pas d'adresse complète), CIN toujours masqué
    (jamais nécessaire pour un simple listing, réduit la surface d'exposition)."""

    cin_masque = serializers.SerializerMethodField()

    class Meta:
        model = Membre
        fields = [
            "id",
            "numero_membre",
            "prenom",
            "nom",
            "email",
            "pays",
            "ville_de",
            "land_de",
            "statut",
            "date_adhesion",
            "cin_masque",
        ]

    def get_cin_masque(self, obj):
        return _mask(obj.cin)


class MembreSerializer(serializers.ModelSerializer):
    """Vue détail (retrieve/create/update). cin/passeport sont acceptés en
    écriture par tout appelant autorisé à créer/modifier (RH+, voir
    MembrePermission), mais démasqués en lecture uniquement pour RH+ ou le
    propriétaire de la fiche — voir to_representation.

    AHM-51 : un Membre peut désormais modifier sa propre fiche (voir
    MembrePermission), mais uniquement ses champs personnels — les champs
    administratifs listés ci-dessous restent lisibles mais verrouillés en
    écriture pour lui (__init__ les repasse en read_only). "statut" a de
    toute façon sa propre action dédiée RH+ (changer_statut) ; l'ouvrir ici
    en écriture pour un Membre contournerait cette règle.
    """

    _CHAMPS_ADMINISTRATIFS = ("user", "statut", "date_adhesion")

    class Meta:
        model = Membre
        fields = [
            "id",
            "user",
            "numero_membre",
            "prenom",
            "nom",
            "date_naissance",
            "sexe",
            "email",
            "telephone",
            "cin",
            "passeport",
            "pays",
            "adresse_de",
            "code_postal_de",
            "ville_de",
            "land_de",
            "ville_origine_tn",
            "gouvernorat_tn",
            "statut",
            "date_adhesion",
            "photo",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "numero_membre", "created_at", "updated_at"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        if user is not None and getattr(user, "is_authenticated", False):
            if ROLE_LEVELS.get(user.role, 0) < ROLE_LEVELS[Role.RH]:
                for champ in self._CHAMPS_ADMINISTRATIFS:
                    self.fields[champ].read_only = True

    def validate_user(self, value):
        if value is None:
            return value
        qs = Membre.objects.filter(user=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                "Ce compte utilisateur est déjà associé à un autre membre."
            )
        return value

    def validate(self, attrs):
        pays = attrs.get("pays", getattr(self.instance, "pays", Pays.ALLEMAGNE))
        erreurs = {}
        if pays == Pays.ALLEMAGNE:
            adresse_de = attrs.get("adresse_de", getattr(self.instance, "adresse_de", ""))
            ville_de = attrs.get("ville_de", getattr(self.instance, "ville_de", ""))
            if not (adresse_de or "").strip():
                erreurs["adresse_de"] = "Ce champ est requis pour un membre résidant en Allemagne."
            if not (ville_de or "").strip():
                erreurs["ville_de"] = "Ce champ est requis pour un membre résidant en Allemagne."
        # CIN ni passeport ne sont requis isolément (retour utilisateur du 2026-09-28, point 5 —
        # même règle qu'à l'inscription libre-service, voir RegisterSerializer.validate), mais au
        # moins l'un des deux doit être renseigné.
        cin = attrs.get("cin", getattr(self.instance, "cin", ""))
        passeport = attrs.get("passeport", getattr(self.instance, "passeport", ""))
        if not (cin or "").strip() and not (passeport or "").strip():
            erreurs["cin"] = "Ausweisnummer (CIN) oder Passnummer ist erforderlich."
        if erreurs:
            raise serializers.ValidationError(erreurs)
        return attrs

    def validate_photo(self, value):
        """Photo de profil (ajoutée le 2026-09-28, retour utilisateur : "zu dem Profile darf der
        User sein Bild hochladen") — même validateur que les autres uploads d'image du projet
        (albums, événements : CLAUDE.md §8 "Uploads : validation MIME (python-magic) + whitelist
        d'extensions") plutôt qu'un `ImageField` nu qui ne vérifierait que l'extension déclarée :
        magic bytes réels, ré-encodage Pillow (supprime l'EXIF), garde-fou bombe de
        décompression. `value` est déjà un fichier (pas encore enregistré) à ce stade du cycle
        DRF — voir valider_et_reencoder_photo pour le détail."""
        return valider_et_reencoder_photo(value)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not _can_view_pii(user, instance):
            data["cin"] = _mask(instance.cin)
            data["passeport"] = _mask(instance.passeport) if instance.passeport else None
        return data
