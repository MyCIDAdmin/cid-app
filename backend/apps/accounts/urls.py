from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

app_name = "accounts"

urlpatterns = [
    path("login/", views.LoginView.as_view(), name="login"),
    path("logout/", views.LogoutView.as_view(), name="logout"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("register/", views.RegisterView.as_view(), name="register"),
    path("password-reset/", views.PasswordResetRequestView.as_view(), name="password-reset"),
    path(
        "password-reset/confirm/",
        views.PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),
    path(
        "pending-registrations/",
        views.PendingRegistrationsView.as_view(),
        name="pending-registrations",
    ),
    path(
        "pending-registrations/<uuid:pk>/approve/",
        views.ApproveRegistrationView.as_view(),
        name="pending-registration-approve",
    ),
    path(
        "pending-registrations/<uuid:pk>/refuse/",
        views.RefuseRegistrationView.as_view(),
        name="pending-registration-refuse",
    ),
    path("me/", views.MeView.as_view(), name="me"),
    path("2fa/send-otp/", views.SendOTPView.as_view(), name="2fa-send-otp"),
    path("2fa/verify/", views.Verify2FAView.as_view(), name="2fa-verify"),
    path("2fa/totp/", views.TOTPSetupView.as_view(), name="2fa-totp"),
    path("2fa/totp/confirm/", views.TOTPConfirmView.as_view(), name="2fa-totp-confirm"),
]
