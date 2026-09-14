from rest_framework.routers import DefaultRouter

from .views import (
    CommentaireViewSet,
    ConversationViewSet,
    GroupeChatViewSet,
    MessageGroupeViewSet,
    MessagePriveViewSet,
    PublicationViewSet,
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

urlpatterns = router.urls
