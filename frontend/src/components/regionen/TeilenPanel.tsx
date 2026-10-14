import { useState } from "react";
import { useTranslation } from "react-i18next";

/** Link und vorbereitete Texte (DE und FR) zum Weitersagen. Es wird nichts automatisch gepostet. */
export default function TeilenPanel({
  url,
  texte,
}: {
  url: string;
  texte: { de: string; fr: string };
}) {
  const { t } = useTranslation("regionen");
  const [kopiert, setKopiert] = useState<string | null>(null);

  async function kopieren(schluessel: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setKopiert(schluessel);
    } catch {
      setKopiert(null);
    }
  }

  const zeilen: { schluessel: string; label: string; text: string }[] = [
    { schluessel: "link", label: t("teilen_link"), text: url },
    { schluessel: "de", label: t("teilen_text_de"), text: texte.de },
    { schluessel: "fr", label: t("teilen_text_fr"), text: texte.fr },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-cid bg-bg-secondary p-3">
      <p className="text-xs text-text-tertiary">{t("teilen_hinweis")}</p>
      {zeilen.map((z) => (
        <div key={z.schluessel}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-text-tertiary">{z.label}</span>
            <button
              type="button"
              onClick={() => kopieren(z.schluessel, z.text)}
              className="rounded-cid px-2 py-1 text-xs font-semibold text-text-secondary hover:bg-bg-primary"
            >
              {kopiert === z.schluessel ? t("teilen_kopiert") : t("teilen_kopieren")}
            </button>
          </div>
          <p className="select-all whitespace-pre-wrap break-words text-sm text-text-primary">
            {z.text}
          </p>
        </div>
      ))}
    </div>
  );
}
