import itertools
from datetime import timezone

import factory
from factory.django import DjangoModelFactory

from apps.accounts.models import Role, User
from apps.communaute.models import (
    Album,
    ArrierePlanModule,
    CategorieForum,
    ChoixQuestion,
    ClassementLigue,
    Commentaire,
    Conversation,
    EquipeEvenement,
    EquipeLogo,
    GroupeChat,
    Match,
    MatchCommentaire,
    MatchEvenement,
    MatchReaction,
    MembreGroupe,
    MessageGroupe,
    MessagePrive,
    ParticipationQuiz,
    Photo,
    PhotoCommentaire,
    PhotoLike,
    Publication,
    QuestionQuiz,
    Quiz,
    RencontreCalendrier,
    ReponseForum,
    ReponseQuiz,
    StatistiqueJoueur,
    StatutMatch,
    StatutPaiementTeilnahme,
    StatutTippspiel,
    Sujet,
    Tippspiel,
    TippspielPrix,
    TippspielTeilnahme,
    TippspielTip,
    TypeEvenementMatch,
    TypeGroupe,
    TypePrixTippspiel,
    TypeReactionMatch,
)
from apps.membres.tests.factories import MembreFactory

_membre_seq = itertools.count()


def user_membre_avec_fiche(email=None, **membre_kwargs):
    """Même convention que apps.vote.tests.factories.user_membre_avec_fiche — utilisé par
    les tests WebSocket (Messagerie/Groupes), qui ont besoin d'un User authentifiable ET
    de sa fiche Membre (le consumer travaille sur `user.membre`, pas `user` seul)."""
    email = email or f"membre{next(_membre_seq)}@example.de"
    user = User.objects.create_user(
        email=email, password="Password123!", role=Role.MEMBRE, is_active=True
    )
    membre = MembreFactory(user=user, **membre_kwargs)
    return user, membre


class PublicationFactory(DjangoModelFactory):
    class Meta:
        model = Publication

    auteur = factory.SubFactory(MembreFactory)
    contenu = factory.Sequence(lambda n: f"Publication de test numéro {n}")


class CommentaireFactory(DjangoModelFactory):
    class Meta:
        model = Commentaire

    publication = factory.SubFactory(PublicationFactory)
    auteur = factory.SubFactory(MembreFactory)
    contenu = "Commentaire de test."


class SujetFactory(DjangoModelFactory):
    class Meta:
        model = Sujet

    auteur = factory.SubFactory(MembreFactory)
    categorie = CategorieForum.GENERAL
    titre = factory.Sequence(lambda n: f"Sujet de test {n}")
    contenu = "Contenu du sujet de test."


class ReponseForumFactory(DjangoModelFactory):
    class Meta:
        model = ReponseForum

    sujet = factory.SubFactory(SujetFactory)
    auteur = factory.SubFactory(MembreFactory)
    contenu = "Réponse de test."


class ConversationFactory(DjangoModelFactory):
    class Meta:
        model = Conversation

    membre_a = factory.SubFactory(MembreFactory)
    membre_b = factory.SubFactory(MembreFactory)


class MessagePriveFactory(DjangoModelFactory):
    class Meta:
        model = MessagePrive

    conversation = factory.SubFactory(ConversationFactory)
    expediteur = factory.SubFactory(MembreFactory)
    contenu = "Message privé de test."


class GroupeChatFactory(DjangoModelFactory):
    class Meta:
        model = GroupeChat

    nom = factory.Sequence(lambda n: f"Groupe de test {n}")
    description = "Description du groupe de test."
    type_groupe = TypeGroupe.PUBLIC
    createur = factory.SubFactory(MembreFactory)


class MembreGroupeFactory(DjangoModelFactory):
    class Meta:
        model = MembreGroupe

    groupe = factory.SubFactory(GroupeChatFactory)
    membre = factory.SubFactory(MembreFactory)


class MessageGroupeFactory(DjangoModelFactory):
    class Meta:
        model = MessageGroupe

    groupe = factory.SubFactory(GroupeChatFactory)
    auteur = factory.SubFactory(MembreFactory)
    contenu = "Message de groupe de test."


# ---------------------------------------------------------------------------
# Live Match, Albums, Quiz (troisième lot — Phase 4B)
# ---------------------------------------------------------------------------


class UserFactory(DjangoModelFactory):
    """Petite factory locale — même raisonnement que apps.notifications.tests.factories
    .UserFactory (un `created_by` de Match/Quiz est un User nu, sans Membre associé
    nécessairement testé)."""

    class Meta:
        model = User
        django_get_or_create = ("email",)

    email = factory.Sequence(lambda n: f"admin{n}@example.de")
    role = Role.BUREAU_ADMIN
    is_active = True

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        manager = cls._get_manager(model_class)
        return manager.create_user(*args, **kwargs)


class MatchFactory(DjangoModelFactory):
    class Meta:
        model = Match

    adversaire = factory.Sequence(lambda n: f"Adversaire {n}")
    # `tzinfo` explicite : `factory.Faker("future_datetime", ...)` renvoie par défaut un
    # datetime naïf, qui déclenche un RuntimeWarning avec USE_TZ=True (settings/base.py).
    date_heure = factory.Faker("future_datetime", end_date="+30d", tzinfo=timezone.utc)
    statut = StatutMatch.EN_COURS
    created_by = factory.SubFactory(UserFactory)


class MatchCommentaireFactory(DjangoModelFactory):
    class Meta:
        model = MatchCommentaire

    match = factory.SubFactory(MatchFactory)
    auteur = factory.SubFactory(MembreFactory)
    contenu = "Commentaire live de test."


class MatchReactionFactory(DjangoModelFactory):
    class Meta:
        model = MatchReaction

    match = factory.SubFactory(MatchFactory)
    membre = factory.SubFactory(MembreFactory)
    emoji = TypeReactionMatch.COEUR


class AlbumFactory(DjangoModelFactory):
    class Meta:
        model = Album

    nom = factory.Sequence(lambda n: f"Album de test {n}")
    description = "Description de l'album de test."
    createur = factory.SubFactory(MembreFactory)


class PhotoFactory(DjangoModelFactory):
    class Meta:
        model = Photo

    album = factory.SubFactory(AlbumFactory)
    membre = factory.SubFactory(MembreFactory)
    image = factory.django.ImageField(color="blue", format="JPEG")
    legende = "Légende de test."


class PhotoLikeFactory(DjangoModelFactory):
    class Meta:
        model = PhotoLike

    photo = factory.SubFactory(PhotoFactory)
    membre = factory.SubFactory(MembreFactory)


class PhotoCommentaireFactory(DjangoModelFactory):
    class Meta:
        model = PhotoCommentaire

    photo = factory.SubFactory(PhotoFactory)
    auteur = factory.SubFactory(MembreFactory)
    contenu = "Commentaire de photo de test."


class QuizFactory(DjangoModelFactory):
    class Meta:
        model = Quiz

    titre = factory.Sequence(lambda n: f"Quiz de test {n}")
    description = "Description du quiz de test."
    est_actif = True
    created_by = factory.SubFactory(UserFactory)


class QuestionQuizFactory(DjangoModelFactory):
    class Meta:
        model = QuestionQuiz

    quiz = factory.SubFactory(QuizFactory)
    texte = factory.Sequence(lambda n: f"Question de test {n} ?")
    ordre = factory.Sequence(lambda n: n)
    points = 100


class ChoixQuestionFactory(DjangoModelFactory):
    class Meta:
        model = ChoixQuestion

    question = factory.SubFactory(QuestionQuizFactory)
    texte = factory.Sequence(lambda n: f"Choix {n}")
    est_correct = False


class ParticipationQuizFactory(DjangoModelFactory):
    class Meta:
        model = ParticipationQuiz

    quiz = factory.SubFactory(QuizFactory)
    membre = factory.SubFactory(MembreFactory)


class ReponseQuizFactory(DjangoModelFactory):
    class Meta:
        model = ReponseQuiz

    participation = factory.SubFactory(ParticipationQuizFactory)
    question = factory.SubFactory(QuestionQuizFactory)
    choix = factory.SubFactory(ChoixQuestionFactory)
    est_correct = False
    points_obtenus = 0


# ---------------------------------------------------------------------------
# Fan-Club — extension du Live Match (2026-09-24)
# ---------------------------------------------------------------------------


class ClassementLigueFactory(DjangoModelFactory):
    class Meta:
        model = ClassementLigue

    saison = "2025-2026"
    equipe = factory.Sequence(lambda n: f"Équipe {n}")
    rang = factory.Sequence(lambda n: n + 1)
    joues = 10
    victoires = 5
    nuls = 3
    defaites = 2
    buts_pour = 15
    buts_contre = 8
    difference = 7
    points = 18
    forme_recente = "VVNDV"


class EquipeLogoFactory(DjangoModelFactory):
    class Meta:
        model = EquipeLogo

    equipe = factory.Sequence(lambda n: f"Équipe {n}")
    logo = factory.django.ImageField(color="red", format="PNG")


class ArrierePlanModuleFactory(DjangoModelFactory):
    class Meta:
        model = ArrierePlanModule

    module = "membres"
    image = factory.django.ImageField(color="blue", format="PNG")


class RencontreCalendrierFactory(DjangoModelFactory):
    class Meta:
        model = RencontreCalendrier

    evenement_externe_id = factory.Sequence(lambda n: f"event-{n}")
    competition = "Ligue 1 Tunisie"
    equipe_domicile = "Club Africain"
    equipe_exterieur = factory.Sequence(lambda n: f"Adversaire {n}")
    date_heure = factory.Faker("future_datetime", end_date="+30d", tzinfo=timezone.utc)


class StatistiqueJoueurFactory(DjangoModelFactory):
    class Meta:
        model = StatistiqueJoueur

    goal_api_id = factory.Sequence(lambda n: f"player-{n}")
    saison = "2025-2026"
    equipe = "Club Africain"
    nom = factory.Sequence(lambda n: f"Joueur {n}")
    numero = factory.Sequence(lambda n: n + 1)
    poste = "Forwards"
    matchs_joues = 10
    buts = 5
    passes_decisives = 2
    cartons_jaunes = 1
    cartons_rouges = 0


class MatchEvenementFactory(DjangoModelFactory):
    class Meta:
        model = MatchEvenement

    match = factory.SubFactory(MatchFactory)
    type_evenement = TypeEvenementMatch.BUT
    minute = 23
    equipe = EquipeEvenement.CA
    joueur = "Joueur de test"
    created_by = factory.SubFactory(UserFactory)


class TippspielFactory(DjangoModelFactory):
    class Meta:
        model = Tippspiel

    titre = factory.Sequence(lambda n: f"Tippspiel {n}")
    saison = "2026-2027"
    regles = "4 points résultat exact, 2 points tordifférence, 1 point tendance."
    statut = StatutTippspiel.PUBLIE
    montant_participation = None
    created_by = factory.SubFactory(UserFactory)


class TippspielPrixFactory(DjangoModelFactory):
    class Meta:
        model = TippspielPrix

    tippspiel = factory.SubFactory(TippspielFactory)
    platz = 1
    type_prix = TypePrixTippspiel.MONTANT_FIXE
    montant = "50.00"


class TippspielTeilnahmeFactory(DjangoModelFactory):
    class Meta:
        model = TippspielTeilnahme

    tippspiel = factory.SubFactory(TippspielFactory)
    membre = factory.SubFactory(MembreFactory)
    statut_paiement = StatutPaiementTeilnahme.SANS_FRAIS


class TippspielTipFactory(DjangoModelFactory):
    class Meta:
        model = TippspielTip

    teilnahme = factory.SubFactory(TippspielTeilnahmeFactory)
    rencontre = factory.SubFactory(RencontreCalendrierFactory, competition="Ligue 1")
    score_domicile = 2
    score_exterieur = 1
