"""
Logique métier partagée — app vote (utilisée par views.py, consumers.py et tasks.py, pour
éviter toute divergence entre le calcul REST et le calcul WebSocket/Celery).
"""

from django.utils import timezone

from .models import (
    ChoixExprime,
    EligibiliteVote,
    StatutSession,
    TypeVote,
    VoteExprime,
    VoteOptionCandidat,
)


def membres_eligibles_qs(session):
    """Retourne le queryset des Membre éligibles à `session` (FDD §5.2 mockup
    #m-create-vote — sélecteur "Membres éligibles"). Import différé de apps.membres et
    apps.cotisations : évite tout risque de dépendance circulaire au démarrage (convention
    déjà en place, voir apps.notifications.services docstring)."""
    from apps.accounts.models import Role
    from apps.cotisations.models import Cotisation, StatutCotisation
    from apps.membres.models import Membre, StatutMembre

    base = Membre.objects.filter(statut=StatutMembre.ACTIF).select_related("user")

    if session.eligibilite == EligibiliteVote.TOUS_ACTIFS:
        return base
    if session.eligibilite == EligibiliteVote.COTISANTS:
        annee = timezone.now().year
        membres_payes = Cotisation.objects.filter(
            annee=annee, statut=StatutCotisation.PAYEE
        ).values_list("membre_id", flat=True)
        return base.filter(id__in=membres_payes)
    if session.eligibilite == EligibiliteVote.BUREAU:
        return base.filter(user__role__in=[Role.BUREAU_ADMIN, Role.DIR_FINANCIER, Role.SUPER_ADMIN])
    # SELECTION_MANUELLE
    return session.membres_selectionnes.filter(statut=StatutMembre.ACTIF).select_related("user")


def nombre_participants(session) -> int:
    """Nombre de bulletins distincts soumis — valable quel que soit mode_anonymat (jamais
    besoin de relier un bulletin à un membre pour le compter)."""
    return VoteExprime.objects.filter(session=session).count()


def calculer_resultats(session) -> dict:
    """Comptages agrégés par option — SCD §7.5 : "ne retourne que les comptages par
    option, jamais les tokens" (aucune requête ici ne touche VoteExprime.voter_token_hash
    au-delà d'un simple COUNT). Pour type_vote=preferentiel, chaque choix compte pour 1
    quel que soit son rang (comptage par "premier choix exprimé sur ce bulletin" serait une
    méthode alternative valable — nous retenons ici un comptage simple et documenté par
    option/rang, laissant le calcul du gagnant définitif — Borda ou IRV complet — à une
    itération frontend/rapport ultérieure)."""
    from django.db.models import Count

    total_participants = nombre_participants(session)
    total_eligibles = membres_eligibles_qs(session).count()

    comptages = list(
        ChoixExprime.objects.filter(bulletin__session=session)
        .values("option_id", "option__label")
        .annotate(nombre=Count("id"))
        .order_by("-nombre")
    )
    options_sans_vote = session.options.exclude(id__in=[c["option_id"] for c in comptages]).values(
        "id", "label"
    )
    comptages += [
        {"option_id": o["id"], "option__label": o["label"], "nombre": 0} for o in options_sans_vote
    ]
    comptages.sort(key=lambda c: c["nombre"], reverse=True)

    # Composition de chaque liste (voir VoteOptionCandidat) — permet au frontend d'afficher
    # les candidats d'une liste sur le podium des résultats ; vide pour une option "candidat
    # individuel" classique (rétrocompatible).
    candidats_par_option: dict[str, list[str]] = {}
    for c in VoteOptionCandidat.objects.filter(option__session=session).values("option_id", "nom"):
        candidats_par_option.setdefault(str(c["option_id"]), []).append(c["nom"])

    taux_participation = (
        round(100 * total_participants / total_eligibles, 1) if total_eligibles else 0.0
    )
    # Seuil de victoire (renommé/repensé le 2026-09-25, retour utilisateur — remplace
    # l'ancien "quorum" de PARTICIPATION, comparé avec >=, qui ne correspondait pas au
    # besoin réel) : l'option arrivée en tête doit dépasser STRICTEMENT `seuil_victoire_pct`
    # % DES VOIX EXPRIMÉES pour que le vote soit considéré comme décidé. Comparaison sur la
    # fraction brute (pas sur `pct` déjà arrondi à 1 décimale plus bas) pour ne pas laisser
    # un arrondi décider artificiellement d'un cas limite (ex. seuil=50, 50.04% arrondi à
    # 50.0% doit quand même compter comme "> 50%"). En cas d'égalité au sommet (plusieurs
    # options à `meilleur_score`), toutes partagent le même pourcentage — géré au même
    # endroit que le reste des ex-aequo, côté frontend (voir ResultatsPodium.tsx).
    meilleur_score = comptages[0]["nombre"] if comptages else 0
    seuil_victoire_atteint = session.seuil_victoire_pct is None or (
        meilleur_score > 0
        and total_participants > 0
        and (100 * meilleur_score / total_participants) > session.seuil_victoire_pct
    )

    return {
        "session_id": str(session.id),
        "statut": session.statut,
        "total_participants": total_participants,
        "total_eligibles": total_eligibles,
        "taux_participation": taux_participation,
        "seuil_victoire_requis": session.seuil_victoire_pct,
        "seuil_victoire_atteint": seuil_victoire_atteint,
        "resultats": [
            {
                "option_id": str(c["option_id"]),
                "label": c["option__label"],
                "nombre_voix": c["nombre"],
                "candidats": candidats_par_option.get(str(c["option_id"]), []),
                "pct": (
                    round(100 * c["nombre"] / total_participants, 1) if total_participants else 0.0
                ),
            }
            for c in comptages
        ],
    }


def participation_payload(session) -> dict:
    """Payload diffusé en direct (WebSocket) pendant que la session est ouverte — jamais
    les comptages par option (SCD §7.5 : résultats cachés pendant la session active), juste
    le nombre de participants (compteur live du mockup #vote-count-live)."""
    total_eligibles = membres_eligibles_qs(session).count()
    total_participants = nombre_participants(session)
    return {
        "type": "participation_update",
        "session_id": str(session.id),
        "total_participants": total_participants,
        "total_eligibles": total_eligibles,
        "pct": round(100 * total_participants / total_eligibles, 1) if total_eligibles else 0.0,
        "temps_restant_secondes": max(0, int((session.date_fin - timezone.now()).total_seconds())),
    }


def session_expiree(session) -> bool:
    return session.statut == StatutSession.OUVERTE and timezone.now() >= session.date_fin


def valider_choix_pour_type(type_vote, option_ids, nb_choix_max) -> None:
    """Lève ValueError si le nombre d'options choisies ne respecte pas les règles du type
    de vote (FDD §5.2). Appelé par le consumer avant toute écriture en base."""
    n = len(option_ids)
    if n == 0:
        raise ValueError("Aucune option sélectionnée.")
    if type_vote in (TypeVote.UNIQUE, TypeVote.OUI_NON) and n != 1:
        raise ValueError("Ce type de vote n'accepte qu'une seule option.")
    if type_vote == TypeVote.MULTIPLE and n > nb_choix_max:
        raise ValueError(f"Maximum {nb_choix_max} choix autorisé(s).")
