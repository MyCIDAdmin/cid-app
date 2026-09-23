"""
Rendu de l'email HTML de bon d'achat — app boutique (ajouté le 2026-09-23, demande
utilisateur : "Der Code soll in einer schönen Email... geschickt werden").

Seul email HTML de tout le projet (les 11+ autres types, voir apps.notifications, restent en
texte brut via send_mail) : la demande utilisateur qualifie explicitement CET email de "schön"
(soigné), contrairement aux autres emails de commande — pas de raison de généraliser ce
traitement à tout le module, qui resterait hors du périmètre demandé.

Réutilise apps.cotisations.assets.logo_cid.jpg (même identité visuelle CID, un seul fichier
binaire à maintenir) mais PAS la technique base64 `data:` URI de apps.cotisations.pdf : ce
choix est correct pour un PDF (WeasyPrint rend le HTML localement, pas de client mail entre les
deux) mais cassait cet email — bug réel constaté en production le 2026-09-23 (rapport
utilisateur : logo absent + email tronqué par Gmail, "[Message clipped] View entire message").
Cause double, avec la même origine : le logo original (1131x1601, ~80 Ko) encodé en base64
inline gonflait l'email à lui seul à ~109 Ko, dépassant le seuil de troncature de Gmail
(~102 Ko) — et de toute façon Gmail (comme la plupart des webmails) supprime purement et
simplement les `<img src="data:...">` du HTML pour des raisons de sécurité, contrairement à un
`cid:` référencé sur une pièce jointe inline (mécanisme MIME standard, le seul fiable pour une
image intégrée dans un email HTML). Corrigé en redimensionnant le logo à une taille d'icône
(affiché 40x40 dans le template, voir `_logo_email_attachment`) et en l'attachant en pièce
jointe inline via Content-ID — voir `LOGO_CONTENT_ID` et `tasks.envoyer_email_bon_achat_code`,
seul appelant, pour l'attachement effectif au message.
"""

from functools import lru_cache
from io import BytesIO
from pathlib import Path

from django.conf import settings
from django.template.loader import render_to_string
from django.utils import timezone
from PIL import Image

from .models import BonAchat

_LOGO_PATH = (
    Path(__file__).resolve().parent.parent / "cotisations" / "assets" / "logo_cid.jpg"
)

# Content-ID de la pièce jointe inline du logo (voir docstring module) — référencé dans le
# template via `cid:{{ logo_cid }}` et dans tasks.envoyer_email_bon_achat_code pour l'en-tête
# MIME `Content-ID` de la pièce jointe. Constante fixe (jamais générée dynamiquement) : un seul
# logo, un seul appelant, pas besoin d'unicité par email.
LOGO_CONTENT_ID = "logo-cid-email"

# Taille d'icône affichée dans le template (40x40, voir email_bon_achat.html) — 120px de long
# côté suffit largement pour un rendu net même sur écran retina (3x), tout en gardant la pièce
# jointe légère (quelques Ko au lieu des ~80 Ko du logo source pleine résolution).
_TAILLE_LOGO_EMAIL = (120, 120)

TRADUCTIONS = {
    "fr": {
        "assoc_name": "Clubistes in Deutschland",
        "assoc_tagline": "Club Africain de Tunis — Supporters en Allemagne",
        "preheader": "Votre bon d'achat CID est prêt à l'emploi.",
        "titre": "Votre bon d'achat est prêt !",
        "intro": "Merci pour votre achat — voici votre code, prêt à être utilisé dans la boutique CID.",
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


@lru_cache(maxsize=1)
def logo_email_attachment() -> tuple[bytes, str]:
    """Bytes JPEG + type MIME du logo redimensionné pour l'email (voir docstring module) —
    calculé une seule fois par process (lru_cache), le fichier source ne change pas en cours de
    vie de l'app. Utilisé par tasks.envoyer_email_bon_achat_code pour construire la pièce
    jointe inline (Content-ID = LOGO_CONTENT_ID)."""
    with Image.open(_LOGO_PATH) as image:
        image = image.convert("RGB")
        image.thumbnail(_TAILLE_LOGO_EMAIL)
        tampon = BytesIO()
        image.save(tampon, format="JPEG", quality=85, optimize=True)
        return tampon.getvalue(), "image/jpeg"


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
            "logo_cid": LOGO_CONTENT_ID,
            "code": bon.code,
            "montant_formate": montant_formate,
            "expiration_formatee": expiration_formatee,
            "lien_boutique": f"{settings.FRONTEND_URL}/boutique",
        },
    )

    return sujet, corps_texte, corps_html
