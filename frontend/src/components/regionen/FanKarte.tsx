import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useFanOptionen, useFanProfil, useFanProfilAendern } from "../../hooks/useRegionen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { laenderName } from "../../utils/laendernamen";
import MitgliedWerdenFormular from "./MitgliedWerdenFormular";

const feld =
  "w-full rounded-cid border border-text-tertiary/20 px-3 py-2 text-sm outline-none focus:border-ca";

/** Fan-Konto : Region/Standort ändern und Mitglied werden. */
export default function FanKarte() {
  const { t, i18n } = useTranslation("regionen");
  const { data: profil } = useFanProfil(true);
  const { data: optionen } = useFanOptionen();
  const aendern = useFanProfilAendern();
  const [bearbeiten, setBearbeiten] = useState(false);
  const [mitglied, setMitglied] = useState(false);
  const [pays, setPays] = useState("DE");
  const [land, setLand] = useState("");
  const [standort, setStandort] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    if (profil) {
      setPays(profil.pays || "DE");
      setLand(profil.land_de);
      setStandort(profil.standort_id ?? "");
    }
  }, [profil]);

  if (!profil) return null;
  const standorte = (optionen?.standorte ?? []).filter((s) => !land || !s.land || s.land === land);
  const landName =
    (profil.pays || "DE") === "DE"
      ? optionen?.laender.find((l) => l.code === profil.land_de)?.name
      : laenderName(profil.pays, i18n.language);

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    setFehler(null);
    try {
      await aendern.mutateAsync({
        prenom: profil!.prenom,
        nom: profil!.nom,
        pays,
        land_de: pays === "DE" ? land : "",
        standort: standort || null,
      });
      setBearbeiten(false);
    } catch (error) {
      setFehler(extractApiErrorMessage(error, t("fan.fehler_speichern")));
    }
  }

  return (
    <section
      className="mb-4 rounded-cid-lg bg-bg-primary p-4 shadow-sm"
      aria-label={t("fan.titel")}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-text-primary">
            {t("fan.begruessung", { name: profil.prenom })}
          </h2>
          <p className="text-sm text-text-secondary">
            {profil.region
              ? t("fan.deine_region", { region: profil.region.name })
              : t("fan.keine_region")}
            {landName ? ` · ${landName}` : ""}
            {profil.standort ? ` · ${profil.standort}` : ""}
          </p>
        </div>
        {!bearbeiten && !mitglied && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setBearbeiten(true)}
              className="rounded-cid border border-text-tertiary/20 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-secondary"
            >
              {t("fan.aendern")}
            </button>
            <button
              type="button"
              onClick={() => setMitglied(true)}
              className="rounded-cid bg-ca px-3 py-1.5 text-sm font-semibold text-white hover:bg-cad"
            >
              {t("fan.mitglied_werden")}
            </button>
          </div>
        )}
      </div>

      {bearbeiten && (
        <form onSubmit={speichern} className="mt-3 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="fan-pays"
                className="mb-1 block text-xs font-medium text-text-secondary"
              >
                {t("fan.pays")}
              </label>
              <select
                id="fan-pays"
                value={pays}
                onChange={(e) => {
                  setPays(e.target.value);
                  setLand("");
                  setStandort("");
                }}
                className={feld}
              >
                <option value="DE">{laenderName("DE", i18n.language, "Deutschland")}</option>
                {optionen?.staaten.map((s) => (
                  <option key={s.code} value={s.code}>
                    {laenderName(s.code, i18n.language, s.name)}
                  </option>
                ))}
              </select>
            </div>
            {pays === "DE" && (
              <div>
                <label
                  htmlFor="fan-land"
                  className="mb-1 block text-xs font-medium text-text-secondary"
                >
                  {t("fan.bundesland")}
                </label>
                <select
                  id="fan-land"
                  value={land}
                  onChange={(e) => {
                    setLand(e.target.value);
                    setStandort("");
                  }}
                  className={feld}
                >
                  <option value="">{t("fan.land_keine")}</option>
                  {optionen?.laender.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label
                htmlFor="fan-standort"
                className="mb-1 block text-xs font-medium text-text-secondary"
              >
                {t("fan.standort")}
              </label>
              <select
                id="fan-standort"
                value={standort}
                onChange={(e) => setStandort(e.target.value)}
                className={feld}
              >
                <option value="">{t("fan.standort_keiner")}</option>
                {standorte.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {fehler && <p className="text-sm text-status-dangerText">{fehler}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={aendern.isPending}
              className="rounded-cid bg-ca px-4 py-2 text-sm font-semibold text-white hover:bg-cad disabled:opacity-60"
            >
              {t("fan.speichern")}
            </button>
            <button
              type="button"
              onClick={() => setBearbeiten(false)}
              className="text-sm text-text-secondary underline"
            >
              {t("fan.abbrechen")}
            </button>
          </div>
        </form>
      )}

      {mitglied && <MitgliedWerdenFormular onAbbrechen={() => setMitglied(false)} />}
    </section>
  );
}
