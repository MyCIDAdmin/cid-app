"""
Backend d'authentification personnalisé.

Le ModelBackend standard de Django refuse d'authentifier un utilisateur
inactif (user_can_authenticate() vérifie is_active), ce qui empêche de
distinguer "mauvais mot de passe" de "compte en attente d'activation"
(FDD §3.1 : un membre inscrit doit être activé par RH/Admin avant de
pouvoir se connecter — mais il doit recevoir un message clair, pas une
erreur générique). On laisse donc passer les comptes inactifs ici, et
c'est LoginView qui décide explicitement de refuser l'accès (403) avec
le bon message.
"""

from django.contrib.auth.backends import ModelBackend


class EmailBackend(ModelBackend):
    def user_can_authenticate(self, user):
        # Le mot de passe doit être valide, mais is_active est vérifié
        # explicitement dans la vue de login, pas ici.
        return True
