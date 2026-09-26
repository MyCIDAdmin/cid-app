import pytest

from apps.accounts.models import ROLE_LEVELS, Role, User

pytestmark = pytest.mark.django_db


def test_create_user_is_inactive_by_default():
    user = User.objects.create_user(email="membre@example.com", password="Password123!")
    assert user.is_active is False
    assert user.role == Role.MEMBRE


def test_create_superuser_is_active_and_super_admin():
    admin = User.objects.create_superuser(email="admin@example.com", password="Password123!")
    assert admin.is_active is True
    assert admin.role == Role.SUPER_ADMIN
    assert admin.is_staff is True


def test_role_level_ordering():
    assert ROLE_LEVELS[Role.MEMBRE] < ROLE_LEVELS[Role.RH] < ROLE_LEVELS[Role.BUREAU_ADMIN]
    assert (
        ROLE_LEVELS[Role.BUREAU_ADMIN]
        < ROLE_LEVELS[Role.DIR_FINANCIER]
        < ROLE_LEVELS[Role.SUPER_ADMIN]
    )


@pytest.mark.parametrize(
    "role,require_2fa,expected",
    [
        (Role.MEMBRE, False, False),
        (Role.MEMBRE, True, True),
        (Role.RH, False, False),
        (Role.BUREAU_ADMIN, False, True),
        (Role.DIR_FINANCIER, False, True),
        (Role.SUPER_ADMIN, False, True),
    ],
)
def test_two_fa_mandatory(role, require_2fa, expected):
    user = User(email="x@example.com", role=role, require_2fa=require_2fa)
    assert user.two_fa_mandatory is expected


# --- task #218 (2026-09-24) : DeviceSession + services.enforce_single_session_per_device /
# services.track_device_session — tests unitaires, en plus des tests bout-en-bout via l'API
# dans test_api.py.


def test_track_device_session_cree_la_ligne_liee_au_refresh_token():
    from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
    from rest_framework_simplejwt.tokens import RefreshToken

    from apps.accounts import services
    from apps.accounts.models import DeviceSession

    user = User.objects.create_user(email="membre@example.com", password="Password123!")
    refresh = RefreshToken.for_user(user)

    services.track_device_session(user, refresh, "fp-hash-a")

    session = DeviceSession.objects.get(user=user)
    assert session.device_fingerprint_hash == "fp-hash-a"
    assert session.outstanding_token == OutstandingToken.objects.get(jti=refresh["jti"])


def test_track_device_session_sans_empreinte_ne_cree_rien():
    from rest_framework_simplejwt.tokens import RefreshToken

    from apps.accounts import services
    from apps.accounts.models import DeviceSession

    user = User.objects.create_user(email="membre@example.com", password="Password123!")
    refresh = RefreshToken.for_user(user)

    services.track_device_session(user, refresh, None)

    assert DeviceSession.objects.count() == 0


def test_enforce_single_session_per_device_revoque_uniquement_le_meme_appareil():
    from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
    from rest_framework_simplejwt.tokens import RefreshToken

    from apps.accounts import services

    user = User.objects.create_user(email="membre@example.com", password="Password123!")

    refresh_meme_appareil = RefreshToken.for_user(user)
    services.track_device_session(user, refresh_meme_appareil, "fp-a")

    refresh_autre_appareil = RefreshToken.for_user(user)
    services.track_device_session(user, refresh_autre_appareil, "fp-b")

    count = services.enforce_single_session_per_device(user, "fp-a")

    assert count == 1
    assert BlacklistedToken.objects.filter(token__jti=refresh_meme_appareil["jti"]).exists()
    assert not BlacklistedToken.objects.filter(token__jti=refresh_autre_appareil["jti"]).exists()


def test_enforce_single_session_per_device_sans_empreinte_ne_revoque_rien():
    from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
    from rest_framework_simplejwt.tokens import RefreshToken

    from apps.accounts import services

    user = User.objects.create_user(email="membre@example.com", password="Password123!")
    refresh = RefreshToken.for_user(user)
    services.track_device_session(user, refresh, "fp-a")

    count = services.enforce_single_session_per_device(user, None)

    assert count == 0
    assert BlacklistedToken.objects.count() == 0


def test_device_session_supprimee_en_cascade_avec_loutstandingtoken():
    from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
    from rest_framework_simplejwt.tokens import RefreshToken

    from apps.accounts import services
    from apps.accounts.models import DeviceSession

    user = User.objects.create_user(email="membre@example.com", password="Password123!")
    refresh = RefreshToken.for_user(user)
    services.track_device_session(user, refresh, "fp-a")

    OutstandingToken.objects.get(jti=refresh["jti"]).delete()

    assert DeviceSession.objects.count() == 0
