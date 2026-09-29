import { describe, expect, it } from "vitest";

import { apercuTexteDepuisHtml, texteBrutDepuisHtml } from "./html";

describe("texteBrutDepuisHtml", () => {
  it("retire les balises HTML", () => {
    expect(texteBrutDepuisHtml("<p><strong>Belle victoire</strong> hier soir !</p>")).toBe(
      "Belle victoire hier soir !",
    );
  });

  it("décode les entités HTML", () => {
    expect(texteBrutDepuisHtml("<p>Caf&eacute; &amp; croissants</p>")).toBe("Café & croissants");
  });

  it("réduit les espaces multiples (retours à la ligne internes) à un seul espace", () => {
    expect(texteBrutDepuisHtml("<p>Un   texte\n  avec plein d'espaces</p>")).toBe(
      "Un texte avec plein d'espaces",
    );
  });

  it("renvoie une chaîne vide pour un contenu HTML sans texte (éditeur vidé)", () => {
    expect(texteBrutDepuisHtml("<p></p>")).toBe("");
  });

  it("laisse intact un texte déjà brut, sans balises", () => {
    expect(texteBrutDepuisHtml("Allez le CA1920 !")).toBe("Allez le CA1920 !");
  });
});

describe("apercuTexteDepuisHtml", () => {
  it("ne tronque pas un texte plus court que la longueur demandée", () => {
    expect(apercuTexteDepuisHtml("<p>Allez le CA1920 !</p>", 80)).toBe("Allez le CA1920 !");
  });

  it("tronque au-delà de la longueur demandée et ajoute une ellipse", () => {
    const html = `<p>${"a".repeat(200)}</p>`;
    const apercu = apercuTexteDepuisHtml(html, 120);
    expect(apercu).toHaveLength(121); // 120 caractères + "…"
    expect(apercu.endsWith("…")).toBe(true);
  });

  it("utilise 120 comme longueur par défaut", () => {
    const html = `<p>${"a".repeat(200)}</p>`;
    expect(apercuTexteDepuisHtml(html)).toBe(apercuTexteDepuisHtml(html, 120));
  });
});
