"""
Demo-Daten und Testkonten je Rolle für die Testfälle der Verwaltung (nur DEV).

Aufruf:  python manage.py demo_daten            # legt fehlende Demo-Daten an
         python manage.py demo_daten --reset    # löscht alle Demo-Daten und legt sie neu an

Schutz: läuft nur, wenn DEMO_DATEN_ERLAUBT=1 gesetzt ist (nur auf DEV setzen, nie auf PROD).
Alle Demo-Objekte sind erkennbar: Konten/Mitglieder an der Domain @cid-demo.test, Ausgaben,
Veranstaltungen und Projekte am Präfix "[DEMO]". Das Passwort kommt aus DEMO_PASSWORT
(sonst wird eines erzeugt und einmalig ausgegeben).
"""

import secrets
from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.accounts.models import RegistrationDecision, Role, User
from apps.evenements.models import Evenement, StatutEvenement, TypeEvenement
from apps.finances.models import CategorieDepense, Depense, StatutDepense
from apps.membres.models import Bundesland, Membre, StatutMembre
from apps.projets.models import Projet, SichtbarkeitProjet, StatutProjet

DOMAIN = "cid-demo.test"
PRAEFIX = "[DEMO]"

# (Kürzel, Rolle, Vorname, Nachname)
KONTEN = [
    ("mitglied", Role.MEMBRE, "Demo", "Mitglied"),
    ("rh", Role.RH, "Demo", "Personal"),
    ("bureau", Role.BUREAU_ADMIN, "Demo", "Bureau"),
    ("finanz", Role.DIR_FINANCIER, "Demo", "Finanzen"),
    ("admin", Role.SUPER_ADMIN, "Demo", "Admin"),
]

# Mitglieder ohne Konto: für Filter, Statuswechsel und Import-Dubletten
OHNE_KONTO = [
    ("Aktiv", StatutMembre.ACTIF),
    ("Wartend", StatutMembre.EN_ATTENTE),
    ("Inaktiv", StatutMembre.INACTIF),
]


def _email(kuerzel: str) -> str:
    return f"demo-{kuerzel}@{DOMAIN}"


class Command(BaseCommand):
    help = "Legt Demo-Daten und Testkonten je Rolle an (nur DEV, DEMO_DATEN_ERLAUBT=1)."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Demo-Daten erst löschen.")

    def handle(self, *args, **options):
        if not getattr(settings, "DEMO_DATEN_ERLAUBT", False):
            raise CommandError("Demo-Daten sind hier nicht erlaubt (DEMO_DATEN_ERLAUBT=1 fehlt).")
        if options["reset"]:
            self._loeschen()
        passwort = settings.DEMO_PASSWORT or secrets.token_urlsafe(12)
        konten = self._konten(passwort)
        self._mitglieder_ohne_konto()
        self._ausgaben(konten)
        self._veranstaltungen(konten)
        self._projekte(konten)
        if not settings.DEMO_PASSWORT:
            self.stdout.write(f"Erzeugtes Demo-Passwort (nur jetzt sichtbar): {passwort}")
        self.stdout.write(self.style.SUCCESS("Demo-Daten bereit."))
        for kuerzel, rolle, _v, _n in KONTEN:
            self.stdout.write(f"  {rolle.label:<32} {_email(kuerzel)}")

    # -- Löschen ---------------------------------------------------------------------------
    def _loeschen(self):
        Depense.objects.filter(fournisseur__startswith=PRAEFIX).delete()
        Evenement.objects.filter(titre__startswith=PRAEFIX).delete()
        Projet.objects.filter(titre__startswith=PRAEFIX).delete()
        Membre.objects.filter(email__endswith=f"@{DOMAIN}").delete()
        User.objects.filter(email__endswith=f"@{DOMAIN}").delete()
        self.stdout.write("Demo-Daten gelöscht.")

    # -- Anlegen ---------------------------------------------------------------------------
    def _membre(self, email, prenom, nom, statut, user=None):
        membre, _ = Membre.objects.get_or_create(
            email=email,
            defaults={
                "user": user,
                "prenom": prenom,
                "nom": nom,
                "date_naissance": date(1990, 1, 1),
                "telephone": "+4915100000000",
                "pays": "DE",
                "adresse_de": "Demostraße 1",
                "code_postal_de": "10115",
                "ville_de": "Berlin",
                "land_de": Bundesland.BERLIN,
                "statut": statut,
            },
        )
        return membre

    def _konten(self, passwort):
        ergebnis = {}
        for kuerzel, rolle, prenom, nom in KONTEN:
            email = _email(kuerzel)
            user = User.objects.filter(email=email).first()
            if user is None:
                user = User.objects.create_user(
                    email=email,
                    password=passwort,
                    role=rolle,
                    is_active=True,
                    is_staff=rolle == Role.SUPER_ADMIN,
                    registration_decision=RegistrationDecision.APPROUVE,
                    registration_decided_at=timezone.now(),
                    email_verifie=True,
                    langue_preferee="de",
                )
            membre = self._membre(email, prenom, nom, StatutMembre.ACTIF, user=user)
            ergebnis[kuerzel] = (user, membre)
        return ergebnis

    def _mitglieder_ohne_konto(self):
        for name, statut in OHNE_KONTO:
            self._membre(f"demo-{name.lower()}@{DOMAIN}", "Demo", name, statut)

    def _ausgaben(self, konten):
        kategorie = CategorieDepense.objects.filter(actif=True).order_by(
            "ordre"
        ).first() or CategorieDepense.objects.create(nom="Demo")
        finanz = konten["finanz"][0]
        admin = konten["admin"][0]
        heute = date.today()
        zeilen = [
            # (Lieferant, Betrag, Status, erfasst von, entschieden von)
            ("Flyer-Druck", "480.00", StatutDepense.EN_ATTENTE, finanz, None),
            ("Saalmiete", "150.00", StatutDepense.APPROUVEE, finanz, admin),
            ("Falsche Rechnung", "99.00", StatutDepense.REJETEE, finanz, admin),
        ]
        for fournisseur, betrag, statut, saisie, decide in zeilen:
            name = f"{PRAEFIX} {fournisseur}"
            if Depense.objects.filter(fournisseur=name).exists():
                continue
            Depense.objects.create(
                date_depense=heute,
                montant=Decimal(betrag),
                categorie=kategorie,
                fournisseur=name,
                description="Demo-Ausgabe für Testfälle",
                statut=statut,
                saisie_par=saisie,
                decide_par=decide,
                date_decision=timezone.now() if decide else None,
                motif_rejet="Beleg fehlt" if statut == StatutDepense.REJETEE else "",
            )

    def _veranstaltungen(self, konten):
        heute = date.today()
        zeilen = [
            (
                "Auswärtsfahrt Dortmund",
                TypeEvenement.DEPLACEMENT,
                StatutEvenement.BROUILLON,
                30,
                20,
                "15.00",
                False,
            ),
            ("Frühlingsfest", TypeEvenement.FETE, StatutEvenement.PUBLIE, 45, 40, "0.00", True),
        ]
        for titel, typ, statut, tage, plaetze, kosten, gratis in zeilen:
            name = f"{PRAEFIX} {titel}"
            if Evenement.objects.filter(titre=name).exists():
                continue
            Evenement.objects.create(
                titre=name,
                type_evenement=typ,
                description="<p>Demo-Veranstaltung für Testfälle.</p>",
                date_evenement=heute + timedelta(days=tage),
                lieu="Demohalle, Berlin",
                places_max=plaetze,
                gratuit=gratis,
                cout=Decimal(kosten),
                statut=statut,
                created_by=konten["bureau"][1],
            )

    def _projekte(self, konten):
        name = f"{PRAEFIX} Spendenaktion"
        if Projet.objects.filter(titre=name).exists():
            return
        Projet.objects.create(
            titre=name,
            description_html="<p>Demo-Projekt für Testfälle.</p>",
            statut=StatutProjet.EN_PREPARATION,
            sichtbarkeit=SichtbarkeitProjet.ENTWURF,
            responsable=konten["bureau"][1],
        )
