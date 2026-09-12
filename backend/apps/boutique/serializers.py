"""
Serializers — app boutique.

Le prix final n'est jamais fait confiance au frontend (CLAUDE.md §8) : PasserCommandeSerializer
ne reçoit que des couples (variante, quantité) ; le prix unitaire (gelé sur la ligne) et le
montant total sont entièrement recalculés côté serveur dans CommandeViewSet.passer (voir
views.py), sous verrou transactionnel pour un stock toujours cohérent.
"""

from rest_framework import serializers

from .models import Commande, LigneCommande, Produit, StatutCommande, VarianteProduit


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

    class Meta:
        model = LigneCommande
        fields = ["id", "variante", "quantite", "prix_unitaire", "sous_total"]
        read_only_fields = fields


class CommandeSerializer(serializers.ModelSerializer):
    lignes = LigneCommandeSerializer(many=True, read_only=True)

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
            "lignes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


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
