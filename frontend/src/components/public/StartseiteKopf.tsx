import { Fragment, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import HeroKacheln from "./HeroKacheln";
import HeroVideo from "./HeroVideo";
import MitgliedWerdenVorschau from "./MitgliedWerdenVorschau";
import { useConfigurationSitePublic } from "../../hooks/useCommunaute";
import { useAuthStore } from "../../store/authStore";

/**
 * Kopf der Startseite : Hero (Banner, optionales Video, „Mitglied werden“) und die zwei Kacheln
 * unter dem Hero-Video (HeroKacheln, im Modul „Hero-Video“ der Verwaltung einstellbar). Gemeinsam
 * für die öffentliche Seite (AccueilTab) und die Startseite nach der Anmeldung
 * (StartseiteMitglieder), damit Hero und Kacheln dort wie hier gleich bleiben und gleich
 * einstellbar sind. Gibt ein Fragment zurück : die Elemente stehen direkt im `space-y`-Container
 * der Seite.
 */
export default function StartseiteKopf() {
  const { t } = useTranslation("public");
  const { data: configuration } = useConfigurationSitePublic();
  const videoUrl = configuration?.video_hero ?? null;
  const isAuthenticated = useAuthStore((st) => st.isAuthenticated);
  const [vorschauOuverte, setVorschauOuverte] = useState(false);
  const titre = t("hero.titre");
  const classeCta = videoUrl
    ? "mt-6 inline-block rounded-cid bg-white px-5 py-2.5 text-sm font-semibold text-ca transition hover:bg-white/90"
    : "mt-6 inline-block rounded-cid bg-ca px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-cad";

  return (
    <>
      <div
        className={
          videoUrl
            ? "relative overflow-hidden rounded-cid-lg bg-gradient-to-br from-ca to-cad px-6 py-12 sm:px-10"
            : "py-10"
        }
      >
        {videoUrl && <HeroVideo videoUrl={videoUrl} />}
        {/* Centré façon mycid.org (retour utilisateur du 2026-09-27 : "gleiche Seitenausrichtung:
            Zentriert", "Button 'Mitglieder werden' Soll auch zentriert sein"). Retour du 2026-10-06 :
            plus de boîte derrière le texte (le texte repose directement sur la vidéo) et une
            animation du texte — titre mot par mot, puis sous-titre et CTA (voir `.hero-anim` dans
            index.css ; désactivée avec prefers-reduced-motion). */}
        <div
          className={`hero-anim relative mx-auto flex max-w-2xl flex-col items-center text-center ${
            videoUrl ? "hero-text-sur-video" : ""
          }`}
        >
          <h1
            aria-label={titre}
            className={`font-display text-3xl font-bold sm:text-4xl ${
              videoUrl ? "text-white" : "text-text-primary"
            }`}
          >
            {titre.split(" ").map((mot, index) => (
              <Fragment key={index}>
                {index > 0 && " "}
                <span
                  className="hero-mot"
                  style={{ "--mot": index } as CSSProperties}
                  aria-hidden="true"
                >
                  {mot}
                </span>
              </Fragment>
            ))}
          </h1>
          <p className={`mt-3 text-base ${videoUrl ? "text-white/85" : "text-text-secondary"}`}>
            {t("hero.sous_titre")}
          </p>
          {/* Point 10 (2026-10-06) : un visiteur voit d'abord l'aperçu de la campagne en cours,
              puis seulement la page de connexion ; un connecté va directement à son adhésion. */}
          {isAuthenticated ? (
            <Link to="/mon-adhesion" className={classeCta}>
              {t("hero.cta_mitglied_werden")}
            </Link>
          ) : (
            <button type="button" onClick={() => setVorschauOuverte(true)} className={classeCta}>
              {t("hero.cta_mitglied_werden")}
            </button>
          )}
        </div>
      </div>

      <HeroKacheln config={configuration} />
      {vorschauOuverte && <MitgliedWerdenVorschau onClose={() => setVorschauOuverte(false)} />}
    </>
  );
}
