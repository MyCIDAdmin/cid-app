from rest_framework.routers import DefaultRouter

from .views import CommentaireViewSet, PublicationViewSet, ReponseForumViewSet, SujetViewSet

app_name = "communaute"

router = DefaultRouter()
router.register("publications", PublicationViewSet, basename="publication")
router.register("commentaires", CommentaireViewSet, basename="commentaire")
router.register("sujets", SujetViewSet, basename="sujet")
router.register("reponses-forum", ReponseForumViewSet, basename="reponse-forum")

urlpatterns = router.urls
