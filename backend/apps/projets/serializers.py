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
from apps.finances.serializers import DepenseSerializer
from apps.membres.models import Membre
from apps.uebersetzung.serializers import UebersetzungenField

from .models import (
    Aufgabe,
    AufgabeKommentar,
    PlanKosten,
    Projet,
    ProjetAktivitaet,
    ProjetImage,
    ProjetMiseAJour,
    ProjetMiseAJourImage,
    ProjetMitglied,
    StatutProjet,
)
from .permissions import (
    darf_arbeitsbereich,
    est_gestionnaire_projet,
    kann_team_verwalten,
    liest_alle_arbeitsbereiche,
    rolle_im_projekt,
)


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
    budget_jahr = serializers.IntegerField(read_only=True)
    est_gestionnaire = serializers.SerializerMethodField()
    partner_logos = serializers.SerializerMethodField()
    meine_rolle = serializers.SerializerMethodField()
    darf_arbeitsbereich = serializers.SerializerMethodField()
    darf_team_verwalten = serializers.SerializerMethodField()

    uebersetzungen = UebersetzungenField()

    class Meta:
        model = Projet
        fields = [
            "id",
            "uebersetzungen",
            "titre",
            "description_html",
            "statut",
            "sichtbarkeit",
            "responsable",
            "responsable_detail",
            "cagnote_active",
            "objectif_montant",
            "montant_collecte",
            "nb_contributeurs",
            "historisch_betrag",
            "historisch_beitragende",
            "historisch_jahr",
            "date_limite",
            "plan_jahr",
            "budget_jahr",
            "echeance_depassee",
            "ordre",
            "images",
            "est_gestionnaire",
            "partner_logos",
            "meine_rolle",
            "darf_arbeitsbereich",
            "darf_team_verwalten",
            "created_by",
            "created_at",
            "updated_at",
        ]
        # plan_jahr nur über die Aktion `planjahr` (prüft den Projekttopf des Zieljahres).
        read_only_fields = ["id", "created_by", "created_at", "updated_at", "plan_jahr"]

    def validate(self, attrs):
        betrag = attrs.get("historisch_betrag", getattr(self.instance, "historisch_betrag", 0))
        anzahl = attrs.get(
            "historisch_beitragende", getattr(self.instance, "historisch_beitragende", 0)
        )
        statut = attrs.get("statut", getattr(self.instance, "statut", None))
        if (betrag or anzahl) and statut != StatutProjet.TERMINE:
            raise serializers.ValidationError(
                {
                    "historisch_betrag": "Ein manuell erfasster Beitrag ist nur bei einem "
                    "abgeschlossenen Projekt möglich."
                }
            )
        return attrs

    def get_partner_logos(self, obj) -> list:
        from apps.partenaires.services import partner_logos

        return partner_logos(obj, "projet")

    def get_est_gestionnaire(self, obj) -> bool:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return est_gestionnaire_projet(user, obj)

    def _user(self):
        return getattr(self.context.get("request"), "user", None)

    def get_meine_rolle(self, obj) -> str | None:
        return rolle_im_projekt(self._user(), obj)

    def get_darf_arbeitsbereich(self, obj) -> bool:
        # Le droit "lecture de tous les espaces" est le même pour tous les projets d'une liste :
        # calculé une seule fois par requête (évite une requête RBAC par projet).
        if "_leser" not in self.context:
            self.context["_leser"] = liest_alle_arbeitsbereiche(self._user())
        return darf_arbeitsbereich(self._user(), obj, leser=self.context["_leser"])

    def get_darf_team_verwalten(self, obj) -> bool:
        return kann_team_verwalten(self._user(), obj)


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


class ProjetMitgliedSerializer(serializers.ModelSerializer):
    membre_detail = MembreResumeSerializer(source="membre", read_only=True)

    class Meta:
        model = ProjetMitglied
        fields = ["id", "projet", "membre", "membre_detail", "rolle", "created_at"]
        read_only_fields = ["id", "created_at"]

    def update(self, instance, validated_data):
        # Même verrou anti-IDOR que les autres serializers du module : ni le projet ni le
        # membre d'une ligne d'équipe ne se réassignent, seul le rôle change.
        validated_data.pop("projet", None)
        validated_data.pop("membre", None)
        return super().update(instance, validated_data)

    def validate(self, attrs):
        projet = attrs.get("projet")
        membre = attrs.get("membre")
        if self.instance is None and projet and membre:
            if ProjetMitglied.objects.filter(projet=projet, membre=membre).exists():
                raise serializers.ValidationError(
                    {"membre": "Cette personne fait déjà partie de l'équipe."}
                )
        return attrs


class AufgabeSerializer(serializers.ModelSerializer):
    verantwortlich_detail = MembreResumeSerializer(source="verantwortlich", read_only=True)
    ueberfaellig = serializers.BooleanField(read_only=True)
    kommentare_anzahl = serializers.SerializerMethodField()

    class Meta:
        model = Aufgabe
        fields = [
            "id",
            "projet",
            "titel",
            "beschreibung",
            "verantwortlich",
            "verantwortlich_detail",
            "frist",
            "prioritaet",
            "status",
            "ordre",
            "ueberfaellig",
            "erledigt_am",
            "kommentare_anzahl",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "erledigt_am", "created_by", "created_at", "updated_at"]
        extra_kwargs = {"projet": {"required": True}}

    def get_kommentare_anzahl(self, obj) -> int:
        anzahl = getattr(obj, "kommentare_anzahl", None)
        return anzahl if anzahl is not None else obj.kommentare.count()

    def validate(self, attrs):
        projet = attrs.get("projet") or (self.instance.projet if self.instance else None)
        verantwortlich = attrs.get("verantwortlich")
        if (
            projet is not None
            and verantwortlich is not None
            and not ProjetMitglied.objects.filter(projet=projet, membre=verantwortlich).exists()
        ):
            raise serializers.ValidationError(
                {"verantwortlich": "Die verantwortliche Person muss zum Projektteam gehören."}
            )
        return attrs

    def update(self, instance, validated_data):
        validated_data.pop("projet", None)
        return super().update(instance, validated_data)


class AufgabeKommentarSerializer(serializers.ModelSerializer):
    autor_detail = MembreResumeSerializer(source="autor", read_only=True)

    class Meta:
        model = AufgabeKommentar
        fields = ["id", "aufgabe", "text", "autor", "autor_detail", "created_at"]
        read_only_fields = ["id", "autor", "created_at"]
        extra_kwargs = {"aufgabe": {"required": True}}

    def update(self, instance, validated_data):
        validated_data.pop("aufgabe", None)
        return super().update(instance, validated_data)


class PlanKostenSerializer(serializers.ModelSerializer):
    categorie_nom = serializers.CharField(source="categorie.nom", read_only=True)
    categorie_namen = serializers.DictField(source="categorie.namen", read_only=True)

    class Meta:
        model = PlanKosten
        fields = [
            "id",
            "projet",
            "categorie",
            "categorie_nom",
            "categorie_namen",
            "betrag",
            "notiz",
            "updated_at",
        ]
        read_only_fields = ["id", "updated_at"]
        # Eindeutigkeit prüft validate() mit einer klaren Meldung (Projekt/Kostenart ändern sich
        # nach dem Anlegen nie — update() ignoriert beide Felder).
        validators = []

    def validate_categorie(self, categorie):
        if not categorie.actif:
            raise serializers.ValidationError("Kostenart deaktiviert.")
        return categorie

    def validate(self, attrs):
        projet, categorie = attrs.get("projet"), attrs.get("categorie")
        if (
            self.instance is None
            and projet
            and categorie
            and PlanKosten.objects.filter(projet=projet, categorie=categorie).exists()
        ):
            raise serializers.ValidationError(
                {"categorie": "Für diese Kostenart gibt es schon einen Plan."}
            )
        return attrs

    def update(self, instance, validated_data):
        validated_data.pop("projet", None)
        validated_data.pop("categorie", None)
        return super().update(instance, validated_data)


class ProjetKostenSerializer(DepenseSerializer):
    """Ist-Kosten eines Projekts = `finances.Depense` mit gesetztem Projekt. Dieselbe Validierung
    (Beleg, aktive Kostenart, Aufgabe gehört zum Projekt), aber ohne Veranstaltung ; das Projekt
    ist Pflicht und danach unveränderlich."""

    class Meta(DepenseSerializer.Meta):
        fields = [
            f for f in DepenseSerializer.Meta.fields if f not in ("evenement", "evenement_titre")
        ]
        extra_kwargs = {"projet": {"required": True, "allow_null": False}}

    def update(self, instance, validated_data):
        validated_data.pop("projet", None)
        return super().update(instance, validated_data)


class ProjetAktivitaetSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjetAktivitaet
        fields = ["id", "projet", "zeitpunkt", "akteur_name", "aktion", "objekt", "detail"]
        read_only_fields = fields
