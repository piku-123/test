// commands/translate.js
const translate = require("google-translate-api-x");

module.exports.config = {
    name: "translate",
    aliases: ["tr", "trans"],
    version: "1.0.0",
    permission: 0,
    author: "Adi.0X",
    description: "Translate text between languages automatically or to a specific language",
    category: "Information & Help",
    usages: "[text] / reply / --lang",
    cooldowns: 3
};

// ── Language map: short code / full name → BCP-47 code ──
const LANG_MAP = {
    // বাংলা
    bn: "bn", bangla: "bn", bengali: "bn", বাংলা: "bn",
    // ইংরেজি
    en: "en", english: "en", ইংলিশ: "en", ইংরেজি: "en",
    // হিন্দি
    hi: "hi", hindi: "hi", হিন্দি: "hi",
    // আরবি
    ar: "ar", arabic: "ar", আরবি: "ar",
    // ফরাসি
    fr: "fr", french: "fr", ফরাসি: "fr",
    // স্প্যানিশ
    es: "es", spanish: "es", স্প্যানিশ: "es",
    // জার্মান
    de: "de", german: "de", জার্মান: "de",
    // জাপানি
    ja: "ja", japanese: "ja", জাপানি: "ja",
    // কোরিয়ান
    ko: "ko", korean: "ko", কোরিয়ান: "ko",
    // চাইনিজ
    zh: "zh-CN", chinese: "zh-CN", চাইনিজ: "zh-CN",
    // রাশিয়ান
    ru: "ru", russian: "ru", রাশিয়ান: "ru",
    // পর্তুগিজ
    pt: "pt", portuguese: "pt",
    // ইতালিয়ান
    it: "it", italian: "it",
    // তুর্কি
    tr: "tr", turkish: "tr",
    // উর্দু
    ur: "ur", urdu: "ur", উর্দু: "ur",
    // মালয়
    ms: "ms", malay: "ms",
    // ইন্দোনেশিয়ান
    id: "id", indonesian: "id",
    // তামিল
    ta: "ta", tamil: "ta",
    // তেলুগু
    te: "te", telugu: "te",
    // ভিয়েতনামিজ
    vi: "vi", vietnamese: "vi",
    // থাই
    th: "th", thai: "th",
    // ফিলিপিনো
    tl: "tl", filipino: "tl", tagalog: "tl",
    // নেপালি
    ne: "ne", nepali: "ne",
    // সিংহলি
    si: "si", sinhala: "si",
    // পাশতো
    ps: "ps", pashto: "ps",
    // পার্সিয়ান
    fa: "fa", persian: "fa", farsi: "fa",
    // সোয়াহিলি
    sw: "sw", swahili: "sw",
    // হিব্রু
    he: "he", hebrew: "he",
    // গ্রিক
    el: "el", greek: "el",
    // ডাচ
    nl: "nl", dutch: "nl",
    // পোলিশ
    pl: "pl", polish: "pl",
    // সুইডিশ
    sv: "sv", swedish: "sv",
    // নরওয়েজিয়ান
    no: "no", norwegian: "no",
    // ডেনিশ
    da: "da", danish: "da",
    // ফিনিশ
    fi: "fi", finnish: "fi",
    // চেক
    cs: "cs", czech: "cs",
    // হাঙ্গেরিয়ান
    hu: "hu", hungarian: "hu",
    // রোমানিয়ান
    ro: "ro", romanian: "ro",
    // বুলগেরিয়ান
    bg: "bg", bulgarian: "bg",
    // ক্রোয়েশিয়ান
    hr: "hr", croatian: "hr",
    // স্লোভাক
    sk: "sk", slovak: "sk",
    // ইউক্রেনিয়ান
    uk: "uk", ukrainian: "uk",
    // কাতালান
    ca: "ca", catalan: "ca",
    // মালায়ালাম
    ml: "ml", malayalam: "ml",
    // কান্নাড়া
    kn: "kn", kannada: "kn",
    // মারাঠি
    mr: "mr", marathi: "mr",
    // গুজরাটি
    gu: "gu", gujarati: "gu",
    // পাঞ্জাবি
    pa: "pa", punjabi: "pa",
    // মায়ানমার
    my: "my", myanmar: "my", burmese: "my",
    // খমের
    km: "km", khmer: "km",
    // লাও
    lo: "lo", lao: "lo",
    // আমহারিক
    am: "am", amharic: "am",
    // ইওরুবা
    yo: "yo", yoruba: "yo",
    // ইগবো
    ig: "ig", igbo: "ig",
    // হাউসা
    ha: "ha", hausa: "ha",
};

// ── Messenger message চরিত্র সীমা ──
const MSG_LIMIT = 2000;

// ── দীর্ঘ text split করে send করার helper ──
async function sendLong(api, text, threadID, messageID) {
    if (text.length <= MSG_LIMIT) {
        return api.sendMessage(text, threadID, messageID);
    }
    const parts = [];
    let current = "";
    for (const line of text.split("\n")) {
        if ((current + "\n" + line).length > MSG_LIMIT) {
            parts.push(current.trim());
            current = line;
        } else {
            current += (current ? "\n" : "") + line;
        }
    }
    if (current.trim()) parts.push(current.trim());

    for (let i = 0; i < parts.length; i++) {
        const prefix = parts.length > 1 ? `[${i + 1}/${parts.length}]\n` : "";
        await api.sendMessage(prefix + parts[i], threadID, i === 0 ? messageID : null);
        if (i < parts.length - 1) await new Promise(r => setTimeout(r, 600));
    }
}

// ── Language name দেখানোর জন্য ──
const LANG_DISPLAY = {
    bn: "Bengali 🇧🇩", en: "English 🇬🇧", hi: "Hindi 🇮🇳",
    ar: "Arabic 🇸🇦", fr: "French 🇫🇷", es: "Spanish 🇪🇸",
    de: "German 🇩🇪", ja: "Japanese 🇯🇵", ko: "Korean 🇰🇷",
    "zh-CN": "Chinese 🇨🇳", ru: "Russian 🇷🇺", pt: "Portuguese 🇵🇹",
    it: "Italian 🇮🇹", tr: "Turkish 🇹🇷", ur: "Urdu 🇵🇰",
    ms: "Malay 🇲🇾", id: "Indonesian 🇮🇩", ta: "Tamil", te: "Telugu",
    vi: "Vietnamese 🇻🇳", th: "Thai 🇹🇭", tl: "Filipino 🇵🇭",
    ne: "Nepali 🇳🇵", fa: "Persian 🇮🇷", he: "Hebrew 🇮🇱",
    el: "Greek 🇬🇷", nl: "Dutch 🇳🇱", pl: "Polish 🇵🇱",
    sv: "Swedish 🇸🇪", uk: "Ukrainian 🇺🇦", my: "Burmese 🇲🇲",
};

function displayLang(code) {
    return LANG_DISPLAY[code] || code.toUpperCase();
}

// ── Auto detect করে target language বের করা ──
function autoTarget(detectedLang) {
    return detectedLang === "bn" ? "en" : "bn";
}

// ── Help message ──
const HELP = `📖 TRANSLATE COMMAND USAGE

1️⃣  Inline text (auto):
   /translate আমি ভালো আছি
   /translate I am fine

2️⃣  Reply to a message (auto):
   Reply করে → /translate

3️⃣  Specific language (inline):
   /translate --hi আমি ভালো আছি
   /translate --hindi I am fine
   /translate --fr Hello world

4️⃣  Specific language (reply):
   Reply করে → /translate --hi
   Reply করে → /translate --japanese

✅ Supported: bn, en, hi, ar, fr, es, de, ja, ko, zh, ru, pt, it, tr, ur, ms, id, ta, vi, th, tl, ne, fa, he, el, nl, pl, sv, uk, my, and more.`;

module.exports.run = async function ({ api, event, args }) {
    const { threadID, messageID, messageReply } = event;

    // Args নেই এবং reply ও নেই → help দেখাও
    if (args.length === 0 && !messageReply) {
        return api.sendMessage(HELP, threadID, messageID);
    }

    // ── Target language parse করা ──
    let targetLang = null; // null = auto
    let textArgs = [...args];

    // --lang বা --language flag চেক
    if (textArgs.length > 0 && textArgs[0].startsWith("--")) {
        const flag = textArgs[0].slice(2).toLowerCase().trim();
        targetLang = LANG_MAP[flag] || null;
        if (!targetLang) {
            return api.sendMessage(
                `❌ Unknown language: "${flag}"\nExample: --hi, --hindi, --fr, --french, --bn`,
                threadID, messageID
            );
        }
        textArgs = textArgs.slice(1); // flag সরিয়ে দাও
    }

    // ── Source text বের করা ──
    let sourceText = "";

    if (messageReply && messageReply.body) {
        // Reply mode — reply এর body নাও
        sourceText = messageReply.body.trim();
        // inline text থাকলে সেটা নাও (reply ignore করো)
        if (textArgs.length > 0) {
            sourceText = textArgs.join(" ").trim();
        }
    } else {
        // Inline mode
        sourceText = textArgs.join(" ").trim();
    }

    if (!sourceText) {
        return api.sendMessage(
            "❌ No text to translate.\n\nReply to a message or provide text:\n/translate আমি ভালো আছি\n/translate --hi Hello",
            threadID, messageID
        );
    }

    // ── Translate করা ──
    try {
        // প্রথমে detect করো
        const detected = await translate(sourceText, { to: "en", autoCorrect: false });
        const fromLang = detected.from?.language?.iso || "auto";

        // target নির্ধারণ
        const to = targetLang || autoTarget(fromLang);

        // যদি source আর target এক হয় তাহলে flip করো
        const finalTo = fromLang === to ? (to === "bn" ? "en" : "bn") : to;

        // Translate
        const result = await translate(sourceText, {
            from: fromLang,
            to: finalTo,
            autoCorrect: false,
        });

        const translated = result.text;

        // ── Output format ──
        const fromDisplay = displayLang(fromLang);
        const toDisplay = displayLang(finalTo);

        const modeLabel = targetLang
            ? `🎯 Target: ${toDisplay}`
            // : `🔄 Auto: ${fromDisplay} → ${toDisplay}`;
            : `${fromDisplay} ➤ ${toDisplay}`;

        const output =
            `${modeLabel}\n` +
            `${"─".repeat(20)}\n` +
       //   `📝 Original:\n${sourceText}\n\n` +
            `${translated}`;

        await sendLong(api, output, threadID, messageID);

    } catch (err) {
        console.error(err);
        return api.sendMessage(
            `❌ Translation failed.\nError: ${err.message}`,
            threadID, messageID
        );
    }
};