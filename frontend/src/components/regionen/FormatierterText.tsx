/**
 * Zeigt einen Text des Regionen-Moduls : HTML aus dem Editor (bereinigt mit DOMPurify, zusätzlich
 * zur Bereinigung im Backend) oder älteren Klartext mit Zeilenumbrüchen.
 */
import { bereinigeHtml } from "../../utils/sicheresHtml";
import { istHtml } from "../../utils/formattext";

const HTML_KLASSEN =
  "prose prose-sm max-w-none text-sm text-text-secondary [&_a]:text-ca [&_a]:underline " +
  "[&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold";

export default function FormatierterText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  if (!istHtml(text)) {
    return <p className={`whitespace-pre-line text-sm text-text-secondary ${className}`}>{text}</p>;
  }
  return (
    <div
      className={`${HTML_KLASSEN} ${className}`}
      dangerouslySetInnerHTML={{ __html: bereinigeHtml(text) }}
    />
  );
}
