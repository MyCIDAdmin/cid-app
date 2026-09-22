"""
Serializers — app projets.

Le montant collecté et le nombre de contributeurs affichés sur un Projet (cagnote,
demande utilisateur points 3 et 5) ne sont JAMAIS des champs modifiables : ce sont les
propriétés calculées `Projet.montant_collecte`/`nb_contributeurs`/`echeance_depassee`
(voir models.py), exposées ici en lecture seule uniquement — impossible à écrire depuis
l'API, conformément à CLAUDE.md §8 ("jamais fait confiance au frontend"). Les images
(ProjetImage/ProjetMiseAJourImage) passent par
`apps.communaute.validators.valider_et_reencoder_photo`, comme toute image uploadée par
un membre dans l'application (jamais les octets bruts du client stockés tels quels — MIME
réel vérifié, ré-encodage Pillow, EXIF supprimé).
"""

from rest_framework import serializers

from apps.communaute.validators import valider_et_reencoder_photo
from apps.membres.models import Membre

from .models import Projet, ProjetImage, ProjetMiseAJour, ProjetMiseAJourImage
from .permissions import est_gestionnaire_projet


class MembreResumeSerializer(serializers.ModelSerializer):
    """Identité minimale d'un membre en lecture imbriquée (responsable d'un projet,
    auteur d'une mise à jour, contributeur en face arrière de la kachel) — même principe
    et même duplication volontaire que
    apps.evenements.serializers.MembreResumeSerializer (pas de dépendance entre apps
    métier, voir sa docstring)."""

    class Meta:
        model = Membre
        fields = ["id", "prenom", "nom", "photo"]


class ProjetImageSerializer(serializers.ModelSerializer):
    """Une image de la kachel (demande utilisateur point 1.1 — carrousel auto-rotatif
    côté frontend, rien ici ne pilote la rotation elle-même, seulement l'ordre
    d'affichage)."""

    class Meta:
        model = ProjetImage
        fields = ["id", "projet", "image", "ordre", "uploaded_by", "created_at"]
        read_only_fields = ["id", "uploaded_by", "created_at"]
        extra_kwargs = {"projet": {"required": True}}

    def validate_image(self, image):
        return valider_et_reencoder_photo(image)

    def update(self, instance, validated_data):
        # `projet` est immuable après création — sans ce verrou, un responsable
        # autorisé à modifier CETTE image (has_object_permission vérifie le projet
        # D'ORIGINE de l'objet) pourrait la réassigner à un tout autre projet dont il
        # n'est pas gestionnaire, contournant ainsi GestionContenuProjetPermission pour
        # ce second projet (IDOR — CID-SCD-001 §2.3 A01). Ignoré silencieusement plutôt
        # qu'une erreur, même convention que ArticleCatalogueSerializer.update pour
        # `type_fixe`/`libelle`.
        validated_data.pop("projet", None)
        return super().update(instance, validated_data)


class ProjetMiseAJourImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjetMiseAJourImage
        fields = ["id", "mise_a_jour", "image", "ordre", "created_at"]
        read_only_fields = ["id", "created_at"]
        extra_kwargs = {"mise_a_jour": {"required": True}}

    def validate_image(self, image):
        return valider_et_reencoder_photo(image)

    def update(self, instance, validated_data):
        # Même verrou que ProjetImageSerializer.update ci-dessus, appliqué à
        # `mise_a_jour` (donc indirectement au projet référencé).
        validated_data.pop("mise_a_jour", None)
        return super().update(instance, validated_data)


class ProjetMiseAJourSerializer(serializers.ModelSerializer):
    """Une entrée du rapport d'avancement (demande utilisateur point 7 — "Bericht (mit
    Bildern)... was getan wurde"). Les images sont gérées séparément, via
    ProjetMiseAJourImageSerializer et les actions dédiées de la vue — pas d'upload
    multipart imbriqué dans le payload JSON de la mise à jour elle-même (même convention
    que ProjetImage vis-à-vis de Projet)."""

    images = ProjetMiseAJourImageSerializer(many=True, read_only=True)
    created_by_detail = MembreResumeSerializer(source="created_by", read_only=True)

    class Meta:
        model = ProjetMiseAJour
        fields = [
            "id",
            "projet",
            "titre",
            "contenu_html",
            "images",
            "created_by",
            "created_by_detail",
            "created_at",
        ]
        read_only_fields = ["id", "created_by", "created_at"]
        extra_kwargs = {"projet": {"required": True}}

    def update(self, instance, validated_data):
        # Même verrou anti-IDOR que ProjetImageSerializer.update — voir sa docstring.
        validated_data.pop("projet", None)
        return super().update(instance, validated_data)


class ProjetSerializer(serializers.ModelSerializer):
    """Liste ET détail (pas de split list/detail : les champs restent légers — les
    mises à jour du rapport d'avancement ne sont PAS imbriquées ici, seulement les images
    de la kachel, voir ProjetMiseAJourViewSet/l'action dédiée pour le rapport complet).
    Les champs calculés ci-dessous sont toujours en lecture seule — voir docstring de
    module et models.Projet.

    `est_gestionnaire` est calculé côté serveur (jamais au frontend, qui ne peut pas
    comparer directement CidUser.id à Membre.id — ce sont deux modèles distincts liés en
    1-to-1, voir apps.accounts.models.User.membre) via la même fonction
    `est_gestionnaire_projet` que les permissions d'écriture — même convention que
    `est_auteur`/`est_proprietaire` dans apps.communaute.serializers : le frontend affiche
    conditionnellement le formulaire d'ajout de mise à jour (rapport d'avancement) sur ce
    seul booléen, jamais sur une comparaison d'ids côté client."""

    images = ProjetImageSerializer(many=True, read_only=True)
    responsable_detail = MembreResumeSerializer(source="responsable", read_only=True)
    montant_collecte = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    nb_contributeurs = serializers.IntegerField(read_only=True)
    echeance_depassee = serializers.BooleanField(read_only=True)
    est_gestionnaire = serializers.SerializerMethodField()

    class Meta:
        model = Projet
        fields = [
            "id",
            "titre",
            "description_html",
            "statut",
            "responsable",
            "responsable_detail",
            "cagnote_active",
            "objectif_montant",
            "montant_collecte",
            "nb_contributeurs",
            "date_limite",
            "echeance_depassee",
            "ordre",
            "images",
            "est_gestionnaire",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def get_est_gestionnaire(self, obj) -> bool:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return est_gestionnaire_projet(user, obj)


class ContributeurSerializer(serializers.Serializer):
    """Face arrière de la kachel (demande utilisateur point 5, "Details zu den
    Mitgliedern die beigetragen haben") — jamais un ModelSerializer : chaque ligne est une
    agrégation {membre, montant_total, derniere_contribution} calculée à la volée sur le
    registre Cotisation (voir ProjetViewSet.contributeurs), jamais une instance de
    Cotisation elle-même ni un champ dénormalisé — même principe que
    Projet.montant_collecte."""

    membre = MembreResumeSerializer(read_only=True)
    montant_total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    derniere_contribution = serializers.DateTimeField(read_only=True)
