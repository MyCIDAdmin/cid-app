"""
Serializers — app boutique.

Le prix final n'est jamais fait confiance au frontend (CLAUDE.md §8) : PasserCommandeSerializer
ne reçoit que des couples (variante, quantité) ; le prix unitaire (gelé sur la ligne) et le
montant total sont entièrement recalculés côté serveur dans CommandeViewSet.passer (voir
views.py), sous verrou transactionnel pour un stock toujours cohérent.
"""

from django.utils import timezone
from rest_framework import serializers

from apps.membres.models import Membre

from .models import (
    STATUTS_RETOURNABLES,
    BonAchat,
    Commande,
    LigneCommande,
    ModePaiementCommande,
    Produit,
    RegleReduction,
    Retour,
    StatutCommande,
    TypeProduit,
    TypeReduction,
    VarianteProduit,
    bon_achat_montant_max,
    bon_achat_montant_min,
)


class VarianteProduitSerializer(serializers.ModelSerializer):
    class Meta:
        model = VarianteProduit
        fields = ["id", "produit", "taille", "couleur", "stock"]
        read_only_fields = ["id"]


class RegleReductionSerializer(serializers.ModelSerializer):
    """CRUD des paliers de réduction par quantité (demande utilisateur du 2026-09-23) —
    Bureau Admin+ en écriture, voir CatalogueBoutiquePermission (même classe que Produit/
    VarianteProduit, réutilisée telle quelle pour RegleReductionViewSet)."""

    class Meta:
        model = RegleReduction
        fields = [
            "id",
            "produit",
            "seuil_quantite",
            "type_reduction",
            "pourcentage",
            "actif",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        # merge avec l'instance existante pour un update partiel (PATCH ne renvoie pas
        # forcément type_reduction si seul `actif` change, par ex.).
        type_reduction = attrs.get(
            "type_reduction", getattr(self.instance, "type_reduction", None)
        )
        pourcentage = attrs.get("pourcentage", getattr(self.instance, "pourcentage", None))
        if type_reduction == TypeReduction.POURCENTAGE and not pourcentage:
            raise serializers.ValidationError(
                {"pourcentage": "Requis pour une règle de type pourcentage."}
            )
        if type_reduction == TypeReduction.ARTICLE_OFFERT and pourcentage:
            raise serializers.ValidationError(
                {"pourcentage": "Sans effet pour une règle « article offert » — laisser vide."}
            )
        return attrs


class ProduitSerializer(serializers.ModelSerializer):
    variantes = VarianteProduitSerializer(many=True, read_only=True)
    stock_total = serializers.IntegerField(read_only=True)
    stock_faible = serializers.BooleanField(read_only=True)
    en_rupture = serializers.BooleanField(read_only=True)
    prix_final = serializers.DecimalField(max_digits=8, decimal_places=2, read_only=True)
    # Uniquement les règles actives (demande utilisateur du 2026-09-23) — l'admin gère
    # l'ensemble (actives et inactives) via /boutique/regles-reduction/?produit=<id>, ce champ
    # nested sert seulement l'affichage catalogue/panier (CataloguePage, PanierCommandePage).
    regles_reduction_actives = serializers.SerializerMethodField()
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
            "type_produit",
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
            "regles_reduction_actives",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_regles_reduction_actives(self, produit):
        regles = [r for r in produit.regles_reduction.all() if r.actif]
        regles.sort(key=lambda r: r.seuil_quantite)
        return RegleReductionSerializer(regles, many=True).data

    def create(self, validated_data):
        stock_initial = validated_data.pop("stock_initial", None)
        produit = super().create(validated_data)
        # Un "bon_achat" a déjà sa VarianteProduit "sentinelle" unique auto-créée par
        # Produit.save() (voir TypeProduit.BON_ACHAT) — stock_initial n'a aucun sens pour ce
        # type (pas de stock réel) et DOIT être ignoré ici, sinon la création d'une seconde
        # VarianteProduit(taille="", couleur="") viole la contrainte d'unicité
        # "une_seule_variante_par_combinaison" (bug réel constaté en production le 2026-09-23 :
        # GestionCatalogueTab envoie toujours stock_initial=0 par défaut, même masqué côté UI
        # pour ce type — voir aussi le nettoyage côté payload dans handleChangerType/handleCreer).
        if stock_initial is not None and produit.type_produit != TypeProduit.BON_ACHAT:
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
    sous_total_net = serializers.DecimalField(max_digits=8, decimal_places=2, read_only=True)
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
            "quantite_offerte",
            "pourcentage_reduction_quantite",
            "reduction_quantite",
            "sous_total_net",
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
    montant_du = serializers.DecimalField(max_digits=8, decimal_places=2, read_only=True)

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
            "bon_achat",
            "montant_bon_achat",
            "montant_du",
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
    mode_paiement = serializers.ChoiceField(choices=ModePaiementCommande.choices, required=False)

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
    variante sont prises en compte ; aucun prix n'est jamais accepté en entrée, à une exception
    près : `montant`, requis UNIQUEMENT pour une ligne portant sur un produit
    `type_produit=BON_ACHAT` (demande utilisateur du 2026-09-23, achat de bon d'achat intégré au
    catalogue) — c'est le montant choisi par l'acheteur pour CE bon, revalidé contre
    bon_achat_montant_min/max dans PasserCommandeSerializer.validate_lignes (jamais fait confiance
    tel quel, CLAUDE.md §8)."""

    variante = serializers.PrimaryKeyRelatedField(queryset=VarianteProduit.objects.all())
    quantite = serializers.IntegerField(min_value=1)
    montant = serializers.DecimalField(max_digits=8, decimal_places=2, required=False)


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
    # Code de bon d'achat optionnel (demande utilisateur du 2026-09-23) — la validité (existe,
    # ACTIF, non expiré, solde>0) n'est vérifiée que sous verrou dans CommandeViewSet.passer,
    # jamais ici : un code peut être consommé par une commande concurrente entre la validation du
    # serializer et l'exécution de la vue (même raison que le stock, voir CLAUDE.md §8).
    code_bon_achat = serializers.CharField(max_length=20, required=False, allow_blank=True)

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
            # Montant libre requis (et borné) UNIQUEMENT pour un bon d'achat (demande
            # utilisateur du 2026-09-23) — voir LigneCommandeEntreeSerializer/CLAUDE.md §8, le
            # montant final reste de toute façon revalidé ici, jamais fait confiance tel quel.
            est_bon_achat = variante.produit.type_produit == TypeProduit.BON_ACHAT
            montant = ligne.get("montant")
            if est_bon_achat:
                if montant is None:
                    raise serializers.ValidationError(
                        f"Un montant est requis pour le bon d'achat « {variante.produit.nom} »."
                    )
                if montant < bon_achat_montant_min() or montant > bon_achat_montant_max():
                    raise serializers.ValidationError(
                        "Le montant d'un bon d'achat doit être compris entre "
                        f"{bon_achat_montant_min()} € et {bon_achat_montant_max()} €."
                    )
            elif montant is not None:
                raise serializers.ValidationError(
                    f"Le montant ne s'applique qu'aux bons d'achat (« {variante.produit.nom} » "
                    "a un prix catalogue fixe)."
                )
        return lignes


class VendreEspecesCommandeSerializer(serializers.Serializer):
    """Entrée de l'action `vendre-especes` (ajoutée le 2026-09-21, retour utilisateur :
    "Shop-Artikel soll für Artikel aus Boutique sein", formulaire "Barzahlung eintragen") —
    vente au comptoir/vereinfachter Kassenverkauf réservée au Directeur Financier/Admin App :
    contrairement à `passer`, aucune adresse de livraison n'est demandée (retrait en main
    propre, voir CommandeViewSet.vendre_especes qui renseigne des valeurs de livraison
    fictives), mais le stock reste décrémenté atomiquement de la même façon (SELECT FOR
    UPDATE)."""

    membre = serializers.PrimaryKeyRelatedField(queryset=Membre.objects.all())
    variante = serializers.PrimaryKeyRelatedField(queryset=VarianteProduit.objects.all())
    quantite = serializers.IntegerField(min_value=1, default=1)
    # Montant libre requis pour la vente au comptoir d'un bon d'achat — même règle que
    # LigneCommandeEntreeSerializer côté `passer` (demande utilisateur du 2026-09-23, un
    # Gutschein peut aussi se vendre en espèces au comptoir).
    montant = serializers.DecimalField(max_digits=8, decimal_places=2, required=False)

    def validate_variante(self, variante):
        if variante.produit.statut != "publie":
            raise serializers.ValidationError(
                f"Le produit « {variante.produit.nom} » n'est plus disponible."
            )
        return variante

    def validate(self, attrs):
        variante = attrs["variante"]
        montant = attrs.get("montant")
        est_bon_achat = variante.produit.type_produit == TypeProduit.BON_ACHAT
        if est_bon_achat:
            if montant is None:
                raise serializers.ValidationError(
                    {"montant": f"Un montant est requis pour le bon d'achat « {variante.produit.nom} »."}
                )
            if montant < bon_achat_montant_min() or montant > bon_achat_montant_max():
                raise serializers.ValidationError(
                    {
                        "montant": (
                            "Le montant d'un bon d'achat doit être compris entre "
                            f"{bon_achat_montant_min()} € et {bon_achat_montant_max()} €."
                        )
                    }
                )
        elif montant is not None:
            raise serializers.ValidationError(
                {
                    "montant": (
                        f"Le montant ne s'applique qu'aux bons d'achat (« {variante.produit.nom} » "
                        "a un prix catalogue fixe)."
                    )
                }
            )
        return attrs


class ChangerStatutCommandeSerializer(serializers.Serializer):
    """Entrée de POST /boutique/commandes/{id}/changer-statut/ — Bureau Admin+."""

    statut = serializers.ChoiceField(choices=StatutCommande.choices)


# --- Bons d'achat (demande utilisateur du 2026-09-23, voir docstring de tête de models.py) ---


class BonAchatSerializer(serializers.ModelSerializer):
    utilisable = serializers.BooleanField(read_only=True)
    est_expire = serializers.BooleanField(read_only=True)

    class Meta:
        model = BonAchat
        fields = [
            "id",
            "code",
            "montant_initial",
            "solde",
            "statut",
            "achete_par",
            "mode_paiement",
            "date_paiement_confirme",
            "paiement_confirme_par",
            "reference_paiement",
            "date_expiration",
            "utilisable",
            "est_expire",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class VerifierBonAchatSerializer(serializers.Serializer):
    """Entrée de POST /boutique/bons-achat/verifier/ — vérification d'un code sans le
    consommer, pour l'aperçu au checkout (voir PanierCommandePage frontend)."""

    code = serializers.CharField(max_length=20)


class BonAchatVerificationSerializer(serializers.ModelSerializer):
    """Sortie de `verifier` — volontairement plus restreinte que BonAchatSerializer : n'importe
    quel détenteur du code peut interroger cet endpoint (c'est le principe même d'un bon
    d'achat, transmissible), il n'a donc jamais à voir l'identité de l'acheteur d'origine
    (`achete_par`) ni les détails de paiement."""

    utilisable = serializers.BooleanField(read_only=True)

    class Meta:
        model = BonAchat
        fields = ["code", "solde", "statut", "date_expiration", "utilisable"]
        read_only_fields = fields
