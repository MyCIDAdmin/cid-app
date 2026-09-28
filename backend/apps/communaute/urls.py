from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AlbumViewSet,
    ChoixQuestionViewSet,
    ClassementLigueViewSet,
    CommentaireViewSet,
    ConfigurationSitePublicView,
    ConversationViewSet,
    EquipeInfoViewSet,
    EquipeLogoViewSet,
    GroupeChatViewSet,
    MatchCommentaireViewSet,
    MatchEvenementViewSet,
    MatchViewSet,
    MembreRechercheViewSet,
    MessageGroupeViewSet,
    MessagePriveViewSet,
    PhotoCommentaireViewSet,
    PhotoViewSet,
    PublicationViewSet,
    QuestionQuizViewSet,
    QuizViewSet,
    RencontreCalendrierViewSet,
    ReponseForumViewSet,
    StatistiqueJoueurViewSet,
    SujetViewSet,
    TippspielTeilnahmeViewSet,
    TippspielTipViewSet,
    TippspielViewSet,
)

app_name = "communaute"

router = DefaultRouter()
router.register("publications", PublicationViewSet, basename="publication")
router.register("commentaires", CommentaireViewSet, basename="commentaire")
router.register("sujets", SujetViewSet, basename="sujet")
router.register("reponses-forum", ReponseForumViewSet, basename="reponse-forum")
router.register("conversations", ConversationViewSet, basename="conversation")
router.register("messages-prives", MessagePriveViewSet, basename="message-prive")
router.register("groupes", GroupeChatViewSet, basename="groupe-chat")
router.register("messages-groupe", MessageGroupeViewSet, basename="message-groupe")
router.register("membres-recherche", MembreRechercheViewSet, basename="membre-recherche")
router.register("matchs", MatchViewSet, basename="match")
router.register("match-commentaires", MatchCommentaireViewSet, basename="match-commentaire")
router.register("albums", AlbumViewSet, basename="album")
router.register("photos", PhotoViewSet, basename="photo")
router.register("photo-commentaires", PhotoCommentaireViewSet, basename="photo-commentaire")
router.register("quiz", QuizViewSet, basename="quiz")
router.register("quiz-questions", QuestionQuizViewSet, basename="quiz-question")
router.register("quiz-choix", ChoixQuestionViewSet, basename="quiz-choix")
router.register("classement", ClassementLigueViewSet, basename="classement")
router.register("calendrier", RencontreCalendrierViewSet, basename="calendrier")
router.register("statistiques-joueurs", StatistiqueJoueurViewSet, basename="statistique-joueur")
router.register("equipe-info", EquipeInfoViewSet, basename="equipe-info")
router.register("equipe-logos", EquipeLogoViewSet, basename="equipe-logo")
router.register("match-evenements", MatchEvenementViewSet, basename="match-evenement")
router.register("tippspiel", TippspielViewSet, basename="tippspiel")
router.register("tippspiel-teilnahmen", TippspielTeilnahmeViewSet, basename="tippspiel-teilnahme")
router.register("tippspiel-tipps", TippspielTipViewSet, basename="tippspiel-tip")

urlpatterns = [
    # Singleton (voir ConfigurationSitePublic.get_solo) — pas un ViewSet routé, même
    # convention que apps.notifications.urls (ParametresNotificationView).
    path(
        "configuration-site/",
        ConfigurationSitePublicView.as_view(),
        name="configuration-site-public",
    ),
] + router.urls
