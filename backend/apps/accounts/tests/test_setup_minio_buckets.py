"""
Tests de `setup_minio_buckets` — la config MinIO réelle (boto3/S3) n'est pas disponible en
CI/sandbox, le client S3 est donc mocké (pas de dépendance moto). Ce qui compte ici : chaque
bucket connu reçoit bien une politique de lecture publique OU voit sa politique supprimée
selon la liste BUCKETS_PUBLICS/BUCKETS_PRIVES, et une erreur sur un bucket n'empêche pas les
suivants d'être traités (voir docstring de tête de la commande — non bloquant par conception).
"""

from unittest.mock import MagicMock, patch

import pytest
from botocore.exceptions import ClientError, EndpointConnectionError
from django.core.management import call_command

pytestmark = pytest.mark.django_db


def erreur_client(code: str) -> ClientError:
    return ClientError({"Error": {"Code": code, "Message": "erreur simulée"}}, "OperationTest")


@patch("apps.accounts.management.commands.setup_minio_buckets.boto3.client")
def test_cree_les_buckets_absents_et_applique_la_politique_publique_ou_privee(mock_boto3_client):
    client = MagicMock()
    # head_bucket échoue partout (aucun bucket n'existe encore) → create_bucket appelé pour
    # chacun, puis politique publique (put_bucket_policy) ou privée (delete_bucket_policy)
    # selon BUCKETS_PUBLICS/BUCKETS_PRIVES.
    client.head_bucket.side_effect = erreur_client("404")
    mock_boto3_client.return_value = client

    call_command("setup_minio_buckets")

    from apps.accounts.management.commands.setup_minio_buckets import (
        BUCKETS_PRIVES,
        BUCKETS_PUBLICS,
    )

    noms_crees = [appel.kwargs["Bucket"] for appel in client.create_bucket.call_args_list]
    assert set(noms_crees) == set(BUCKETS_PUBLICS) | set(BUCKETS_PRIVES)

    noms_avec_politique_publique = [
        appel.kwargs["Bucket"] for appel in client.put_bucket_policy.call_args_list
    ]
    assert set(noms_avec_politique_publique) == set(BUCKETS_PUBLICS)

    noms_politique_supprimee = [
        appel.kwargs["Bucket"] for appel in client.delete_bucket_policy.call_args_list
    ]
    assert set(noms_politique_supprimee) == set(BUCKETS_PRIVES)


@patch("apps.accounts.management.commands.setup_minio_buckets.boto3.client")
def test_bucket_deja_existant_nappelle_pas_create_bucket(mock_boto3_client):
    client = MagicMock()
    client.head_bucket.return_value = {}  # bucket déjà présent
    mock_boto3_client.return_value = client

    call_command("setup_minio_buckets")

    client.create_bucket.assert_not_called()
    assert client.put_bucket_policy.called


@patch("apps.accounts.management.commands.setup_minio_buckets.boto3.client")
def test_une_erreur_sur_un_bucket_nempeche_pas_les_suivants(mock_boto3_client):
    from apps.accounts.management.commands.setup_minio_buckets import BUCKETS_PUBLICS

    client = MagicMock()
    premier_bucket = BUCKETS_PUBLICS[0]

    def head_bucket_side_effect(Bucket):
        if Bucket == premier_bucket:
            raise erreur_client("500")  # erreur inattendue, non "bucket absent"
        raise erreur_client("404")

    client.head_bucket.side_effect = head_bucket_side_effect
    mock_boto3_client.return_value = client

    # Ne doit pas lever — l'échec sur premier_bucket est journalisé (stderr), pas fatal.
    call_command("setup_minio_buckets")

    # Le bucket en erreur n'a pas reçu de politique (create_bucket jamais atteint pour lui)...
    noms_avec_politique = {
        appel.kwargs["Bucket"] for appel in client.put_bucket_policy.call_args_list
    }
    assert premier_bucket not in noms_avec_politique
    # ...mais les autres buckets publics ont bien été traités.
    assert set(BUCKETS_PUBLICS[1:]) <= noms_avec_politique


@patch("apps.accounts.management.commands.setup_minio_buckets.boto3.client")
def test_minio_injoignable_ne_fait_pas_echouer_la_commande(mock_boto3_client):
    # Incident Railway : minio.railway.internal injoignable au démarrage → la commande doit
    # sortir normalement (sinon la chaîne `&&` du CMD n'atteint jamais daphne).
    client = MagicMock()
    client.head_bucket.side_effect = EndpointConnectionError(
        endpoint_url="http://minio.railway.internal:9000/cid-media"
    )
    mock_boto3_client.return_value = client

    call_command("setup_minio_buckets")  # ne doit pas lever

    # Arrêt dès la première erreur de connexion : pas un timeout par bucket.
    assert client.head_bucket.call_count == 1
    client.create_bucket.assert_not_called()
    client.put_bucket_policy.assert_not_called()


@patch("apps.accounts.management.commands.setup_minio_buckets.boto3.client")
def test_creation_du_client_en_erreur_ne_fait_pas_echouer_la_commande(mock_boto3_client):
    mock_boto3_client.side_effect = ValueError("Invalid endpoint: ")

    call_command("setup_minio_buckets")  # ne doit pas lever


@patch("apps.accounts.management.commands.setup_minio_buckets.boto3.client")
def test_erreur_inattendue_ne_fait_pas_echouer_la_commande(mock_boto3_client):
    client = MagicMock()
    client.head_bucket.side_effect = RuntimeError("bug inattendu")
    mock_boto3_client.return_value = client

    call_command("setup_minio_buckets")  # filet de sécurité : ne doit pas lever
