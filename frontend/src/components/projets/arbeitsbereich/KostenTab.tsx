import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useKosten,
  useKostenLoeschen,
  useKostenUebersicht,
  usePlankosten,
  usePlankostenAendern,
  usePlankostenErstellen,
  usePlankostenLoeschen,
} from "../../../hooks/useProjets";
import type { Aufgabe, KostenPosition, StatutKosten } from "../../../types/projets";
import { extractApiErrorMessage } from "../../../utils/apiError";
import ConfirmDialog from "../../ui/ConfirmDialog";
import KostenFormModal from "./KostenFormModal";

const CLASSE_STATUT: Record<StatutKosten, string> = {
  en_attente: "bg-status-warningBg text-status-warningText",
  approuvee: "bg-status-successBg text-status-successText",
  rejetee: "bg-status-dangerBg text-status-dangerText",
};

function euro(betrag: string | number): string {
  return `${Number(betrag).toFixed(2).replace(".", ",")} €`;
}

/** Coûts du projet (2026-10-06) : plan par catégorie, lignes réelles (saisies par l'équipe,
 * approuvées par le service financier — quatre yeux) et comparaison plan/réel. Le serveur
 * (apps.projets.views) fait foi pour les droits ; `darf_*` ne fait que masquer les boutons. */
export default function KostenTab({
  projetId,
  aufgaben,
}: {
  projetId: string;
  aufgaben: Aufgabe[];
}) {
  const { t } = useTranslation("projets");
  const uebersichtQuery = useKostenUebersicht(projetId);
  const planQuery = usePlankosten(projetId);
  const positionenQuery = useKosten(projetId);
  const planErstellen = usePlankostenErstellen();
  const planAendern = usePlankostenAendern();
  const planLoeschen = usePlankostenLoeschen();
  const kostenLoeschen = useKostenLoeschen();
  const [dialog, setDialog] = useState<{ position: KostenPosition | null } | null>(null);
  const [loeschen, setLoeschen] = useState<KostenPosition | null>(null);
  const [neueArt, setNeueArt] = useState("");
  const [neuerBetrag, setNeuerBetrag] = useState("");
  const [bearbeiteterPlan, setBearbeiteterPlan] = useState<{ id: string; betrag: string } | null>(
    null,
  );
  const [erreur, setErreur] = useState("");

  const daten = uebersichtQuery.data;
  if (uebersichtQuery.isLoading) {
    return <p className="text-sm text-text-tertiary">{t("arbeitsbereich.laden")}</p>;
  }
  if (uebersichtQuery.isError || !daten) {
    return <p className="text-sm text-status-dangerText">{t("arbeitsbereich.kosten.fehler")}</p>;
  }

  const plaene = planQuery.data ?? [];
  const planProArt = new Map(plaene.map((p) => [p.categorie, p]));
  const freieArten = daten.kostenarten.filter((k) => !planProArt.has(k.id));

  async function aktion(fn: () => Promise<unknown>) {
    setErreur("");
    try {
      await fn();
    } catch (error) {
      setErreur(extractApiErrorMessage(error, t("arbeitsbereich.fehler")));
    }
  }

  const kacheln: { key: string; wert: string; ton?: string }[] = [
    { key: "plan", wert: euro(daten.plan_gesamt) },
    { key: "ist", wert: euro(daten.ist_gesamt) },
    { key: "offen", wert: euro(daten.offen_gesamt) },
    {
      key: "abweichung",
      wert: euro(daten.abweichung),
      ton: Number(daten.abweichung) < 0 ? "text-status-dangerText" : undefined,
    },
    { key: "einnahmen", wert: euro(daten.einnahmen) },
    {
      key: "ergebnis",
      wert: euro(daten.ergebnis),
      ton: Number(daten.ergebnis) < 0 ? "text-status-dangerText" : undefined,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {kacheln.map((k) => (
          <div key={k.key} className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
            <p className={`text-lg font-bold ${k.ton ?? "text-text-primary"}`}>{k.wert}</p>
            <p className="text-[10px] uppercase text-text-tertiary">
              {t(`arbeitsbereich.kosten.kachel.${k.key}`)}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs text-text-tertiary">{t("arbeitsbereich.kosten.hinweis_freigabe")}</p>
      {erreur && <p className="text-xs text-status-dangerText">{erreur}</p>}

      <section className="space-y-2 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-text-primary">
          {t("arbeitsbereich.kosten.plan_ist")}
        </h3>
        {daten.kategorien.length === 0 ? (
          <p className="text-sm text-text-tertiary">{t("arbeitsbereich.kosten.kein_plan")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase text-text-tertiary">
                  <th>{t("arbeitsbereich.kosten.spalte.kostenart")}</th>
                  <th className="text-right">{t("arbeitsbereich.kosten.spalte.plan")}</th>
                  <th className="text-right">{t("arbeitsbereich.kosten.spalte.ist")}</th>
                  <th className="text-right">{t("arbeitsbereich.kosten.spalte.offen")}</th>
                  <th className="text-right">{t("arbeitsbereich.kosten.spalte.abweichung")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {daten.kategorien.map((z) => {
                  const plan = planProArt.get(z.categorie);
                  const aendert = plan && bearbeiteterPlan?.id === plan.id;
                  return (
                    <tr key={z.categorie} className="border-t border-text-tertiary/10">
                      <td className="py-1">{z.categorie_nom}</td>
                      <td className="text-right">
                        {aendert ? (
                          <input
                            aria-label={t("arbeitsbereich.kosten.plan_betrag", {
                              art: z.categorie_nom,
                            })}
                            type="number"
                            min="0"
                            step="0.01"
                            value={bearbeiteterPlan.betrag}
                            onChange={(e) =>
                              setBearbeiteterPlan({ id: plan.id, betrag: e.target.value })
                            }
                            className="w-24 rounded-cid border border-text-tertiary/30 px-1 text-right"
                          />
                        ) : (
                          euro(z.plan)
                        )}
                      </td>
                      <td className="text-right">
                        {euro(z.ist)}
                        {z.prozent !== null && (
                          <span className="ml-1 text-[10px] text-text-tertiary">{z.prozent}%</span>
                        )}
                      </td>
                      <td className="text-right">{euro(z.offen)}</td>
                      <td
                        className={`text-right ${
                          Number(z.abweichung) < 0 ? "text-status-dangerText" : ""
                        }`}
                      >
                        {euro(z.abweichung)}
                      </td>
                      <td className="space-x-2 text-right text-xs">
                        {daten.darf_plan_bearbeiten && plan && aendert && (
                          <button
                            type="button"
                            className="text-ca"
                            onClick={() =>
                              aktion(async () => {
                                await planAendern.mutateAsync({
                                  id: plan.id,
                                  betrag: bearbeiteterPlan.betrag,
                                });
                                setBearbeiteterPlan(null);
                              })
                            }
                          >
                            {t("arbeitsbereich.kosten.speichern")}
                          </button>
                        )}
                        {daten.darf_plan_bearbeiten && plan && !aendert && (
                          <>
                            <button
                              type="button"
                              className="text-ca"
                              onClick={() =>
                                setBearbeiteterPlan({ id: plan.id, betrag: plan.betrag })
                              }
                            >
                              {t("arbeitsbereich.kosten.plan_aendern")}
                            </button>
                            <button
                              type="button"
                              className="text-status-dangerText"
                              onClick={() => aktion(() => planLoeschen.mutateAsync(plan.id))}
                            >
                              {t("arbeitsbereich.kosten.plan_entfernen")}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {daten.darf_plan_bearbeiten && freieArten.length > 0 && (
          <div className="flex flex-wrap items-end gap-2 border-t border-text-tertiary/10 pt-2">
            <select
              aria-label={t("arbeitsbereich.kosten.spalte.kostenart")}
              value={neueArt}
              onChange={(e) => setNeueArt(e.target.value)}
              className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
            >
              <option value="">{t("arbeitsbereich.kosten.kostenart_waehlen")}</option>
              {freieArten.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nom}
                </option>
              ))}
            </select>
            <input
              aria-label={t("arbeitsbereich.kosten.spalte.plan")}
              type="number"
              min="0"
              step="0.01"
              value={neuerBetrag}
              onChange={(e) => setNeuerBetrag(e.target.value)}
              className="w-28 rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
            />
            <button
              type="button"
              disabled={!neueArt || neuerBetrag === "" || planErstellen.isPending}
              onClick={() =>
                aktion(async () => {
                  await planErstellen.mutateAsync({
                    projet: projetId,
                    categorie: neueArt,
                    betrag: neuerBetrag,
                  });
                  setNeueArt("");
                  setNeuerBetrag("");
                })
              }
              className="rounded-cid bg-ca px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
            >
              {t("arbeitsbereich.kosten.plan_hinzufuegen")}
            </button>
          </div>
        )}
      </section>

      <section className="space-y-2 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">
            {t("arbeitsbereich.kosten.positionen")}
          </h3>
          {daten.darf_erfassen && (
            <button
              type="button"
              onClick={() => setDialog({ position: null })}
              className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white"
            >
              {t("arbeitsbereich.kosten.erfassen")}
            </button>
          )}
        </div>
        {(positionenQuery.data ?? []).length === 0 && (
          <p className="text-sm text-text-tertiary">
            {t("arbeitsbereich.kosten.keine_positionen")}
          </p>
        )}
        {(positionenQuery.data ?? []).map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-start justify-between gap-2 border-t border-text-tertiary/10 pt-2 text-sm"
          >
            <div className="space-y-0.5">
              <p className="font-medium text-text-primary">
                {p.fournisseur} · {euro(p.montant)}
              </p>
              <p className="text-xs text-text-tertiary">
                {p.date_depense} · {p.categorie_nom}
                {p.aufgabe_titel ? ` · ${p.aufgabe_titel}` : ""} · {p.saisie_par_nom}
              </p>
              {p.statut === "rejetee" && p.motif_rejet && (
                <p className="text-xs text-status-dangerText">
                  {t("arbeitsbereich.kosten.abgelehnt_grund", { grund: p.motif_rejet })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${CLASSE_STATUT[p.statut]}`}>
                {t(`arbeitsbereich.kosten.statut.${p.statut}`)}
              </span>
              {p.justificatif_url && (
                <a
                  href={p.justificatif_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-ca underline"
                >
                  {t("arbeitsbereich.kosten.beleg")}
                </a>
              )}
              {daten.darf_erfassen && p.statut !== "approuvee" && (
                <>
                  <button
                    type="button"
                    className="text-xs text-ca"
                    onClick={() => setDialog({ position: p })}
                  >
                    {t("arbeitsbereich.kosten.bearbeiten")}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-status-dangerText"
                    onClick={() => setLoeschen(p)}
                  >
                    {t("arbeitsbereich.kosten.loeschen")}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </section>

      {daten.aufgaben.length > 0 && (
        <section className="space-y-1 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-text-primary">
            {t("arbeitsbereich.kosten.pro_aufgabe")}
          </h3>
          {daten.aufgaben.map((a) => (
            <div key={a.aufgabe} className="flex justify-between text-sm">
              <span>{a.titel}</span>
              <span>
                {euro(a.ist)}
                {Number(a.offen) > 0 && (
                  <span className="ml-2 text-xs text-text-tertiary">
                    +{euro(a.offen)} {t("arbeitsbereich.kosten.spalte.offen")}
                  </span>
                )}
              </span>
            </div>
          ))}
        </section>
      )}

      {dialog && (
        <KostenFormModal
          key={dialog.position?.id ?? "neu"}
          projetId={projetId}
          position={dialog.position}
          kostenarten={daten.kostenarten}
          aufgaben={aufgaben}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        open={loeschen !== null}
        title={t("arbeitsbereich.kosten.loeschen_titel")}
        message={t("arbeitsbereich.kosten.loeschen_frage")}
        danger
        onCancel={() => setLoeschen(null)}
        onConfirm={() => {
          const ziel = loeschen;
          setLoeschen(null);
          if (ziel) void aktion(() => kostenLoeschen.mutateAsync(ziel.id));
        }}
      />
    </div>
  );
}
