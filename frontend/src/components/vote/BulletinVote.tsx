/**
 * Bulletin de vote — rendu du formulaire selon `type_vote` (FDD §5.2, mockup #pg-vote
 * renderBallot()). Miroir de apps.vote.services.valider_choix_pour_type côté backend :
 *  - unique / oui_non   : une seule option (radio).
 *  - multiple           : jusqu'à `nb_choix_max` options (checkbox).
 *  - preferentiel       : classement par ordre de clic — le backend ne persiste pas encore le
 *                         rang (ChoixExprime.rang reste 0, chaque choix compte pour 1 côté
 *                         résultats, voir services.calculer_resultats) ; l'ordre est néanmoins
 *                         envoyé dans le tableau `choix` pour rester prêt côté API à l'évolution
 *                         future de cette fonctionnalité, sans qu'aucune UI de classement plus
 *                         élaborée soit nécessaire pour l'instant (le mockup lui-même ne
 *                         distingue pas ce type visuellement, voir docstring de recherche).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { VoteOption, VoteSession } from "../../types/vote";

interface BulletinVoteProps {
  session: VoteSession;
  onSubmit: (choix: string[]) => void;
  envoiEnCours: boolean;
}

const OUI_NON_STYLES: Record<string, string> = {
  oui: "border-status-successText/40 hover:bg-status-successBg/40",
  non: "border-status-dangerText/40 hover:bg-status-dangerBg/40",
  abstention: "border-text-tertiary/30 hover:bg-bg-tertiary",
};

function ouiNonStyleKey(label: string): string {
  const l = label.trim().toLowerCase();
  if (l.startsWith("oui")) return "oui";
  if (l.startsWith("non")) return "non";
  return "abstention";
}

export default function BulletinVote({ session, onSubmit, envoiEnCours }: BulletinVoteProps) {
  const { t } = useTranslation("vote");
  const [selection, setSelection] = useState<string[]>([]);

  const estOuiNon = session.type_vote === "oui_non";
  const estMultiple = session.type_vote === "multiple";
  const estPreferentiel = session.type_vote === "preferentiel";

  function toggleUnique(id: string) {
    setSelection([id]);
  }

  function toggleMultiple(id: string) {
    setSelection((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= session.nb_choix_max) return prev;
      return [...prev, id];
    });
  }

  function togglePreferentiel(id: string) {
    setSelection((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleToggle(option: VoteOption) {
    if (estMultiple) toggleMultiple(option.id);
    else if (estPreferentiel) togglePreferentiel(option.id);
    else toggleUnique(option.id);
  }

  function renderOption(option: VoteOption) {
    const selectionne = selection.includes(option.id);
    const rang = estPreferentiel ? selection.indexOf(option.id) + 1 : null;
    const styleOuiNon = estOuiNon ? OUI_NON_STYLES[ouiNonStyleKey(option.label)] : "";

    return (
      <label
        key={option.id}
        className={`flex cursor-pointer items-start gap-3 rounded-cid border px-3 py-2.5 transition ${
          selectionne
            ? "border-ca bg-cal/30"
            : `border-text-tertiary/20 ${styleOuiNon || "hover:bg-bg-tertiary"}`
        }`}
      >
        <input
          type={estMultiple ? "checkbox" : "radio"}
          name="bulletin-vote"
          checked={selectionne}
          onChange={() => handleToggle(option)}
          className="mt-0.5"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            {rang !== null && rang > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ca text-[10px] font-bold text-white">
                {rang}
              </span>
            )}
            {option.label}
          </div>
          {option.description && (
            <div className="mt-0.5 text-xs text-text-tertiary">{option.description}</div>
          )}
        </div>
      </label>
    );
  }

  return (
    <div>
      <p className="mb-3 text-xs text-text-tertiary">
        {estMultiple
          ? t("bulletin.instructions_multiple", { max: session.nb_choix_max })
          : t("bulletin.instructions_unique")}{" "}
        {t("bulletin.anonymat_note", {
          mode:
            session.mode_anonymat === "anonyme" ? t("bulletin.anonyme") : t("bulletin.nominatif"),
        })}
      </p>

      <div className="space-y-2">{session.options.map(renderOption)}</div>

      <button
        type="button"
        disabled={selection.length === 0 || envoiEnCours}
        onClick={() => onSubmit(selection)}
        className="mt-4 w-full rounded-cid bg-ca px-3 py-2.5 text-sm font-semibold text-white hover:bg-cad disabled:opacity-40"
      >
        {envoiEnCours ? t("bulletin.envoi_en_cours") : t("bulletin.confirmer")}
      </button>
      <p className="mt-2 text-center text-[10px] text-text-tertiary">
        🔒 {t("bulletin.chiffre_anonyme")}
      </p>
    </div>
  );
}
