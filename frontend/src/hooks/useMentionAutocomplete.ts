/**
 * Autocomplétion "@" réutilisable pour les champs texte libre (Forum Sujet/Réponse, Fil
 * Commentaire — ajouté le 2026-09-29, demande utilisateur : "'@'-Erwähnungen auf weitere
 * Module wie Forum/Neuigkeiten ausweiten und mit echten Benachrichtigungen versehen").
 *
 * Extrait de GroupeChatPage.tsx (détection `/(^|\s)@(\w*)$/` en fin de texte, remplacement
 * `@mot` → `@Prénom `), mais avec deux différences volontaires par rapport à l'original
 * (qui reste, lui, purement cosmétique — voir sa propre docstring) :
 *   - les suggestions viennent de `useRechercherMembres` (annuaire réel, backend
 *     `MembreRechercheViewSet`) plutôt que des auteurs déjà vus dans l'historique chargé ;
 *   - chaque choix est mémorisé dans `mentions` (liste de `Auteur`), pour permettre à
 *     l'appelant de transmettre les IDs réels au backend (`mentions: string[]` — voir
 *     CommentaireSerializer.mentions côté backend) et déclencher une VRAIE notification,
 *     plutôt que le simple surlignage visuel de GroupeChatPage.
 *
 * Ces champs sont de simples <input>/<textarea> (pas de TipTap, contrairement au composeur
 * de Publication — voir RichTextEditor.tsx pour l'extension @tiptap/extension-mention) :
 * aucune ambiguïté nom→membre n'est possible côté backend puisque l'ID réel est transmis
 * explicitement, jamais reparsé depuis le texte.
 *
 * `mentionsPourEnvoi(texteFinal)` ne renvoie que les membres dont le token "@Prénom" est
 * encore présent dans le texte au moment de l'envoi — si l'utilisateur supprime la mention
 * après l'avoir choisie, elle n'est pas transmise (heuristique volontairement simple, sur le
 * prénom comme le remplacement ci-dessous, pas un suivi de position au caractère près).
 */
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { useRechercherMembres } from "./useCommunaute";
import type { Auteur } from "../types/communaute";

const MAX_SUGGESTIONS = 5;

export function useMentionAutocomplete(texte: string, setTexte: Dispatch<SetStateAction<string>>) {
  const [mentions, setMentions] = useState<Auteur[]>([]);

  const matchMention = /(^|\s)@(\w*)$/.exec(texte);
  const requeteMention = matchMention ? matchMention[2] : null;
  const rechercheQuery = useRechercherMembres(requeteMention ?? "", requeteMention !== null);
  const suggestions =
    requeteMention !== null ? (rechercheQuery.data ?? []).slice(0, MAX_SUGGESTIONS) : [];

  function choisirMention(membre: Auteur) {
    setTexte((t) => t.replace(/@\w*$/, `@${membre.prenom} `));
    setMentions((precedentes) =>
      precedentes.some((m) => m.id === membre.id) ? precedentes : [...precedentes, membre],
    );
  }

  function mentionsPourEnvoi(texteFinal: string): string[] {
    return mentions.filter((m) => texteFinal.includes(`@${m.prenom}`)).map((m) => m.id);
  }

  function reinitialiser() {
    setMentions([]);
  }

  return { suggestions, choisirMention, mentionsPourEnvoi, reinitialiser };
}
