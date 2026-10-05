/**
 * Complément de profil avant l'adhésion (demande utilisateur du 2026-10-06, point 1.2) : la
 * pièce d'identité (CIN ou passeport) est facultative à l'inscription mais obligatoire pour
 * devenir membre. Affiché quand POST /adhesions/souscriptions/souscrire/ répond
 * `profil_incomplet` ; enregistre la valeur sur la fiche du membre (PATCH /membres/moi/) puis
 * relance la souscription via `onComplete`.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useUpdateMembreMoi } from "../../hooks/useMembres";
import { extractApiErrorMessage } from "../../utils/apiError";

// eslint-disable-next-line react-refresh/only-export-components
export function estErreurProfilIncomplet(erreur: unknown): boolean {
  const data = (erreur as { response?: { data?: unknown } } | null)?.response?.data;
  return JSON.stringify(data ?? "").includes("profil_incomplet");
}

export default function CompleterProfilIdentite({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation("adhesions");
  const update = useUpdateMembreMoi();
  const [cin, setCin] = useState("");
  const [passeport, setPasseport] = useState("");
  const [erreur, setErreur] = useState("");

  function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!cin.trim() && !passeport.trim()) {
      setErreur(t("profil_incomplet.requis"));
      return;
    }
    setErreur("");
    update.mutate(
      {
        ...(cin.trim() ? { cin: cin.trim() } : {}),
        ...(passeport.trim() ? { passeport: passeport.trim() } : {}),
      },
      {
        onSuccess: onComplete,
        onError: (err) => setErreur(extractApiErrorMessage(err, t("profil_incomplet.erreur"))),
      },
    );
  }

  return (
    <form
      onSubmit={enregistrer}
      className="mb-3 rounded-cid-lg border border-ca/40 bg-cal/20 p-3"
      aria-label={t("profil_incomplet.titre")}
    >
      <p className="text-sm font-semibold text-text-primary">{t("profil_incomplet.titre")}</p>
      <p className="mb-2 text-xs text-text-secondary">{t("profil_incomplet.texte")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-text-secondary">
          {t("profil_incomplet.cin")}
          <input
            value={cin}
            onChange={(e) => setCin(e.target.value)}
            className="mt-1 w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-text-secondary">
          {t("profil_incomplet.passeport")}
          <input
            value={passeport}
            onChange={(e) => setPasseport(e.target.value)}
            className="mt-1 w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      {erreur && <p className="mt-2 text-xs text-status-dangerText">{erreur}</p>}
      <button
        type="submit"
        disabled={update.isPending}
        className="mt-2 rounded-cid bg-ca px-3 py-1.5 text-xs font-semibold text-white hover:bg-cad disabled:opacity-50"
      >
        {t("profil_incomplet.enregistrer")}
      </button>
    </form>
  );
}
