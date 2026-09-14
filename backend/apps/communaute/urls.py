from rest_framework.routers import DefaultRouter

from .views import (
    AlbumViewSet,
    ChoixQuestionViewSet,
    CommentaireViewSet,
    ConversationViewSet,
    GroupeChatViewSet,
    MatchCommentaireViewSet,
    MatchViewSet,
    MembreRechercheViewSet,
    MessageGroupeViewSet,
    MessagePriveViewSet,
    PhotoCommentaireViewSet,
    PhotoViewSet,
    PublicationViewSet,
    QuestionQuizViewSet,
    QuizViewSet,
    ReponseForumViewSet,
    SujetViewSet,
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

urlpatterns = router.urls
