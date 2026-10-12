"""Zugriff auf Business Partner & Lieferanten über die Matrix der Rollenverwaltung (Seite
`page_partner`, ab 2026-10-12): Lesen = Stufe `lecture`, Pflegen/Bewerten = `lecture_ecriture`.
Startwerte (Migration rbac 0007): Lesen ab RH, Pflegen ab Bureau Admin — wie zuvor."""

from apps.rbac.permissions import page_admin_permission

PartnerPermission = page_admin_permission("page_partner")
