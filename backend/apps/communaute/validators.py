"""
Validation des photos uploadées dans un album (Release Plan §3.2 "Albums photos — upload
collaboratif" — module Phase 4B, RICEFW/CLAUDE.md §8 "Uploads : validation MIME
(python-magic) + whitelist d'extensions").

Même principe que `apps.adhesions.serializers.JustificatifRabaisUploadSerializer
.validate_fichier` (magic bytes réels, jamais l'extension/Content-Type déclarés par le
client) — mais pousse un cran plus loin ici, conformément à CID-SCD-001 §7.4
("Redimensionnement photos : Pillow redimensionne et re-encode les images avant stockage" —
menace couverte : "Bombs PNG/JPEG, déni de service par décompression") : l'image est
rouverte avec Pillow, son nombre de pixels décompressés est vérifié explicitement (au lieu
de se fier au seul contrôle interne de Pillow, qui n'est qu'un avertissement configurable),
puis redimensionnée si nécessaire et ré-encodée — jamais les octets bruts envoyés par le
client qui ne sont stockés/servis tels quels.
"""

import io
import uuid

import magic
from django.core.files.base import ContentFile
from PIL import Image
from rest_framework import serializers

# Ajoutés le 2026-09-20 (retour utilisateur : "Hochladen von pdf Dokumenten", module fil
# d'actualité — Publication.document) — même principe que
# apps.adhesions.serializers.JustificatifRabaisUploadSerializer.validate_fichier (magic
# bytes réels, jamais l'extension/Content-Type déclarés par le client), mais PDF
# uniquement ici : la demande utilisateur ne mentionne que des "pdf Dokumenten", pas des
# documents Office ou autres formats.
MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024  # même limite que les photos (MAX_PHOTO_SIZE_BYTES)

ALLOWED_DOCUMENT_MIME_TYPES = {"application/pdf": "pdf"}

# Mockup (modal "Ajouter des photos") : "JPG, PNG, WEBP · max 10 Mo" — seule limite/format
# documentés pour ce module, repris tels quels plutôt qu'une valeur inventée.
MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024

ALLOWED_PHOTO_MIME_TYPES = {
    "image/jpeg": ("jpg", "JPEG"),
    "image/png": ("png", "PNG"),
    "image/webp": ("webp", "WEBP"),
}

# Long côté max après redimensionnement — largement suffisant pour un affichage web (galerie
# + zoom), tout en bornant la taille stockée/servie. Pas de valeur documentée dans le FDD/SCD
# pour ce chiffre précis (seule "Pillow redimensionne" est exigé) : 2000px est un choix
# raisonnable, cohérent avec les résolutions d'écran courantes.
MAX_DIMENSION_PX = 2000

# Nombre de pixels décompressés au-delà duquel on refuse le fichier (bombe de décompression)
# — bien en dessous du défaut Pillow (~89M, seulement un warning), pour rejeter activement
# plutôt que de risquer un traitement coûteux d'une image conçue pour épuiser la mémoire.
MAX_DECOMPRESSED_PIXELS = 40_000_000  # ex. ~7100x5600


def valider_et_reencoder_photo(fichier):
    """Valide un fichier uploadé (taille, MIME réel, intégrité/bombe de décompression) et
    retourne un nouveau `ContentFile` PRÊT À STOCKER — image ré-encodée par Pillow, EXIF/
    métadonnées d'origine supprimées, nom de fichier reconstruit côté serveur.

    Lève `serializers.ValidationError` (mêmes clés de message que
    `JustificatifRabaisUploadSerializer.validate_fichier`) si le fichier est invalide.
    """
    if fichier.size > MAX_PHOTO_SIZE_BYTES:
        raise serializers.ValidationError(
            f"Fichier trop volumineux (max {MAX_PHOTO_SIZE_BYTES // (1024 * 1024)} Mo)."
        )

    contenu = fichier.read()
    fichier.seek(0)
    mime_reel = magic.from_buffer(contenu, mime=True)
    formats = ALLOWED_PHOTO_MIME_TYPES.get(mime_reel)
    if formats is None:
        raise serializers.ValidationError(
            f"Format non supporté (détecté : {mime_reel}). JPG, PNG ou WEBP uniquement."
        )
    extension, format_pillow = formats

    try:
        image = Image.open(io.BytesIO(contenu))
        # `Image.open` est paresseux (n'analyse pas encore les pixels) — `load()` force la
        # décompression complète, point où Pillow lève `DecompressionBombError` si le
        # `Image.MAX_IMAGE_PIXELS` par défaut est dépassé ; le contrôle explicite ci-dessous
        # (MAX_DECOMPRESSED_PIXELS, plus bas que le défaut Pillow) s'applique en premier.
        largeur, hauteur = image.size
        if largeur * hauteur > MAX_DECOMPRESSED_PIXELS:
            raise serializers.ValidationError(
                "Image trop grande une fois décompressée (dimensions excessives)."
            )
        image.load()
    except serializers.ValidationError:
        raise
    except Exception:
        raise serializers.ValidationError("Fichier image invalide ou corrompu.")

    # Re-encodage systématique (même si déjà dans les dimensions cibles) : c'est ce qui
    # supprime l'EXIF/les métadonnées d'origine et garantit que seuls les octets réellement
    # décodés par Pillow (jamais le fichier brut du client) sont stockés.
    if format_pillow == "JPEG" and image.mode not in ("RGB", "L"):
        image = image.convert("RGB")
    image.thumbnail((MAX_DIMENSION_PX, MAX_DIMENSION_PX), Image.LANCZOS)

    tampon = io.BytesIO()
    save_kwargs = {"quality": 85, "optimize": True} if format_pillow == "JPEG" else {}
    image.save(tampon, format=format_pillow, **save_kwargs)
    tampon.seek(0)

    nom_fichier = f"{uuid.uuid4()}.{extension}"
    return ContentFile(tampon.read(), name=nom_fichier)


def valider_document_pdf(fichier):
    """Valide un fichier PDF uploadé (taille, MIME réel) pour `Publication.document` et
    retourne le même fichier, nom reconstruit côté serveur — pas de ré-encodage possible
    pour un PDF (contrairement à `valider_et_reencoder_photo`, il n'y a pas d'équivalent
    Pillow ici) : la garantie de sécurité vient uniquement de la détection MIME réelle
    (magic bytes), pas d'un nouveau fichier régénéré à partir du contenu décodé.

    Lève `serializers.ValidationError` (mêmes clés de message que
    `valider_et_reencoder_photo`/`JustificatifRabaisUploadSerializer.validate_fichier`) si
    le fichier est invalide.
    """
    if fichier.size > MAX_DOCUMENT_SIZE_BYTES:
        raise serializers.ValidationError(
            f"Fichier trop volumineux (max {MAX_DOCUMENT_SIZE_BYTES // (1024 * 1024)} Mo)."
        )

    contenu = fichier.read()
    fichier.seek(0)
    mime_reel = magic.from_buffer(contenu, mime=True)
    extension = ALLOWED_DOCUMENT_MIME_TYPES.get(mime_reel)
    if extension is None:
        raise serializers.ValidationError(
            f"Format non supporté (détecté : {mime_reel}). PDF uniquement."
        )

    # Nom de fichier reconstruit côté serveur à partir du type réellement détecté — jamais
    # le nom/l'extension fournis par le client (SCD §7.4, path traversal / extension
    # trompeuse), même principe que valider_et_reencoder_photo ci-dessus.
    fichier.name = f"{uuid.uuid4()}.{extension}"
    return fichier
