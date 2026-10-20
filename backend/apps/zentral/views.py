from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.services import log_audit_event

from .models import ZentraleEinstellungen
from .permissions import ZentraleEinstellungenPermission
from .serializers import ZentraleEinstellungenSerializer


class ZentraleEinstellungenView(APIView):
    """GET/PATCH /zentral/einstellungen/ — Singleton (`ZentraleEinstellungen.get_solo`)."""

    permission_classes = [ZentraleEinstellungenPermission]

    def get(self, request):
        return Response(ZentraleEinstellungenSerializer(ZentraleEinstellungen.get_solo()).data)

    def patch(self, request):
        einstellungen = ZentraleEinstellungen.get_solo()
        serializer = ZentraleEinstellungenSerializer(einstellungen, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(modifie_par=request.user)
        log_audit_event(
            "zentrale_einstellungen_geaendert",
            user=request.user,
            felder=sorted(serializer.validated_data.keys()),
        )
        return Response(serializer.data)
