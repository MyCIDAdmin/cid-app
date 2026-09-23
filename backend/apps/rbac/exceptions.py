"""Exception DRF manquante dans ce projet : aucun des 10 modules métier n'avait jusqu'ici besoin
d'un 409 Conflict (voir apps.boutique — le bug IntegrityError du 2026-09-23 a été corrigé en
amont, jamais en renvoyant un 409). `apps.rbac` en a besoin pour "suppression d'un rôle encore
attribué" (django.db.models.deletion.ProtectedError, voir models.UserRoleAssignment.role
on_delete=PROTECT) — DRF 3.15 n'a pas de classe 409 intégrée. `cid_exception_handler`
(apps.accounts.exceptions) gère automatiquement toute sous-classe d'APIException, donc aucune
modification là-bas n'est nécessaire."""

from rest_framework.exceptions import APIException


class Conflict(APIException):
    status_code = 409
    default_detail = "Conflit : la ressource est dans un état incompatible avec cette action."
    default_code = "conflict"
