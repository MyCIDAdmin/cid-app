"""Tests tâches Celery envoi d'email — app boutique (ajouté le 2026-09-19, correctif : voir
docstring de apps.boutique.tasks). Même principe que apps.adhesions.tests.test_tasks : le task
est appelé directement (pas via .delay()) et `mailoutbox` (pytest-django) capture les envois
sans jamais toucher un vrai serveur SMTP."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.boutique.models import StatutBonAchat, StatutCommande
from apps.boutique.tasks import (
    envoyer_email_bon_achat_code,
    envoyer_email_commande_annulee,
    envoyer_email_commande_confirmee,
    envoyer_email_commande_expediee,
)
from apps.boutique.tests.factories import BonAchatFactory, CommandeFactory
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db


def _membre_avec_compte(email="riadh@example.de"):
    user = User.objects.create_user(email=email, password="Password123!", is_active=True)
    return MembreFactory(user=user)


def test_envoyer_email_commande_confirmee(mailoutbox):
    membre = _membre_avec_compte()
    commande = CommandeFactory(membre=membre, montant_total=Decimal("45.00"))

    envoyer_email_commande_confirmee(str(commande.id))

    assert len(mailoutbox) == 1
    assert commande.numero_commande in mailoutbox[0].subject
    assert mailoutbox[0].to == ["riadh@example.de"]


def test_envoyer_email_commande_confirmee_sans_compte_utilisateur_ne_leve_pas(mailoutbox):
    # Membre sans User lié (FK nullable) — comportement historique : aucun envoi, aucune erreur.
    membre = MembreFactory()
    commande = CommandeFactory(membre=membre)

    envoyer_email_commande_confirmee(str(commande.id))

    assert len(mailoutbox) == 0


def test_envoyer_email_commande_confirmee_commande_introuvable_ne_leve_pas(mailoutbox):
    envoyer_email_commande_confirmee("00000000-0000-0000-0000-000000000000")
    assert len(mailoutbox) == 0


def test_envoyer_email_commande_annulee(mailoutbox):
    membre = _membre_avec_compte()
    commande = CommandeFactory(membre=membre, statut=StatutCommande.ANNULEE)

    envoyer_email_commande_annulee(str(commande.id))

    assert len(mailoutbox) == 1
    assert "annulée" in mailoutbox[0].subject


def test_envoyer_email_commande_expediee_inclut_le_numero_de_suivi(mailoutbox):
    membre = _membre_avec_compte()
    commande = CommandeFactory(
        membre=membre,
        statut=StatutCommande.EXPEDIEE,
        numero_suivi="DHL123456789",
        transporteur="DHL",
    )

    envoyer_email_commande_expediee(str(commande.id))

    assert len(mailoutbox) == 1
    assert "DHL123456789" in mailoutbox[0].body
    assert "DHL" in mailoutbox[0].body


def test_envoyer_email_commande_expediee_sans_numero_de_suivi(mailoutbox):
    membre = _membre_avec_compte()
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EXPEDIEE)

    envoyer_email_commande_expediee(str(commande.id))

    assert len(mailoutbox) == 1
    assert "Numéro de suivi" not in mailoutbox[0].body


# --- envoyer_email_bon_achat_code (demande utilisateur du 2026-09-23, seul email HTML du
# module — voir apps.boutique.emails) ---


def test_envoyer_email_bon_achat_code(mailoutbox):
    membre = _membre_avec_compte()
    bon = BonAchatFactory(
        achete_par=membre,
        statut=StatutBonAchat.ACTIF,
        montant_initial=Decimal("80.00"),
        solde=Decimal("80.00"),
        date_expiration=timezone.now() + timedelta(days=365 * 3),
    )

    envoyer_email_bon_achat_code(str(bon.id))

    assert len(mailoutbox) == 1
    message = mailoutbox[0]
    assert bon.code in message.subject
    assert message.to == ["riadh@example.de"]
    # Corps texte brut (repli) : code, montant, date d'expiration.
    assert bon.code in message.body
    assert "80,00 €" in message.body
    # Seul email HTML de tout le projet : une alternative text/html doit être jointe.
    assert len(message.alternatives) == 1
    corps_html, mimetype = message.alternatives[0]
    assert mimetype == "text/html"
    assert bon.code in corps_html
    assert "80,00 €" in corps_html


def test_envoyer_email_bon_achat_code_logo_est_un_badge_css_jamais_une_image_externe(
    mailoutbox,
):
    # Régression — TROIS bugs réels successifs en production le 2026-09-23 (voir docstring de
    # apps.boutique.emails pour l'historique complet) : (1) `data:` URI inline — gonflait
    # l'email au-delà du seuil de troncature Gmail (~102 Ko) ET était de toute façon strippé du
    # HTML par Gmail, jamais affiché ; (2) pièce jointe inline (Content-ID) — fonctionne en SMTP
    # mais pas via l'API Brevo utilisée en prod (django-anymail : "Brevo does not support inline
    # attachments", email jamais envoyé) ; (3) URL hébergée sur MinIO — l'URL elle-même
    # fonctionnait parfaitement (vérifié manuellement), mais Brevo réécrit systématiquement les
    # `<img src>` vers son propre domaine de cache/tracking (`r.mail.<domaine>/im/...`) en allant
    # chercher l'image lui-même, et cette récupération s'est révélée non fiable (documenté,
    # non désactivable hors compte Enterprise) — icône d'image cassée côté destinataire malgré
    # une URL source valide. Le logo est donc désormais un badge "CID" en pur HTML/CSS (voir
    # email_bon_achat.html) : plus AUCUNE ressource externe à charger pour l'afficher, donc
    # imperméable aux trois bugs à la fois.
    membre = _membre_avec_compte()
    bon = BonAchatFactory(achete_par=membre, statut=StatutBonAchat.ACTIF)

    envoyer_email_bon_achat_code(str(bon.id))

    assert len(mailoutbox) == 1
    message = mailoutbox[0]
    corps_html, _ = message.alternatives[0]

    assert "data:image" not in corps_html
    # Aucune balise <img> du tout pour le logo : un badge CSS ne peut pas être tronqué, refusé
    # en pièce jointe, ni échouer à être récupéré par un proxy d'images tiers.
    assert "<img" not in corps_html
    assert "CID" in corps_html

    # Aucune pièce jointe : rien à encoder ni à héberger pour ce logo.
    assert message.attachments == []

    # Le message complet reste minuscule, largement sous le seuil de troncature de Gmail
    # (~102 Ko) — l'ancien data: URI faisait à lui seul ~109 Ko.
    taille_totale = len(message.message().as_bytes())
    assert taille_totale < 20_000


def test_envoyer_email_bon_achat_code_echec_envoi_est_journalise_jamais_leve(mailoutbox, caplog):
    # Régression (bug réel constaté en production le 2026-09-23 : email jamais reçu — ni boîte
    # de réception ni spam — sans AUCUNE trace exploitable côté serveur). `fail_silently=True`
    # (ancien comportement) n'aurait de toute façon jamais couvert une exception levée pendant la
    # CONSTRUCTION du message (avant `.send()`) — seul un échec SMTP l'aurait été. Ce test
    # simule les deux cas via un échec de `.send()` (le plus simple à déclencher depuis les
    # tests) et vérifie : (a) aucune exception ne remonte (la tâche Celery ne doit jamais
    # échouer pour un email raté — le bon reste utilisable) et (b) l'échec est bien journalisé
    # (logger.exception), pour rester diagnosticable dans les logs du service celery_worker.
    import logging

    from django.core.mail.backends.locmem import EmailBackend

    membre = _membre_avec_compte()
    bon = BonAchatFactory(achete_par=membre, statut=StatutBonAchat.ACTIF)

    def _send_qui_echoue(self, *args, **kwargs):
        raise Exception("Simulated SMTP failure")

    monkeypatch_cible = EmailBackend.send_messages
    EmailBackend.send_messages = _send_qui_echoue
    # Le handler par défaut de caplog n'est attaché qu'à la racine — config/settings/base.py met
    # `propagate: False` sur le logger "apps" (donc "apps.boutique.tasks" en hérite), ce qui
    # empêche tout enregistrement d'y remonter, même si `logger.exception` a bien été appelé
    # (visible dans le flux stderr capturé par ailleurs). `caplog.at_level(..., logger=...)` ne
    # fait que baisser le niveau du logger visé, il ne le fait PAS remonter à la racine — il
    # faut donc attacher le handler de caplog directement dessus.
    task_logger = logging.getLogger("apps.boutique.tasks")
    task_logger.addHandler(caplog.handler)
    try:
        with caplog.at_level("ERROR", logger="apps.boutique.tasks"):
            envoyer_email_bon_achat_code(str(bon.id))  # ne doit lever aucune exception
    finally:
        EmailBackend.send_messages = monkeypatch_cible
        task_logger.removeHandler(caplog.handler)

    assert len(mailoutbox) == 0
    assert any(bon.code in record.getMessage() for record in caplog.records)


def test_envoyer_email_bon_achat_code_respecte_la_langue_preferee(mailoutbox):
    membre = _membre_avec_compte()
    membre.user.langue_preferee = "de"
    membre.user.save(update_fields=["langue_preferee"])
    bon = BonAchatFactory(
        achete_par=membre,
        statut=StatutBonAchat.ACTIF,
        date_expiration=timezone.now() + timedelta(days=365 * 3),
    )

    envoyer_email_bon_achat_code(str(bon.id))

    assert len(mailoutbox) == 1
    assert "Gutschein" in mailoutbox[0].subject


def test_envoyer_email_bon_achat_code_sans_compte_utilisateur_ne_leve_pas(mailoutbox):
    # Membre sans User lié (FK nullable) — comportement identique aux emails de commande.
    membre = MembreFactory()
    bon = BonAchatFactory(achete_par=membre, statut=StatutBonAchat.ACTIF)

    envoyer_email_bon_achat_code(str(bon.id))

    assert len(mailoutbox) == 0


def test_envoyer_email_bon_achat_code_bon_introuvable_ne_leve_pas(mailoutbox):
    envoyer_email_bon_achat_code("00000000-0000-0000-0000-000000000000")
    assert len(mailoutbox) == 0
