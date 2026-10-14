"""Zugriff auf Regionen : Lesen für alle angemeldeten Konten (die Sichtbarkeit des Menüpunkts
„Regionen“ regelt die Rollenverwaltung) ; Verwaltung der Struktur nur für den App Admin ;
Inhalte gestalten die Verantwortlichen der Region, das Büro (Seite `page_regionen`) und der App
Admin (siehe services.darf_bearbeiten)."""

from rest_framework.permissions import IsAuthenticated

from apps.accounts.permissions import IsSuperAdmin

__all__ = ["IsAuthenticated", "IsSuperAdmin"]
