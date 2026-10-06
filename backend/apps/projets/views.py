"""
Vues API — app projets (module "Projets & Actions", demande utilisateur du 2026-09-22 —
voir docstring de module de models.py pour le détail des 8 points) :

  GET/POST         /projets/projets/                — kacheln (lecture : tout authentifié,
                                                        statut "en_preparation" masqué sous
                                                        Bureau Admin ; écriture : Bureau
                                                        Admin+)
  GET/PATCH/DELETE  /projets/projets/{id}/
  GET               /projets/projets/{id}/contributeurs/  — face arrière de la kachel
                                                              (demande utilisateur point 5),
                                                              tout authentifié
  GET/POST          /projets/images/                — carrousel (demande utilisateur
                                                        point 1.1) ; écriture : Bureau
                                                        Admin+ OU responsable du projet
                                                        référencé
  PATCH/DELETE      /projets/images/{id}/
  GET/POST          /projets/mises-a-jour/           — rapport d'avancement (demande
                                                        utilisateur point 7), même règle
                                                        d'écriture que les images
  PATCH/DELETE      /projets/mises-a-jour/{id}/
  GET/POST          /projets/mises-a-jour-images/     — images jointes au rapport, même
                                                        règle d'écriture
  DELETE            /projets/mises-a-jour-images/{id}/

La contribution libre elle-même (demande utilisateur point 2 "freie Beiträge... zu
zahlen") ne passe PAS par ce module : c'est une Cotisation(type_article=projet,
projet=<ce Projet>) créée via POST /cotisations/cotisations/ (voir
apps.cotisations.views.CotisationViewSet — déjà entièrement générique vis-à-vis de
type_article, aucune vue dédiée n'est nécessaire ici, y compris pour le paiement en ligne
Stripe/PayPal ou la saisie pour autrui F-015).
"""

from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Max, Sum
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import CursorPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.cotisations.models import Cotisation, StatutCotisation
from apps.membres.models import Membre

from .models import (
    Aufgabe,
    AufgabeKommentar,
    ProjetImage,
    ProjetMiseAJour,
    ProjetMiseAJourImage,
    ProjetMitglied,
    RolleProjet,
    SichtbarkeitProjet,
    StatutAufgabe,
)
from .notifications import notifier_aufgabe_zugewiesen, notifier_kommentar
from .permissions import (
    GestionContenuProjetPermission,
    ProjetPermission,
    arbeitsbereich_projekte,
    darf_arbeitsbereich,
    est_gestionnaire_projet,
    kann_aufgaben_bearbeiten,
    kann_team_verwalten,
    sichtbare_projekte,
)
from .serializers import (
    AufgabeKommentarSerializer,
    AufgabeSerializer,
    ContributeurSerializer,
    ProjetImageSerializer,
    ProjetMiseAJourImageSerializer,
    ProjetMiseAJourSerializer,
    ProjetMitgliedSerializer,
    ProjetSerializer,
)


class ProjetsCursorPagination(CursorPagination):
    """Pour Projet/ProjetImage/ProjetMiseAJourImage — tous ont un champ `ordre` propre
    (voir models.py). PAS pour ProjetMiseAJour, qui n'a pas ce champ — voir
    MisesAJourCursorPagination ci-dessous."""

    page_size = 20
    ordering = ("ordre", "-created_at", "id")


class MisesAJourCursorPagination(CursorPagination):
    """ProjetMiseAJour n'a pas de champ `ordre` (le rapport d'avancement s'ordonne
    naturellement par date, voir Meta.ordering du modèle) — une pagination dédiée plutôt
    que de réutiliser ProjetsCursorPagination, qui lèverait une FieldError sur ce
    modèle."""

    page_size = 20
    ordering = ("-created_at", "id")


class ProjetViewSet(ModelViewSet):
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    permission_classes = [ProjetPermission]
    serializer_class = ProjetSerializer
    pagination_class = ProjetsCursorPagination

    def get_permissions(self):
        # La Direction d'un projet (pas seulement un gestionnaire) peut publier/dépublier : action
        # dédiée, contrôle d'objet fait dans la vue (voir `sichtbarkeit` ci-dessous).
        if self.action == "sichtbarkeit":
            return [IsAuthenticated()]
        return super().get_permissions()

    def get_queryset(self):
        # Visibilité : un brouillon n'est visible que de l'équipe et des gestionnaires (voir
        # apps.projets.permissions.sichtbare_projekte) — remplace l'ancienne règle fondée sur le
        # statut "en_preparation".
        return (
            sichtbare_projekte(self.request.user)
            .select_related("responsable", "created_by")
            .prefetch_related("images", "team")
        )

    def perform_create(self, serializer):
        membre = getattr(self.request.user, "membre", None)
        serializer.save(created_by=membre)

    @action(detail=True, methods=["post"])
    def sichtbarkeit(self, request, pk=None):
        """Publie/dépublie un projet — Direction du projet ou gestionnaire."""
        projet = self.get_object()
        if not kann_team_verwalten(request.user, projet):
            raise PermissionDenied("Nur die Projektleitung oder die Verwaltung darf das ändern.")
        wert = request.data.get("sichtbarkeit")
        if wert not in SichtbarkeitProjet.values:
            raise ValidationError({"sichtbarkeit": "Ungültiger Wert."})
        projet.sichtbarkeit = wert
        projet.save(update_fields=["sichtbarkeit", "updated_at"])
        return Response(self.get_serializer(projet).data)

    @action(detail=True, methods=["get"])
    def arbeitsbereich(self, request, pk=None):
        """Kennzahlen de l'espace de travail (progression des tâches) — équipe et lecture."""
        projet = self.get_object()
        if not darf_arbeitsbereich(request.user, projet):
            raise PermissionDenied("Der Arbeitsbereich ist nur für das Projektteam sichtbar.")
        aufgaben = Aufgabe.objects.filter(projet=projet)
        gesamt = aufgaben.count()
        erledigt = aufgaben.filter(status=StatutAufgabe.ERLEDIGT).count()
        ueberfaellig = (
            aufgaben.exclude(status=StatutAufgabe.ERLEDIGT)
            .filter(frist__lt=timezone.localdate())
            .count()
        )
        pro_status = {
            row["status"]: row["n"] for row in aufgaben.values("status").annotate(n=Count("id"))
        }
        return Response(
            {
                "gesamt": gesamt,
                "erledigt": erledigt,
                "ueberfaellig": ueberfaellig,
                "prozent": round(100 * erledigt / gesamt) if gesamt else 0,
                "pro_status": {code: pro_status.get(code, 0) for code in StatutAufgabe.values},
                "team_groesse": projet.team.count(),
            }
        )

    @action(detail=True, methods=["get"])
    def contributeurs(self, request, pk=None):
        """Face arrière de la kachel (demande utilisateur point 5, "Details zu den
        Mitgliedern die beigetragen haben") — agrégée à la volée sur le registre
        Cotisation, jamais dénormalisée (voir docstring de module
        serializers.ContributeurSerializer et models.Projet.montant_collecte)."""
        projet = self.get_object()
        totaux = (
            Cotisation.objects.filter(projet=projet, statut=StatutCotisation.PAYEE)
            .values("membre_id")
            .annotate(montant_total=Sum("montant"), derniere_contribution=Max("date_paiement"))
        )
        par_membre = {row["membre_id"]: row for row in totaux if row["membre_id"] is not None}
        membres = Membre.objects.filter(id__in=par_membre.keys())
        lignes = sorted(
            (
                {
                    "membre": membre,
                    "montant_total": par_membre[membre.id]["montant_total"],
                    "derniere_contribution": par_membre[membre.id]["derniere_contribution"],
                }
                for membre in membres
            ),
            key=lambda ligne: ligne["montant_total"],
            reverse=True,
        )
        return Response(ContributeurSerializer(lignes, many=True).data)

    @action(detail=False, methods=["get"])
    def kennzahlen(self, request):
        """Kennzahlen "Donators / Gesammelt / Projekte" de la page d'accueil publique façon
        mycid.org (demande utilisateur 2026-09-26, section C.3 du plan) — agrégées à la volée
        sur le même registre Cotisation que `contributeurs`/`Projet.montant_collecte`, jamais
        dénormalisées. `self.get_queryset()` applique déjà le bon périmètre selon qui demande
        (masque "en_preparation" à un anonyme/membre normal, montre tout à un Bureau Admin+),
        donc ces trois chiffres restent cohérents avec ce que l'appelant peut effectivement
        voir dans la liste des projets. Lecture ouverte à tout le monde (voir ProjetPermission),
        aucune action GET dédiée à protéger davantage — ce ne sont que des totaux, jamais le
        détail nominatif d'un contributeur (contrairement à `contributeurs` ci-dessus)."""
        projets = self.get_queryset()
        totaux = Cotisation.objects.filter(
            projet__in=projets, statut=StatutCotisation.PAYEE
        ).aggregate(montant_collecte=Sum("montant"), nb_donateurs=Count("membre_id", distinct=True))
        return Response(
            {
                "nb_projets": projets.count(),
                "montant_collecte": totaux["montant_collecte"] or Decimal("0.00"),
                "nb_donateurs": totaux["nb_donateurs"] or 0,
            }
        )


class ProjetImageViewSet(ModelViewSet):
    """Images de la kachel, carrousel auto-rotatif côté frontend (demande utilisateur
    point 1.1) — voir docstring de module."""

    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    permission_classes = [GestionContenuProjetPermission]
    serializer_class = ProjetImageSerializer
    pagination_class = ProjetsCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["projet"]

    def get_queryset(self):
        return ProjetImage.objects.select_related("projet", "uploaded_by").filter(
            projet__in=sichtbare_projekte(self.request.user)
        )

    def perform_create(self, serializer):
        # has_object_permission n'est jamais appelée à la création (pas encore
        # d'instance) — même garde manuelle que CotisationViewSet.perform_create pour la
        # saisie pour autrui (voir apps.projets.permissions.est_gestionnaire_projet).
        projet = serializer.validated_data.get("projet")
        if projet is None or not est_gestionnaire_projet(self.request.user, projet):
            raise PermissionDenied(
                "Seuls le Bureau Admin ou le responsable de ce projet peuvent ajouter " "une image."
            )
        membre = getattr(self.request.user, "membre", None)
        serializer.save(uploaded_by=membre)


class ProjetMiseAJourViewSet(ModelViewSet):
    """Rapport d'avancement — "Was getan wurde" (demande utilisateur point 7) — voir
    docstring de module."""

    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    permission_classes = [GestionContenuProjetPermission]
    serializer_class = ProjetMiseAJourSerializer
    pagination_class = MisesAJourCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["projet"]

    def get_queryset(self):
        return (
            ProjetMiseAJour.objects.select_related("projet", "created_by")
            .prefetch_related("images")
            .filter(projet__in=sichtbare_projekte(self.request.user))
        )

    def perform_create(self, serializer):
        projet = serializer.validated_data.get("projet")
        if projet is None or not est_gestionnaire_projet(self.request.user, projet):
            raise PermissionDenied(
                "Seuls le Bureau Admin ou le responsable de ce projet peuvent ajouter "
                "une mise à jour."
            )
        membre = getattr(self.request.user, "membre", None)
        serializer.save(created_by=membre)


class ProjetMiseAJourImageViewSet(ModelViewSet):
    """Images jointes à une mise à jour du rapport (demande utilisateur point 7, "mit
    Bildern") — voir docstring de module. Pas de PATCH exposé : seuls l'ordre
    d'affichage/l'image elle-même n'ont pas de cas d'usage "modifier après coup" identifié
    dans la demande, contrairement au carrousel de la kachel (ProjetImage.ordre, réordonné
    en continu)."""

    http_method_names = ["get", "post", "delete", "head", "options"]
    permission_classes = [GestionContenuProjetPermission]
    serializer_class = ProjetMiseAJourImageSerializer
    pagination_class = ProjetsCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["mise_a_jour"]

    def get_queryset(self):
        return ProjetMiseAJourImage.objects.select_related("mise_a_jour__projet").filter(
            mise_a_jour__projet__in=sichtbare_projekte(self.request.user)
        )

    def perform_create(self, serializer):
        mise_a_jour = serializer.validated_data.get("mise_a_jour")
        if mise_a_jour is None or not est_gestionnaire_projet(
            self.request.user, mise_a_jour.projet
        ):
            raise PermissionDenied(
                "Seuls le Bureau Admin ou le responsable de ce projet peuvent ajouter " "une image."
            )
        serializer.save()


class ArbeitsbereichCursorPagination(CursorPagination):
    """Un tableau Kanban a besoin de toutes les tâches d'un projet d'un coup — page large."""

    page_size = 200
    ordering = ("ordre", "created_at", "id")


class TeamCursorPagination(CursorPagination):
    page_size = 100
    ordering = ("created_at", "id")


class KommentarCursorPagination(CursorPagination):
    page_size = 100
    ordering = ("created_at", "id")


def _projekt_aus_daten(request, serializer, feld="projet"):
    projet = serializer.validated_data.get(feld)
    if projet is None:
        raise ValidationError({feld: "Dieses Feld ist erforderlich."})
    return projet


class ProjetTeamViewSet(ModelViewSet):
    """Équipe interne d'un projet (2026-10-06). Lecture : équipe, gestionnaires et service
    financier ; écriture : Direction du projet ou gestionnaire."""

    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    permission_classes = [IsAuthenticated]
    serializer_class = ProjetMitgliedSerializer
    pagination_class = TeamCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["projet"]

    def get_queryset(self):
        return ProjetMitglied.objects.select_related("membre", "projet").filter(
            projet__in=arbeitsbereich_projekte(self.request.user)
        )

    def _pruefe_schreibrecht(self, projet):
        if not kann_team_verwalten(self.request.user, projet):
            raise PermissionDenied(
                "Nur die Projektleitung oder die Verwaltung darf das Team ändern."
            )

    def perform_create(self, serializer):
        projet = _projekt_aus_daten(self.request, serializer)
        if not arbeitsbereich_projekte(self.request.user).filter(pk=projet.pk).exists():
            raise PermissionDenied("Kein Zugriff auf dieses Projekt.")
        self._pruefe_schreibrecht(projet)
        serializer.save()

    def _letzte_leitung(self, eintrag) -> bool:
        return (
            eintrag.rolle == RolleProjet.LEITUNG
            and not ProjetMitglied.objects.filter(projet=eintrag.projet, rolle=RolleProjet.LEITUNG)
            .exclude(pk=eintrag.pk)
            .exists()
        )

    def perform_update(self, serializer):
        eintrag = serializer.instance
        self._pruefe_schreibrecht(eintrag.projet)
        neue_rolle = serializer.validated_data.get("rolle", eintrag.rolle)
        if neue_rolle != RolleProjet.LEITUNG and self._letzte_leitung(eintrag):
            raise ValidationError({"rolle": "Das Projekt braucht mindestens eine Projektleitung."})
        serializer.save()

    def perform_destroy(self, instance):
        self._pruefe_schreibrecht(instance.projet)
        if self._letzte_leitung(instance):
            raise ValidationError(
                {"membre": "Die letzte Projektleitung kann nicht entfernt werden."}
            )
        instance.delete()


class AufgabeViewSet(ModelViewSet):
    """Tâches d'un projet / tableau Kanban (2026-10-06). Lecture : équipe, gestionnaires et
    service financier ; écriture : Direction, Collaboration et gestionnaires (jamais
    Observateur) ; suppression : Direction et gestionnaires."""

    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    permission_classes = [IsAuthenticated]
    serializer_class = AufgabeSerializer
    pagination_class = ArbeitsbereichCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["projet", "status", "verantwortlich"]

    def get_queryset(self):
        return (
            Aufgabe.objects.select_related("projet", "verantwortlich", "created_by")
            .annotate(kommentare_anzahl=Count("kommentare"))
            .filter(projet__in=arbeitsbereich_projekte(self.request.user))
        )

    @staticmethod
    def _setze_erledigt(aufgabe):
        if aufgabe.status == StatutAufgabe.ERLEDIGT:
            aufgabe.erledigt_am = aufgabe.erledigt_am or timezone.now()
        else:
            aufgabe.erledigt_am = None

    def perform_create(self, serializer):
        projet = _projekt_aus_daten(self.request, serializer)
        if not arbeitsbereich_projekte(self.request.user).filter(pk=projet.pk).exists():
            raise PermissionDenied("Kein Zugriff auf dieses Projekt.")
        if not kann_aufgaben_bearbeiten(self.request.user, projet):
            raise PermissionDenied("Keine Berechtigung, Aufgaben zu erstellen.")
        membre = getattr(self.request.user, "membre", None)
        aufgabe = serializer.save(created_by=membre)
        self._setze_erledigt(aufgabe)
        aufgabe.save(update_fields=["erledigt_am"])
        notifier_aufgabe_zugewiesen(aufgabe, durch=membre)

    def perform_update(self, serializer):
        aufgabe = serializer.instance
        if not kann_aufgaben_bearbeiten(self.request.user, aufgabe.projet):
            raise PermissionDenied("Keine Berechtigung, Aufgaben zu bearbeiten.")
        vorher = aufgabe.verantwortlich_id
        aufgabe = serializer.save()
        self._setze_erledigt(aufgabe)
        aufgabe.save(update_fields=["erledigt_am"])
        if aufgabe.verantwortlich_id and aufgabe.verantwortlich_id != vorher:
            notifier_aufgabe_zugewiesen(aufgabe, durch=getattr(self.request.user, "membre", None))

    def perform_destroy(self, instance):
        if not kann_team_verwalten(self.request.user, instance.projet):
            raise PermissionDenied("Nur Projektleitung oder Verwaltung darf Aufgaben löschen.")
        instance.delete()

    @action(detail=True, methods=["post"])
    def verschieben(self, request, pk=None):
        """Déplacement Kanban : {status, position} — place la tâche à `position` dans la
        colonne `status` et renumérote cette colonne (et l'ancienne) de façon contiguë."""
        aufgabe = self.get_object()
        if not kann_aufgaben_bearbeiten(request.user, aufgabe.projet):
            raise PermissionDenied("Keine Berechtigung, Aufgaben zu verschieben.")
        status = request.data.get("status", aufgabe.status)
        if status not in StatutAufgabe.values:
            raise ValidationError({"status": "Ungültiger Status."})
        try:
            position = max(int(request.data.get("position", 0)), 0)
        except (TypeError, ValueError):
            raise ValidationError({"position": "Ungültige Position."})
        with transaction.atomic():
            alter_status = aufgabe.status
            aufgabe.status = status
            self._setze_erledigt(aufgabe)
            aufgabe.save(update_fields=["status", "erledigt_am", "updated_at"])
            spalte = list(
                Aufgabe.objects.filter(projet=aufgabe.projet, status=status)
                .exclude(pk=aufgabe.pk)
                .order_by("ordre", "created_at")
            )
            spalte.insert(min(position, len(spalte)), aufgabe)
            spalten = [(status, spalte)]
            if alter_status != status:
                spalten.append(
                    (
                        alter_status,
                        list(
                            Aufgabe.objects.filter(
                                projet=aufgabe.projet, status=alter_status
                            ).order_by("ordre", "created_at")
                        ),
                    )
                )
            for _status, eintraege in spalten:
                for index, eintrag in enumerate(eintraege):
                    if eintrag.ordre != index:
                        Aufgabe.objects.filter(pk=eintrag.pk).update(ordre=index)
        aufgabe.refresh_from_db()
        return Response(self.get_serializer(self.get_queryset().get(pk=aufgabe.pk)).data)


class AufgabeKommentarViewSet(ModelViewSet):
    """Commentaires d'une tâche. Lecture : comme les tâches ; ajout : Direction, Collaboration et
    gestionnaires ; suppression : son auteur·e, la Direction ou un gestionnaire."""

    http_method_names = ["get", "post", "delete", "head", "options"]
    permission_classes = [IsAuthenticated]
    serializer_class = AufgabeKommentarSerializer
    pagination_class = KommentarCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["aufgabe"]

    def get_queryset(self):
        return AufgabeKommentar.objects.select_related("autor", "aufgabe__projet").filter(
            aufgabe__projet__in=arbeitsbereich_projekte(self.request.user)
        )

    def perform_create(self, serializer):
        aufgabe = _projekt_aus_daten(self.request, serializer, feld="aufgabe")
        if not arbeitsbereich_projekte(self.request.user).filter(pk=aufgabe.projet_id).exists():
            raise PermissionDenied("Kein Zugriff auf dieses Projekt.")
        if not kann_aufgaben_bearbeiten(self.request.user, aufgabe.projet):
            raise PermissionDenied("Keine Berechtigung, zu kommentieren.")
        kommentar = serializer.save(autor=getattr(self.request.user, "membre", None))
        notifier_kommentar(kommentar)

    def perform_destroy(self, instance):
        membre = getattr(self.request.user, "membre", None)
        eigener = membre is not None and instance.autor_id == membre.id
        if not (eigener or kann_team_verwalten(self.request.user, instance.aufgabe.projet)):
            raise PermissionDenied("Nur der Autor oder die Projektleitung darf löschen.")
        instance.delete()
