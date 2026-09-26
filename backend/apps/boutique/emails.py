"""
Rendu de l'email HTML de bon d'achat — app boutique (ajouté le 2026-09-23, demande
utilisateur : "Der Code soll in einer schönen Email... geschickt werden").

Seul email HTML de tout le projet (les 11+ autres types, voir apps.notifications, restent en
texte brut via send_mail) : la demande utilisateur qualifie explicitement CET email de "schön"
(soigné), contrairement aux autres emails de commande — pas de raison de généraliser ce
traitement à tout le module, qui resterait hors du périmètre demandé.

Logo — historique de TROIS bugs réels successifs en production le 2026-09-23, chacun corrigeant
le précédent tout en révélant le suivant, jusqu'à abandonner complètement l'idée d'une image :
  1. `data:` URI inline (même technique que apps.cotisations.pdf, correcte pour un PDF —
     WeasyPrint rend le HTML localement — mais pas pour un email) : gonflait le message à lui
     seul à ~109 Ko (> seuil de troncature Gmail ~102 Ko, "[Message clipped]") ET était de toute
     façon strippé du HTML par Gmail (sécurité) — jamais affiché.
  2. Pièce jointe inline avec Content-ID (`cid:`), correctif du bug 1 : fonctionne très bien en
     SMTP classique (testé et vérifié en local), MAIS la production envoie via l'API HTTP de
     Brevo (django-anymail, voir EMAIL_BACKEND dans config/settings/prod.py) — dont le backend
     Anymail ne supporte PAS les pièces jointes inline : `AnymailUnsupportedFeature: Brevo does
     not support inline attachments`, levée à la CONSTRUCTION du message, jamais rattrapée par
     `fail_silently` (qui ne couvre que `.send()`) → l'email entier ne partait jamais, ni erreur
     visible ni trace nulle part avant que tasks.envoyer_email_bon_achat_code soit entouré d'un
     try/except explicite (voir son docstring) pour révéler ce traceback.
  3. URL hébergée sur MinIO (`https://.../produits/_emails/logo_cid_email.jpg`, bucket public,
     déjà vérifié fonctionnel pour les photos produits), correctif du bug 2 : l'URL elle-même est
     confirmée joignable (testée en direct, l'image s'affiche parfaitement) — mais l'email reçu
     ne montrait toujours qu'une icône d'image cassée. Cause : l'API Brevo NE renvoie PAS l'URL
     telle quelle, elle la réécrit systématiquement vers son propre domaine de tracking/cache
     (`r.mail.<domaine>/im/...`, distinct des URLs `/tr/op/...` et `/tr/cl/...` d'ouverture/clic)
     après être allée chercher elle-même l'image à l'URL d'origine — un comportement documenté et
     non désactivable sur les comptes non-Enterprise (voir community.brevo.com, plusieurs
     signalements d'images cassées malgré une URL source valide, sans cause unique identifiée
     côté Brevo — SSL, délai, ou blocage réseau selon les cas). Autrement dit : même une URL
     `https://` publique et fonctionnelle ne suffit pas, la fiabilité du récupérateur d'images de
     Brevo échappe entièrement à notre contrôle.

Corrigé définitivement en abandonnant toute image raster pour ce logo : remplacé par un badge
"CID" en pur HTML/CSS (table + texte stylé, voir email_bon_achat.html) — aucune ressource externe
à charger, donc imperméable aux TROIS bugs précédents à la fois (rien à tronquer, rien à refuser
comme pièce jointe, rien à aller chercher). Seule perte : le logo n'est plus une image bitmap,
juste les lettres "CID" sur fond blanc arrondi aux couleurs de la charte — un compromis délibéré
pour un email transactionnel dont la fiabilité de livraison prime sur la fidélité graphique.
"""

from django.conf import settings
from django.template.loader import render_to_string
from django.utils import timezone

from .models import BonAchat

TRADUCTIONS = {
    "fr": {
        "assoc_name": "Clubistes in Deutschland",
        "assoc_tagline": "Club Africain de Tunis — Supporters en Allemagne",
        "preheader": "Votre bon d'achat CID est prêt à l'emploi.",
        "titre": "Votre bon d'achat est prêt !",
        "intro": (
            "Merci pour votre achat — voici votre code, prêt à être utilisé dans la boutique CID."
        ),
        "montant_label": "Montant",
        "code_label": "Votre code",
        "expiration_label": "Valable jusqu'au",
        "cta": "Découvrir la boutique",
        "usage_note": (
            "Saisissez ce code à l'étape « Livraison » de votre commande pour le déduire "
            "automatiquement du total à payer. Il reste valable pour plusieurs achats tant "
            "qu'il conserve du solde."
        ),
        "footer_note": (
            "Cet email a été généré automatiquement suite à la confirmation de votre paiement. "
            "Conservez ce code en lieu sûr — toute personne qui le connaît peut l'utiliser."
        ),
        "subject": "Votre bon d'achat {code} est prêt !",
    },
    "de": {
        "assoc_name": "Clubistes in Deutschland",
        "assoc_tagline": "Club Africain de Tunis — Anhänger in Deutschland",
        "preheader": "Ihr CID-Gutschein ist einsatzbereit.",
        "titre": "Ihr Gutschein ist bereit!",
        "intro": "Vielen Dank für Ihren Kauf — hier ist Ihr Code, einsatzbereit im CID-Shop.",
        "montant_label": "Betrag",
        "code_label": "Ihr Code",
        "expiration_label": "Gültig bis",
        "cta": "Zum Shop",
        "usage_note": (
            "Geben Sie diesen Code im Schritt „Versand“ Ihrer Bestellung ein, um ihn automatisch "
            "vom zu zahlenden Betrag abzuziehen. Er bleibt für mehrere Käufe gültig, solange "
            "noch Guthaben vorhanden ist."
        ),
        "footer_note": (
            "Diese E-Mail wurde automatisch nach der Bestätigung Ihrer Zahlung erstellt. "
            "Bewahren Sie diesen Code sicher auf — jeder, der ihn kennt, kann ihn einlösen."
        ),
        "subject": "Ihr Gutschein {code} ist bereit!",
    },
}


def _formate_montant(montant) -> str:
    valeur = f"{montant:,.2f}".replace(",", " ").replace(".", ",")
    return f"{valeur} €"


def _formate_date(date_expiration, langue: str) -> str:
    date_locale = (
        timezone.localtime(date_expiration)
        if timezone.is_aware(date_expiration)
        else date_expiration
    )
    return date_locale.strftime("%d.%m.%Y" if langue == "de" else "%d/%m/%Y")


def _resoudre_langue(user) -> str:
    """Même principe/mêmes raisons que apps.cotisations.pdf._resoudre_langue (portée FR/DE
    volontairement limitée pour cette itération, l'arabe est Phase 5 — voir sa docstring)."""
    return user.langue_preferee if user and user.langue_preferee in TRADUCTIONS else "fr"


def rendre_email_bon_achat(bon: BonAchat) -> tuple[str, str, str]:
    """Construit (sujet, corps texte brut, corps HTML) pour l'email d'un bon d'achat activé —
    voir tasks.envoyer_email_bon_achat_code, seul appelant. Le corps texte brut sert de repli
    (clients mail sans rendu HTML) et d'assertion la plus simple à tester."""
    user = getattr(bon.achete_par, "user", None)
    langue = _resoudre_langue(user)
    t = TRADUCTIONS[langue]

    montant_formate = _formate_montant(bon.solde)
    expiration_formatee = _formate_date(bon.date_expiration, langue) if bon.date_expiration else ""

    sujet = t["subject"].format(code=bon.code)

    corps_texte = (
        f"{t['titre']}\n\n"
        f"{t['intro']}\n\n"
        f"{t['code_label']} : {bon.code}\n"
        f"{t['montant_label']} : {montant_formate}\n"
        + (f"{t['expiration_label']} : {expiration_formatee}\n" if expiration_formatee else "")
        + f"\n{t['usage_note']}\n\n{t['footer_note']}"
    )

    corps_html = render_to_string(
        "boutique/email_bon_achat.html",
        {
            "t": t,
            "code": bon.code,
            "montant_formate": montant_formate,
            "expiration_formatee": expiration_formatee,
            "lien_boutique": f"{settings.FRONTEND_URL}/boutique",
        },
    )

    return sujet, corps_texte, corps_html
