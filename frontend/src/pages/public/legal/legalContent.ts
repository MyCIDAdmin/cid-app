/**
 * Inhalt der 4 rechtlichen Seiten (Impressum/Datenschutz/Nutzungsbedingungen/
 * Erstattungsrichtlinie) — Nachbau der entsprechenden Seiten von https://www.mycid.org/
 * (retour utilisateur du 2026-09-28, point 3.1-3.4 : "soll die Seite [...] in my-cid.com
 * nachgebaut werden"), aber mit eigener Formulierung statt wörtlicher Übernahme (les faits —
 * nom de l'association, adresse, numéro de registre, composition du bureau — restent
 * identiques puisqu'il s'agit de la même association ; seule la mise en forme du texte est
 * réécrite pour cette plateforme).
 *
 * Contenu directement en dur ici (pas de clés i18next atomisées comme pour le reste de
 * l'app) : un texte légal a besoin d'un contrôle exact de sa formulation par langue, pas
 * d'un découpage en dizaines de petites clés qui rendrait toute relecture juridique plus
 * difficile — même principe que LanguageSwitcher.tsx pour la sélection de langue (allemand
 * par défaut, sinon français ; l'arabe n'est pas encore disponible pour l'app, cf.
 * CLAUDE.md §7 Phase 5 "à faire").
 */

export interface SectionLegale {
  titre: string;
  absaetze?: string[];
  liste?: string[];
}

export interface PageLegale {
  titre: string;
  untertitel: string;
  sections: SectionLegale[];
  stand: string;
}

interface ContenuBilingue {
  de: PageLegale;
  fr: PageLegale;
}

const ADRESSE = "c/o Khaled Msakni, Borussiastraße 50, 12099 Berlin";
const EMAIL = "info@clubistesindeutschland.org";
const REGISTRE = "VR 39125 B, Amtsgericht Charlottenburg, Berlin";

export const IMPRESSUM: ContenuBilingue = {
  de: {
    titre: "Impressum",
    untertitel: "Pflichtangaben gemäß § 5 TMG und § 18 MStV",
    stand: "Stand: März 2025",
    sections: [
      {
        titre: "1. Vereinsangaben",
        liste: [
          "Name: Clubistes in Deutschland e.V.",
          "Rechtsform: Eingetragener Verein (e.V.) nach deutschem Recht",
          "Registernummer: VR 39125 B",
          "Registergericht: Amtsgericht Charlottenburg, Berlin",
          "Gemeinnützigkeit: Anerkannt gemeinnützig gemäß § 52 AO (Förderung des Sports)",
          `Sitz/Anschrift: ${ADRESSE}`,
          "Gegründet: 4. Oktober 2019",
          "Letzte Satzungsänderung: 7. August 2021 (§ 4 Mitgliedschaft, § 5 Finanzierung)",
        ],
      },
      {
        titre: "2. Kontakt",
        liste: [`E-Mail: ${EMAIL}`, "Telefon: auf Anfrage per E-Mail", "Website: https://www.my-cid.de"],
        absaetze: [
          "Für Mitgliedschaftsfragen, Spendenanfragen und allgemeine Korrespondenz nutzen Sie bitte die oben genannte E-Mail-Adresse.",
        ],
      },
      {
        titre: "3. Vertretungsberechtigte (Vorstand gemäß § 26 BGB)",
        absaetze: [
          "Der Verein wird gerichtlich und außergerichtlich durch zwei Vorstandsmitglieder gemeinsam vertreten. Der Vorsitzende ist allein vertretungsberechtigt. Zahlungsanweisungen bedürfen der Unterschrift des Schatzmeisters sowie eines weiteren Vorstandsmitglieds.",
        ],
        liste: [
          "Vorsitz (einzelvertretungsberechtigt): Khaled Msakni, geb. 01.08.1982, wohnhaft in Berlin",
          "Stellvertretender Vorsitz: Zied Bouabdelli, geb. 15.03.1982, wohnhaft in Düsseldorf",
          "Schatzmeister: Mokhtar Arfaoui, geb. 12.07.1984, wohnhaft in Oberhausen",
        ],
      },
      {
        titre: "4. Vereinszweck",
        absaetze: [
          "Clubistes in Deutschland e.V. verfolgt ausschließlich und unmittelbar gemeinnützige Zwecke im Sinne des § 52 Abs. 2 Nr. 21 AO (Förderung des Sports, insbesondere des Ballsports). Der Verein ist nicht auf eigenwirtschaftliche Tätigkeit ausgerichtet.",
          "Der Zweck wird insbesondere verwirklicht durch:",
        ],
        liste: [
          "Finanzielle und materielle Unterstützung von Sportvereinen, insbesondere Club Africain (Tunis, Tunesien)",
          "Mittelbeschaffung durch Mitgliedsbeiträge und Spenden zur Förderung des Breitensports",
          "Anschaffung von Sportausrüstung (Bälle, Trikots, Schuhe) für minderjährige und bedürftige Kinder",
          "Organisation von Ballsport-Aktivitäten für Vereinsmitglieder",
          "Unterstützung bei Pflege und Instandhaltung von Sportanlagen (nach Absprache)",
        ],
      },
      {
        titre: "5. Haftungsausschluss",
        absaetze: [
          "5.1 Haftung für eigene Inhalte: Als Diensteanbieter sind wir für eigene Inhalte dieser Website gemäß § 7 Abs. 1 TMG nach den allgemeinen Gesetzen verantwortlich. Wir bemühen uns, die Inhalte aktuell und richtig zu halten, können jedoch keine Gewähr für Vollständigkeit, Richtigkeit oder Aktualität übernehmen.",
          "5.2 Haftung für externe Links: Unsere Website enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Verlinkte Seiten wurden zum Zeitpunkt der Verlinkung auf mögliche Rechtsverstöße geprüft; eine permanente inhaltliche Kontrolle ist ohne konkrete Anhaltspunkte nicht zumutbar. Bei Bekanntwerden von Rechtsverletzungen werden entsprechende Links umgehend entfernt.",
          "5.3 Haftungsbeschränkung für Vorstandsmitglieder: Als gemeinnütziger Verein haften Vorstandsmitglieder gegenüber Mitgliedern und dem Verein gemäß § 31a BGB nur für Schäden, die in Wahrnehmung ihrer Pflichten vorsätzlich oder grob fahrlässig verursacht werden. Dies gilt nicht bei Verletzung von Leben, Körper oder Gesundheit.",
        ],
      },
      {
        titre: "6. Urheberrecht",
        absaetze: [
          "Die vom Verein auf dieser Website erstellten Inhalte und Werke unterliegen dem deutschen Urheberrecht. Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechts bedürfen der schriftlichen Zustimmung des Vereins. Downloads und Kopien dieser Seite sind nur für den privaten, nicht kommerziellen Gebrauch gestattet.",
        ],
      },
      {
        titre: "7. Online-Streitbeilegung",
        absaetze: [
          "Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS-Plattform) unter https://ec.europa.eu/consumers/odr bereit. Als gemeinnütziger Verein sind wir nicht verpflichtet, an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen, und tun dies auch nicht.",
          `Kontakt: ${EMAIL}`,
        ],
      },
    ],
  },
  fr: {
    titre: "Mentions légales",
    untertitel: "Informations obligatoires selon § 5 TMG et § 18 MStV (droit allemand)",
    stand: "Dernière mise à jour : mars 2025",
    sections: [
      {
        titre: "1. Informations sur l'association",
        liste: [
          "Nom : Clubistes in Deutschland e.V.",
          "Forme juridique : association enregistrée (eingetragener Verein, e.V.) de droit allemand",
          "Numéro d'enregistrement : VR 39125 B",
          "Tribunal d'enregistrement : Amtsgericht Charlottenburg, Berlin",
          "Statut : reconnue d'intérêt général (gemeinnützig) au sens du § 52 AO (promotion du sport)",
          `Siège/Adresse : ${ADRESSE}`,
          "Fondée le : 4 octobre 2019",
          "Dernière modification des statuts : 7 août 2021 (§ 4 Adhésion, § 5 Financement)",
        ],
      },
      {
        titre: "2. Contact",
        liste: [`E-mail : ${EMAIL}`, "Téléphone : sur demande par e-mail", "Site web : https://www.my-cid.de"],
        absaetze: [
          "Pour toute question relative à l'adhésion, aux dons ou à la correspondance générale, veuillez utiliser l'adresse e-mail ci-dessus.",
        ],
      },
      {
        titre: "3. Représentants légaux (Bureau selon § 26 BGB)",
        absaetze: [
          "L'association est représentée en justice et hors justice par deux membres du bureau agissant conjointement. Le/la Président(e) dispose d'un pouvoir de représentation individuel. Les ordres de paiement requièrent la signature du/de la Trésorier(ère) et d'un autre membre du bureau.",
        ],
        liste: [
          "Président (représentation individuelle) : Khaled Msakni, né le 01.08.1982, domicilié à Berlin",
          "Vice-président : Zied Bouabdelli, né le 15.03.1982, domicilié à Düsseldorf",
          "Trésorier : Mokhtar Arfaoui, né le 12.07.1984, domicilié à Oberhausen",
        ],
      },
      {
        titre: "4. Objet de l'association",
        absaetze: [
          "Clubistes in Deutschland e.V. poursuit exclusivement et directement des buts d'intérêt général au sens du § 52 al. 2 n° 21 AO (promotion du sport, en particulier des sports collectifs). L'association n'exerce pas d'activité à but lucratif pour elle-même.",
          "Cet objet se concrétise notamment par :",
        ],
        liste: [
          "Le soutien financier et matériel à des clubs sportifs, en particulier le Club Africain (Tunis, Tunisie)",
          "La collecte de fonds via cotisations et dons pour promouvoir le sport amateur",
          "L'achat d'équipements sportifs (ballons, maillots, chaussures) pour des enfants mineurs et défavorisés",
          "L'organisation d'activités sportives pour les membres de l'association",
          "Le soutien à l'entretien d'infrastructures sportives (sur accord préalable)",
        ],
      },
      {
        titre: "5. Exclusion de responsabilité",
        absaetze: [
          "5.1 Responsabilité pour son propre contenu : en tant que prestataire de services, nous sommes responsables de notre propre contenu sur ce site conformément au § 7 al. 1 TMG. Nous nous efforçons de maintenir ce contenu exact et à jour, sans pouvoir garantir son exhaustivité.",
          "5.2 Responsabilité pour les liens externes : notre site contient des liens vers des sites tiers dont nous ne contrôlons pas le contenu. Les pages liées ont été vérifiées au moment de la mise en lien ; une surveillance permanente sans indice concret n'est pas exigible. Tout lien signalé comme illicite sera retiré sans délai.",
          "5.3 Limitation de responsabilité des membres du bureau : en tant qu'association d'intérêt général, les membres du bureau ne sont responsables envers les membres et l'association, selon le § 31a BGB, qu'en cas de dol ou de négligence grave dans l'exercice de leurs fonctions. Cela ne s'applique pas aux atteintes à la vie, au corps ou à la santé.",
        ],
      },
      {
        titre: "6. Droit d'auteur",
        absaetze: [
          "Les contenus et œuvres créés par l'association sur ce site sont soumis au droit d'auteur allemand. Toute reproduction, modification, diffusion ou exploitation au-delà des limites du droit d'auteur nécessite l'accord écrit de l'association. Le téléchargement et la copie de cette page ne sont autorisés que pour un usage privé et non commercial.",
        ],
      },
      {
        titre: "7. Règlement en ligne des litiges",
        absaetze: [
          "La Commission européenne met à disposition une plateforme de règlement en ligne des litiges (plateforme RLL), accessible sur https://ec.europa.eu/consumers/odr. En tant qu'association d'intérêt général, nous ne sommes pas tenus de participer à une procédure devant un organisme de conciliation des consommateurs et n'y participons pas.",
          `Contact : ${EMAIL}`,
        ],
      },
    ],
  },
};

export const DATENSCHUTZ: ContenuBilingue = {
  de: {
    titre: "Datenschutzerklärung",
    untertitel: "Gemäß DSGVO (EU 2016/679) und BDSG",
    stand: "Stand: März 2025",
    sections: [
      {
        titre: "1. Verantwortlicher und Kontakt",
        absaetze: ["Verantwortlicher im Sinne der DSGVO ist:"],
        liste: [
          "Verein: Clubistes in Deutschland e.V.",
          `Anschrift: ${ADRESSE}`,
          `E-Mail: ${EMAIL}`,
          `Registereintrag: ${REGISTRE}`,
          `Datenschutzbeauftragter: Khaled Msakni, erreichbar unter: ${EMAIL}`,
        ],
        // Fortsetzung nach der Liste (Absätze werden vor der Liste gerendert — siehe
        // LegalPageLayout.tsx) : ergänzender Hinweis unten in einer eigenen kleinen Sektion,
        // um die Reihenfolge Absatz→Liste→Absatz beizubehalten.
      },
      {
        titre: "",
        absaetze: [
          "Für Fragen zur Datenverarbeitung oder zur Ausübung Ihrer Rechte können Sie uns jederzeit unter der oben genannten E-Mail-Adresse kontaktieren.",
        ],
      },
      {
        titre: "2. Grundsätze der Datenverarbeitung",
        absaetze: [
          "Wir verarbeiten personenbezogene Daten ausschließlich im Einklang mit der Datenschutz-Grundverordnung (DSGVO) und dem Bundesdatenschutzgesetz (BDSG). Unsere Grundsätze sind:",
        ],
        liste: [
          "Rechtmäßigkeit, Verarbeitung nach Treu und Glauben, Transparenz",
          "Zweckbindung: Daten werden nur für festgelegte, eindeutige und legitime Zwecke erhoben",
          "Datenminimierung: nur tatsächlich erforderliche Daten werden erhoben",
          "Richtigkeit: Daten werden aktuell gehalten",
          "Speicherbegrenzung: Daten werden gelöscht, sobald der Zweck erfüllt ist",
          "Integrität und Vertraulichkeit durch geeignete technische und organisatorische Maßnahmen",
        ],
      },
      {
        titre: "3. Datenkategorien, Zwecke und Rechtsgrundlagen",
        absaetze: [
          "3.1 Mitgliedsdaten: Für die Aufnahme und Verwaltung der Vereinsmitgliedschaft erheben und verarbeiten wir Vor- und Nachname, vollständige Postanschrift, E-Mail-Adresse, Geburtsdatum (zur Identifikation und Altersverifikation), Bankverbindung/IBAN (ausschließlich zum Einzug der Mitgliedsbeiträge) sowie Beitritts- und ggf. Austrittsdatum. Zweck: Mitgliederverwaltung, Kommunikation, Beitragseinzug, Einladung zu Mitgliederversammlungen, satzungsmäßige Pflichten. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) und Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an ordnungsgemäßer Verwaltung).",
          "3.2 Spenden und Online-Zahlungen: Für die Abwicklung von Spenden und Online-Zahlungen erheben wir Name und Anschrift, Zahlungsmethode und Transaktionsdaten (verschlüsselt übertragen), Spendenbetrag und -zeitpunkt, ggf. Verwendungszweck sowie die für Zuwendungsbestätigungen nach § 10b EStG erforderlichen Daten. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO sowie Art. 6 Abs. 1 lit. c DSGVO (rechtliche Verpflichtung, z. B. § 147 AO, § 10b EStG).",
          "3.3 Websitenutzung: Beim Besuch von www.my-cid.de erfasst unser Server automatisch technische Daten (Server-Logfiles): IP-Adresse (nach 7 Tagen anonymisiert), Datum/Uhrzeit des Zugriffs, aufgerufene Datei, übertragene Datenmenge, HTTP-Statuscode, Browser/Betriebssystem und Referrer-URL. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (technischer Betrieb und Sicherheit). Logfiles werden spätestens nach 7 Tagen automatisch gelöscht.",
          "3.4 Kontaktaufnahme per E-Mail oder Kontaktformular: Wir erheben Ihre E-Mail-Adresse, weitere von Ihnen angegebene Kontaktdaten, den Inhalt Ihrer Nachricht und den Zeitpunkt der Kontaktaufnahme. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO. Löschung nach abschließender Bearbeitung, spätestens nach 2 Jahren.",
          "3.5 Vereinsveranstaltungen und Sportaktivitäten: Bei der Organisation von Vereinsveranstaltungen erheben wir Teilnehmerdaten (Name, Kontaktdaten und, soweit sportmedizinisch erforderlich, Gesundheitsdaten). Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO, für Gesundheitsdaten Art. 9 Abs. 2 lit. a DSGVO (ausdrückliche Einwilligung).",
        ],
      },
      {
        titre: "4. Weitergabe von Daten an Dritte",
        absaetze: ["Personenbezogene Daten werden nur an Dritte weitergegeben, wenn:"],
        liste: [
          "Sie ausdrücklich eingewilligt haben (Art. 6 Abs. 1 lit. a DSGVO)",
          "dies zur Vertragserfüllung erforderlich ist — z. B. Weitergabe an Zahlungsdienstleister zur Abwicklung von Beiträgen und Spenden (Art. 6 Abs. 1 lit. b DSGVO)",
          "eine rechtliche Verpflichtung besteht — z. B. Meldepflichten gegenüber Behörden (Art. 6 Abs. 1 lit. c DSGVO)",
          "dies zur Wahrung berechtigter Interessen des Vereins erforderlich ist (Art. 6 Abs. 1 lit. f DSGVO)",
        ],
        // Ergänzung als eigener Absatz nach der Liste in einer Folge-Sektion (siehe unten).
      },
      {
        titre: "",
        absaetze: [
          "Im Rahmen unserer satzungsmäßigen Vereinszwecke leiten wir Mittel an Club Africain (Tunis, Tunesien) weiter. Dabei werden ausschließlich aggregierte, anonymisierte Informationen zur Mittelverwendung übermittelt — keine personenbezogenen Daten.",
          "Hinweis zu Drittlandtransfers: Eine Übermittlung personenbezogener Daten in Länder außerhalb der EU/des EWR erfolgt nur unter den Voraussetzungen der Art. 44 ff. DSGVO (Angemessenheitsbeschluss, Standardvertragsklauseln oder andere geeignete Garantien).",
        ],
      },
      {
        titre: "5. Auftragsverarbeiter",
        absaetze: [
          "Wir setzen folgende Kategorien von Dienstleistern ein, mit denen wir Auftragsverarbeitungsverträge gemäß Art. 28 DSGVO abgeschlossen haben bzw. abschließen werden:",
        ],
        liste: ["Webhosting-Anbieter (Betrieb der Website)", "E-Mail-Dienste (Vereinskommunikation)", "Zahlungsdienstleister (Online-Zahlungen und Spenden)"],
      },
      {
        titre: "6. Speicherdauer",
        absaetze: ["Wir speichern personenbezogene Daten nur so lange, wie es für den jeweiligen Zweck erforderlich oder gesetzlich vorgeschrieben ist:"],
        liste: [
          "Mitgliedsdaten (aktiv): für die Dauer der Mitgliedschaft",
          "Mitgliedsdaten (nach Austritt): 3 Jahre (Verjährungsfristen)",
          "Buchungsunterlagen, Zuwendungsbestätigungen: 10 Jahre gemäß § 147 AO",
          "Handels- und Geschäftsbriefe: 6 Jahre gemäß § 147 AO",
          "Server-Logfiles: max. 7 Tage",
          "E-Mail-Anfragen/Kontaktformulare: 2 Jahre nach Ende der Kommunikation",
          "Veranstaltungsdaten: 3 Jahre nach der Veranstaltung",
        ],
      },
      {
        titre: "7. Ihre Rechte nach der DSGVO (Art. 12–22)",
        absaetze: [
          `Sie können Ihre Rechte jederzeit unter ${EMAIL} geltend machen. Wir bearbeiten Ihre Anfrage unverzüglich, spätestens innerhalb eines Monats (Art. 12 DSGVO).`,
          "Ihre Rechte im Einzelnen:",
        ],
        liste: [
          "Art. 15 DSGVO — Auskunftsrecht: Sie können Auskunft über die zu Ihrer Person gespeicherten Daten, deren Herkunft, Empfänger und den Verarbeitungszweck verlangen.",
          "Art. 16 DSGVO — Recht auf Berichtigung: Sie können die Berichtigung unrichtiger oder unvollständiger Daten verlangen.",
          "Art. 17 DSGVO — Recht auf Löschung ('Recht auf Vergessenwerden'): Sie können die Löschung Ihrer Daten verlangen, soweit keine gesetzlichen Aufbewahrungspflichten entgegenstehen.",
          "Art. 18 DSGVO — Recht auf Einschränkung der Verarbeitung: Sie können die Einschränkung der Verarbeitung verlangen, z. B. wenn Sie die Richtigkeit der Daten bestreiten.",
          "Art. 20 DSGVO — Recht auf Datenübertragbarkeit: Sie können die Bereitstellung Ihrer Daten in einem maschinenlesbaren Format verlangen.",
          "Art. 21 DSGVO — Widerspruchsrecht: Sie können der auf berechtigten Interessen beruhenden Verarbeitung Ihrer Daten jederzeit widersprechen.",
          "Art. 7 Abs. 3 DSGVO — Recht auf Widerruf der Einwilligung: Eine erteilte Einwilligung kann jederzeit mit Wirkung für die Zukunft widerrufen werden.",
        ],
      },
      {
        titre: "",
        absaetze: [
          "Beschwerderecht: Unbeschadet anderweitiger Rechtsbehelfe haben Sie das Recht auf Beschwerde bei der zuständigen Aufsichtsbehörde: Berliner Beauftragte für Datenschutz und Informationsfreiheit, Friedrichstr. 219, 10969 Berlin, mailbox@datenschutz-berlin.de.",
        ],
      },
      {
        titre: "8. Datensicherheit",
        absaetze: ["Wir setzen technische und organisatorische Sicherheitsmaßnahmen ein, um Ihre Daten vor Manipulation, Verlust, Zerstörung und unbefugtem Zugriff zu schützen, u. a.:"],
        liste: [
          "SSL/TLS-Verschlüsselung der Datenübertragung auf unserer Website",
          "Zugriffsbeschränkungen auf personenbezogene Daten (Need-to-know-Prinzip)",
          "Regelmäßige Sicherheitsüberprüfungen unserer IT-Systeme",
          "Passwortschutz und Zwei-Faktor-Authentifizierung für Vereinskonten",
        ],
      },
      {
        titre: "9. Cookies und Tracking",
        absaetze: [
          "Unsere Website verwendet ausschließlich technisch notwendige Cookies, die für den Betrieb der Website erforderlich sind. Ohne Ihre ausdrückliche Einwilligung werden keine Analyse-, Tracking- oder Marketing-Cookies gesetzt. Technisch notwendige Cookies werden nach Schließen der Browser-Sitzung nicht dauerhaft gespeichert (Session-Cookies) — hierfür ist gemäß § 25 Abs. 2 Nr. 2 TTDSG keine Einwilligung erforderlich. Sollten wir künftig optionale Cookies einführen, werden wir Ihre Einwilligung vorab einholen (Cookie-Banner gemäß § 25 Abs. 1 TTDSG).",
        ],
      },
      {
        titre: "10. Änderungen dieser Datenschutzerklärung",
        absaetze: [
          "Wir behalten uns vor, diese Datenschutzerklärung bei Bedarf anzupassen, um sie an geänderte gesetzliche Anforderungen oder Änderungen unserer Leistungen anzupassen. Die jeweils aktuelle Fassung ist stets auf unserer Website abrufbar.",
          `Datenschutzkontakt: ${EMAIL}`,
        ],
      },
    ],
  },
  fr: {
    titre: "Politique de confidentialité",
    untertitel: "Conformément au RGPD (UE 2016/679) et au BDSG",
    stand: "Dernière mise à jour : mars 2025",
    sections: [
      {
        titre: "1. Responsable du traitement et contact",
        absaetze: ["Le responsable du traitement au sens du RGPD est :"],
        liste: [
          "Association : Clubistes in Deutschland e.V.",
          `Adresse : ${ADRESSE}`,
          `E-mail : ${EMAIL}`,
          `Registre : ${REGISTRE}`,
          `Délégué à la protection des données : Khaled Msakni, joignable à : ${EMAIL}`,
        ],
      },
      {
        titre: "",
        absaetze: [
          "Pour toute question relative au traitement de vos données ou pour exercer vos droits, vous pouvez nous contacter à tout moment à l'adresse e-mail ci-dessus.",
        ],
      },
      {
        titre: "2. Principes du traitement des données",
        absaetze: ["Nous traitons les données à caractère personnel exclusivement conformément au RGPD et au BDSG (loi fédérale allemande sur la protection des données). Nos principes directeurs sont :"],
        liste: [
          "Licéité, loyauté et transparence",
          "Limitation des finalités : les données ne sont collectées que pour des finalités déterminées, explicites et légitimes",
          "Minimisation des données : seules les données réellement nécessaires sont collectées",
          "Exactitude : les données sont tenues à jour",
          "Limitation de la conservation : les données sont supprimées une fois leur finalité atteinte",
          "Intégrité et confidentialité par des mesures techniques et organisationnelles appropriées",
        ],
      },
      {
        titre: "3. Catégories de données, finalités et bases légales",
        absaetze: [
          "3.1 Données des membres : pour l'admission et la gestion de l'adhésion, nous collectons prénom et nom, adresse postale complète, adresse e-mail, date de naissance (identification et vérification de l'âge), coordonnées bancaires/IBAN (uniquement pour le prélèvement des cotisations) ainsi que les dates d'adhésion et, le cas échéant, de démission. Finalité : gestion des membres, communication, encaissement des cotisations, convocation aux assemblées générales, obligations statutaires. Base légale : art. 6 §1 b) RGPD (exécution du contrat) et art. 6 §1 f) RGPD (intérêt légitime à une gestion correcte).",
          "3.2 Dons et paiements en ligne : pour le traitement des dons et des paiements en ligne, nous collectons nom et adresse complets, mode de paiement et données de transaction (transmises de façon chiffrée), montant et date du don, objet désigné le cas échéant, ainsi que les données nécessaires à l'émission des reçus fiscaux selon le § 10b EStG. Base légale : art. 6 §1 b) RGPD et art. 6 §1 c) RGPD (obligation légale, par ex. § 147 AO, § 10b EStG).",
          "3.3 Utilisation du site : lors de la visite de www.my-cid.de, notre serveur enregistre automatiquement des données techniques (fichiers journaux) : adresse IP (anonymisée après 7 jours), date et heure d'accès, fichier consulté, volume transféré, code de statut HTTP, navigateur/système d'exploitation et URL de provenance. Base légale : art. 6 §1 f) RGPD (fonctionnement technique et sécurité). Les journaux sont supprimés automatiquement après 7 jours maximum.",
          "3.4 Contact par e-mail ou formulaire de contact : nous collectons votre adresse e-mail, les autres coordonnées que vous fournissez, le contenu de votre message et la date du contact. Base légale : art. 6 §1 f) RGPD. Suppression après traitement final, au plus tard après 2 ans.",
          "3.5 Événements et activités sportives de l'association : lors de l'organisation d'événements, nous collectons les données des participants (nom, coordonnées et, si nécessaire d'un point de vue médico-sportif, données de santé). Base légale : art. 6 §1 b) RGPD, et pour les données de santé, art. 9 §2 a) RGPD (consentement explicite).",
        ],
      },
      {
        titre: "4. Transmission de données à des tiers",
        absaetze: ["Les données à caractère personnel ne sont transmises à des tiers que si :"],
        liste: [
          "vous y avez expressément consenti (art. 6 §1 a) RGPD)",
          "cela est nécessaire à l'exécution d'un contrat — par ex. transmission à des prestataires de paiement pour le traitement des cotisations et des dons (art. 6 §1 b) RGPD)",
          "une obligation légale l'exige — par ex. obligations de déclaration auprès des autorités (art. 6 §1 c) RGPD)",
          "cela est nécessaire à la protection des intérêts légitimes de l'association (art. 6 §1 f) RGPD)",
        ],
      },
      {
        titre: "",
        absaetze: [
          "Dans le cadre de nos statuts, nous transférons des fonds au Club Africain (Tunis, Tunisie). Seules des informations agrégées et anonymisées sur l'utilisation des fonds sont communiquées — aucune donnée à caractère personnel n'est transférée.",
          "Remarque sur les transferts vers des pays tiers : tout transfert de données personnelles hors UE/EEE n'a lieu que dans les conditions des art. 44 et suivants du RGPD (décision d'adéquation, clauses contractuelles types ou autres garanties appropriées).",
        ],
      },
      {
        titre: "5. Sous-traitants",
        absaetze: ["Nous faisons appel aux catégories de prestataires suivantes, avec lesquelles nous avons conclu ou conclurons des accords de sous-traitance conformément à l'art. 28 RGPD :"],
        liste: ["Hébergeur du site web", "Services de messagerie (communication associative)", "Prestataires de paiement (paiements en ligne et dons)"],
      },
      {
        titre: "6. Durées de conservation",
        absaetze: ["Nous ne conservons les données personnelles que pour la durée nécessaire à leur finalité ou exigée par la loi :"],
        liste: [
          "Données des membres (actifs) : pour la durée de l'adhésion",
          "Données des membres (après démission) : 3 ans (délais de prescription)",
          "Pièces comptables, reçus de dons : 10 ans selon § 147 AO",
          "Correspondance commerciale : 6 ans selon § 147 AO",
          "Journaux du serveur : 7 jours maximum",
          "Demandes par e-mail/formulaire de contact : 2 ans après la fin de la communication",
          "Données d'événements : 3 ans après l'événement",
        ],
      },
      {
        titre: "7. Vos droits selon le RGPD (art. 12 à 22)",
        absaetze: [
          `Vous pouvez exercer vos droits à tout moment en nous contactant à ${EMAIL}. Nous traiterons votre demande sans délai, au plus tard dans un délai d'un mois (art. 12 RGPD).`,
          "Vos droits en détail :",
        ],
        liste: [
          "Art. 15 RGPD — Droit d'accès : vous pouvez demander des informations sur les données vous concernant, leur origine, leurs destinataires et la finalité du traitement.",
          "Art. 16 RGPD — Droit de rectification : vous pouvez demander la correction de données inexactes ou incomplètes.",
          "Art. 17 RGPD — Droit à l'effacement (« droit à l'oubli ») : vous pouvez demander la suppression de vos données, sous réserve d'obligations légales de conservation.",
          "Art. 18 RGPD — Droit à la limitation du traitement : vous pouvez demander la limitation du traitement, par ex. si vous contestez l'exactitude des données.",
          "Art. 20 RGPD — Droit à la portabilité : vous pouvez demander la fourniture de vos données dans un format structuré et lisible par machine.",
          "Art. 21 RGPD — Droit d'opposition : vous pouvez vous opposer à tout moment à un traitement fondé sur un intérêt légitime.",
          "Art. 7 §3 RGPD — Droit de retrait du consentement : tout consentement donné peut être retiré à tout moment, avec effet pour l'avenir.",
        ],
      },
      {
        titre: "",
        absaetze: [
          "Droit de réclamation : sans préjudice de tout autre recours, vous avez le droit d'introduire une réclamation auprès de l'autorité de contrôle compétente : Berliner Beauftragte für Datenschutz und Informationsfreiheit, Friedrichstr. 219, 10969 Berlin, mailbox@datenschutz-berlin.de.",
        ],
      },
      {
        titre: "8. Sécurité des données",
        absaetze: ["Nous mettons en œuvre des mesures de sécurité techniques et organisationnelles pour protéger vos données contre la manipulation, la perte, la destruction et l'accès non autorisé, notamment :"],
        liste: [
          "Chiffrement SSL/TLS de la transmission des données sur notre site",
          "Restrictions d'accès aux données personnelles (principe du besoin d'en connaître)",
          "Contrôles de sécurité réguliers de nos systèmes informatiques",
          "Protection par mot de passe et authentification à deux facteurs pour les comptes associatifs",
        ],
      },
      {
        titre: "9. Cookies et traceurs",
        absaetze: [
          "Notre site utilise uniquement des cookies techniquement nécessaires au fonctionnement du site. Aucun cookie d'analyse, de suivi ou marketing n'est déposé sans votre consentement explicite. Les cookies techniquement nécessaires ne sont pas conservés au-delà de la session de navigation (cookies de session) — aucun consentement n'est requis pour ceux-ci selon le § 25 al. 2 n° 2 TTDSG. Si nous introduisons à l'avenir des cookies optionnels, nous recueillerons votre consentement préalable (bandeau cookies selon § 25 al. 1 TTDSG).",
        ],
      },
      {
        titre: "10. Modifications de cette politique",
        absaetze: [
          "Nous nous réservons le droit d'actualiser cette politique de confidentialité si nécessaire, afin de l'adapter aux évolutions légales ou à nos services. La version en vigueur est toujours disponible sur notre site.",
          `Contact protection des données : ${EMAIL}`,
        ],
      },
    ],
  },
};

export const AGB: ContenuBilingue = {
  de: {
    titre: "Nutzungsbedingungen",
    untertitel: "Clubistes in Deutschland e.V. | www.my-cid.de",
    stand: "Stand: März 2025",
    sections: [
      {
        titre: "1. Geltungsbereich, Vertragspartner und Begriffe",
        absaetze: [
          "Diese Nutzungsbedingungen (\"NB\") regeln die Nutzung der Website www.my-cid.de sowie alle Rechtsbeziehungen zwischen dem Verein Clubistes in Deutschland e.V. (\"Verein\") einerseits und Websitebesuchern, Mitgliedern und Spendern (\"Nutzer\") andererseits.",
        ],
        liste: [
          "Vereinsname: Clubistes in Deutschland e.V.",
          `Anschrift: ${ADRESSE}`,
          `Registergericht: ${REGISTRE}`,
          `E-Mail: ${EMAIL}`,
          "Gemeinnützigkeit: Anerkannt gemeinnützig gemäß § 52 AO",
        ],
      },
      {
        titre: "",
        absaetze: [
          "Mit Nutzung der Website oder Beantragung der Mitgliedschaft akzeptieren Nutzer diese NB in der jeweils gültigen Fassung. Für Verbraucher im Sinne des § 13 BGB gehen zwingende gesetzliche Verbraucherschutzvorschriften vor, soweit diese NB davon abweichen.",
        ],
      },
      {
        titre: "2. Zweck und Leistungen",
        absaetze: [
          "Clubistes in Deutschland e.V. ist ein eingetragener gemeinnütziger Verein mit dem satzungsmäßigen Zweck der Sportförderung, insbesondere des Ballsports (§ 52 Abs. 2 Nr. 21 AO). Der Verein handelt nicht gewinnorientiert.",
          "Über die Website www.my-cid.de bietet der Verein folgende Leistungen an:",
        ],
        liste: [
          "Informationen über den Verein, seine Satzung, Aktivitäten und geförderten Zwecke",
          "Möglichkeit zur Beantragung der Vereinsmitgliedschaft",
          "Online-Zahlung von Mitgliedsbeiträgen",
          "Abwicklung von Spenden zur Förderung der Vereinszwecke",
          "Informationen zu Veranstaltungen und Sportaktivitäten",
          "Kontakt zum Vorstand",
        ],
        // Absatz nach der Liste, siehe Folge-Sektion.
      },
      {
        titre: "",
        absaetze: ["Der Verein behält sich vor, Leistungen jederzeit im Rahmen des Vereinszwecks zu ändern, zu erweitern oder einzustellen."],
      },
      {
        titre: "3. Mitgliedschaft",
        absaetze: [
          "3.1 Aufnahme: Natürliche und juristische Personen können Mitglied des Vereins werden. Die Aufnahme erfolgt durch schriftlichen Mitgliedsantrag (per Post oder E-Mail), Entscheidung des Vorstands über die Aufnahme und schriftliche Mitteilung der Entscheidung an den Antragsteller. Ein Rechtsanspruch auf Aufnahme besteht nicht; der Vorstand kann einen Antrag ohne Angabe von Gründen ablehnen. Mit der Aufnahme erkennt das Mitglied die Satzung, diese NB und alle weiteren Vereinsordnungen an.",
          "3.2 Rechte der Mitglieder: Jedes ordentliche Mitglied hat insbesondere das Recht auf Teilnahme an Mitgliederversammlungen und Stimmrecht (eine Stimme je Mitglied), Wählbarkeit zu Vereinsämtern, Teilnahme an Vereinsveranstaltungen und Sportaktivitäten, Einsicht in Satzung und Protokolle der Mitgliederversammlung sowie Information über die Verwendung der Vereinsmittel.",
          "3.3 Pflichten der Mitglieder: Jedes Mitglied ist insbesondere verpflichtet, die Satzung und diese NB einzuhalten, den Mitgliedsbeitrag fristgerecht zu zahlen, Änderungen der Kontakt- oder Bankdaten unverzüglich mitzuteilen, die Interessen des Vereins zu fördern und nicht gegen dessen Zweck zu handeln sowie Beschlüsse der Mitgliederversammlung zu befolgen.",
          "3.4 Mitgliedsbeiträge: Die Höhe der Mitgliedsbeiträge wird von der Mitgliederversammlung festgelegt und auf der Website veröffentlicht. Beiträge werden je Kalenderjahr erhoben und können jährlich oder monatlich gezahlt werden. Ehren- und Vorstandsmitglieder zahlen freiwillige Beiträge.",
          "3.5 Beendigung der Mitgliedschaft: Die Mitgliedschaft endet durch schriftlichen Austritt gegenüber dem Vorstand (wirksam zum Kalenderjahresende, Kündigungsfrist: 3 Monate vor dem 31. Dezember), durch Ausschluss bei einstimmigem Vorstandsbeschluss im Falle schwerwiegender Verletzung der Vereinsinteressen oder bei Beitragsrückstand von mindestens 2 Jahren, durch Tod des Mitglieds (natürliche Personen) bzw. Auflösung (juristische Personen), oder durch Auflösung des Vereins. Ein ausgeschlossenes Mitglied kann innerhalb eines Monats schriftlich Berufung bei der Mitgliederversammlung einlegen.",
        ],
      },
      {
        titre: "4. Spenden",
        absaetze: [
          "Spenden an den Verein erfolgen freiwillig und ohne Anspruch auf eine Gegenleistung. Sie werden ausschließlich für die satzungsmäßigen Zwecke des Vereins verwendet: Unterstützung von Club Africain (Tunis, Tunesien), insbesondere durch Anschaffung von Sportausrüstung, Organisation von Sportaktivitäten für Vereinsmitglieder, Instandhaltung von Sportanlagen.",
          "Der Verein ist als gemeinnützig anerkannt. Zuwendungsbestätigungen werden gemäß § 10b EStG und § 50 EStDV für steuerlich absetzbare Spenden ausgestellt. Für Spenden bis 300 € genügt als vereinfachter Nachweis ein Kontoauszug zusammen mit einer Kopie des Freistellungsbescheids. Eine Zweckbindung einzelner Spenden ist auf ausdrücklichen schriftlichen Wunsch des Spenders möglich, sofern der Verwendungszweck mit dem satzungsmäßigen Vereinszweck vereinbar ist.",
        ],
      },
      {
        titre: "5. Zahlungsabwicklung und Datenschutz",
        absaetze: [
          "Zahlungen über die Website werden über lizenzierte Zahlungsdienstleister abgewickelt. Der Verein speichert keine vollständigen Zahlungsdaten direkt. Es gelten ergänzend die Bedingungen des jeweiligen Zahlungsdienstleisters. Vereinsinterne Zahlungsanweisungen bedürfen der Unterschrift des Schatzmeisters und eines weiteren Vorstandsmitglieds (§ 5 Abs. 4 der Satzung). Der Schatzmeister führt Buch über alle Einnahmen und Ausgaben.",
          "Zahlungsdaten werden gemäß unserer Datenschutzerklärung (www.my-cid.de/datenschutz) und den Vorgaben der DSGVO verarbeitet.",
        ],
      },
      {
        titre: "6. Nutzung der Website",
        absaetze: [
          "6.1 Erlaubte Nutzung: Die Website www.my-cid.de darf nur für rechtmäßige Zwecke und im Einklang mit diesen NB genutzt werden.",
          "6.2 Untersagte Nutzung: Ausdrücklich untersagt sind: die Verbreitung rechtswidriger, verleumderischer oder beleidigender Inhalte; automatisierte Abfragen (Scraping, Crawling, Bots) ohne vorherige schriftliche Zustimmung; jede Handlung, die den technischen Betrieb der Website beeinträchtigt oder stört (z. B. DoS-Angriffe); das Umgehen von Sicherheitsmaßnahmen oder unbefugter Zugriff auf Vereinssysteme; die Nutzung der Website zu kommerziellen Werbezwecken; sowie Identitätsvortäuschung oder Angabe falscher Informationen.",
          "6.3 Geistiges Eigentum: Alle Inhalte der Website — einschließlich Texte, Bilder, Grafiken, Logos und deren Anordnung — sind urheberrechtlich geschützt. Jede nicht ausdrücklich gestattete Nutzung ist untersagt. Ausnahmen gelten für die private, nicht kommerzielle Nutzung zu Informationszwecken. Für Nutzungsanfragen wenden Sie sich bitte an: " + EMAIL,
          "6.4 Verfügbarkeit der Website: Der Verein bemüht sich um einen möglichst unterbrechungsfreien Betrieb der Website. Ein Anspruch auf ununterbrochene Verfügbarkeit besteht jedoch nicht. Wartungsarbeiten, technische Störungen oder höhere Gewalt können zu vorübergehenden Einschränkungen führen.",
        ],
      },
      {
        titre: "7. Haftung",
        absaetze: [
          "7.1 Allgemeine Haftungsbeschränkung: Der Verein haftet nach den allgemeinen gesetzlichen Bestimmungen. Als gemeinnütziger Verein gilt ergänzend: Vorstandsmitglieder haften gegenüber Mitgliedern und dem Verein nur bei Vorsatz oder grober Fahrlässigkeit (§ 31a BGB); ehrenamtlich tätige Mitglieder und unentgeltlich tätige Vereinsmitglieder haften gegenüber dem Verein und Dritten nur bei Vorsatz oder grober Fahrlässigkeit (§ 31b BGB).",
          "7.2 Haftung für Website-Inhalte: Der Verein übernimmt keine Gewähr für die Richtigkeit und Vollständigkeit der auf der Website bereitgestellten Informationen. Die Inhalte dienen ausschließlich der allgemeinen Information.",
          "7.3 Haftungsausschluss für externe Links: Der Verein übernimmt keine Haftung für Inhalte verlinkter externer Websites. Die Verantwortung liegt allein beim jeweiligen Anbieter der verlinkten Seite.",
        ],
      },
      {
        titre: "8. Datenschutz",
        absaetze: [
          "Personenbezogene Daten, die im Zusammenhang mit der Vereinsmitgliedschaft, der Spendenabwicklung und der Websitenutzung verarbeitet werden, werden gemäß unserer Datenschutzerklärung (www.my-cid.de/datenschutz) behandelt. Verantwortlicher im Sinne der DSGVO ist der Vorstand von Clubistes in Deutschland e.V. (" + EMAIL + "). Mitglieder stimmen der Verarbeitung ihrer Daten gemäß Satzung und geltendem Recht zu.",
        ],
      },
      {
        titre: "9. Kommunikation und Mitteilungen",
        absaetze: [
          "Offizielle Mitteilungen des Vereins erfolgen per E-Mail an die zuletzt bekannte E-Mail-Adresse oder per Post an die zuletzt bekannte Postanschrift. Mitglieder sind verpflichtet, Änderungen ihrer Kontaktdaten unverzüglich mitzuteilen. Mitglieder ohne E-Mail-Adresse können alle Mitteilungen per Post erhalten.",
        ],
      },
      {
        titre: "10. Änderungen dieser Nutzungsbedingungen",
        absaetze: [
          "Der Verein behält sich vor, diese NB jederzeit zu ändern. Mitglieder werden über Änderungen mindestens 4 Wochen vor deren Inkrafttreten per E-Mail oder Post informiert. Widerspricht ein Mitglied der Änderung nicht innerhalb von 4 Wochen nach Erhalt der Mitteilung, gilt die Änderung als angenommen. Die jeweils aktuelle Fassung der NB ist stets auf www.my-cid.de abrufbar.",
        ],
      },
      {
        titre: "11. Schlussbestimmungen",
        absaetze: [
          "Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts (CISG). Gerichtsstand für alle Streitigkeiten aus oder im Zusammenhang mit diesen NB ist Berlin (vgl. § 14 der Satzung). Sollte eine Bestimmung dieser NB ganz oder teilweise unwirksam sein oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt; an die Stelle der unwirksamen Bestimmung tritt die entsprechende gesetzliche Regelung. Maßgeblich ist die deutsche Fassung dieser NB; die französische Fassung dient nur der Information.",
          `Kontakt: ${EMAIL}`,
        ],
      },
    ],
  },
  fr: {
    titre: "Conditions d'utilisation",
    untertitel: "Clubistes in Deutschland e.V. | www.my-cid.de",
    stand: "Dernière mise à jour : mars 2025",
    sections: [
      {
        titre: "1. Champ d'application, cocontractant et définitions",
        absaetze: [
          "Les présentes conditions d'utilisation (« CU ») régissent l'utilisation du site www.my-cid.de ainsi que l'ensemble des relations juridiques entre l'association Clubistes in Deutschland e.V. (« l'Association ») d'une part, et les visiteurs du site, membres et donateurs (« Utilisateurs ») d'autre part.",
        ],
        liste: [
          "Nom de l'association : Clubistes in Deutschland e.V.",
          `Adresse : ${ADRESSE}`,
          `Registre : ${REGISTRE}`,
          `E-mail : ${EMAIL}`,
          "Statut : reconnue d'intérêt général selon § 52 AO",
        ],
      },
      {
        titre: "",
        absaetze: [
          "En utilisant le site ou en demandant son adhésion, l'Utilisateur accepte les présentes CU dans leur version en vigueur. Pour les consommateurs au sens du § 13 BGB, les dispositions impératives de protection des consommateurs priment en cas de divergence avec ces CU.",
        ],
      },
      {
        titre: "2. Objet et services",
        absaetze: [
          "Clubistes in Deutschland e.V. est une association enregistrée d'intérêt général dont l'objet statutaire est la promotion du sport, en particulier des sports collectifs (§ 52 al. 2 n° 21 AO). L'association n'exerce pas d'activité à but lucratif.",
          "Via le site www.my-cid.de, l'association propose les services suivants :",
        ],
        liste: [
          "Informations sur l'association, ses statuts, ses activités et les causes soutenues",
          "Possibilité de demander l'adhésion à l'association",
          "Paiement en ligne des cotisations",
          "Traitement des dons en soutien aux objectifs de l'association",
          "Informations sur les événements et activités sportives",
          "Contact avec le bureau",
        ],
      },
      {
        titre: "",
        absaetze: ["L'association se réserve le droit de modifier, étendre ou interrompre ses services à tout moment, dans la mesure justifiée par son objet statutaire."],
      },
      {
        titre: "3. Adhésion",
        absaetze: [
          "3.1 Admission : toute personne physique ou morale peut devenir membre de l'association. L'admission suppose le dépôt d'une demande d'adhésion écrite (par courrier ou e-mail), une décision du bureau sur l'admission, et une notification écrite de la décision au candidat. Il n'existe aucun droit à l'admission ; le bureau peut rejeter une demande sans motivation. En cas d'acceptation, le membre reconnaît les statuts, les présentes CU et l'ensemble des règlements de l'association.",
          "3.2 Droits des membres : chaque membre ordinaire a notamment le droit de participer aux assemblées générales et de voter (une voix par membre), d'être éligible aux fonctions associatives, de participer aux événements et activités sportives, de consulter les statuts et les procès-verbaux d'assemblée générale, et d'être informé de l'utilisation des fonds de l'association.",
          "3.3 Obligations des membres : chaque membre est notamment tenu de respecter les statuts et les présentes CU, de payer la cotisation dans les délais, de signaler sans délai tout changement de coordonnées ou de compte bancaire, de promouvoir les intérêts de l'association sans agir contre son objet, et de se conformer aux décisions de l'assemblée générale.",
          "3.4 Cotisations : le montant des cotisations est fixé par l'assemblée générale et publié sur le site. Les cotisations sont dues par année civile et peuvent être payées annuellement ou mensuellement. Les membres d'honneur et du bureau versent des cotisations volontaires.",
          "3.5 Fin de l'adhésion : l'adhésion prend fin par démission écrite adressée au bureau (effective à la fin de l'année civile, préavis de 3 mois avant le 31 décembre), par exclusion sur décision unanime du bureau en cas de violation grave des intérêts de l'association ou d'arriérés de cotisation d'au moins 2 ans, par décès du membre (personne physique) ou dissolution (personne morale), ou par dissolution de l'association. Un membre exclu peut faire appel par écrit auprès de l'assemblée générale dans un délai d'un mois.",
        ],
      },
      {
        titre: "4. Dons",
        absaetze: [
          "Les dons à l'association sont volontaires et effectués sans contrepartie. Ils sont utilisés exclusivement pour les buts statutaires de l'association : soutien au Club Africain (Tunis, Tunisie), notamment par l'achat d'équipements sportifs ; organisation d'activités sportives pour les membres ; entretien d'infrastructures sportives.",
          "L'association est reconnue d'intérêt général. Des reçus fiscaux sont délivrés conformément aux § 10b EStG et § 50 EStDV pour les dons déductibles. Pour les dons jusqu'à 300 €, un relevé bancaire accompagné d'une copie de l'attestation d'exonération suffit comme justificatif simplifié. Une affectation d'un don particulier est possible sur demande écrite expresse du donateur, dans la mesure où l'objet désigné est compatible avec l'objet statutaire de l'association.",
        ],
      },
      {
        titre: "5. Traitement des paiements et protection des données",
        absaetze: [
          "Les paiements effectués via le site sont traités par des prestataires de paiement agréés. L'association ne conserve pas directement les données de paiement complètes. Les conditions du prestataire de paiement concerné s'appliquent en complément. Les ordres de paiement internes requièrent la signature du trésorier et d'un autre membre du bureau (§ 5 al. 4 des statuts). Le trésorier tient la comptabilité de toutes les recettes et dépenses.",
          "Les données de paiement sont traitées conformément à notre politique de confidentialité (www.my-cid.de/datenschutz) et aux dispositions du RGPD.",
        ],
      },
      {
        titre: "6. Utilisation du site",
        absaetze: [
          "6.1 Utilisation autorisée : le site www.my-cid.de ne peut être utilisé qu'à des fins licites et conformément aux présentes CU.",
          "6.2 Utilisation interdite : sont expressément interdits : la diffusion de contenus illicites, diffamatoires ou injurieux ; les requêtes automatisées (scraping, crawling, robots) sans autorisation écrite préalable ; toute action portant atteinte ou perturbant le fonctionnement technique du site (par ex. attaques par déni de service) ; le contournement de mesures de sécurité ou l'accès non autorisé aux systèmes de l'association ; l'utilisation du site à des fins publicitaires commerciales ; ainsi que l'usurpation d'identité ou la communication de fausses informations.",
          `6.3 Propriété intellectuelle : l'ensemble des contenus du site — textes, images, graphismes, logos et leur agencement — est protégé par le droit d'auteur. Toute utilisation non expressément autorisée est interdite. Des exceptions s'appliquent à l'usage privé et non commercial à des fins d'information. Pour toute demande d'utilisation, veuillez contacter : ${EMAIL}`,
          "6.4 Disponibilité du site : l'association s'efforce d'assurer un fonctionnement du site aussi ininterrompu que possible. Il n'existe toutefois aucun droit à une disponibilité continue. Des travaux de maintenance, des incidents techniques ou un cas de force majeure peuvent entraîner des limitations temporaires.",
        ],
      },
      {
        titre: "7. Responsabilité",
        absaetze: [
          "7.1 Limitation générale de responsabilité : l'association répond conformément aux dispositions légales générales. En tant qu'association d'intérêt général, s'applique en outre : les membres du bureau ne sont responsables envers les membres et l'association qu'en cas de dol ou de négligence grave (§ 31a BGB) ; les bénévoles et membres agissant à titre gratuit ne sont responsables envers l'association et les tiers qu'en cas de dol ou de négligence grave (§ 31b BGB).",
          "7.2 Responsabilité relative au contenu du site : l'association ne garantit pas l'exactitude et l'exhaustivité des informations fournies sur le site. Le contenu sert uniquement à des fins d'information générale.",
          "7.3 Exclusion de responsabilité pour les liens externes : l'association décline toute responsabilité quant au contenu des sites externes liés. La responsabilité incombe exclusivement au fournisseur respectif de la page liée.",
        ],
      },
      {
        titre: "8. Protection des données",
        absaetze: [
          `Les données à caractère personnel traitées dans le cadre de l'adhésion, du traitement des dons et de l'utilisation du site sont traitées conformément à notre politique de confidentialité, disponible sur www.my-cid.de/datenschutz. Le responsable du traitement au sens du RGPD est le bureau de Clubistes in Deutschland e.V. (${EMAIL}). Les membres consentent au traitement de leurs données conformément aux statuts et au droit applicable.`,
        ],
      },
      {
        titre: "9. Communication et notifications",
        absaetze: [
          "Les communications officielles de l'association sont envoyées par e-mail à la dernière adresse connue ou par courrier postal à la dernière adresse connue. Les membres sont tenus de signaler sans délai tout changement de coordonnées. Les membres sans adresse e-mail peuvent recevoir toutes les communications par courrier postal.",
        ],
      },
      {
        titre: "10. Modification des présentes conditions",
        absaetze: [
          "L'association se réserve le droit de modifier ces CU à tout moment. Les membres seront informés des modifications au moins 4 semaines avant leur entrée en vigueur, par e-mail ou par courrier. Si un membre ne s'oppose pas à la modification dans un délai de 4 semaines après réception de la notification, la modification est réputée acceptée. La version en vigueur des CU est toujours disponible sur www.my-cid.de.",
        ],
      },
      {
        titre: "11. Dispositions finales",
        absaetze: [
          "Le droit allemand s'applique, à l'exclusion de la Convention de Vienne sur la vente internationale de marchandises (CISG). Le tribunal compétent pour tout litige relatif aux présentes CU est celui de Berlin (cf. § 14 des statuts). Si une disposition des présentes CU est ou devient totalement ou partiellement invalide, la validité des autres dispositions n'en est pas affectée ; la disposition invalide est remplacée par la règle légale applicable. La version allemande de ces CU fait foi ; la version française est fournie à titre informatif uniquement.",
          `Contact : ${EMAIL}`,
        ],
      },
    ],
  },
};

export const ERSTATTUNG: ContenuBilingue = {
  de: {
    titre: "Erstattungsrichtlinie",
    untertitel: "Clubistes in Deutschland e.V.",
    stand: "Stand: März 2025",
    sections: [
      {
        titre: "",
        absaetze: [
          "Diese Richtlinie erläutert, unter welchen Voraussetzungen Mitgliedsbeiträge oder Spenden erstattet werden können und wie eine Erstattung beantragt wird.",
        ],
      },
      {
        titre: "1. Geltungsbereich",
        absaetze: ["Diese Richtlinie gilt für alle über www.my-cid.de oder auf anderem Weg (Überweisung, Lastschrift) geleisteten Zahlungen an den Verein, insbesondere:"],
        liste: ["Jährliche Mitgliedsbeiträge", "Monatliche Mitgliedsbeiträge", "Einmalige oder wiederkehrende freiwillige Spenden", "Sonstige Zuwendungen an den Verein"],
      },
      {
        titre: "2. Mitgliedsbeiträge",
        absaetze: [
          "2.1 Grundsatz: Mitgliedsbeiträge werden gemäß § 5 der Satzung je Kalenderjahr erhoben. Mit Zahlung des Mitgliedsbeitrags bestätigt das Mitglied seine Mitgliedschaft und die Anerkennung der Satzung sowie dieser Richtlinie.",
          "2.2 Jahresbeiträge: Bereits gezahlte Jahresbeiträge werden grundsätzlich nicht erstattet, da dem Verein durch die Mitgliedschaft laufende Verpflichtungen und Kosten entstehen. Ausnahmen bestehen nur in den in Abschnitt 2.4 genannten Fällen.",
          "2.3 Monatliche Beiträge: Bei monatlicher Zahlungsweise gilt: bereits gezahlte Beiträge für den laufenden Monat werden nicht erstattet; irrtümlich nach dem Austritts-/Kündigungsdatum eingezogene Beiträge werden vollständig erstattet; doppelt eingezogene Zahlungen werden vollständig erstattet.",
        ],
      },
      {
        titre: "2.4 Ausnahme- und Kulanzerstattungen",
        absaetze: ["In folgenden Fällen kann auf schriftlichen Antrag eine vollständige oder teilweise Erstattung von Mitgliedsbeiträgen gewährt werden:"],
        liste: [
          "Nachgewiesener technischer Fehler bei der Zahlungsabwicklung (z. B. Doppelbelastung)",
          "Irrtümliche Zahlung aufgrund einer Verwechslung (vom Antragsteller glaubhaft zu machen)",
          "Schwerwiegende persönliche Härte des Mitglieds (auf Antrag, nach billigem Ermessen des Vorstands)",
          "Auflösung des Vereins während des laufenden Mitgliedsjahres (anteilige Erstattung)",
          "Ablehnung eines Mitgliedsantrags durch den Vorstand (vollständige Erstattung)",
        ],
        // Folgeabsatz siehe unten.
      },
      {
        titre: "",
        absaetze: [
          "Der Vorstand entscheidet über Kulanzerstattungen nach billigem Ermessen und unter Berücksichtigung der Vereinsinteressen. Die Entscheidung ist endgültig.",
        ],
      },
      {
        titre: "3. Spenden",
        absaetze: [
          "3.1 Grundsatz der Unwiderruflichkeit: Spenden sind freiwillige, unentgeltliche Zuwendungen ohne Anspruch auf Gegenleistung. Nach zivilrechtlichen Grundsätzen (§ 516 BGB) und dem Gemeinnützigkeitsrecht sind Spenden grundsätzlich nicht erstattungsfähig. Dies gilt insbesondere, wenn die Spende bereits zweckentsprechend verwendet wurde, eine Zuwendungsbestätigung ausgestellt wurde, oder die Spende im Rahmen einer öffentlich angekündigten Kampagne erfolgt ist.",
        ],
      },
      {
        titre: "3.2 Ausnahmen für Spenden",
        absaetze: ["Ausnahmsweise kann eine Spendenerstattung gewährt werden bei:"],
        liste: [
          "Nachgewiesenem technischem Fehler bei der Zahlungsabwicklung (z. B. versehentliche Mehrfachzahlung)",
          "Unautorisierter Belastung (z. B. Identitätsdiebstahl, Betrug)",
          "Eindeutig irrtümlicher Zahlung (z. B. falsche IBAN, versehentlich ausgelöste Transaktion)",
        ],
      },
      {
        titre: "",
        absaetze: [
          `In diesen Fällen muss der Erstattungsantrag innerhalb von 30 Tagen nach dem Zahlungsdatum schriftlich eingereicht werden (per E-Mail an ${EMAIL}).`,
        ],
      },
      {
        titre: "3.3 Steuerliche Auswirkungen",
        absaetze: [
          "Wird eine Spende erstattet, für die bereits eine Zuwendungsbestätigung ausgestellt wurde, ist das Mitglied/der Spender verpflichtet, die Bestätigung unverzüglich an den Verein zurückzugeben. Zuwendungsbestätigungen werden im Erstattungsfall ungültig. Bitte bewahren Sie Ihre Zahlungsnachweise sorgfältig auf. Für steuerliche Fragen zur Abzugsfähigkeit von Spenden wenden Sie sich bitte an einen Steuerberater.",
        ],
      },
      {
        titre: "4. Ablauf des Erstattungsantrags",
        absaetze: [
          `Für einen Erstattungsantrag senden Sie bitte eine E-Mail an ${EMAIL} mit folgenden vollständigen Angaben:`,
        ],
        liste: [
          "Vollständiger Name und Mitgliedsnummer (falls vorhanden)",
          "Zahlungsdatum und gezahlter Betrag",
          "Zahlungsreferenz oder Transaktionsnummer (aus dem Kontoauszug)",
          "Verwendete Zahlungsmethode (Lastschrift, Überweisung, Online-Zahlung)",
          "Ausführliche Begründung des Erstattungsantrags",
          "Bankverbindung für die Rückerstattung (IBAN, BIC, Kontoinhaber)",
          "Ggf. Nachweise (Kontoauszug, Screenshot)",
        ],
      },
      {
        titre: "",
        absaetze: ["Bearbeitungszeiten:"],
        liste: [
          "Eingangsbestätigung des Antrags: innerhalb von 3 Werktagen",
          "Prüfung und Entscheidung durch den Vorstand: innerhalb von 14 Werktagen",
          "Auszahlung genehmigter Erstattungen: innerhalb von 7 Werktagen nach Genehmigung",
        ],
      },
      {
        titre: "5. Rückbuchungen (Chargebacks)",
        absaetze: [
          "Wir bitten Sie, uns im Streitfall direkt zu kontaktieren, bevor Sie eine Rückbuchung über Ihre Bank oder Ihren Zahlungsdienstleister veranlassen. Dies ermöglicht eine schnellere und kostengünstigere Klärung.",
          "Im Falle einer unberechtigten Rückbuchung behält sich der Verein vor, die Mitgliedschaft mit sofortiger Wirkung zu beenden, entstandene Bankgebühren und Verwaltungskosten geltend zu machen sowie rechtliche Schritte einzuleiten.",
        ],
      },
      {
        titre: "6. Kontakt und Zuständigkeit",
        absaetze: ["Für alle Fragen zu Erstattungen und Rückzahlungen wenden Sie sich bitte an:"],
        liste: [`E-Mail: ${EMAIL}`, `Postanschrift: ${ADRESSE}`, "Zuständig: Vorstand von Clubistes in Deutschland e.V."],
      },
      {
        titre: "7. Änderungen dieser Richtlinie",
        absaetze: [
          "Diese Richtlinie kann jederzeit durch Vorstandsbeschluss geändert werden. Mitglieder werden über wesentliche Änderungen per E-Mail informiert. Die jeweils aktuelle Fassung ist stets auf www.my-cid.de abrufbar.",
        ],
      },
    ],
  },
  fr: {
    titre: "Politique de remboursement",
    untertitel: "Clubistes in Deutschland e.V.",
    stand: "Dernière mise à jour : mars 2025",
    sections: [
      {
        titre: "",
        absaetze: [
          "Cette politique explique clairement dans quelles circonstances les cotisations ou les dons peuvent être remboursés et comment formuler une demande de remboursement.",
        ],
      },
      {
        titre: "1. Champ d'application",
        absaetze: ["Cette politique s'applique à tous les paiements effectués via www.my-cid.de ou par un autre moyen (virement, prélèvement) à l'association, notamment :"],
        liste: ["Les cotisations annuelles", "Les cotisations mensuelles", "Les dons ponctuels ou récurrents", "Les autres contributions à l'association"],
      },
      {
        titre: "2. Cotisations",
        absaetze: [
          "2.1 Principe général : les cotisations sont perçues par année civile conformément au § 5 des statuts. En payant sa cotisation, le membre confirme son adhésion et son acceptation des statuts ainsi que de la présente politique.",
          "2.2 Cotisations annuelles : les cotisations annuelles déjà payées ne sont en principe pas remboursées, l'association assumant des obligations et des coûts continus liés à l'adhésion. Des exceptions n'existent que dans les cas prévus à la section 2.4.",
          "2.3 Cotisations mensuelles : pour les paiements mensuels : les cotisations déjà payées pour le mois en cours ne sont pas remboursables ; les cotisations prélevées par erreur après la date de démission ou de résiliation seront intégralement remboursées ; les doubles paiements seront intégralement remboursés.",
        ],
      },
      {
        titre: "2.4 Remboursements exceptionnels et de courtoisie",
        absaetze: ["Dans les cas suivants, un remboursement total ou partiel des cotisations peut être accordé sur demande écrite :"],
        liste: [
          "Erreur technique avérée dans le traitement du paiement (par ex. double prélèvement)",
          "Paiement erroné dû à une confusion (à démontrer par le demandeur)",
          "Difficultés personnelles graves du membre (sur demande, à l'appréciation équitable du bureau)",
          "Dissolution de l'association en cours d'année d'adhésion (remboursement au prorata)",
          "Rejet d'une demande d'adhésion par le bureau (remboursement intégral)",
        ],
      },
      {
        titre: "",
        absaetze: [
          "Le bureau décide des remboursements de courtoisie à sa discrétion équitable et en tenant compte des intérêts de l'association. Sa décision est définitive.",
        ],
      },
      {
        titre: "3. Dons",
        absaetze: [
          "3.1 Principe d'irrévocabilité : les dons sont des contributions volontaires et gratuites, effectuées sans contrepartie. Selon les principes du droit civil (§ 516 BGB) et du droit de l'intérêt général, les dons ne sont en principe pas remboursables. Cela vaut en particulier lorsque le don a déjà été utilisé conformément à son objet, qu'un reçu fiscal a été délivré, ou que le don a été effectué dans le cadre d'une campagne publiquement annoncée.",
        ],
      },
      {
        titre: "3.2 Exceptions pour les dons",
        absaetze: ["À titre exceptionnel, un remboursement de don peut être accordé en cas de :"],
        liste: [
          "Erreur technique avérée dans le traitement du paiement (par ex. paiement multiple accidentel)",
          "Prélèvement non autorisé (par ex. usurpation d'identité, fraude)",
          "Paiement manifestement erroné (par ex. IBAN incorrect, transaction déclenchée par erreur)",
        ],
      },
      {
        titre: "",
        absaetze: [
          `Dans ces cas, la demande de remboursement doit être soumise par écrit dans un délai de 30 jours suivant la date du paiement (par e-mail à ${EMAIL}).`,
        ],
      },
      {
        titre: "3.3 Conséquences fiscales",
        absaetze: [
          "Si un don pour lequel un reçu fiscal a déjà été délivré est remboursé, le membre/donateur est tenu de restituer sans délai ce reçu à l'association. Les reçus fiscaux deviennent invalides en cas de remboursement. Veuillez conserver soigneusement vos justificatifs de paiement. Pour toute question fiscale relative à la déductibilité des dons, veuillez consulter un conseiller fiscal.",
        ],
      },
      {
        titre: "4. Procédure de demande de remboursement",
        absaetze: [`Pour demander un remboursement, veuillez envoyer un e-mail à ${EMAIL} avec les informations complètes suivantes :`],
        liste: [
          "Nom complet et numéro de membre (le cas échéant)",
          "Date du paiement et montant payé",
          "Référence de paiement ou numéro de transaction (figurant sur votre relevé bancaire)",
          "Mode de paiement utilisé (prélèvement, virement, paiement en ligne)",
          "Motif détaillé de la demande de remboursement",
          "Coordonnées bancaires pour le remboursement (IBAN, BIC, titulaire du compte)",
          "Justificatifs le cas échéant (relevé bancaire, capture d'écran)",
        ],
      },
      {
        titre: "",
        absaetze: ["Délais de traitement :"],
        liste: [
          "Accusé de réception de la demande : sous 3 jours ouvrés",
          "Examen et décision du bureau : sous 14 jours ouvrés",
          "Versement des remboursements approuvés : sous 7 jours ouvrés après approbation",
        ],
      },
      {
        titre: "5. Rétrofacturations (chargebacks)",
        absaetze: [
          "En cas de litige, nous vous demandons de nous contacter directement avant d'engager une rétrofacturation auprès de votre banque ou prestataire de paiement. Cela permet une résolution plus rapide et moins coûteuse.",
          "En cas de rétrofacturation injustifiée, l'association se réserve le droit de mettre fin à l'adhésion avec effet immédiat, de réclamer les frais bancaires et administratifs engagés, et d'engager des poursuites judiciaires.",
        ],
      },
      {
        titre: "6. Contact et responsabilité",
        absaetze: ["Pour toute question relative aux remboursements, veuillez contacter :"],
        liste: [`E-mail : ${EMAIL}`, `Adresse postale : ${ADRESSE}`, "Responsable : Bureau de Clubistes in Deutschland e.V."],
      },
      {
        titre: "7. Modifications de cette politique",
        absaetze: [
          "Cette politique peut être modifiée à tout moment par décision du bureau. Les membres seront informés des modifications substantielles par e-mail. La version en vigueur est toujours disponible sur www.my-cid.de.",
        ],
      },
    ],
  },
};
