"""
Vues API — app cotisations (TDD §2.4) :
  GET   /cotisations/           — liste (scope selon rôle, RH+ voit tout)
  POST  /cotisations/           — enregistrer un paiement (libre-service, ou pour autrui si DG+)
  GET   /cotisations/{id}/      — détail (scope selon rôle)
  GET   /cotisations/{id}/receipt/       — reçu PDF (AHM-17, RICEFW R-010/W-002)
  POST  /cotisations/{id}/marquer-payee/ — confirmer manuellement un paiement reçu hors ligne
                                            (AHM-53, DF/Admin uniquement)
  POST  /cotisations/{id}/initier-paiement-en-ligne/ — créer une session/commande Stripe ou
                                            PayPal (AHM-46, propriétaire uniquement)
  POST  /cotisations/{id}/changer-statut/ — corriger rétroactivement le statut vers n'importe
                                            lequel des 5 statuts, avec motif (ajouté le
                                            2026-09-19, DF/Admin uniquement — voir
                                            HistoriqueStatutCotisation)
  GET   /cotisations/{id}/historique-statuts/ — historique des changements de statut (ajouté le
                                            2026-09-19, même scope que list/retrieve)

  GET/POST/PATCH/DELETE /configurations-relance/ — échéance des relances par année de cotisation
                                            (AHM-54, DF/Admin uniquement — voir
                                            ConfigurationRelanceViewSet ci-dessous)
  GET/POST/PATCH   /articles-catalogue/  — catalogue d'articles de paiement personnalisés (ajouté
                                            le 2026-09-17) : lecture ouverte à tout authentifié
                                            (scope aux actifs pour un rôle < Administrateur App,
                                            sauf les 2 lignes type_fixe cotisation/adhésion —
                                            toujours visibles, voir ArticleCatalogueViewSet),
                                            écriture réservée à l'Administrateur App — voir
                                            ArticleCatalogueViewSet ci-dessous. Pas de DELETE :
                                            "Deaktivieren" (actif=False), jamais "Löschen".

Pas de PUT/PATCH/DELETE sur /cotisations/ : registre financier append-only (voir models.py) —
seule exception volontaire, l'action `marquer_payee` ci-dessous, réservée au Directeur
Financier/Admin. ConfigurationRelance (AHM-54) n'est pas un registre financier — c'est un
paramétrage, donc CRUD complet, mais réservé au même niveau de rôle.

Règle AHM-53 (retour utilisateur : recevoir une quittance immédiate pour un virement SEPA non
encore réglé est trompeur) : `perform_create` impose toujours statut=en_attente pour un paiement
en libre-service (le membre paie pour lui-même), quel que soit le mode de paiement choisi et quel
que soit le statut transmis par le client. Seule la saisie pour le compte d'un AUTRE membre par le
Directeur Financier/Admin (F-015, staff qui constate une transaction déjà reçue) conserve le
statut transmis par le client.

AHM-46 (passerelles de paiement réelles, écart assumé avec le FDD §1.3 qui plaçait ceci hors
périmètre Phase 1 — décision explicite avec l'utilisateur le 2026-09-11, voir le ticket Linear) :
`initier_paiement_en_ligne` crée une session Stripe Checkout ou une commande PayPal Checkout
(apps.cotisations.gateways) pour les modes carte/paypal uniquement — le virement SEPA reste
exclusivement une confirmation manuelle (`marquer_payee`), une automatisation SEPA réelle étant
hors de proportion pour une association de cette taille. Le passage à `payee` n'est jamais décidé
ici ni par le client : c'est le webhook (apps.cotisations.webhooks), signé par le PSP, qui décide
— même principe que `marquer_payee` (le statut final n'est jamais fait confiance au frontend,
CLAUDE.md §8).
"""

from django.conf import settings
from django.db.models import Q
from django.http import HttpResponse
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import CursorPagination
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.accounts.models import ROLE_LEVELS

from .filters import CotisationFilter
from .gateways import GatewayError, creer_commande_paypal, creer_session_stripe
from .models import (
    ArticleCatalogue,
    ConfigurationRelance,
    Cotisation,
    HistoriqueStatutCotisation,
    ModePaiement,
    StatutCotisation,
)
from .notifications import notifier_nouveau_paiement_attente_staff
from .notifications import notifier_paiement_confirme as _notifier_paiement_confirme
from .pdf import generate_receipt_pdf
from .permissions import (
    GESTION_ARTICLES_MIN_LEVEL,
    READ_ALL_MIN_LEVEL,
    SAISIE_POUR_AUTRUI_MIN_LEVEL,
    ArticleCataloguePermission,
    CotisationPermission,
)
from .serializers import (
    ArticleCatalogueSerializer,
    ChangerStatutCotisationSerializer,
    ConfigurationRelanceSerializer,
    CotisationSerializer,
    HistoriqueStatutCotisationSerializer,
)

# Modes de paiement pris en charge par initier_paiement_en_ligne (AHM-46) — le virement SEPA n'a
# volontairement pas d'équivalent en ligne, voir docstring de module.
MODES_PAIEMENT_EN_LIGNE = {ModePaiement.CARTE, ModePaiement.PAYPAL}

# Statuts depuis lesquels une confirmation manuelle de paiement (marquer_payee) est autorisée.
# "payee" (déjà fait), "remboursee" et "annulee" sont des statuts terminaux qu'on ne réécrit pas.
STATUTS_CONFIRMABLES_EN_PAYEE = {StatutCotisation.EN_ATTENTE, StatutCotisation.ECHOUEE}


class CotisationCursorPagination(CursorPagination):
    page_size = 20
    ordering = ("-created_at", "id")


class CotisationViewSet(ModelViewSet):
    http_method_names = ["get", "post", "head", "options"]
    permission_classes = [CotisationPermission]
    serializer_class = CotisationSerializer
    pagination_class = CotisationCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_class = CotisationFilter

    def get_queryset(self):
        queryset = Cotisation.objects.select_related("membre", "saisie_par").all()
        user = self.request.user
        if not user or not user.is_authenticated:
            return queryset.none()
        if ROLE_LEVELS.get(user.role, 0) >= READ_ALL_MIN_LEVEL:
            return queryset
        # Protection IDOR (SCD §2.3 A01) : sous RH, uniquement les cotisations de sa propre
        # fiche membre (si elle existe et est liée à son compte).
        membre = getattr(user, "membre", None)
        return queryset.filter(membre=membre) if membre else queryset.none()

    def perform_create(self, serializer):
        user = self.request.user
        membre_self = getattr(user, "membre", None)
        membre_cible = serializer.validated_data.get("membre")

        if membre_cible and membre_cible != membre_self:
            if ROLE_LEVELS.get(user.role, 0) < SAISIE_POUR_AUTRUI_MIN_LEVEL:
                raise PermissionDenied(
                    "Seuls le Directeur Financier ou l'Administrateur peuvent enregistrer une "
                    "transaction pour le compte d'un autre membre."
                )
            cotisation = serializer.save(membre=membre_cible, saisie_par=membre_self)
            # Ajouté le 2026-09-21 (feature "Barzahlung eintragen" : enregistrer directement une
            # transaction déjà reçue en espèces) — si le DF/Admin saisit une transaction DÉJÀ
            # payee (ex. espèces remises en main propre), on déclenche les mêmes effets de bord
            # qu'une confirmation via marquer_payee (email/notification "paiement confirmé", mise
            # à jour du statut associatif annuel du membre, cascade adhésion/évènement liés — voir
            # notifications.notifier_paiement_confirme) : le membre doit être informé et le reste
            # du système doit réagir exactement comme si le DF avait confirmé un paiement
            # en_attente existant. Aucun effet si la transaction saisie reste en_attente/echouee
            # (ex. virement SEPA annoncé mais pas encore reçu, comportement inchangé).
            if cotisation.statut == StatutCotisation.PAYEE:
                _notifier_paiement_confirme(cotisation)
            return

        if membre_self is None:
            raise ValidationError(
                {"membre": "Aucune fiche membre associée à ce compte utilisateur."}
            )
        # AHM-53 : jamais fait confiance au statut transmis par le client en libre-service — voir
        # docstring de ce module. Le paiement reste en_attente jusqu'à confirmation manuelle
        # (marquer_payee ci-dessous) ; aucune référence de transaction/reçu tant qu'il ne l'est pas.
        cotisation = serializer.save(
            membre=membre_self, saisie_par=None, statut=StatutCotisation.EN_ATTENTE
        )
        # Notification staff (ajoutée le 2026-09-16) — seule cette branche libre-service
        # produit un paiement en_attente à confirmer ; la saisie DF pour autrui ci-dessus n'en
        # a pas besoin (voir notifications.notifier_nouveau_paiement_attente_staff).
        notifier_nouveau_paiement_attente_staff(cotisation)

    @action(detail=True, methods=["get"])
    def receipt(self, request, pk=None):
        """
        GET /cotisations/{id}/receipt/ — reçu PDF (AHM-17). get_object() applique le même
        scope IDOR que list/retrieve (CotisationPermission.has_object_permission) : propriétaire
        ou RH+ uniquement.
        """
        cotisation = self.get_object()
        if cotisation.statut != StatutCotisation.PAYEE:
            raise ValidationError(
                "Le reçu n'est disponible que pour une cotisation payée "
                f"(statut actuel : {cotisation.get_statut_display()})."
            )

        pdf_bytes = generate_receipt_pdf(cotisation)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="recu-{cotisation.reference_transaction}.pdf"'
        )
        return response

    @action(detail=True, methods=["post"], url_path="marquer-payee")
    def marquer_payee(self, request, pk=None):
        """
        POST /cotisations/{id}/marquer-payee/ — confirme la réception d'un paiement effectué hors
        ligne (virement SEPA en attente de réconciliation, chèque, espèces...), AHM-53. get_object()
        applique le même scope IDOR que list/retrieve (propriétaire ou RH+), mais l'exécution de
        l'action elle-même est réservée au Directeur Financier et à l'Administrateur App
        (SAISIE_POUR_AUTRUI_MIN_LEVEL) : le RH garde un accès en lecture seule sur ce module.
        """
        cotisation = self.get_object()

        if ROLE_LEVELS.get(request.user.role, 0) < SAISIE_POUR_AUTRUI_MIN_LEVEL:
            raise PermissionDenied(
                "Seuls le Directeur Financier ou l'Administrateur peuvent marquer un paiement "
                "comme reçu."
            )

        if cotisation.statut not in STATUTS_CONFIRMABLES_EN_PAYEE:
            raise ValidationError(
                "Seule une cotisation en attente ou échouée peut être marquée comme payée "
                f"(statut actuel : {cotisation.get_statut_display()})."
            )

        mode_paiement = request.data.get("mode_paiement", "")
        if mode_paiement:
            if mode_paiement not in ModePaiement.values:
                raise ValidationError({"mode_paiement": "Mode de paiement invalide."})
            cotisation.mode_paiement = mode_paiement
        elif not cotisation.mode_paiement:
            raise ValidationError(
                {
                    "mode_paiement": (
                        "Le mode de paiement doit être précisé pour confirmer ce paiement."
                    )
                }
            )

        ancien_statut = cotisation.statut
        cotisation.statut = StatutCotisation.PAYEE
        # save() (voir models.py) génère la référence de transaction et la date de paiement
        # puisque le statut passe à "payee" sans référence existante.
        cotisation.save()
        # Journalisation (ajoutée le 2026-09-19, voir HistoriqueStatutCotisation) — même point
        # d'écriture que changer_statut ci-dessous, sans motif (transition standard du flux
        # normal, pas une correction manuelle).
        HistoriqueStatutCotisation.objects.create(
            cotisation=cotisation,
            ancien_statut=ancien_statut,
            nouveau_statut=StatutCotisation.PAYEE,
            modifie_par=getattr(request.user, "membre", None),
        )
        _notifier_paiement_confirme(cotisation)

        return Response(CotisationSerializer(cotisation).data)

    @action(detail=True, methods=["post"], url_path="changer-statut")
    def changer_statut(self, request, pk=None):
        """
        POST /cotisations/{id}/changer-statut/ (ajouté le 2026-09-19, demande utilisateur : "Bei
        'Ausstehende Zahlungen' muss es möglich sein die Historie zu behalten und Zahlungsstatus
        nachträglich zu ändern" — "Admin kann jeden Status ändern + volles Änderungsprotokoll").

        Contrairement à `marquer_payee` (restreint EN_ATTENTE/ECHOUEE -> PAYEE, flux normal de
        confirmation d'un paiement reçu hors ligne), cette action autorise le Directeur
        Financier/Admin à corriger RÉTROACTIVEMENT le statut d'une cotisation vers N'IMPORTE
        LEQUEL des 5 statuts (y compris revenir en arrière depuis "payee", ex. paiement finalement
        rejeté/à tort confirmé) — chaque changement est journalisé (HistoriqueStatutCotisation),
        avec motif optionnel.

        Effets de bord volontairement limités : si le nouveau statut est "payee", la même
        notification que marquer_payee est déclenchée (email + in-app + synchronisation du statut
        associatif annuel du membre, voir notifications.notifier_paiement_confirme) — cohérent
        avec le fait qu'une cotisation devient "payee" par ce chemin ou par marquer_payee de
        façon équivalente pour la suite du système. À l'inverse, annuler rétroactivement un
        paiement (payee -> un autre statut) NE désactive PAS automatiquement le membre : cette
        automatisation reste le rôle du pipeline de relance existant (checkpoint J+1, voir
        apps.cotisations.tasks._desactiver_membres_impayes_pour) plutôt qu'un effet de bord
        immédiat d'une correction ponctuelle, potentiellement surprenant pour l'Admin qui ne
        fait que corriger une erreur de saisie.
        """
        cotisation = self.get_object()

        if ROLE_LEVELS.get(request.user.role, 0) < SAISIE_POUR_AUTRUI_MIN_LEVEL:
            raise PermissionDenied(
                "Seuls le Directeur Financier ou l'Administrateur peuvent modifier le statut "
                "d'une cotisation."
            )

        serializer = ChangerStatutCotisationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        nouveau_statut = serializer.validated_data["statut"]
        motif = serializer.validated_data["motif"]

        ancien_statut = cotisation.statut
        if nouveau_statut == ancien_statut:
            raise ValidationError({"statut": "La cotisation a déjà ce statut."})

        cotisation.statut = nouveau_statut
        cotisation.save()
        HistoriqueStatutCotisation.objects.create(
            cotisation=cotisation,
            ancien_statut=ancien_statut,
            nouveau_statut=nouveau_statut,
            motif=motif,
            modifie_par=getattr(request.user, "membre", None),
        )
        if nouveau_statut == StatutCotisation.PAYEE:
            _notifier_paiement_confirme(cotisation)

        return Response(CotisationSerializer(cotisation).data)

    @action(detail=True, methods=["get"], url_path="historique-statuts")
    def historique_statuts(self, request, pk=None):
        """GET /cotisations/{id}/historique-statuts/ — même scope IDOR que list/retrieve
        (get_object() : propriétaire ou RH+, voir CotisationPermission)."""
        cotisation = self.get_object()
        historique = cotisation.historique_statuts.select_related("modifie_par")
        return Response(HistoriqueStatutCotisationSerializer(historique, many=True).data)

    @action(detail=True, methods=["post"], url_path="initier-paiement-en-ligne")
    def initier_paiement_en_ligne(self, request, pk=None):
        """
        POST /cotisations/{id}/initier-paiement-en-ligne/ (AHM-46) — crée une session Stripe
        Checkout ou une commande PayPal Checkout pour cette cotisation et renvoie son URL de
        redirection. Réservé au propriétaire de la cotisation (paiement en libre-service
        uniquement — une écriture saisie par le DF pour un autre membre, F-015, n'a pas vocation
        à être payée en ligne par ce dernier depuis cette action).
        """
        cotisation = self.get_object()
        membre_self = getattr(request.user, "membre", None)

        if membre_self is None or cotisation.membre_id != membre_self.id:
            raise PermissionDenied(
                "Seul le titulaire de cette cotisation peut initier un paiement en ligne."
            )

        if cotisation.statut not in STATUTS_CONFIRMABLES_EN_PAYEE:
            raise ValidationError(
                "Seule une cotisation en attente ou échouée peut être payée en ligne "
                f"(statut actuel : {cotisation.get_statut_display()})."
            )

        if cotisation.mode_paiement not in MODES_PAIEMENT_EN_LIGNE:
            raise ValidationError(
                {
                    "mode_paiement": (
                        "Le paiement en ligne n'est disponible que pour les modes carte et "
                        "PayPal — le virement SEPA reste confirmé manuellement par le "
                        "Directeur Financier."
                    )
                }
            )

        success_url = f"{settings.FRONTEND_URL}/cotisation/retour?cotisation={cotisation.id}"
        cancel_url = (
            f"{settings.FRONTEND_URL}/cotisation/retour?cotisation={cotisation.id}&annule=1"
        )
        try:
            # Appelées par leur nom de module (pas via un dict construit à l'import) pour rester
            # patchables individuellement dans les tests (unittest.mock.patch sur
            # apps.cotisations.views.creer_session_stripe / creer_commande_paypal).
            if cotisation.mode_paiement == ModePaiement.CARTE:
                redirect_url = creer_session_stripe(
                    cotisation.id, cotisation.libelle, cotisation.montant, success_url, cancel_url
                )
            else:
                redirect_url = creer_commande_paypal(
                    cotisation.id, cotisation.libelle, cotisation.montant, success_url, cancel_url
                )
        except GatewayError as exc:
            # Message volontairement générique côté client (jamais de détail interne PSP) — voir
            # GatewayError. Le paiement reste en_attente : le membre peut réessayer plus tard, ou
            # le Directeur Financier peut le confirmer manuellement (marquer_payee) s'il reçoit
            # le paiement par un autre biais.
            raise ValidationError(
                {
                    "gateway": (
                        "Le paiement en ligne n'est pas disponible pour le moment. "
                        "Contactez le Directeur Financier."
                    )
                }
            ) from exc

        return Response({"redirect_url": redirect_url})


class ConfigurationRelancePermission(BasePermission):
    """AHM-54 — même niveau que marquer_payee : Directeur Financier et Administrateur App."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and ROLE_LEVELS.get(user.role, 0) >= SAISIE_POUR_AUTRUI_MIN_LEVEL
        )


class ConfigurationRelanceCursorPagination(CursorPagination):
    # "annee" est unique (voir models.py) : ordre monotone valable pour un curseur, et cohérent
    # avec le tri déjà appliqué par le Meta.ordering du modèle.
    page_size = 20
    ordering = ("-annee",)


class ConfigurationRelanceViewSet(ModelViewSet):
    """
    AHM-54 (suite retour utilisateur sur AHM-18) — CRUD de l'échéance des relances par année de
    cotisation. Contrairement à Cotisation (registre financier append-only), il ne s'agit que
    d'un paramétrage : PATCH/DELETE sont exposés, mais réservés au Directeur Financier/Admin
    (même niveau que `marquer_payee`) puisqu'une échéance mal réglée impacte directement les
    relances envoyées aux membres.
    """

    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    permission_classes = [ConfigurationRelancePermission]
    serializer_class = ConfigurationRelanceSerializer
    pagination_class = ConfigurationRelanceCursorPagination
    queryset = ConfigurationRelance.objects.select_related("modifie_par").all()

    def perform_create(self, serializer):
        serializer.save(modifie_par=getattr(self.request.user, "membre", None))

    def perform_update(self, serializer):
        serializer.save(modifie_par=getattr(self.request.user, "membre", None))


class ArticleCatalogueCursorPagination(CursorPagination):
    # Petit catalogue par nature (association de taille modeste) — même choix que
    # ConfigurationRelanceCursorPagination ci-dessus, la 1re page suffit en pratique.
    page_size = 20
    ordering = ("libelle",)


class ArticleCatalogueViewSet(ModelViewSet):
    """
    Catalogue d'articles de paiement personnalisés, géré par l'Administrateur App (ajouté le
    2026-09-17, retour utilisateur : "Artikeln / Elemente bei Cotisation müssen vom APP-Admin
    verwaltbar sein (Anlegen / Aktualisieren / Deaktivieren)") — voir ArticleCataloguePermission
    et models.ArticleCatalogue. Pas de DELETE exposé : "Deaktivieren" (actif=False via PATCH),
    jamais "Löschen" — un article référencé par une Cotisation existante ne doit jamais pouvoir
    disparaître (voir Cotisation.article_catalogue, on_delete=PROTECT).

    Ce même queryset renvoie aussi, mêlées aux articles personnalisés, les 2 lignes techniques
    `type_fixe` (cotisation/adhésion, seedées par la migration 0006 — voir docstring de module de
    models.py) : suite au retour utilisateur du même jour ("die bestehende [Artikel] müssen auch
    verwaltbar sein"), leur montant/actif se gèrent exactement comme un article personnalisé, via
    ce même endpoint — pas de vue séparée. `type_fixe` est en lecture seule côté serializer : ces
    2 lignes ne peuvent ni être créées à nouveau, ni renommées en un autre type, seulement
    modifiées/désactivées.

    Bug corrigé le 2026-09-17 (retour utilisateur : "Die Artikel sind immer noch bei einem anderen
    User vorhanden aber nicht mehr beim App-Admin") : un membre normal continue à ne PAS voir un
    article personnalisé désactivé (comportement voulu, voir plus bas), mais voit désormais
    toujours les 2 lignes `type_fixe`, actives ou non — jamais filtrées par ce queryset pour lui.
    Raison : CotisationStepperPage (frontend) décide d'afficher/masquer la carte cotisation/
    adhésion en cherchant la ligne correspondante dans la réponse ; si ce queryset la lui cachait
    dès qu'elle est désactivée, le frontend ne pouvait plus distinguer "ligne inexistante/pas
    encore seedée" (repli volontaire vers le tarif par défaut, toujours actif) de "ligne désactivée
    par l'Administrateur App" — les deux cas produisaient la même absence côté membre, et le
    stepper retombait donc à tort sur le tarif par défaut (toujours actif) au lieu de masquer la
    carte. Aucune donnée sensible exposée par ce changement : seuls libellé/montant/actif, déjà
    publics pour tout authentifié.
    """

    http_method_names = ["get", "post", "patch", "head", "options"]
    permission_classes = [ArticleCataloguePermission]
    serializer_class = ArticleCatalogueSerializer
    pagination_class = ArticleCatalogueCursorPagination

    def get_queryset(self):
        queryset = ArticleCatalogue.objects.all()
        user = self.request.user
        if (
            user
            and user.is_authenticated
            and ROLE_LEVELS.get(user.role, 0) >= GESTION_ARTICLES_MIN_LEVEL
        ):
            return queryset
        # Un membre normal (ou tout rôle < Administrateur App) ne doit voir, pour choisir dans le
        # stepper, que les articles personnalisés actuellement proposés — voir docstring de
        # classe. Les 2 lignes type_fixe restent toujours visibles, actives ou non (Q séparé) :
        # voir le paragraphe "Bug corrigé le 2026-09-17" ci-dessus.
        return queryset.filter(Q(actif=True) | Q(type_fixe__isnull=False))
