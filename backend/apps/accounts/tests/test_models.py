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
