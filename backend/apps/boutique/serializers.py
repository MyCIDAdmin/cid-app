"""
Serializers — app boutique.

Le prix final n'est jamais fait confiance au frontend (CLAUDE.md §8) : PasserCommandeSerializer
ne reçoit que des couples (variante, quantité) ; le prix unitaire (gelé sur la ligne) et le
montant total sont entièrement recalculés côté serveur dans CommandeViewSet.passer (voir
views.py), sous verrou transactionnel pour un stock toujours cohérent.
"""

from django.utils import timezone
from rest_framework import serializers

from .models import (
    STATUTS_RETOURNABLES,
    Commande,
    LigneCommande,
    ModePaiementCommande,
    Produit,
    Retour,
    StatutCommande,
    VarianteProduit,
)


class VarianteProduitSerializer(serializers.ModelSerializer):
    class Meta:
        model = VarianteProduit
        fields = ["id", "produit", "taille", "couleur", "stock"]
        read_only_fields = ["id"]


class ProduitSerializer(serializers.ModelSerializer):
    variantes = VarianteProduitSerializer(many=True, read_only=True)
    stock_total = serializers.IntegerField(read_only=True)
    stock_faible = serializers.BooleanField(read_only=True)
    en_rupture = serializers.BooleanField(read_only=True)
    prix_final = serializers.DecimalField(max_digits=8, decimal_places=2, read_only=True)
    # Écriture uniquement — pratique pour saisir le stock disponible dès la création du
    # produit (mockup #m-newprod) sans passer par le panneau "gérer les variantes" : crée
    # automatiquement une VarianteProduit "unique" (taille/couleur vides, voir docstring
    # module) portant ce stock. Ignoré en modification (`update`) pour ne pas perturber la
    # gestion fine des variantes existantes.
    stock_initial = serializers.IntegerField(write_only=True, required=False, min_value=0)

    class Meta:
        model = Produit
        fields = [
            "id",
            "nom",
            "categorie",
            "description",
            "prix",
            "pourcentage_reduction",
            "prix_final",
            "image",
            "statut",
            "nouveaute",
            "seuil_alerte_stock",
            "stock_initial",
            "variantes",
            "stock_total",
            "stock_faible",
            "en_rupture",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def create(self, validated_data):
        stock_initial = validated_data.pop("stock_initial", None)
        produit = super().create(validated_data)
        if stock_initial is not None:
            VarianteProduit.objects.create(
                produit=produit, taille="", couleur="", stock=stock_initial
            )
        return produit

    def update(self, instance, validated_data):
        # stock_initial n'a de sens qu'à la création — voir commentaire du champ ci-dessus.
        validated_data.pop("stock_initial", None)
        return super().update(instance, validated_data)


class LigneCommandeSerializer(serializers.ModelSerializer):
    sous_total = serializers.DecimalField(max_digits=8, decimal_places=2, read_only=True)
    quantite_retournee = serializers.IntegerField(read_only=True)
    quantite_retournable = serializers.IntegerField(read_only=True)

    class Meta:
        model = LigneCommande
        fields = [
            "id",
            "variante",
            "quantite",
            "prix_unitaire",
            "sous_total",
            "quantite_retournee",
            "quantite_retournable",
        ]
        read_only_fields = fields


class RetourSerializer(serializers.ModelSerializer):
    class Meta:
        model = Retour
        fields = [
            "id",
            "commande",
            "ligne_commande",
            "quantite",
            "motif",
            "commentaire",
            "enregistre_par",
            "created_at",
        ]
        read_only_fields = ["id", "enregistre_par", "created_at"]

    def validate(self, attrs):
        commande = attrs["commande"]
        ligne_commande = attrs["ligne_commande"]
        quantite = attrs["quantite"]

        if ligne_commande.commande_id != commande.id:
            raise serializers.ValidationError(
                {"ligne_commande": "Cette ligne n'appartient pas à la commande indiquée."}
            )
        if commande.statut not in STATUTS_RETOURNABLES:
            raise serializers.ValidationError(
                {
                    "commande": (
                        "Une commande annulée ou remboursée a déjà eu son stock intégralement "
                        "restitué — enregistrer un retour créerait un double comptage "
                        f"(statut actuel : {commande.get_statut_display()})."
                    )
                }
            )
        # Re-vérifié dans la vue sous verrou (SELECT FOR UPDATE) : ce contrôle ici évite un
        # aller-retour serveur inutile pour le cas non concurrent, la vue reste seule source
        # de vérité transactionnelle (même principe que PasserCommandeSerializer/CLAUDE.md §8).
        if quantite > ligne_commande.quantite_retournable:
            raise serializers.ValidationError(
                {
                    "quantite": (
                        "Quantité supérieure à ce qui reste retournable pour cette ligne "
                        f"({ligne_commande.quantite_retournable})."
                    )
                }
            )
        return attrs


class CommandeSerializer(serializers.ModelSerializer):
    lignes = LigneCommandeSerializer(many=True, read_only=True)
    retours = RetourSerializer(many=True, read_only=True)

    class Meta:
        model = Commande
        fields = [
            "id",
            "numero_commande",
            "membre",
            "nom_destinataire",
            "adresse_livraison",
            "code_postal_livraison",
            "ville_livraison",
            "pays_livraison",
            "telephone_livraison",
            "montant_total",
            "statut",
            "mode_paiement",
            "date_paiement_confirme",
            "paiement_confirme_par",
            "reference_paiement",
            "numero_suivi",
            "transporteur",
            "date_expedition",
            "lignes",
            "retours",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ConfirmerPaiementCommandeSerializer(serializers.Serializer):
    """Entrée de POST /boutique/commandes/{id}/confirmer-paiement/ — Directeur Financier+,
    même principe que Cotisation.marquer_payee/AHM-53 (voir permissions.py)."""

    mode_paiement = serializers.ChoiceField(choices=ModePaiementCommande.choices)


class InitierPaiementEnLigneCommandeSerializer(serializers.Serializer):
    """Entrée de POST /boutique/commandes/{id}/initier-paiement-en-ligne/ (ajouté le
    2026-09-17, même principe que Cotisation/AHM-46) — réservé au propriétaire de la commande.

    Contrairement à Cotisation.mode_paiement (qui distingue déjà carte/paypal/virement dès la
    création), ModePaiementCommande.EN_LIGNE ne distingue pas la passerelle : le choix se fait
    ici, au moment où le membre initie réellement le paiement."""

    passerelle = serializers.ChoiceField(choices=["stripe", "paypal"])


class ExpedierCommandeSerializer(serializers.Serializer):
    """Entrée de POST /boutique/commandes/{id}/expedier/ — Directeur Financier+.

    `nacherfassement=True` (demande utilisateur du 2026-09-15) autorise l'action à sauter
    directement à EXPEDIEE pour une commande dont le paiement n'a jamais été confirmé dans le
    système (gérée hors flux normal) — `mode_paiement` devient alors obligatoire, puisque
    confirmer_paiement n'aura jamais été appelée pour cette commande (voir CommandeViewSet).
    """

    numero_suivi = serializers.CharField(max_length=100)
    transporteur = serializers.CharField(max_length=100, required=False, allow_blank=True)
    date_expedition = serializers.DateTimeField(required=False)
    nacherfassement = serializers.BooleanField(default=False)
    mode_paiement = serializers.ChoiceField(
        choices=ModePaiementCommande.choices, required=False
    )

    def validate_date_expedition(self, value):
        if value > timezone.now():
            raise serializers.ValidationError("La date d'expédition ne peut pas être future.")
        return value

    def validate(self, attrs):
        if attrs.get("nacherfassement") and not attrs.get("mode_paiement"):
            raise serializers.ValidationError(
                {
                    "mode_paiement": (
                        "Le mode de paiement doit être précisé pour une saisie rétroactive "
                        "(le paiement de cette commande n'a jamais été confirmé)."
                    )
                }
            )
        return attrs


class LigneCommandeEntreeSerializer(serializers.Serializer):
    """Une ligne du panier envoyée par le client — seule la quantité et l'identité de la
    variante sont prises en compte ; aucun prix n'est jamais accepté en entrée."""

    variante = serializers.PrimaryKeyRelatedField(queryset=VarianteProduit.objects.all())
    quantite = serializers.IntegerField(min_value=1)


class PasserCommandeSerializer(serializers.Serializer):
    """Entrée de l'action `passer` — voir CommandeViewSet.passer pour le calcul de prix et
    le verrouillage de stock atomiques (SELECT FOR UPDATE)."""

    lignes = LigneCommandeEntreeSerializer(many=True)
    nom_destinataire = serializers.CharField(max_length=200)
    adresse_livraison = serializers.CharField(max_length=255)
    code_postal_livraison = serializers.CharField(max_length=10)
    ville_livraison = serializers.CharField(max_length=100)
    pays_livraison = serializers.CharField(max_length=100, default="Allemagne")
    telephone_livraison = serializers.CharField(max_length=30, required=False, allow_blank=True)

    def validate_lignes(self, lignes):
        if not lignes:
            raise serializers.ValidationError("Le panier ne peut pas être vide.")
        variantes_vues = set()
        for ligne in lignes:
            variante = ligne["variante"]
            if variante.id in variantes_vues:
                raise serializers.ValidationError(
                    "Chaque variante ne doit apparaître qu'une seule fois dans le panier."
                )
            variantes_vues.add(variante.id)
            if variante.produit.statut != "publie":
                raise serializers.ValidationError(
                    f"Le produit « {variante.produit.nom} » n'est plus disponible."
                )
        return lignes


class ChangerStatutCommandeSerializer(serializers.Serializer):
    """Entrée de POST /boutique/commandes/{id}/changer-statut/ — Bureau Admin+."""

    statut = serializers.ChoiceField(choices=StatutCommande.choices)
