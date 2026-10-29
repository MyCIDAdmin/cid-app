from celery import shared_task


@shared_task(name="apps.reisen.tasks.erinnere_entscheidungen_task")
def erinnere_entscheidungen_task():
    from .erinnerungen import erinnere_entscheidungen

    return erinnere_entscheidungen()
