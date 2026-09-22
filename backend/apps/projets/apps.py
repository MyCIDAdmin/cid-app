from django.apps import AppConfig


class ProjetsConfig(AppConfig):
    """
    Module "Projets & Aktionen" (demande utilisateur du 2026-09-22) : kacheln de projets/actions
    associatifs gérées par les admins/Bureau Admin et par un membre "responsable" par projet —
    carrousel d'images, texte riche, cagnote optionnelle (contribution libre), échéance, statut
    et rapport d'avancement. Voir models.py pour le détail des décisions de conception.
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.projets"
    verbose_name = "Projets & Actions"
