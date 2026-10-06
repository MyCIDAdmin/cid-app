import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useAbschluss, useJahrAbschliessen, useJahrWiedereroeffnen } from "../../hooks/useFinances";
import { useAuthStore } from "../../store/authStore";
import { extractApiErrorMessage } from "../../utils/apiError";
import ConfirmDialog from "../ui/ConfirmDialog";

function formatMontant(montant: string): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

export default function AbschlussTab({ modifiable }: { modifiable: boolean }) {
  const { t, i18n } = useTranslation("finances");
  const istAppAdmin = useAuthStore((s) => s.user?.role === "super_admin");
  const [annee, setAnnee] = useState(new Date().getFullYear() - 1);
  const { data, isLoading, isError } = useAbschluss(annee);
  const abschliessen = useJahrAbschliessen();
  const wiedereroeffnen = useJahrWiedereroeffnen();
  const [bestaetigen, setBestaetigen] = useState(false);
  const [grund, setGrund] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  async function ausfuehren(aktion: () => Promise<unknown>) {
    setFehler(null);
    try {
      await aktion();
    } catch (error) {
      setFehler(extractApiErrorMessage(error, t("erreur")));
    }
  }

  const datum = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString(i18n.language) : "";

  return (
    <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <p className="mb-3 text-xs text-text-tertiary">{t("abschluss.intro")}</p>
      <div className="mb-4">
        <label htmlFor="abs-annee" className="mb-1 block text-[10px] uppercase text-text-tertiary">
          {t("annee")}
        </label>
        <input
          id="abs-annee"
          type="number"
          value={annee}
          onChange={(e) => setAnnee(Number(e.target.value))}
          className="w-24 rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-text-tertiary">{t("chargement")}</p>
      ) : isError || !data ? (
        <p className="text-sm text-status-dangerText">{t("erreur")}</p>
      ) : data.abgeschlossen ? (
        <div>
          <p className="mb-3 text-sm font-medium text-status-successText">
            {t("abschluss.status_zu", {
              datum: datum(data.abgeschlossen_am),
              wer: data.abgeschlossen_durch,
            })}
          </p>
          {data.snapshot && (
            <div className="overflow-x-auto">
              <table className="mb-4 text-sm">
                <caption className="mb-1 text-left text-[10px] uppercase text-text-tertiary">
                  {t("abschluss.eingefroren")}
                </caption>
                <tbody>
                  {(["recettes", "depenses", "resultat"] as const).map((k, i) => (
                    <tr key={k}>
                      <td className="pr-4 text-text-secondary">
                        {t(["abschluss.einnahmen", "abschluss.ausgaben", "abschluss.ergebnis"][i])}
                      </td>
                      <td className="text-right font-medium">{formatMontant(data.snapshot![k])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {istAppAdmin ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                aria-label={t("abschluss.grund")}
                placeholder={t("abschluss.grund")}
                value={grund}
                onChange={(e) => setGrund(e.target.value)}
                className="w-72 rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
              />
              <button
                type="button"
                disabled={!grund.trim() || wiedereroeffnen.isPending}
                onClick={() =>
                  ausfuehren(() => wiedereroeffnen.mutateAsync({ annee, grund: grund.trim() }))
                }
                className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary disabled:opacity-50"
              >
                {t("abschluss.wiedereroeffnen")}
              </button>
            </div>
          ) : (
            <p className="text-xs text-text-tertiary">{t("abschluss.nur_admin")}</p>
          )}
        </div>
      ) : (
        <div>
          <p className="mb-3 text-sm text-text-primary">{t("abschluss.status_offen")}</p>
          {data.wiedergeoeffnet_am && (
            <p className="mb-3 text-xs text-text-tertiary">
              {t("abschluss.wiedereroeffnet_info", {
                datum: datum(data.wiedergeoeffnet_am),
                grund: data.wiedereroeffnung_grund,
              })}
            </p>
          )}
          {(data.offene_ausgaben ?? 0) > 0 && (
            <p className="mb-3 rounded-cid bg-status-warningBg px-3 py-2 text-xs text-status-warningText">
              {t("abschluss.offene", { n: data.offene_ausgaben })}
            </p>
          )}
          {modifiable && (
            <button
              type="button"
              disabled={(data.offene_ausgaben ?? 0) > 0 || abschliessen.isPending}
              onClick={() => setBestaetigen(true)}
              className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {t("abschluss.abschliessen")}
            </button>
          )}
        </div>
      )}
      {fehler && <p className="mt-3 text-xs text-status-dangerText">{fehler}</p>}

      <ConfirmDialog
        open={bestaetigen}
        title={t("abschluss.bestaetigen_titel")}
        message={t("abschluss.bestaetigen_text")}
        confirmLabel={t("abschluss.abschliessen")}
        onConfirm={async () => {
          setBestaetigen(false);
          await ausfuehren(() => abschliessen.mutateAsync(annee));
        }}
        onCancel={() => setBestaetigen(false)}
      />
    </div>
  );
}
