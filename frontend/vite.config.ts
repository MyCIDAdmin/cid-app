import { readFileSync } from "node:fs";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * Setzt die öffentliche Adresse der Umgebung (DEV: my-cid.de, PROD: mycid.org) in index.html
 * (canonical/Open Graph) und erzeugt robots.txt + sitemap.xml aus den Vorlagen in
 * `site-templates/`. Quelle: Build-Variable `VITE_SITE_URL` (ohne Schrägstrich am Ende).
 */
function siteUrlPlugin(siteUrl: string): Plugin {
  return {
    name: "cid-site-url",
    transformIndexHtml: (html) => html.replaceAll("__SITE_URL__", siteUrl),
    generateBundle() {
      for (const datei of ["robots.txt", "sitemap.xml"]) {
        const quelle = readFileSync(new URL(`./site-templates/${datei}`, import.meta.url), "utf-8");
        this.emitFile({
          type: "asset",
          fileName: datei,
          source: quelle.replaceAll("__SITE_URL__", siteUrl),
        });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const siteUrl = (env.VITE_SITE_URL || "https://my-cid.de").replace(/\/+$/, "");
  return {
    plugins: [react(), siteUrlPlugin(siteUrl)],
    server: {
      host: true,
      port: 5173,
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/setupTests.ts",
    },
  };
});
