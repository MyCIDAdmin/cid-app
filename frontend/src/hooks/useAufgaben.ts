/** Die offenen Dinge für „Heute für dich“ : sammelt die Quellen und lässt baueAufgaben sortieren. */
import { useMemo } from "react";

import { baueAufgaben, naechstesSpiel, tippFristOffen, type Aufgabe } from "../utils/uebersicht";
import {
  useCalendrierRencontres,
  useTippspielTeilnahmen,
  useTippspielTipps,
  useTippspiele,
} from "./useCommunaute";
import { useMesCotisations } from "./useCotisations";
import { useInscriptions } from "./useEvenements";
import { useModuleOuvert } from "./useRbac";
import { useSaison } from "./useReisen";
import { useSessionVoteActive } from "./useVote";

export function useAufgaben(): { aufgaben: Aufgabe[]; laedt: boolean } {
  const jahr = new Date().getFullYear();
  const liveOffen = useModuleOuvert("live").ouvert;
  const voteOffen = useModuleOuvert("vote").ouvert;
  const reisenOffen = useModuleOuvert("covoiturage").ouvert;
  const votes = useSessionVoteActive({ enabled: voteOffen });
  const cotisations = useMesCotisations();
  const anmeldungen = useInscriptions({ statut: "en_attente_paiement" });
  const saison = useSaison(reisenOffen);
  const spiele = useCalendrierRencontres();
  const tippspiele = useTippspiele();
  const tippspiel = tippspiele.data?.results.find((x) => x.statut === "publie");
  const teilnahme = useTippspielTeilnahmen({ tippspiel: tippspiel?.id, mine: true });
  const tipps = useTippspielTipps({ tippspiel: tippspiel?.id });

  const aufgaben = useMemo(() => {
    const liste = cotisations.data?.results;
    const beitrag = liste?.find((c) => c.type_article === "cotisation" && c.annee === jahr);
    const spiel = naechstesSpiel(spiele.data?.results);
    const reise = spiel
      ? saison.data?.find((s) => s.rencontre === spiel.id)?.reisen.find((r) => !r.mein_status)
      : undefined;
    const meine = teilnahme.data?.results[0];
    const darfTippen = meine && meine.statut_paiement !== "en_attente";
    const tippSpiel = (spiele.data?.results ?? [])
      .filter((s) => s.competition === "Ligue 1" && s.statut === "SCHEDULED")
      .filter((s) => tippFristOffen(s))
      .sort((a, b) => a.date_heure.localeCompare(b.date_heure))[0];
    const schonGetippt = tipps.data?.results.some((t) => t.rencontre === tippSpiel?.id);
    return baueAufgaben({
      abstimmungen: voteOffen
        ? (votes.data?.results ?? []).map((v) => ({ id: String(v.id), titel: v.titre }))
        : [],
      beitrag: liste
        ? beitrag
          ? { status: beitrag.statut, betrag: beitrag.montant }
          : null
        : undefined,
      anmeldungen: (anmeldungen.data?.results ?? []).map((a) => ({
        id: a.id,
        titel: a.evenement_detail?.titre ?? "",
        betrag: a.montant_paye,
      })),
      reiseOffen: reise ? { id: reise.id, titel: reise.titel } : null,
      tippFehlt:
        liveOffen && darfTippen && tippSpiel && !schonGetippt
          ? { spiel: `${tippSpiel.equipe_domicile} – ${tippSpiel.equipe_exterieur}`, link: "/live" }
          : null,
    });
  }, [
    cotisations.data,
    spiele.data,
    saison.data,
    teilnahme.data,
    tipps.data,
    votes.data,
    anmeldungen.data,
    voteOffen,
    liveOffen,
    jahr,
  ]);
  return { aufgaben, laedt: cotisations.isLoading };
}
