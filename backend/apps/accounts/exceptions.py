"""
Handler d'exception DRF uniformisant le format d'erreur de l'API
(TDD §2.3) : { "code": "xxx", "message": "...", "details": {} }
"""

from rest_framework.views import exception_handler


def cid_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None

    code = getattr(exc, "default_code", exc.__class__.__name__.lower())
    if isinstance(response.data, dict) and "detail" in response.data:
        message = str(response.data["detail"])
        details = {}
    else:
        message = "Une erreur de validation est survenue."
        details = response.data if isinstance(response.data, (dict, list)) else {}

    response.data = {"code": code, "message": message, "details": details}
    return response
