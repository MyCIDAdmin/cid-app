from celery import shared_task
from django.apps import apps


@shared_task
def uebersetze_objekt_task(modell: str, pk: str) -> int:
    from .services import uebersetze_objekt

    obj = apps.get_model(modell).objects.filter(pk=pk).first()
    return uebersetze_objekt(obj) if obj else 0
