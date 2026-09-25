/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  // Bascule clair/sombre (demande utilisateur du 2026-09-16, "Button zu Wechseln zwischen
  // Dunkel und Hell Modus") — stratégie "class" : Tailwind n'active les variantes `dark:` que
  // sous <html class="dark">, appliquée par useUiStore.toggleTheme (voir uiStore.ts et
  // main.tsx pour la synchronisation avant le premier rendu). En pratique, on n'utilise même
  // pas les variantes `dark:` dans les composants : les couleurs ci-dessous pointent vers des
  // variables CSS redéfinies pour `.dark` dans index.css, donc TOUTE l'app change de thème
  // automatiquement via les classes existantes (bg-bg-primary, text-text-secondary, etc.) sans
  // toucher aux composants un par un.
  darkMode: "class",
  theme: {
    extend: {
      // Charte graphique CID — reprise du mockup clubistes_deutschland_mockup_v2.html.
      // Valeurs réelles définies comme variables CSS dans index.css (:root pour le clair,
      // .dark pour le sombre) plutôt qu'en dur ici — voir commentaire darkMode ci-dessus.
      colors: {
        ca: "var(--color-ca)", // rouge principal
        cad: "var(--color-cad)", // rouge foncé (hover / accent)
        cal: "var(--color-cal)", // rouge très clair (fonds)
        caxx: "var(--color-caxx)",
        sb: "var(--color-sb)", // sidebar / fond sombre
        bg: {
          primary: "var(--color-bg-primary)",
          secondary: "var(--color-bg-secondary)",
          tertiary: "var(--color-bg-tertiary)",
        },
        status: {
          infoBg: "var(--color-status-infoBg)",
          infoText: "var(--color-status-infoText)",
          successBg: "var(--color-status-successBg)",
          successText: "var(--color-status-successText)",
          warningBg: "var(--color-status-warningBg)",
          warningText: "var(--color-status-warningText)",
          dangerBg: "var(--color-status-dangerBg)",
          dangerText: "var(--color-status-dangerText)",
        },
        text: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          tertiary: "var(--color-text-tertiary)",
        },
        // Palette catégorielle (voir index.css) — différencie des éléments de même nature
        // (ex. offres d'adhésion) sans hiérarchie entre eux.
        cat: {
          1: "var(--color-cat-1)",
          2: "var(--color-cat-2)",
          3: "var(--color-cat-3)",
        },
      },
      fontFamily: {
        sans: ["Segoe UI", "system-ui", "sans-serif"],
      },
      borderRadius: {
        cid: "8px",
        "cid-lg": "12px",
      },
      // Module Fan-Club (2026-09-24) — animation d'apparition du journal d'événements du
      // Live-Ticker (voir LiveMatchDetailPage.tsx), en CSS pur plutôt qu'une bibliothèque
      // d'animation (frontend/package.json n'en contient encore aucune, voir plan approuvé).
      keyframes: {
        "slide-in-fade": {
          "0%": { opacity: "0", transform: "translateY(-6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "slide-in-fade": "slide-in-fade 0.35s ease-out",
      },
    },
  },
  plugins: [],
};
