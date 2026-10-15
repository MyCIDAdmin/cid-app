/**
 * Regionsseite (Release 26) : Banner, Beschreibung (DE/FR), Standorte und Vorstellungskarten der
 * Verantwortlichen. Bearbeiten dürfen Verantwortliche der Region und Personenverwalter
 * (`darf_bearbeiten`) ; Zuweisen/Entfernen nur Personenverwalter (`darf_personen_verwalten`).
 */
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import RichTextEditor from "../../components/ui/RichTextEditor";
import FansBereich from "../../components/regionen/FansBereich";
import BeitraegeBereich from "../../components/regionen/BeitraegeBereich";
import VeranstaltungenBereich from "../../components/regionen/VeranstaltungenBereich";
import PersonZuweisen from "../../components/regionen/PersonZuweisen";
import FormatierterText from "../../components/regionen/FormatierterText";
import RegionBild from "../../components/regionen/RegionBild";
import VerantwortlicheKarte from "../../components/regionen/VerantwortlicheKarte";
import {
  useBannerEntfernen,
  useBannerHochladen,
  useBeschreibungSpeichern,
  useRegion,
} from "../../hooks/useRegionen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { klartext } from "../../utils/formattext";
import { beschreibungIn } from "../../utils/regionen";

export default function RegionDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation("regionen");
  const { data: region, isLoading, isError } = useRegion(slug);
  const beschreibungSpeichern = useBeschreibungSpeichern();
  const bannerHoch = useBannerHochladen();
  const bannerWeg = useBannerEntfernen();
  const bannerEingabe = useRef<HTMLInputElement | null>(null);

  const [bearbeiten, setBearbeiten] = useState(false);
  const [de, setDe] = useState("");
  const [fr, setFr] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    if (region && !bearbeiten) {
      setDe(region.beschreibung.de);
      setFr(region.beschreibung.fr);
    }
  }, [region, bearbeiten]);

  if (isLoading) return <p className="text-sm text-text-tertiary">{t("laden")}</p>;
  if (isError || !region || !slug) {
    return <p className="text-sm text-status-dangerText">{t("fehler_laden_region")}</p>;
  }

  const bei = (err: unknown) => setFehler(extractApiErrorMessage(err, t("fehler_speichern")));
  const text = beschreibungIn(i18n.language, region.beschreibung);

  function sichern() {
    setFehler(null);
    beschreibungSpeichern.mutate(
      { slug: slug as string, de, fr },
      { onSuccess: () => setBearbeiten(false), onError: bei },
    );
  }

  function bannerGewaehlt(e: ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0];
    if (!datei) return;
    setFehler(null);
    bannerHoch.mutate({ slug: slug as string, datei }, { onError: bei });
    e.target.value = "";
  }

  return (
    <div className="flex flex-col gap-5">
      <Link to="/regionen" className="text-sm text-text-secondary hover:underline">
        ← {t("zurueck")}
      </Link>

      <header className="overflow-hidden rounded-cid-lg bg-bg-primary shadow-sm">
        <RegionBild region={region} hoehe="h-40" />
        <div className="p-4">
          <h1 className="text-xl font-bold text-text-primary">{region.name}</h1>
          <p className="text-xs text-text-tertiary">
            {t("mitglieder_zahl", { count: region.mitglieder })}
            {region.laender.length > 0 && <> · {region.laender.map((l) => l.name).join(", ")}</>}
          </p>
          {region.wettbewerb && (
            <Link
              to="/regionen/wettbewerb"
              className="mt-2 inline-block rounded-full bg-bg-secondary px-3 py-1 text-xs font-semibold text-text-secondary hover:underline"
            >
              {t("wettbewerb.platz", {
                rang: region.wettbewerb.rang,
                von: region.wettbewerb.regionen,
                punkte: region.wettbewerb.punkte,
              })}
            </Link>
          )}
          {region.darf_bearbeiten && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                ref={bannerEingabe}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label={t("banner_waehlen")}
                onChange={bannerGewaehlt}
                className="text-xs text-text-primary"
              />
              {region.banner_url && (
                <button
                  type="button"
                  onClick={() => bannerWeg.mutate(slug, { onError: bei })}
                  className="rounded-cid px-2 py-1 text-xs font-semibold text-status-dangerText hover:bg-status-dangerBg"
                >
                  {t("banner_entfernen")}
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {fehler && <p className="text-sm text-status-dangerText">{fehler}</p>}

      <section className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-text-primary">{t("ueber_uns")}</h2>
          {region.darf_bearbeiten && !bearbeiten && (
            <button
              type="button"
              onClick={() => setBearbeiten(true)}
              className="rounded-cid px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-bg-secondary"
            >
              {t("beschreibung_bearbeiten")}
            </button>
          )}
        </div>
        {!bearbeiten &&
          (klartext(text) ? (
            <FormatierterText text={text} />
          ) : (
            <p className="text-sm text-text-secondary">{t("keine_beschreibung")}</p>
          ))}
        {bearbeiten && (
          <div className="flex flex-col gap-3">
            <div className="text-xs font-semibold text-text-tertiary">
              <span className="mb-1 block">{t("beschreibung_de")}</span>
              <RichTextEditor value={de} onChange={setDe} ariaLabel={t("beschreibung_de")} />
            </div>
            <div className="text-xs font-semibold text-text-tertiary">
              <span className="mb-1 block">{t("beschreibung_fr")}</span>
              <RichTextEditor value={fr} onChange={setFr} ariaLabel={t("beschreibung_fr")} />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={sichern}
                disabled={beschreibungSpeichern.isPending}
                className="rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
              >
                {t("speichern")}
              </button>
              <button
                type="button"
                onClick={() => setBearbeiten(false)}
                className="rounded-cid px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-secondary"
              >
                {t("abbrechen")}
              </button>
            </div>
          </div>
        )}
      </section>

      {region.standorte.length > 0 && (
        <section>
          <h2 className="mb-2 text-base font-semibold text-text-primary">{t("standorte")}</h2>
          <ul className="flex flex-wrap gap-2">
            {region.standorte.map((s) => (
              <li
                key={s.id}
                className="rounded-full bg-bg-primary px-3 py-1 text-sm text-text-secondary shadow-sm"
              >
                {s.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-base font-semibold text-text-primary">{t("verantwortliche")}</h2>
        {region.verantwortliche.length === 0 && (
          <p className="text-sm text-text-tertiary">{t("keine_verantwortliche")}</p>
        )}
        {region.verantwortliche.length > 0 && (
          <ul className="grid gap-4 md:grid-cols-2">
            {region.verantwortliche.map((v) => (
              <VerantwortlicheKarte
                key={v.id}
                slug={region.slug}
                person={v}
                standorte={region.standorte}
                darfBearbeiten={v.eigene || region.darf_personen_verwalten}
                darfEntfernen={region.darf_personen_verwalten}
              />
            ))}
          </ul>
        )}
      </section>

      {region.darf_personen_verwalten && <PersonZuweisen slug={region.slug} />}

      <VeranstaltungenBereich
        slug={region.slug}
        standorte={region.standorte}
        darfAnlegen={region.darf_bearbeiten}
      />

      <BeitraegeBereich slug={region.slug} darfSchreiben={region.darf_bearbeiten} />
      {region.darf_bearbeiten && <FansBereich slug={region.slug} />}
    </div>
  );
}
