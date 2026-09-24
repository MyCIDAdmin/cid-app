"""
Tests API — JustificatifRabais (AHM-20, FDD §4.2/§9, SCD §2.3 A01/A08).

Storage réel remplacé par un FileSystemStorage local pour tous les tests de ce module —
voir apps/adhesions/tests/conftest.py (fixture autouse _justificatifs_storage_local).
"""

from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.adhesions.models import JustificatifRabais, StatutJustificatif, StatutSouscription
from apps.adhesions.serializers import MAX_JUSTIFICATIF_SIZE_BYTES
from apps.adhesions.tests.factories import (
    JustificatifRabaisFactory,
    OffreAdhesionFactory,
    RabaisOffreFactory,
    SouscriptionFactory,
)
from apps.membres.tests.factories import MembreFactory
from apps.notifications.models import Notification, TypeNotification

pytestmark = pytest.mark.django_db

# En-tête minimal suffisant pour que libmagic détecte "application/pdf" par magic bytes
# (même principe que apps.membres.import_views — jamais l'extension/Content-Type déclarés).
PDF_MINIMAL = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"


@pytest.fixture
def api_client():
    return APIClient()


def _user_avec_membre(role, email, **membre_kwargs):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    membre = MembreFactory(user=user, **membre_kwargs)
    return user, membre


def _auth(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


JUSTIFICATIF_LIST_URL = "adhesions:justificatif-list"
SOUSCRIRE_URL = "adhesions:souscription-souscrire"


def _detail_url(justificatif):
    return reverse("adhesions:justificatif-detail", args=[justificatif.id])


def _telecharger_url(justificatif):
    return reverse("adhesions:justificatif-telecharger", args=[justificatif.id])


def _valider_url(justificatif):
    return reverse("adhesions:justificatif-valider", args=[justificatif.id])


def _pdf_upload(nom="justificatif.pdf"):
    return SimpleUploadedFile(nom, PDF_MINIMAL, content_type="application/pdf")


# --- Upload (POST /adhesions/justificatifs/) ---


def test_upload_non_authentifie_refuse(api_client):
    resp = api_client.post(reverse(JUSTIFICATIF_LIST_URL), {})
    assert resp.status_code == 401


def test_upload_pour_sa_propre_souscription(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    souscription = SouscriptionFactory(
        membre=membre, statut=StatutSouscription.EN_ATTENTE_JUSTIFICATIF
    )
    _auth(api_client, user)

    resp = api_client.post(
        reverse(JUSTIFICATIF_LIST_URL),
        {"souscription": str(souscription.id), "fichier": _pdf_upload()},
        format="multipart",
    )

    assert resp.status_code == 201, resp.data
    assert resp.data["statut"] == StatutJustificatif.EN_ATTENTE
    assert "fichier" not in resp.data  # jamais de chemin d'objet brut dans la réponse
    assert JustificatifRabais.objects.filter(souscription=souscription).count() == 1


def test_upload_par_un_membre_notifie_le_staff_rh(api_client):
    """Ajouté le 2026-09-16 (retour utilisateur : couverture "allen Admin Modulen") — voir
    notifications.notifier_nouveau_justificatif_staff : tout RH+ est notifié quand un membre
    soumet lui-même son justificatif."""
    user, membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    user_rh, _rh = _user_avec_membre(Role.RH, "rh-destinataire@example.de")
    user_bureau, _bureau = _user_avec_membre(Role.BUREAU_ADMIN, "bureau-destinataire@example.de")
    souscription = SouscriptionFactory(
        membre=membre, statut=StatutSouscription.EN_ATTENTE_JUSTIFICATIF
    )
    _auth(api_client, user)

    resp = api_client.post(
        reverse(JUSTIFICATIF_LIST_URL),
        {"souscription": str(souscription.id), "fichier": _pdf_upload()},
        format="multipart",
    )

    assert resp.status_code == 201, resp.data
    for destinataire in (user_rh, user_bureau):
        notification = Notification.objects.get(destinataire=destinataire)
        assert notification.type_notification == TypeNotification.ADHESION_JUSTIFICATIF_SOUMIS
        assert notification.lien == "/admin/justificatifs"
    # Le membre lui-même n'est pas dans la file RH — aucune notification pour lui ici.
    assert not Notification.objects.filter(destinataire=user).exists()


def test_upload_pour_la_souscription_dun_autre_refuse(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    autre_souscription = SouscriptionFactory(statut=StatutSouscription.EN_ATTENTE_JUSTIFICATIF)
    _auth(api_client, user)

    resp = api_client.post(
        reverse(JUSTIFICATIF_LIST_URL),
        {"souscription": str(autre_souscription.id), "fichier": _pdf_upload()},
        format="multipart",
    )

    assert resp.status_code == 400


def test_upload_refuse_si_souscription_pas_en_attente_de_justificatif(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    souscription = SouscriptionFactory(membre=membre, statut=StatutSouscription.EN_ATTENTE_PAIEMENT)
    _auth(api_client, user)

    resp = api_client.post(
        reverse(JUSTIFICATIF_LIST_URL),
        {"souscription": str(souscription.id), "fichier": _pdf_upload()},
        format="multipart",
    )

    assert resp.status_code == 400


def test_upload_type_mime_invalide_refuse(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    souscription = SouscriptionFactory(
        membre=membre, statut=StatutSouscription.EN_ATTENTE_JUSTIFICATIF
    )
    _auth(api_client, user)
    fichier_texte = SimpleUploadedFile("justificatif.txt", b"pas un pdf", content_type="text/plain")

    resp = api_client.post(
        reverse(JUSTIFICATIF_LIST_URL),
        {"souscription": str(souscription.id), "fichier": fichier_texte},
        format="multipart",
    )

    assert resp.status_code == 400


def test_upload_fichier_trop_volumineux_refuse(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    souscription = SouscriptionFactory(
        membre=membre, statut=StatutSouscription.EN_ATTENTE_JUSTIFICATIF
    )
    _auth(api_client, user)
    contenu_trop_gros = PDF_MINIMAL + b"0" * MAX_JUSTIFICATIF_SIZE_BYTES
    fichier = SimpleUploadedFile("gros.pdf", contenu_trop_gros, content_type="application/pdf")

    resp = api_client.post(
        reverse(JUSTIFICATIF_LIST_URL),
        {"souscription": str(souscription.id), "fichier": fichier},
        format="multipart",
    )

    assert resp.status_code == 400


def test_reupload_avant_decision_remplace_le_meme_enregistrement(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    souscription = SouscriptionFactory(
        membre=membre, statut=StatutSouscription.EN_ATTENTE_JUSTIFICATIF
    )
    _auth(api_client, user)

    resp1 = api_client.post(
        reverse(JUSTIFICATIF_LIST_URL),
        {"souscription": str(souscription.id), "fichier": _pdf_upload("v1.pdf")},
        format="multipart",
    )
    resp2 = api_client.post(
        reverse(JUSTIFICATIF_LIST_URL),
        {"souscription": str(souscription.id), "fichier": _pdf_upload("v2.pdf")},
        format="multipart",
    )

    assert resp1.status_code == 201
    assert resp2.status_code == 201, resp2.data
    assert resp1.data["id"] == resp2.data["id"]
    assert JustificatifRabais.objects.filter(souscription=souscription).count() == 1


def test_rh_uploade_un_justificatif_pour_le_compte_dun_membre(api_client):
    """Demande utilisateur du 2026-09-16 : "Inklusive das hochladen des Beweisdokumentes
    beim Rabatt-Vorteil" — RH+ peut désormais uploader pour n'importe quelle souscription,
    pas seulement pour la sienne."""
    user, _rh = _user_avec_membre(Role.RH, "rh@example.de")
    souscription = SouscriptionFactory(statut=StatutSouscription.EN_ATTENTE_JUSTIFICATIF)
    _auth(api_client, user)

    resp = api_client.post(
        reverse(JUSTIFICATIF_LIST_URL),
        {"souscription": str(souscription.id), "fichier": _pdf_upload()},
        format="multipart",
    )

    assert resp.status_code == 201, resp.data
    assert JustificatifRabais.objects.filter(souscription=souscription).count() == 1
    # Ajouté le 2026-09-16 : RH n'a pas besoin d'être notifié de sa propre action.
    assert not Notification.objects.filter(
        type_notification=TypeNotification.ADHESION_JUSTIFICATIF_SOUMIS
    ).exists()


def test_rh_sans_fiche_membre_peut_quand_meme_uploader_pour_autrui(api_client):
    """Un compte RH pur (sans Membre associé) reste valide pour cette action — voir
    JustificatifRabaisViewSet.create."""
    user = User.objects.create_user(
        email="rh-sans-fiche@example.de", password="Password123!", role=Role.RH, is_active=True
    )
    souscription = SouscriptionFactory(statut=StatutSouscription.EN_ATTENTE_JUSTIFICATIF)
    _auth(api_client, user)

    resp = api_client.post(
        reverse(JUSTIFICATIF_LIST_URL),
        {"souscription": str(souscription.id), "fichier": _pdf_upload()},
        format="multipart",
    )

    assert resp.status_code == 201, resp.data


def test_bureau_admin_uploade_aussi_pour_le_compte_dun_membre(api_client):
    user, _admin = _user_avec_membre(Role.BUREAU_ADMIN, "admin@example.de")
    souscription = SouscriptionFactory(statut=StatutSouscription.EN_ATTENTE_JUSTIFICATIF)
    _auth(api_client, user)

    resp = api_client.post(
        reverse(JUSTIFICATIF_LIST_URL),
        {"souscription": str(souscription.id), "fichier": _pdf_upload()},
        format="multipart",
    )

    assert resp.status_code == 201, resp.data


def test_reupload_apres_decision_refuse(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    souscription = SouscriptionFactory(
        membre=membre, statut=StatutSouscription.EN_ATTENTE_JUSTIFICATIF
    )
    JustificatifRabaisFactory(souscription=souscription, statut=StatutJustificatif.APPROUVE)
    _auth(api_client, user)

    resp = api_client.post(
        reverse(JUSTIFICATIF_LIST_URL),
        {"souscription": str(souscription.id), "fichier": _pdf_upload()},
        format="multipart",
    )

    assert resp.status_code == 400


# --- Liste (file RH+) ---


def test_membre_ne_peut_pas_lister_les_justificatifs(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp = api_client.get(reverse(JUSTIFICATIF_LIST_URL))

    assert resp.status_code == 403


def test_rh_liste_tous_les_justificatifs(api_client):
    JustificatifRabaisFactory.create_batch(2)
    user, _membre = _user_avec_membre(Role.RH, "rh@example.de")
    _auth(api_client, user)

    resp = api_client.get(reverse(JUSTIFICATIF_LIST_URL))

    assert resp.status_code == 200
    assert len(resp.data["results"]) == 2


# ---------------------------------------------------------------------------
# Phase D (ajoutée le 2026-09-23) — page de gestion "Nachweise" (page_justificatifs) désormais
# pilotée par apps.rbac (real enforcement, y compris pour les rôles système eux-mêmes) — couvre
# JustificatifPermission.RH_ONLY_ACTIONS (list/valider) UNIQUEMENT ; has_object_permission
# (propriétaire ou RH+, "voir mon propre justificatif") reste inchangé.
# ---------------------------------------------------------------------------


def _set_matrice_cellule(role_slug, module_slug, niveau_acces):
    from apps.rbac.models import NiveauAcces, RoleDefinition, RoleModulePermission

    role = RoleDefinition.objects.get(slug=role_slug, is_system=True)
    RoleModulePermission.objects.update_or_create(
        role=role, module=module_slug, defaults={"niveau_acces": niveau_acces}
    )


def test_phase_d_rh_perd_lacces_a_la_file_de_justificatifs_si_matrice_le_dit(api_client):
    from apps.rbac.models import NiveauAcces

    _set_matrice_cellule("rh", "page_justificatifs", NiveauAcces.AUCUN)
    user, _membre = _user_avec_membre(Role.RH, "phased-justificatifs-restrict@example.de")
    _auth(api_client, user)

    resp = api_client.get(reverse(JUSTIFICATIF_LIST_URL))
    assert resp.status_code == 403


def test_phase_d_role_personnalise_peut_voir_la_file_via_la_matrice(api_client):
    """Vérifie uniquement le nouveau gate de page (has_permission) apporté par la matrice — la
    visibilité "toutes les souscriptions vs. les miennes" au niveau du queryset
    (READ_ALL_SOUSCRIPTIONS_MIN_LEVEL, basé sur le rôle système legacy) reste explicitement hors
    scope de cette phase (voir plan, section "bewusst NICHT angefasst"), donc ce test porte sur
    la propre justificatif du user plutôt que sur "voit tout"."""
    from apps.rbac.models import NiveauAcces
    from apps.rbac.tests.factories import RoleDefinitionFactory, RoleModulePermissionFactory, UserRoleAssignmentFactory

    JustificatifRabaisFactory.create_batch(2)  # bruit : appartiennent à d'autres membres
    user, membre = _user_avec_membre(Role.MEMBRE, "phased-justificatifs-grant@example.de")
    mon_justificatif = JustificatifRabaisFactory(souscription=SouscriptionFactory(membre=membre))
    role_perso = RoleDefinitionFactory(slug="justificatifs-manager")
    RoleModulePermissionFactory(
        role=role_perso, module="page_justificatifs", niveau_acces=NiveauAcces.LECTURE_ECRITURE
    )
    UserRoleAssignmentFactory(user=user, role=role_perso)
    _auth(api_client, user)

    resp = api_client.get(reverse(JUSTIFICATIF_LIST_URL))
    assert resp.status_code == 200
    ids = {r["id"] for r in resp.data["results"]}
    assert str(mon_justificatif.id) in ids


def test_phase_d_super_admin_voit_toujours_la_file_meme_si_matrice_dit_aucun(api_client):
    from apps.rbac.models import NiveauAcces

    _set_matrice_cellule("super_admin", "page_justificatifs", NiveauAcces.AUCUN)
    user, _membre = _user_avec_membre(Role.SUPER_ADMIN, "phased-justificatifs-super@example.de")
    _auth(api_client, user)

    resp = api_client.get(reverse(JUSTIFICATIF_LIST_URL))
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Lecture vs écriture (ajouté le 2026-09-24, task #214, retour utilisateur sur Quiz-Verwaltung —
# voir apps.rbac.services.has_admin_page_access) : une cellule `lecture` seule sur
# page_justificatifs donne accès à la file (action "list") mais ne doit plus permettre de statuer
# sur un justificatif (action "valider") — voir JustificatifPermission.ACTIONS_ECRITURE.
# ---------------------------------------------------------------------------


def test_role_lecture_seule_peut_voir_la_file_mais_pas_valider(api_client):
    """Comme test_phase_d_role_personnalise_peut_voir_la_file_via_la_matrice ci-dessus, le
    justificatif ciblé appartient à la propre fiche membre du user : get_object() de
    JustificatifRabaisViewSet reste scopé par READ_ALL_SOUSCRIPTIONS_MIN_LEVEL (rôle système
    legacy, hors scope de cette phase), pas par la matrice page_justificatifs."""
    from apps.rbac.models import NiveauAcces
    from apps.rbac.tests.factories import (
        RoleDefinitionFactory,
        RoleModulePermissionFactory,
        UserRoleAssignmentFactory,
    )

    user, membre = _user_avec_membre(Role.MEMBRE, "readonly-justificatifs@example.de")
    justificatif = JustificatifRabaisFactory(
        souscription=SouscriptionFactory(
            membre=membre, statut=StatutSouscription.EN_ATTENTE_JUSTIFICATIF
        )
    )
    role_perso = RoleDefinitionFactory(slug="justificatifs-lecteur")
    RoleModulePermissionFactory(
        role=role_perso, module="page_justificatifs", niveau_acces=NiveauAcces.LECTURE
    )
    UserRoleAssignmentFactory(user=user, role=role_perso)
    _auth(api_client, user)

    resp_list = api_client.get(reverse(JUSTIFICATIF_LIST_URL))
    assert resp_list.status_code == 200
    ids = {r["id"] for r in resp_list.data["results"]}
    assert str(justificatif.id) in ids

    resp_valider = api_client.post(_valider_url(justificatif), {"decision": "approuve"})
    assert resp_valider.status_code == 403


def test_role_lecture_ecriture_peut_valider_un_justificatif(api_client):
    from apps.rbac.models import NiveauAcces
    from apps.rbac.tests.factories import (
        RoleDefinitionFactory,
        RoleModulePermissionFactory,
        UserRoleAssignmentFactory,
    )

    user, membre = _user_avec_membre(Role.MEMBRE, "readwrite-justificatifs@example.de")
    justificatif = JustificatifRabaisFactory(
        souscription=SouscriptionFactory(
            membre=membre, statut=StatutSouscription.EN_ATTENTE_JUSTIFICATIF
        )
    )
    role_perso = RoleDefinitionFactory(slug="justificatifs-editeur")
    RoleModulePermissionFactory(
        role=role_perso, module="page_justificatifs", niveau_acces=NiveauAcces.LECTURE_ECRITURE
    )
    UserRoleAssignmentFactory(user=user, role=role_perso)
    _auth(api_client, user)

    resp = api_client.post(_valider_url(justificatif), {"decision": "approuve"})
    assert resp.status_code == 200, resp.data
    justificatif.refresh_from_db()
    assert justificatif.statut == StatutJustificatif.APPROUVE


# --- Détail / téléchargement (RH+ ou propriétaire) ---


def test_membre_peut_recuperer_son_propre_justificatif(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    souscription = SouscriptionFactory(membre=membre)
    justificatif = JustificatifRabaisFactory(souscription=souscription)
    _auth(api_client, user)

    resp = api_client.get(_detail_url(justificatif))

    assert resp.status_code == 200


def test_membre_ne_peut_pas_recuperer_le_justificatif_dun_autre(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    justificatif = JustificatifRabaisFactory()  # une autre souscription
    _auth(api_client, user)

    resp = api_client.get(_detail_url(justificatif))

    assert resp.status_code == 404


def test_rh_peut_recuperer_nimporte_quel_justificatif(api_client):
    justificatif = JustificatifRabaisFactory()
    user, _membre = _user_avec_membre(Role.RH, "rh@example.de")
    _auth(api_client, user)

    resp = api_client.get(_detail_url(justificatif))

    assert resp.status_code == 200


def test_telecharger_renvoie_une_url_presignee_pour_le_proprietaire(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    souscription = SouscriptionFactory(membre=membre)
    justificatif = JustificatifRabaisFactory(souscription=souscription)
    _auth(api_client, user)

    resp = api_client.get(_telecharger_url(justificatif))

    assert resp.status_code == 200
    assert resp.data["expires_in"] == 900
    assert resp.data["url"]


def test_telecharger_refuse_pour_un_autre_membre(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    justificatif = JustificatifRabaisFactory()
    _auth(api_client, user)

    resp = api_client.get(_telecharger_url(justificatif))

    assert resp.status_code == 404


# --- Validation (POST .../valider/, RH+ uniquement) ---


def test_membre_ne_peut_pas_valider(api_client):
    justificatif = JustificatifRabaisFactory()
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp = api_client.post(_valider_url(justificatif), {"decision": "approuve"})

    assert resp.status_code == 403


def test_rh_approuve_le_justificatif(api_client):
    souscription = SouscriptionFactory(statut=StatutSouscription.EN_ATTENTE_JUSTIFICATIF)
    justificatif = JustificatifRabaisFactory(souscription=souscription)
    user, rh = _user_avec_membre(Role.RH, "rh@example.de")
    _auth(api_client, user)

    resp = api_client.post(_valider_url(justificatif), {"decision": "approuve"})

    assert resp.status_code == 200, resp.data
    justificatif.refresh_from_db()
    souscription.refresh_from_db()
    assert justificatif.statut == StatutJustificatif.APPROUVE
    assert justificatif.valide_par_id == rh.id
    assert justificatif.date_decision is not None
    assert souscription.statut == StatutSouscription.EN_ATTENTE_PAIEMENT
    # Ajouté le 2026-09-19 (retour utilisateur : "Die Zahlung taucht nicht im Modul Ausstehende
    # Zahlungen") — le paiement est désormais dû, voir apps.adhesions.services.synchroniser_
    # cotisation, appelée depuis JustificatifRabaisViewSet.valider().
    assert souscription.cotisation is not None
    from apps.cotisations.models import StatutCotisation, TypeArticle

    assert souscription.cotisation.type_article == TypeArticle.ADHESION
    assert souscription.cotisation.statut == StatutCotisation.EN_ATTENTE
    assert souscription.cotisation.montant == souscription.prix_paye


def test_rh_approuve_le_justificatif_notifie_le_membre(api_client, mailoutbox):
    """Ajouté le 2026-09-16 — voir apps.adhesions.notifications.notifier_justificatif_valide."""
    user_membre = User.objects.create_user(
        email="etudiant@example.de", password="Password123!", is_active=True
    )
    membre = MembreFactory(user=user_membre)
    souscription = SouscriptionFactory(
        membre=membre, statut=StatutSouscription.EN_ATTENTE_JUSTIFICATIF
    )
    justificatif = JustificatifRabaisFactory(souscription=souscription)
    user_rh, _rh = _user_avec_membre(Role.RH, "rh-valide@example.de")
    _auth(api_client, user_rh)

    resp = api_client.post(_valider_url(justificatif), {"decision": "approuve"})

    assert resp.status_code == 200, resp.data
    notification = Notification.objects.get(destinataire=user_membre)
    assert notification.type_notification == TypeNotification.ADHESION_JUSTIFICATIF_VALIDE
    assert len(mailoutbox) == 1


def test_rh_rejette_le_justificatif_avec_motif(api_client):
    souscription = SouscriptionFactory(statut=StatutSouscription.EN_ATTENTE_JUSTIFICATIF)
    justificatif = JustificatifRabaisFactory(souscription=souscription)
    user, _rh = _user_avec_membre(Role.RH, "rh@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        _valider_url(justificatif),
        {"decision": "rejete", "motif_rejet": "Carte étudiante expirée."},
    )

    assert resp.status_code == 200, resp.data
    justificatif.refresh_from_db()
    souscription.refresh_from_db()
    assert justificatif.statut == StatutJustificatif.REJETE
    assert justificatif.motif_rejet == "Carte étudiante expirée."
    assert souscription.statut == StatutSouscription.RABAIS_REFUSE
    # Un rabais refusé ne rend pas de paiement dû dans l'immédiat (le membre doit encore choisir
    # prix plein ou annulation) — voir apps.adhesions.services.synchroniser_cotisation.
    assert souscription.cotisation is None


def test_rh_rejette_le_justificatif_notifie_le_membre_avec_le_motif(api_client, mailoutbox):
    """Ajouté le 2026-09-16 — voir apps.adhesions.notifications.notifier_justificatif_refuse."""
    user_membre = User.objects.create_user(
        email="etudiant2@example.de", password="Password123!", is_active=True
    )
    membre = MembreFactory(user=user_membre)
    souscription = SouscriptionFactory(
        membre=membre, statut=StatutSouscription.EN_ATTENTE_JUSTIFICATIF
    )
    justificatif = JustificatifRabaisFactory(souscription=souscription)
    user_rh, _rh = _user_avec_membre(Role.RH, "rh-rejette@example.de")
    _auth(api_client, user_rh)

    resp = api_client.post(
        _valider_url(justificatif),
        {"decision": "rejete", "motif_rejet": "Carte étudiante expirée."},
    )

    assert resp.status_code == 200, resp.data
    notification = Notification.objects.get(destinataire=user_membre)
    assert notification.type_notification == TypeNotification.ADHESION_JUSTIFICATIF_REFUSE
    assert "Carte étudiante expirée." in notification.message
    assert len(mailoutbox) == 1


def test_rejet_sans_motif_refuse(api_client):
    justificatif = JustificatifRabaisFactory()
    user, _rh = _user_avec_membre(Role.RH, "rh@example.de")
    _auth(api_client, user)

    resp = api_client.post(_valider_url(justificatif), {"decision": "rejete"})

    assert resp.status_code == 400


def test_valider_un_justificatif_deja_tranche_refuse(api_client):
    justificatif = JustificatifRabaisFactory(statut=StatutJustificatif.APPROUVE)
    user, _rh = _user_avec_membre(Role.RH, "rh@example.de")
    _auth(api_client, user)

    resp = api_client.post(_valider_url(justificatif), {"decision": "approuve"})

    assert resp.status_code == 400


# --- Intégration avec souscrire() : nettoyage du justificatif si le rabais change ---


def test_changer_de_rabais_supprime_lancien_justificatif(api_client):
    offre = OffreAdhesionFactory(prix_plein=Decimal("50.00"))
    rabais1 = RabaisOffreFactory(offre=offre, justificatif_requis=True)
    rabais2 = RabaisOffreFactory(offre=offre, justificatif_requis=True)
    user, membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    api_client.post(reverse(SOUSCRIRE_URL), {"offre": str(offre.id), "rabais": str(rabais1.id)})
    souscription = membre.souscriptions.get()
    api_client.post(
        reverse(JUSTIFICATIF_LIST_URL),
        {"souscription": str(souscription.id), "fichier": _pdf_upload()},
        format="multipart",
    )
    assert JustificatifRabais.objects.filter(souscription=souscription).exists()

    resp = api_client.post(
        reverse(SOUSCRIRE_URL), {"offre": str(offre.id), "rabais": str(rabais2.id)}
    )

    assert resp.status_code == 200, resp.data
    assert not JustificatifRabais.objects.filter(souscription=souscription).exists()


def test_abandonner_le_rabais_supprime_lancien_justificatif_et_debloque_le_paiement(api_client):
    offre = OffreAdhesionFactory(prix_plein=Decimal("50.00"))
    rabais = RabaisOffreFactory(offre=offre, justificatif_requis=True)
    user, membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    api_client.post(reverse(SOUSCRIRE_URL), {"offre": str(offre.id), "rabais": str(rabais.id)})
    souscription = membre.souscriptions.get()
    JustificatifRabaisFactory(souscription=souscription)

    resp = api_client.post(reverse(SOUSCRIRE_URL), {"offre": str(offre.id)})

    assert resp.status_code == 200, resp.data
    assert resp.data["statut"] == StatutSouscription.EN_ATTENTE_PAIEMENT
    assert not JustificatifRabais.objects.filter(souscription=souscription).exists()


def test_resouscrire_au_meme_rabais_conserve_le_justificatif(api_client):
    offre = OffreAdhesionFactory(prix_plein=Decimal("50.00"))
    rabais = RabaisOffreFactory(offre=offre, justificatif_requis=True)
    user, membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    api_client.post(reverse(SOUSCRIRE_URL), {"offre": str(offre.id), "rabais": str(rabais.id)})
    souscription = membre.souscriptions.get()
    justificatif = JustificatifRabaisFactory(souscription=souscription)

    resp = api_client.post(
        reverse(SOUSCRIRE_URL), {"offre": str(offre.id), "rabais": str(rabais.id)}
    )

    assert resp.status_code == 200, resp.data
    assert JustificatifRabais.objects.filter(id=justificatif.id, souscription=souscription).exists()
