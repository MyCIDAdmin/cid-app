import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { fetchMe } from "../../api/auth";
import { useMitgliedWerden } from "../../hooks/useRegionen";
import { useAuthStore } from "../../store/authStore";
import { extractApiErrorMessage } from "../../utils/apiError";

const feld =
  "w-full rounded-cid border border-text-tertiary/20 px-3 py-2 text-sm outline-none focus:border-ca";

/** Fan → Mitglied : legt die Mitgliedsfiche an und führt zu „Meine Mitgliedschaft“. */
export default function MitgliedWerdenFormular({ onAbbrechen }: { onAbbrechen: () => void }) {
  const { t } = useTranslation("regionen");
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const senden = useMitgliedWerden();
  const [werte, setWerte] = useState({
    date_naissance: "",
    telephone: "",
    adresse_de: "",
    code_postal_de: "",
    ville_de: "",
  });
  const [fehler, setFehler] = useState<string | null>(null);

  const vollstaendig = Boolean(
    werte.date_naissance && werte.telephone && werte.adresse_de && werte.ville_de,
  );

  function aendern(name: keyof typeof werte, wert: string) {
    setWerte((alt) => ({ ...alt, [name]: wert }));
  }

  async function abschicken(e: React.FormEvent) {
    e.preventDefault();
    setFehler(null);
    try {
      const { weiter } = await senden.mutateAsync({
        ...werte,
        sexe: "non_renseigne",
        code_postal_de: werte.code_postal_de || undefined,
      });
      setUser(await fetchMe());
      navigate(weiter);
    } catch (error) {
      setFehler(extractApiErrorMessage(error, t("fan.mitglied_fehler")));
    }
  }

  const eingabe = (name: keyof typeof werte, label: string, typ = "text", pflicht = true) => (
    <div>
      <label htmlFor={`mw-${name}`} className="mb-1 block text-xs font-medium text-text-secondary">
        {label}
        {pflicht && <span className="text-status-dangerText"> *</span>}
      </label>
      <input
        id={`mw-${name}`}
        type={typ}
        value={werte[name]}
        onChange={(e) => aendern(name, e.target.value)}
        className={feld}
      />
    </div>
  );

  return (
    <form
      onSubmit={abschicken}
      className="mt-3 flex flex-col gap-3 border-t border-text-tertiary/10 pt-3"
    >
      <p className="text-sm text-text-secondary">{t("fan.mitglied_hinweis")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {eingabe("date_naissance", t("fan.geburtsdatum"), "date")}
        {eingabe("telephone", t("fan.telefon"), "tel")}
        {eingabe("adresse_de", t("fan.adresse"))}
        {eingabe("code_postal_de", t("fan.plz"), "text", false)}
        {eingabe("ville_de", t("fan.ort"))}
      </div>
      {fehler && <p className="text-sm text-status-dangerText">{fehler}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!vollstaendig || senden.isPending}
          className="rounded-cid bg-ca px-4 py-2 text-sm font-semibold text-white hover:bg-cad disabled:opacity-60"
        >
          {t("fan.mitglied_weiter")}
        </button>
        <button
          type="button"
          onClick={onAbbrechen}
          className="text-sm text-text-secondary underline"
        >
          {t("fan.abbrechen")}
        </button>
      </div>
    </form>
  );
}
