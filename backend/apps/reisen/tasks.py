from celery import shared_task


@shared_task(name="apps.reisen.tasks.erinnere_entscheidungen_task")
def erinnere_entscheidungen_task():
    from .erinnerungen import erinnere_entscheidungen

    return erinnere_entscheidungen()


@shared_task(name="apps.reisen.tasks.bereinige_reisedaten_task")
def bereinige_reisedaten_task():
    from .bereinigung import bereinige_persoenliche_daten

    return bereinige_persoenliche_daten()
