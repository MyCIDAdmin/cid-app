import typography from "@tailwindcss/typography";

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
      // Paire typographique reprise de MyCID dans le cadre du merge de design (2026-09-25,
      // voir rapport de comparaison "CID vs MyCID") : Oswald pour les titres (font-display),
      // Inter remplace Segoe UI comme police de texte courant — les deux chargées via Google
      // Fonts dans index.css. Fallbacks système conservés en dernier recours.
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Oswald", "system-ui", "sans-serif"],
      },
      borderRadius: {
        cid: "8px",
        "cid-lg": "12px",
      },
      keyframes: {
        // Module Fan-Club (2026-09-24) — animation d'apparition du journal d'événements du
        // Live-Ticker (voir LiveMatchDetailPage.tsx), en CSS pur plutôt qu'une bibliothèque
        // d'animation (frontend/package.json n'en contient encore aucune, voir plan approuvé).
        "slide-in-fade": {
          "0%": { opacity: "0", transform: "translateY(-6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        // "fade-up" (apparition douce pour cartes/listes) est déclaré en CSS brut directement
        // dans index.css (@keyframes fade-up, à côté de .stagger-children), PAS ici : un
        // @keyframes Tailwind n'est émis dans le CSS de production que si la classe utilitaire
        // correspondante (.animate-fade-up) est détectée par le content-scan JIT dans un fichier
        // .tsx, or elle n'est utilisée nulle part (seule la propriété `animation: fade-up` en CSS
        // brut de .stagger-children la référence) — la déclarer ici sans jamais utiliser
        // .animate-fade-up produisait un @keyframes fantôme, absent du build (bug constaté le
        // 2026-09-26 : modules Shop/Projets & Actions vides en production, voir index.css).
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        // Pastille de statut "actif" avec pulsation — même principe que le keyframe existant
        // cid-pulse-cible dans index.css (box-shadow solide → transparent, pas de couleur avec
        // alpha à maintenir en double pour chaque thème).
        "badge-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 var(--color-ca)" },
          "50%": { boxShadow: "0 0 0 4px transparent" },
        },
      },
      animation: {
        "slide-in-fade": "slide-in-fade 0.35s ease-out",
        "scale-in": "scale-in 0.35s ease-out both",
        "badge-pulse": "badge-pulse 2s ease-in-out infinite",
      },
      // Ajouté avec @tailwindcss/typography ci-dessous (2026-09-28) — sans ce surcharge, `prose`
      // impose sa propre échelle de gris (--tw-prose-body etc.) qui aurait ignoré les couleurs de
      // thème CID (text-text-primary/secondary, variables CSS définies dans index.css) et cassé
      // le mode sombre pour tout contenu HTML riche (éditeur + rendu en lecture seule). `inherit`
      // partout : le texte suit la couleur déjà posée par le composant appelant (voir
      // RichTextEditor.tsx `class="... text-text-primary ..."`), seules les puces/numéros/
      // espacements/typo viennent désormais du plugin.
      typography: {
        DEFAULT: {
          css: {
            "--tw-prose-body": "inherit",
            "--tw-prose-headings": "inherit",
            "--tw-prose-lead": "inherit",
            "--tw-prose-links": "inherit",
            "--tw-prose-bold": "inherit",
            "--tw-prose-counters": "inherit",
            "--tw-prose-bullets": "currentColor",
            "--tw-prose-hr": "currentColor",
            "--tw-prose-quotes": "inherit",
            "--tw-prose-quote-borders": "currentColor",
            "--tw-prose-captions": "inherit",
            "--tw-prose-code": "inherit",
            color: "inherit",
            maxWidth: "none",
          },
        },
      },
    },
  },
  // @tailwindcss/typography ajouté le 2026-09-28 (retour utilisateur : "Numerierung und Bullet
  // points im Word like editor funktionieren nicht") — les classes `prose`/`prose-sm` utilisées
  // par RichTextEditor.tsx (et le rendu HTML riche partout ailleurs : ProjetDetailPage,
  // RapportListe, kacheln Événements/Projets) supposaient déjà ce plugin sans qu'il soit installé
  // : Tailwind preflight retire `list-style`/marge/padding par défaut sur ul/ol/li, donc sans les
  // règles `.prose ul`/`.prose ol` du plugin, les listes à puces/numérotées de l'éditeur (et de
  // tout contenu HTML riche affiché en lecture seule) n'affichaient tout simplement plus aucune
  // puce/numéro — le bouton de la barre d'outils fonctionnait bien (voir toggleBulletList/
  // toggleOrderedList dans RichTextEditor.tsx), seul le rendu visuel manquait.
  plugins: [typography],
};
