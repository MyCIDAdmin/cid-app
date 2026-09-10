/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Charte graphique CID — reprise du mockup clubistes_deutschland_mockup_v2.html
      colors: {
        ca: "#CC0000", // rouge principal
        cad: "#8B0000", // rouge foncé (hover / accent)
        cal: "#FFF0F0", // rouge très clair (fonds)
        caxx: "#FFF8F8",
        sb: "#1A0000", // sidebar / fond sombre
        bg: {
          primary: "#ffffff",
          secondary: "#fafafa",
          tertiary: "#f0f0f0",
        },
        status: {
          infoBg: "#FFF0F0",
          infoText: "#CC0000",
          successBg: "#e8f5e0",
          successText: "#1a5c0a",
          warningBg: "#fef3e2",
          warningText: "#7a4a00",
          dangerBg: "#fdeaea",
          dangerText: "#8b1a1a",
        },
        text: {
          primary: "#1a1a1a",
          secondary: "#555555",
          tertiary: "#999999",
        },
      },
      fontFamily: {
        sans: ["Segoe UI", "system-ui", "sans-serif"],
      },
      borderRadius: {
        cid: "8px",
        "cid-lg": "12px",
      },
    },
  },
  plugins: [],
};
