/**
 * Jahresabschluss als geführter Assistent: Aufräumen → Probelauf → Bewerten → Abschließen.
 * Die Schritte 1 bis 3 sind eine reine Vorschau (nichts wird gespeichert oder gesperrt); erst
 * Schritt 4 schließt das Jahr mit dem bisherigen Endpunkt ab.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useAbschluss,
  useJahrAbschliessen,
  useJahrWiedereroeffnen,
  useProbelauf,
} from "../../hooks/useFinances";
import { useAuthStore } from "../../store/authStore";
import type { PruefZiel } from "../../types/finances";
import { extractApiErrorMessage } from "../../utils/apiError";
import { kategorieName } from "../../utils/kategorie";
import AbgeschlossenAnsicht from "./abschluss/AbgeschlossenAnsicht";
import AbschlussSchritt from "./abschluss/AbschlussSchritt";
import BewertungSchritt from "./abschluss/BewertungSchritt";
import ProbelaufSchritt, { type Annahmen } from "./abschluss/ProbelaufSchritt";
import PruefschrittListe from "./abschluss/PruefschrittListe";
import { EinfachSchalter, Fachwort, HilfeHinweis } from "./Erklaerung";

const SCHRITTE = ["aufraeumen", "probelauf", "bewerten", "abschliessen"] as const;
const AMPEL_FARBE = {
  gruen: "var(--color-status-successText, #2f9e44)",
  orange: "var(--color-status-warningText, #e08a00)",
  rot: "var(--color-status-dangerText, #d00a0f)",
} as const;

function Reife({ prozent, ampel }: { prozent: number; ampel: keyof typeof AMPEL_FARBE }) {
  const { t } = useTranslation("finances");
  const umfang = 2 * Math.PI * 44;
  return (
    <div
      role="img"
      aria-label={t("assistent.reife_label", { prozent })}
      className="relative h-24 w-24 flex-none"
    >
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          r="44"
          fill="none"
          strokeWidth="10"
          className="stroke-bg-tertiary"
        />
        <circle
          cx="50"
          cy="50"
          r="44"
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          stroke={AMPEL_FARBE[ampel]}
          strokeDasharray={`${(umfang * prozent) / 100} ${umfang}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <b className="text-xl leading-none text-text-primary">{prozent}%</b>
        <span className="text-[9px] uppercase text-text-tertiary">{t("assistent.bereit")}</span>
      </div>
    </div>
  );
}

export default function AbschlussTab({
  modifiable,
  onGoto,
}: {
  modifiable: boolean;
  onGoto: (ziel: PruefZiel) => void;
}) {
  const { t, i18n } = useTranslation("finances");
  const istAppAdmin = useAuthStore((s) => s.user?.role === "super_admin");
  const [annee, setAnnee] = useState(new Date().getFullYear() - 1);
  const [schritt, setSchritt] = useState(1);
  const [annahmen, setAnnahmen] = useState<Annahmen>({
    offeneAusgaben: false,
    offeneBeitraege: false,
  });
  const [begruendungen, setBegruendungen] = useState<Record<string, string>>({});
  const [eingabe, setEingabe] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  const abschluss = useAbschluss(annee);
  const echt = useProbelauf(annee);
  const sim = useProbelauf(annee, annahmen);
  const abschliessen = useJahrAbschliessen();
  const wiedereroeffnen = useJahrWiedereroeffnen();

  const namen = useMemo(() => {
    const karte: Record<string, string> = {};
    for (const k of echt.data?.kostenarten ?? [])
      karte[k.categorie_id] = kategorieName(k.namen, k.nom, i18n.language);
    return karte;
  }, [echt.data, i18n.language]);

  function jahrWechseln(wert: number) {
    setAnnee(wert);
    setSchritt(1);
    setAnnahmen({ offeneAusgaben: false, offeneBeitraege: false });
    setBegruendungen({});
    setEingabe("");
    setFehler(null);
  }

  async function ausfuehren(aktion: () => Promise<unknown>) {
    setFehler(null);
    try {
      await aktion();
    } catch (error) {
      setFehler(extractApiErrorMessage(error, t("erreur")));
    }
  }

  const nichtLeer = Object.fromEntries(
    Object.entries(begruendungen).filter(([, text]) => text.trim()),
  );
  const pflichtOffen = (echt.data?.pruefliste ?? []).some((p) => p.stufe === "pflicht" && !p.ok);
  const vorschau = schritt === 2 || schritt === 3 ? sim.data : echt.data;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <div className="flex items-center gap-4">
          {echt.data && !abschluss.data?.abgeschlossen && (
            <Reife prozent={echt.data.bewertung.bereit_prozent} ampel={echt.data.bewertung.ampel} />
          )}
          <div>
            <h2 className="text-base font-bold text-text-primary">
              {abschluss.data?.abgeschlossen
                ? t("assistent.kopf.abgeschlossen")
                : t(`assistent.kopf.${echt.data?.bewertung.ampel ?? "orange"}`)}
            </h2>
            <p className="max-w-xl text-xs text-text-secondary">
              {abschluss.data?.abgeschlossen
                ? t("assistent.kopf.abgeschlossen_text")
                : t(`assistent.kopf.${echt.data?.bewertung.ampel ?? "orange"}_text`)}
            </p>
          </div>
        </div>
        <div className="flex items-end gap-4">
          <EinfachSchalter />
          <div>
            <label
              htmlFor="abs-annee"
              className="mb-1 block text-[10px] uppercase text-text-tertiary"
            >
              {t("annee")}
            </label>
            <input
              id="abs-annee"
              type="number"
              value={annee}
              onChange={(e) => jahrWechseln(Number(e.target.value))}
              className="w-24 rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
            />
          </div>
        </div>
      </div>

      {abschluss.isLoading || echt.isLoading ? (
        <p className="text-sm text-text-tertiary">{t("chargement")}</p>
      ) : abschluss.isError || !abschluss.data || echt.isError || !echt.data ? (
        <p className="text-sm text-status-dangerText">{t("erreur")}</p>
      ) : abschluss.data.abgeschlossen ? (
        <AbgeschlossenAnsicht
          data={abschluss.data}
          annee={annee}
          namen={namen}
          istAppAdmin={istAppAdmin}
          laeuft={wiedereroeffnen.isPending}
          onWiedereroeffnen={(grund) =>
            ausfuehren(() => wiedereroeffnen.mutateAsync({ annee, grund }))
          }
        />
      ) : (
        <>
          {abschluss.data.wiedergeoeffnet_am && (
            <p className="text-xs text-text-tertiary">
              {t("abschluss.wiedereroeffnet_info", {
                datum: new Date(abschluss.data.wiedergeoeffnet_am).toLocaleDateString(
                  i18n.language,
                ),
                grund: abschluss.data.wiedereroeffnung_grund,
              })}
            </p>
          )}
          <ol className="grid grid-cols-4 gap-2" aria-label={t("assistent.schritte.titel")}>
            {SCHRITTE.map((s, i) => {
              const n = i + 1;
              const gesperrt = n === 4 && pflichtOffen;
              const aktiv = n === schritt;
              return (
                <li key={s}>
                  <button
                    type="button"
                    disabled={gesperrt}
                    aria-current={aktiv ? "step" : undefined}
                    title={gesperrt ? t("assistent.schritt_gesperrt") : undefined}
                    onClick={() => setSchritt(n)}
                    className={`flex w-full items-center gap-2 rounded-cid border px-2 py-2 text-left text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                      aktiv
                        ? "border-ca text-text-primary"
                        : "border-text-tertiary/20 text-text-tertiary hover:bg-bg-tertiary"
                    }`}
                  >
                    <span
                      className={`grid h-6 w-6 flex-none place-items-center rounded-full border-2 text-[11px] ${
                        n < schritt
                          ? "border-status-successText bg-status-successText text-white"
                          : aktiv
                            ? "border-ca text-ca"
                            : "border-text-tertiary/30"
                      }`}
                    >
                      {n < schritt ? "✓" : gesperrt ? "🔒" : n}
                    </span>
                    <span className="hidden min-w-0 sm:block">{t(`assistent.schritte.${s}`)}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          <p
            role="status"
            className="flex flex-wrap items-center gap-2 rounded-cid border border-dashed border-status-infoText bg-status-infoBg px-3 py-2 text-xs text-status-infoText"
          >
            {schritt === 4 ? (
              <span>
                <b>{t("assistent.banner.letzter")}</b> {t("assistent.banner.letzter_text")}
              </span>
            ) : (
              <span>
                <b>
                  <Fachwort begriff="probelauf" />:
                </b>{" "}
                {t("assistent.banner.probe_text")}
              </span>
            )}
          </p>

          {schritt === 1 && <PruefschrittListe punkte={echt.data.pruefliste} onGoto={onGoto} />}
          {schritt === 2 && vorschau && (
            <ProbelaufSchritt
              daten={vorschau}
              echt={echt.data}
              annahmen={annahmen}
              onAnnahmen={setAnnahmen}
            />
          )}
          {schritt === 3 && vorschau && (
            <BewertungSchritt
              daten={vorschau}
              begruendungen={begruendungen}
              onBegruendung={(id, text) => setBegruendungen((b) => ({ ...b, [id]: text }))}
            />
          )}
          {schritt === 4 && (
            <AbschlussSchritt
              daten={echt.data}
              annee={annee}
              modifiable={modifiable}
              eingabe={eingabe}
              onEingabe={setEingabe}
              laeuft={abschliessen.isPending}
              begruendungen={Object.keys(nichtLeer).length}
              onAbschliessen={() =>
                ausfuehren(async () => {
                  await abschliessen.mutateAsync({ annee, begruendungen: nichtLeer });
                  setEingabe("");
                  setSchritt(1);
                })
              }
            />
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={schritt === 1}
              onClick={() => setSchritt((s) => Math.max(1, s - 1))}
              className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary disabled:opacity-40"
            >
              ← {t("assistent.zurueck")}
            </button>
            <span className="text-xs text-text-tertiary">
              {t("assistent.schritt_x_von", { n: schritt })}
            </span>
            {schritt < 4 ? (
              <button
                type="button"
                disabled={schritt === 3 && pflichtOffen}
                onClick={() => setSchritt((s) => Math.min(4, s + 1))}
                className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {schritt === 3 ? t("assistent.weiter_abschluss") : t("assistent.weiter")} →
              </button>
            ) : (
              <span />
            )}
          </div>
          {fehler && <p className="text-xs text-status-dangerText">{fehler}</p>}
          <HilfeHinweis>{t("assistent.fuss_hilfe")}</HilfeHinweis>
        </>
      )}
      {abschluss.data?.abgeschlossen && fehler && (
        <p className="text-xs text-status-dangerText">{fehler}</p>
      )}
    </div>
  );
}
