from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import Role

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "role",
            "langue_preferee",
            "is_active",
            "require_2fa",
            "created_at",
        ]
        read_only_fields = ["id", "role", "is_active", "require_2fa", "created_at"]


class RegisterSerializer(serializers.ModelSerializer):
    """
    Inscription membre (FDD §3.1, F-002). Le compte est créé inactif —
    l'activation nécessite la validation d'un rôle RH ou Admin.
    """

    password = serializers.CharField(write_only=True, validators=[validate_password])
    consentement_rgpd = serializers.BooleanField(write_only=True)

    class Meta:
        model = User
        fields = ["email", "password", "langue_preferee", "consentement_rgpd"]

    def validate_consentement_rgpd(self, value):
        if not value:
            raise serializers.ValidationError(
                "Le consentement RGPD est requis pour créer un compte."
            )
        return value

    def create(self, validated_data):
        validated_data.pop("consentement_rgpd")
        password = validated_data.pop("password")
        user = User(**validated_data, role=Role.MEMBRE)
        user.set_password(password)
        user.save()
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    device_fingerprint = serializers.CharField(required=False, allow_blank=True)


class SendOTPSerializer(serializers.Serializer):
    login_ticket = serializers.CharField()


class Verify2FASerializer(serializers.Serializer):
    login_ticket = serializers.CharField()
    method = serializers.ChoiceField(choices=["totp", "email_otp"])
    code = serializers.CharField(max_length=6, min_length=6)


class TOTPSetupConfirmSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=6, min_length=6)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, validators=[validate_password])
