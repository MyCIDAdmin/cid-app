# flake8: noqa: E501
"""Mustertexte der Bekanntmachungen (erfundene Beispiele, vom Ausschuss frei änderbar) und die
Platzhalter {Wahl}, {Datum}, {Frist}, die beim Versand ersetzt werden."""

SCHLUESSEL = ("ankuendigung", "aufruf", "zugelassen", "wahlbeginn", "ergebnis")

# Kanäle je Bekanntmachung: mail, app, print (Aushang als PDF)
KANAELE = {
    "ankuendigung": ["mail", "app", "print"],
    "aufruf": ["mail", "app"],
    "zugelassen": ["mail", "app", "print"],
    "wahlbeginn": ["mail", "app"],
    "ergebnis": ["mail", "app", "print"],
}

MUSTER = {
    "ankuendigung": {
        "de": (
            "Die {Wahl} findet statt",
            "<p>Liebe Mitglieder,</p><p>im Januar wählen wir den neuen Vorstand. Abgestimmt wird online bis zum <b>{Datum}</b>. Alle Informationen gibt es in der App unter „Abstimmungen &amp; Wahlen“.</p><p>Die Wahlordnung ist dort in allen Sprachen abrufbar. Verbindlich ist die deutsche Fassung.</p>",
        ),
        "fr": (
            "L’élection « {Wahl} » aura lieu",
            "<p>Chers membres,</p><p>Nous élisons le nouveau comité en janvier. Le vote se fait en ligne jusqu’au <b>{Datum}</b>. Toutes les informations se trouvent dans l’application, sous « Votes et élections ».</p><p>Le règlement électoral y est disponible dans toutes les langues. La version allemande fait foi.</p>",
        ),
        "ar": (
            "ستُجرى انتخابات «{Wahl}»",
            "<p>أعزاءنا الأعضاء،</p><p>ننتخب اللجنة الجديدة في شهر يناير. يتم التصويت عبر الإنترنت حتى <b>{Datum}</b>. تجدون كل المعلومات في التطبيق ضمن «التصويت والانتخابات».</p><p>لائحة الانتخابات متاحة هناك بجميع اللغات. النسخة الألمانية هي المعتمدة.</p>",
        ),
    },
    "aufruf": {
        "de": (
            "Aufruf zur Kandidatur: {Wahl}",
            "<p>Liebe Mitglieder,</p><p>ab sofort können Listen für die {Wahl} angemeldet werden. Die Unterlagen müssen bis zum <b>{Frist}</b> eingereicht sein.</p><ul><li>Liste in der App anmelden</li><li>Unterstützungsunterschriften sammeln</li><li>Nachweise hochladen</li></ul>",
        ),
        "fr": (
            "Appel aux candidatures : {Wahl}",
            "<p>Chers membres,</p><p>Les listes pour « {Wahl} » peuvent être déposées dès maintenant. Les documents doivent être remis avant le <b>{Frist}</b>.</p><ul><li>Déposer la liste dans l’application</li><li>Recueillir les signatures de soutien</li><li>Téléverser les justificatifs</li></ul>",
        ),
        "ar": (
            "دعوة إلى الترشح: {Wahl}",
            "<p>أعزاءنا الأعضاء،</p><p>يمكن من الآن تقديم القوائم لانتخابات «{Wahl}». يجب تسليم الوثائق قبل <b>{Frist}</b>.</p><ul><li>تسجيل القائمة في التطبيق</li><li>جمع تواقيع التزكية</li><li>رفع المستندات</li></ul>",
        ),
    },
    "zugelassen": {
        "de": (
            "Zugelassene Listen für die {Wahl}",
            "<p>Liebe Mitglieder,</p><p>der Wahlausschuss hat die Prüfung abgeschlossen. Die zugelassenen Listen stehen jetzt in der App. Gegen die Entscheidung ist fünf Tage lang ein Einspruch möglich.</p>",
        ),
        "fr": (
            "Listes admises pour « {Wahl} »",
            "<p>Chers membres,</p><p>La commission électorale a terminé la vérification. Les listes admises sont maintenant dans l’application. Un recours est possible pendant cinq jours.</p>",
        ),
        "ar": (
            "القوائم المقبولة لانتخابات «{Wahl}»",
            "<p>أعزاءنا الأعضاء،</p><p>أنهت لجنة الانتخابات التدقيق. القوائم المقبولة متاحة الآن في التطبيق. يمكن الطعن في القرار خلال خمسة أيام.</p>",
        ),
    },
    "wahlbeginn": {
        "de": (
            "Die Wahl beginnt",
            "<p>Liebe Mitglieder,</p><p>die Stimmabgabe für die {Wahl} hat begonnen. Abgestimmt wird online bis zum <b>{Datum}</b>. Die Wahl ist geheim, jede Stimme zählt.</p>",
        ),
        "fr": (
            "Le vote commence",
            "<p>Chers membres,</p><p>Le vote pour « {Wahl} » a commencé. Il se fait en ligne jusqu’au <b>{Datum}</b>. Le scrutin est secret, chaque voix compte.</p>",
        ),
        "ar": (
            "بدأ التصويت",
            "<p>أعزاءنا الأعضاء،</p><p>بدأ التصويت في انتخابات «{Wahl}». يتم التصويت عبر الإنترنت حتى <b>{Datum}</b>. الاقتراع سري وكل صوت له قيمته.</p>",
        ),
    },
    "ergebnis": {
        "de": (
            "Ergebnis der {Wahl}",
            "<p>Liebe Mitglieder,</p><p>das Ergebnis der {Wahl} steht fest. Zwei Mitglieder des Wahlausschusses haben es freigegeben, es ist jetzt in der App veröffentlicht. Herzlichen Dank an alle, die mitgemacht haben.</p>",
        ),
        "fr": (
            "Résultat de « {Wahl} »",
            "<p>Chers membres,</p><p>Le résultat de « {Wahl} » est connu. Deux membres de la commission électorale l’ont validé ; il est publié dans l’application. Un grand merci à toutes celles et ceux qui ont participé.</p>",
        ),
        "ar": (
            "نتيجة انتخابات «{Wahl}»",
            "<p>أعزاءنا الأعضاء،</p><p>ظهرت نتيجة انتخابات «{Wahl}». وافق عليها عضوان من لجنة الانتخابات وهي منشورة الآن في التطبيق. شكرًا جزيلًا لكل من شارك.</p>",
        ),
    },
}

# Eingefügte Mustertexte sprechen von „Vorstand“ und „Januar“ — der Ausschuss passt sie je Wahl an.
FOOTER = {
    "de": "Verbindlich ist die deutsche Fassung.",
    "fr": "La version allemande fait foi.",
    "ar": "النسخة الألمانية هي المعتمدة.",
}
MT_HINWEIS = {
    "fr": "Traduction automatique, non contraignante",
    "ar": "ترجمة آلية، غير ملزمة",
}
ABMELDEN = {
    "de": "Abmelden · Einstellungen",
    "fr": "Se désinscrire · Réglages",
    "ar": "إلغاء الاشتراك · الإعدادات",
}
