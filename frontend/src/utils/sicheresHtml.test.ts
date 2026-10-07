import { describe, expect, it } from "vitest";

import { bereinigeHtml } from "./sicheresHtml";

describe("bereinigeHtml", () => {
  it("entfernt Skripte und Event-Handler", () => {
    const sauber = bereinigeHtml(
      '<p onclick="x()">Hallo</p><img src="a.png" onerror="alert(1)"><script>alert(1)</script>',
    );
    expect(sauber).not.toMatch(/script/i);
    expect(sauber).not.toMatch(/onerror|onclick/i);
    expect(sauber).toContain("Hallo");
  });

  it("entfernt javascript:-Links", () => {
    expect(bereinigeHtml('<a href="javascript:alert(1)">x</a>')).not.toMatch(/javascript:/i);
  });

  it("behält Formatierung und Erwähnungen", () => {
    const html =
      '<p><strong>Fett</strong> <span data-type="mention" data-id="7">@Anna</span></p><ul><li>Punkt</li></ul>';
    const sauber = bereinigeHtml(html);
    expect(sauber).toContain("<strong>Fett</strong>");
    expect(sauber).toContain('data-type="mention"');
    expect(sauber).toContain("<li>Punkt</li>");
  });

  it("verträgt leere Eingaben", () => {
    expect(bereinigeHtml(null)).toBe("");
    expect(bereinigeHtml(undefined)).toBe("");
  });
});
