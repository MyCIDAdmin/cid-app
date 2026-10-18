"""Fan-Konto (Release 29) — API unter /api/v1/regionen/fan/.

  GET   fan/optionen/          Bundesländer, Länder mit Sektor, Standorte (öffentlich)
  POST  fan/registrieren/      Fan-Konto anlegen (öffentlich) ; Code: /auth/register/confirm/
  GET   fan/                   eigenes Fan-Profil (404 ohne Fan-Profil)
  PATCH fan/                   Name, Wohnland, Bundesland, Standort ändern
  POST  fan/mitglied-werden/   Mitgliedsfiche anlegen (Status „in Erwartung“) ; danach Antrag unter
                               „Meine Mitgliedschaft“

Ein Fan-Konto hat keine Mitgliedsfiche ; die Barriere „Nicht-Mitglied“ (apps.rbac.services) gilt
unverändert. Verarbeitet werden nur Name, E-Mail, Bundesland, Standort und der Zeitpunkt der
Einwilligung."""

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.http import Http404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import services as account_services
from apps.accounts.models import Role, User
from apps.accounts.tasks import send_email_verification_code
from apps.membres.models import Bundesland, Membre, Pays, Sexe, StatutMembre
from apps.membres.rapprochement import lier_automatiquement

from . import services
from .models import FanProfil, Region, RegionLand, RegionPays, Standort
from .permissions import IsAuthenticated

SPRACHEN = [("fr", "Français"), ("de", "Deutsch"), ("ar", "العربية")]


def _ip(request) -> str | None:
    kette = request.META.get("HTTP_X_FORWARDED_FOR", "")
    return kette.split(",")[0].strip() or request.META.get("REMOTE_ADDR")


def _region_dict(region: Region | None) -> dict | None:
    return {"slug": region.slug, "name": region.name} if region else None


def fan_dict(profil: FanProfil) -> dict:
    standort = profil.standort
    return {
        "prenom": profil.prenom,
        "nom": profil.nom,
        "email": profil.user.email,
        "pays": profil.pays,
        "land_de": profil.land_de,
        "standort_id": str(standort.pk) if standort else None,
        "standort": standort.name if standort else None,
        "region": _region_dict(services.region_von_gebiet(profil.pays, profil.land_de)),
        "mitgliedsantrag_am": profil.mitgliedsantrag_am,
        "ist_mitglied_in_erwartung": hasattr(profil.user, "membre"),
    }


def _standort_pruefen(standort: Standort | None, land: str):
    """Ein Standort muss aktiv sein und zum gewählten Bundesland passen (wenn er eines hat)."""
    if standort is None:
        return
    if not standort.aktiv:
        raise serializers.ValidationError({"standort": "Dieser Standort ist nicht verfügbar."})
    if land and standort.land and standort.land != land:
        raise serializers.ValidationError(
            {"standort": "Der Standort liegt nicht im gewählten Bundesland."}
        )


def _gebiet_pruefen(attrs):
    """Außerhalb Deutschlands gibt es kein Bundesland ; innerhalb bleibt es wie bisher optional."""
    if attrs.get("pays", Pays.ALLEMAGNE) != Pays.ALLEMAGNE:
        attrs["land_de"] = ""
    return attrs


class FanRegistrierenSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    prenom = serializers.CharField(max_length=100)
    nom = serializers.CharField(max_length=100)
    langue_preferee = serializers.ChoiceField(choices=SPRACHEN, default="fr")
    pays = serializers.ChoiceField(choices=Pays.choices, default=Pays.ALLEMAGNE)
    land_de = serializers.ChoiceField(choices=Bundesland.choices, required=False, allow_blank=True)
    standort = serializers.PrimaryKeyRelatedField(
        queryset=Standort.objects.filter(aktiv=True), required=False, allow_null=True
    )
    consentement_rgpd = serializers.BooleanField(write_only=True)

    def validate_email(self, value):
        value = User.objects.normalize_email(value)
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Un compte existe déjà avec cet email.")
        return value

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def validate_consentement_rgpd(self, value):
        if not value:
            raise serializers.ValidationError(
                "Le consentement RGPD est requis pour créer un compte."
            )
        return value

    def validate(self, attrs):
        attrs = _gebiet_pruefen(attrs)
        _standort_pruefen(attrs.get("standort"), attrs.get("land_de", ""))
        return attrs


class FanOptionenView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        regionen = {
            z.land: z.region
            for z in RegionLand.objects.filter(region__aktiv=True).select_related("region")
        }
        staaten_regionen = {
            z.pays: z.region
            for z in RegionPays.objects.filter(region__aktiv=True).select_related("region")
        }
        laender = [
            {"code": code, "name": name, "region": _region_dict(regionen.get(code))}
            for code, name in Bundesland.choices
        ]
        standorte = [
            {"id": str(s.pk), "name": s.name, "land": s.land, "region": s.region.name}
            for s in Standort.objects.filter(aktiv=True, region__aktiv=True).select_related(
                "region"
            )
        ]
        staaten = [
            {"code": code, "name": name, "region": _region_dict(staaten_regionen.get(code))}
            for code, name in services.STAATEN.items()
        ]
        return Response({"laender": laender, "staaten": staaten, "standorte": standorte})


class FanRegistrierenView(APIView):
    """Wie die Mitgliedsanmeldung : Konto und E-Mail-Code ; nach der Bestätigung ist das Konto
    aktiv (apps.accounts.views.RegisterConfirmView)."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = FanRegistrierenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        with transaction.atomic():
            user = User(email=d["email"], langue_preferee=d["langue_preferee"], role=Role.MEMBRE)
            user.set_password(d["password"])
            user.save()
            FanProfil.objects.create(
                user=user,
                prenom=d["prenom"].strip(),
                nom=d["nom"].strip(),
                pays=d["pays"],
                land_de=d.get("land_de", ""),
                standort=d.get("standort"),
                datenschutz_am=timezone.now(),
            )
            from apps.rbac.models import RoleDefinition, UserRoleAssignment

            rolle = RoleDefinition.objects.filter(slug=Role.MEMBRE, is_system=True).first()
            if rolle:
                UserRoleAssignment.objects.get_or_create(user=user, role=rolle)
        code = account_services.generate_email_otp(user, purpose="email_verification")
        send_email_verification_code.delay(str(user.id), code)
        account_services.log_audit_event("register_fan", user=user, ip_address=_ip(request))
        return Response(
            {"message": "Inscription reçue. Un code de vérification vient d'être envoyé."},
            status=201,
        )


def _profil(user) -> FanProfil:
    profil = getattr(user, "fan_profil", None)
    if profil is None:
        raise Http404
    return profil


class FanProfilView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(fan_dict(_profil(request.user)))

    def patch(self, request):
        profil = _profil(request.user)
        serializer = FanAendernSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        pays = d.get("pays", profil.pays)
        land = d.get("land_de", profil.land_de)
        if pays != Pays.ALLEMAGNE:
            land = ""
        standort = d.get("standort", profil.standort)
        # Wechselt das Bundesland, passt ein bisheriger Standort ggf. nicht mehr dazu.
        if (
            ("land_de" in d or "pays" in d)
            and "standort" not in d
            and standort
            and standort.land not in ("", land)
        ):
            standort = None
        _standort_pruefen(standort, land)
        for feld in ("prenom", "nom"):
            if feld in d:
                setattr(profil, feld, d[feld].strip())
        profil.pays, profil.land_de, profil.standort = pays, land, standort
        profil.save()
        return Response(fan_dict(profil))


class FanAendernSerializer(serializers.Serializer):
    prenom = serializers.CharField(max_length=100)
    nom = serializers.CharField(max_length=100)
    pays = serializers.ChoiceField(choices=Pays.choices)
    land_de = serializers.ChoiceField(choices=Bundesland.choices, allow_blank=True)
    standort = serializers.PrimaryKeyRelatedField(
        queryset=Standort.objects.filter(aktiv=True), allow_null=True
    )


class MitgliedWerdenSerializer(serializers.Serializer):
    date_naissance = serializers.DateField()
    sexe = serializers.ChoiceField(choices=Sexe.choices, default=Sexe.NON_RENSEIGNE)
    telephone = serializers.CharField(max_length=30)
    adresse_de = serializers.CharField(max_length=255)
    code_postal_de = serializers.CharField(max_length=10, required=False, allow_blank=True)
    ville_de = serializers.CharField(max_length=100)
    land_de = serializers.ChoiceField(choices=Bundesland.choices, required=False, allow_blank=True)


class MitgliedWerdenView(APIView):
    """Legt die Mitgliedsfiche an (Status in Erwartung). Identitätsnummer (CIN/Pass) wird erst im
    Antrag verlangt (apps.adhesions.views._exiger_piece_identite), wie bei der Mitgliedsanmeldung.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        profil = _profil(request.user)
        if hasattr(request.user, "membre"):
            raise serializers.ValidationError({"detail": "Es besteht bereits eine Mitgliedsfiche."})
        serializer = MitgliedWerdenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        pays = profil.pays
        land = (d.get("land_de") or profil.land_de) if pays == Pays.ALLEMAGNE else ""
        with transaction.atomic():
            membre = Membre.objects.create(
                user=request.user,
                email=request.user.email,
                prenom=profil.prenom,
                nom=profil.nom,
                pays=pays,
                statut=StatutMembre.EN_ATTENTE,
                land_de=land,
                date_naissance=d["date_naissance"],
                sexe=d["sexe"],
                telephone=d["telephone"],
                adresse_de=d["adresse_de"],
                code_postal_de=d.get("code_postal_de", ""),
                ville_de=d["ville_de"],
            )
            profil.land_de = land
            profil.mitgliedsantrag_am = timezone.now()
            profil.save(update_fields=["land_de", "mitgliedsantrag_am"])
        # Eine importierte Fiche mit derselben (nun bestätigten) E-Mail wird übernommen.
        lier_automatiquement(membre)
        account_services.log_audit_event(
            "fan_mitgliedsantrag", user=request.user, ip_address=_ip(request)
        )
        return Response({"weiter": "/adhesions"}, status=201)
