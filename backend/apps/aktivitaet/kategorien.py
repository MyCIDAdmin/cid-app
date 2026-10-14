"""Kategorien, Bezeichnungen (DE/FR), Gewichtung und Aufbewahrung der Protokoll-Aktionen.

Unbekannte Aktionen (neue Module, die noch nicht eingetragen sind) landen in „sonstige“ und
werden mit ihrem technischen Namen angezeigt — nichts geht verloren.
"""

# Kategorie → (Bezeichnung DE, Bezeichnung FR, Aufbewahrung in Tagen)
KATEGORIEN = {
    "anmeldung": ("Anmeldung & Geräte", "Connexion et appareils", 180),
    "konto": ("Konto & Sicherheit", "Compte et sécurité", 180),
    "rollen": ("Rollen, Rechte & Freigaben", "Rôles, droits et validations", 730),
    "moderation": ("Moderation", "Modération", 730),
    "audit": ("Protokoll-Zugriffe", "Accès au journal", 730),
    "mitglieder": ("Mitglieder & Beitritt", "Membres et adhésions", 730),
    "zahlungen": ("Beiträge & Zahlungen", "Cotisations et paiements", 730),
    "finanzen": ("Finanzen", "Finances", 730),
    "shop": ("Shop", "Boutique", 730),
    "kalender": ("Kalender", "Calendrier", 730),
    "inhalte": ("Veranstaltungen, Projekte & Partner", "Événements, projets et partenaires", 730),
    "einstellungen": ("Einstellungen", "Paramètres", 730),
    "export": ("Exporte & Importe", "Exports et imports", 730),
    "betrieb": ("Betrieb & Fehler", "Exploitation et erreurs", 730),
    "sonstige": ("Sonstiges", "Autres", 730),
}
IP_AUFBEWAHRUNG_TAGE = 90
NUTZUNG_AUFBEWAHRUNG_TAGE = (
    400  # Nutzungsstatistik (Release 23) : gut ein Jahr für Vorjahresvergleiche
)

# Aktion → (Kategorie, Gewicht, DE, FR) ; Gewicht: info | warnung | wichtig
AKTIONEN = {
    "login_success": ("anmeldung", "info", "Anmeldung erfolgreich", "Connexion réussie"),
    "login_failed": ("anmeldung", "warnung", "Anmeldung fehlgeschlagen", "Échec de connexion"),
    "login_locked_out": (
        "anmeldung",
        "warnung",
        "Anmeldung gesperrt (zu viele Versuche)",
        "Connexion bloquée (trop de tentatives)",
    ),
    "login_2fa_required": (
        "anmeldung",
        "info",
        "Zweiter Faktor angefordert",
        "Second facteur demandé",
    ),
    "login_2fa_success": (
        "anmeldung",
        "info",
        "Anmeldung mit zweitem Faktor",
        "Connexion avec second facteur",
    ),
    "login_2fa_failed": (
        "anmeldung",
        "warnung",
        "Zweiter Faktor falsch",
        "Second facteur incorrect",
    ),
    "logout": ("anmeldung", "info", "Abmeldung", "Déconnexion"),
    "device_limit_reached": (
        "anmeldung",
        "warnung",
        "Geräte-Limit erreicht",
        "Limite d'appareils atteinte",
    ),
    "device_sessions_revoked": (
        "anmeldung",
        "info",
        "Sitzungen auf demselben Gerät beendet",
        "Sessions du même appareil terminées",
    ),
    "device_session_revoked_by_user": (
        "anmeldung",
        "info",
        "Gerät vom Nutzer abgemeldet",
        "Appareil déconnecté par l'utilisateur",
    ),
    "device_sessions_revoked_by_user": (
        "anmeldung",
        "info",
        "Alle Geräte vom Nutzer abgemeldet",
        "Tous les appareils déconnectés par l'utilisateur",
    ),
    "register": ("konto", "info", "Registrierung", "Inscription"),
    "email_verified": ("konto", "info", "E-Mail bestätigt", "E-mail confirmé"),
    "password_reset_requested": (
        "konto",
        "info",
        "Passwort-Zurücksetzen angefordert",
        "Réinitialisation du mot de passe demandée",
    ),
    "password_reset_confirmed": (
        "konto",
        "wichtig",
        "Passwort zurückgesetzt",
        "Mot de passe réinitialisé",
    ),
    "password_changed": ("konto", "wichtig", "Passwort geändert", "Mot de passe modifié"),
    "totp_enabled": ("konto", "info", "Authenticator-App aktiviert", "Application TOTP activée"),
    "totp_disabled": (
        "konto",
        "wichtig",
        "Authenticator-App deaktiviert",
        "Application TOTP désactivée",
    ),
    "registration_approved": (
        "rollen",
        "wichtig",
        "Registrierung freigegeben",
        "Inscription validée",
    ),
    "registration_refused": ("rollen", "wichtig", "Registrierung abgelehnt", "Inscription refusée"),
    "role_changed": ("rollen", "wichtig", "Rolle geändert", "Rôle modifié"),
    "rbac_roles_changed": ("rollen", "wichtig", "Rollen zugewiesen", "Rôles attribués"),
    "rbac_role_created": ("rollen", "wichtig", "Eigene Rolle angelegt", "Rôle personnalisé créé"),
    "rbac_role_updated": ("rollen", "wichtig", "Rolle bearbeitet", "Rôle modifié (définition)"),
    "rbac_role_deleted": ("rollen", "wichtig", "Rolle gelöscht", "Rôle supprimé"),
    "rbac_matrix_cell_set": (
        "rollen",
        "wichtig",
        "Zugriffsmatrix geändert",
        "Matrice d'accès modifiée",
    ),
    "rbac_module_visibilite_set": (
        "rollen",
        "wichtig",
        "Sichtbarkeit eines Moduls geändert",
        "Visibilité d'un module modifiée",
    ),
    "publication_masquee": ("moderation", "info", "Beitrag ausgeblendet", "Publication masquée"),
    "publication_demasquee": ("moderation", "info", "Beitrag eingeblendet", "Publication affichée"),
    "commentaire_masque": ("moderation", "info", "Kommentar ausgeblendet", "Commentaire masqué"),
    "commentaire_demasque": ("moderation", "info", "Kommentar eingeblendet", "Commentaire affiché"),
    "photo_masquee": ("moderation", "info", "Foto ausgeblendet", "Photo masquée"),
    "photo_demasquee": ("moderation", "info", "Foto eingeblendet", "Photo affichée"),
    "sujet_masque": ("moderation", "info", "Thema ausgeblendet", "Sujet masqué"),
    "sujet_demasque": ("moderation", "info", "Thema eingeblendet", "Sujet affiché"),
    "sujet_epingle": ("moderation", "info", "Thema angepinnt", "Sujet épinglé"),
    "sujet_desepingle": ("moderation", "info", "Thema losgelöst", "Sujet désépinglé"),
    "sujet_verrouille": ("moderation", "info", "Thema gesperrt", "Sujet verrouillé"),
    "sujet_deverrouille": ("moderation", "info", "Thema entsperrt", "Sujet déverrouillé"),
    "reponse_forum_masquee": ("moderation", "info", "Antwort ausgeblendet", "Réponse masquée"),
    "reponse_forum_demasquee": ("moderation", "info", "Antwort eingeblendet", "Réponse affichée"),
    "aktivitaet_geoeffnet": (
        "audit",
        "info",
        "Aktivitäts-Protokoll geöffnet",
        "Journal d'activité ouvert",
    ),
    "aktivitaet_export": (
        "audit",
        "wichtig",
        "Protokoll exportiert (CSV)",
        "Journal exporté (CSV)",
    ),
    "aktivitaet_bereinigt": (
        "audit",
        "info",
        "Aufbewahrungsfristen angewendet",
        "Durées de conservation appliquées",
    ),
}

# --- Release 21 : Datenänderungen (von der Middleware `AktivitaetMiddleware` erfasst) -----------
# URL-Präfix unter /api/v1/ → (Kategorie, Bezeichnung DE, Bezeichnung FR). Module mit eigenen,
# detaillierten Protokolleinträgen (auth, rbac, communaute, aktivitaet) stehen bewusst nicht hier.
MODULE = {
    "membres": ("mitglieder", "Mitglieder", "Membres"),
    "adhesions": ("mitglieder", "Beitritt & Angebote", "Adhésions et offres"),
    "cotisations": ("zahlungen", "Beiträge & Zahlungen", "Cotisations et paiements"),
    "finances": ("finanzen", "Finanzen", "Finances"),
    "boutique": ("shop", "Shop", "Boutique"),
    "kalender": ("kalender", "Kalender", "Calendrier"),
    "evenements": ("inhalte", "Veranstaltungen", "Événements"),
    "projets": ("inhalte", "Projekte", "Projets"),
    "umfragen": ("inhalte", "Umfragen", "Sondages"),
    "votes": ("inhalte", "Abstimmungen", "Votes"),
    "partenaires": ("inhalte", "Partner", "Partenaires"),
    "uebersetzungen": ("einstellungen", "Übersetzungen", "Traductions"),
    "notifications": ("einstellungen", "Benachrichtigungen", "Notifications"),
    "stats": ("export", "Statistiken", "Statistiques"),
}
# Löschen in diesen Kategorien gilt als Warnung (Nachvollziehbarkeit von Daten mit Rechtswirkung).
SENSIBLE_KATEGORIEN = ("mitglieder", "zahlungen", "finanzen")
_VERBEN = {
    "erstellt": ("info", "angelegt", "créé"),
    "geaendert": ("info", "geändert", "modifié"),
    "geloescht": ("info", "gelöscht", "supprimé"),
    "aktion": ("info", "Aktion ausgeführt", "action exécutée"),
}
for _praefix, (_kat, _de, _fr) in MODULE.items():
    for _verb, (_gewicht, _vde, _vfr) in _VERBEN.items():
        _g = "warnung" if _verb == "geloescht" and _kat in SENSIBLE_KATEGORIEN else _gewicht
        AKTIONEN[f"{_praefix}_{_verb}"] = (_kat, _g, f"{_de}: {_vde}", f"{_fr} : {_vfr}")
    _g = "wichtig" if _praefix == "membres" else "warnung"
    AKTIONEN[f"{_praefix}_export"] = ("export", _g, f"{_de}: Export", f"{_fr} : export")
    if _praefix != "stats":
        AKTIONEN[f"{_praefix}_import"] = ("export", _g, f"{_de}: Import", f"{_fr} : import")

# Besondere Vorgänge (Teil des URL-Pfads → Aktion) : eigene Aktion mit höherem Gewicht.
SONDERFAELLE = (
    ("rapprochement/fusionner", "membres_zusammengefuehrt"),
    ("abschluss/wiedereroeffnen", "finances_wiedereroeffnet"),
    ("abschluss", "finances_abschluss"),
)
AKTIONEN.update(
    {
        "membres_zusammengefuehrt": (
            "mitglieder",
            "wichtig",
            "Mitglieder: Duplikate zusammengeführt",
            "Membres : doublons fusionnés",
        ),
        "finances_wiedereroeffnet": (
            "finanzen",
            "wichtig",
            "Finanzen: Abschluss wieder geöffnet",
            "Finances : clôture rouverte",
        ),
        "finances_abschluss": (
            "finanzen",
            "wichtig",
            "Finanzen: Abschluss durchgeführt",
            "Finances : clôture effectuée",
        ),
    }
)


# --- Release 22 : Betrieb (Serverfehler, Hintergrundjobs, Mailversand) und Auffälligkeiten ------
AKTIONEN.update(
    {
        "server_fehler": (
            "betrieb",
            "warnung",
            "Serverfehler (5xx)",
            "Erreur serveur (5xx)",
        ),
        "task_fehlgeschlagen": (
            "betrieb",
            "warnung",
            "Hintergrundjob fehlgeschlagen",
            "Tâche de fond en échec",
        ),
        "mail_fehler": (
            "betrieb",
            "warnung",
            "E-Mail-Versand fehlgeschlagen",
            "Échec d'envoi d'e-mail",
        ),
        "rechte_review_angelegt": (
            "rollen",
            "info",
            "Rechteprüfung angelegt",
            "Revue des droits créée",
        ),
        "rechte_review_entschieden": (
            "rollen",
            "info",
            "Rechteprüfung: Konto entschieden",
            "Revue des droits : compte décidé",
        ),
        "rechte_review_abgeschlossen": (
            "rollen",
            "wichtig",
            "Rechteprüfung abgeschlossen",
            "Revue des droits terminée",
        ),
        "monatsbericht_erstellt": (
            "audit",
            "info",
            "Monatsbericht erstellt",
            "Rapport mensuel créé",
        ),
        "monatsbericht_gesendet": (
            "audit",
            "info",
            "Monatsbericht gesendet",
            "Rapport mensuel envoyé",
        ),
        "auffaelligkeit_erledigt": (
            "audit",
            "info",
            "Auffälligkeit als erledigt markiert",
            "Anomalie marquée comme traitée",
        ),
    }
)

LOGIN_ERFOLG = ("login_success", "login_2fa_success")
LOGIN_FEHLER = ("login_failed", "login_2fa_failed")
ROLLEN_AENDERUNG = (
    "role_changed",
    "rbac_roles_changed",
    "rbac_role_created",
    "rbac_role_updated",
    "rbac_role_deleted",
    "rbac_matrix_cell_set",
    "rbac_module_visibilite_set",
)


def kategorie_von(aktion: str) -> str:
    return AKTIONEN[aktion][0] if aktion in AKTIONEN else "sonstige"


def gewicht_von(aktion: str) -> str:
    return AKTIONEN[aktion][1] if aktion in AKTIONEN else "info"


def label_von(aktion: str) -> tuple[str, str]:
    return AKTIONEN[aktion][2:] if aktion in AKTIONEN else (aktion, aktion)


def aktionen_von(kategorie: str) -> list[str]:
    """Bekannte Aktionen einer Kategorie ; für „sonstige“ leer (dort : alles Unbekannte)."""
    return [a for a, v in AKTIONEN.items() if v[0] == kategorie]


def aufbewahrung_tage(kategorie: str) -> int:
    return KATEGORIEN[kategorie][2]
