const axios = require("axios");
const fs = require("fs");
const path = require("path");

module.exports.config = {
    name: "videodl",
    aliases: ["vdl"],
    version: "1.1.0",
    permission: 0, 
    prefix: true,
    author: "Adi.0X",
    description: "Download video/reels from YouTube, Facebook, Instagram, Threads, Twitter/X, TikTok, CapCut, Snapchat, or Pinterest.",
    category: "Media",
    usages: "(reply to a link) | --auto on | --auto off",
    cooldowns: 5
};

const API_BASE = "https://zeroex-all-rest-api.onrender.com/api/vdl?url=";
const MAX_SIZE = 50 * 1024 * 1024; // 50MB — safe Messenger video attachment size

const urlRegex =
    /(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi;

const PLATFORM_PATTERNS = [
    /youtube\.com/i,
    /youtu\.be/i,
    /facebook\.com/i,
    /fb\.watch/i,
    /fb\.com/i,
    /instagram\.com/i,
    /threads\.net/i,
    /threads\.com/i,
    /twitter\.com/i,
    /x\.com/i,
    /tiktok\.com/i,
    /capcut\.com/i,
    /snapchat\.com/i,
    /pinterest\./i, 
    /pin\.it/i
];

function isSupportedLink(url) {
    return PLATFORM_PATTERNS.some(re => re.test(url));
}

function cleanToken(raw) {
    return raw
        .replace(/^[<(\[{"'“‘]+/, "")
        .replace(/[<>)\]}."'“”‘’,!?;:।]+$/g, "");
}

function normalizeUrl(token) {
    const cleaned = cleanToken(token);
    if (!cleaned) return null;
    return /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
}

async function resolveUrl(url) {
    if (
        url.includes("instagram.com") ||
        url.includes("youtu.be") ||
        url.includes("youtube.com") ||
        url.includes("tiktok.com")
    ) {
        return url.split(" ")[0];
    }
    try {
        const res = await axios.head(url, { maxRedirects: 10, timeout: 5000 });
        return res.request?.res?.responseUrl || url;
    } catch (_) {
        return url;
    }
}

function collectCandidateUrls(event) {
    const { body, attachments, messageReply } = event;
    const raw = [];

    if (body) {
        const found = body.match(urlRegex);
        if (found) raw.push(...found);
    }

    const pushAttachmentLinks = atts => {
        if (!Array.isArray(atts)) return;
        for (const att of atts) {
            if (att.url) raw.push(att.url);
            if (att.facebookUrl) raw.push(att.facebookUrl);
            if (att.target && att.target.url) raw.push(att.target.url);
        }
    };
    pushAttachmentLinks(attachments);

    if (messageReply) {
        if (messageReply.body) {
            const found = messageReply.body.match(urlRegex);
            if (found) raw.push(...found);
        }
        pushAttachmentLinks(messageReply.attachments);
    }

    const seen = new Set();
    const out = [];
    for (const token of raw) {
        const normalized = normalizeUrl(token);
        if (normalized && !seen.has(normalized)) {
            seen.add(normalized);
            out.push(normalized);
        }
    }
    return out;
}

function getUserLevel(userID, threadID) {
    const id = String(userID);
    if ((global.config.ADMINBOT || []).includes(id)) return 4; // bot admin
    if ((global.config.mod || []).includes(id)) return 3; // mod
    const tInfo = global.data.threadInfo.get(String(threadID)) || {};
    const admins = tInfo.adminIDs || [];
    if (admins.some(a => String(a.id || a.uid || a) === id)) return 1; // gcadmin
    return 0;
}

async function getRemoteSize(url) {
    try {
        const res = await axios.head(url, { timeout: 8000 });
        const len = parseInt(res.headers["content-length"], 10);
        return isNaN(len) ? null : len;
    } catch (_) {
        return null;
    }
}

async function pickVideoUrl(video) {
    const hd = video?.HD;
    const sd = video?.SD;
    if (!hd && !sd) return null;
    if (!hd) return sd;
    if (!sd) return hd;

    const hdSize = await getRemoteSize(hd);
    if (hdSize !== null && hdSize > MAX_SIZE) return sd; // HD too big, fall back to SD
    return hd; // try HD first
}

async function handleDownload({ api, threadID, messageID, url, silent }) {
    const cacheDir = path.join(__dirname, "cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    let filePath = null;

    try {
        api.setMessageReaction("🔎", messageID, threadID, () => {}, true); // detecting/searching

        const res = await axios.get(`${API_BASE}${encodeURIComponent(url)}`, { timeout: 30000 });

        if (!res.data || !res.data.status || !res.data.video) {
            if (silent) return;
            api.setMessageReaction("❎", messageID, threadID, () => {}, true);
            return api.sendMessage("❌ Failed to fetch this video. Try again later.", threadID, messageID);
        }

        api.setMessageReaction("ℹ️", messageID, threadID, () => {}, true); // fetching/processing info

        const { title, video } = res.data;
        const videoUrl = await pickVideoUrl(video);

        if (!videoUrl) {
            if (silent) return;
            api.setMessageReaction("❎", messageID, threadID, () => {}, true);
            return api.sendMessage("❌ No downloadable video found for this link.", threadID, messageID);
        }

        api.setMessageReaction("🎥", messageID, threadID, () => {}, true); 

        filePath = path.join(cacheDir, `vdl_${Date.now()}.mp4`);
        const videoRes = await axios({ method: "GET", url: videoUrl, responseType: "stream", timeout: 60000 });
        const writer = fs.createWriteStream(filePath);
        videoRes.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
        });

        api.setMessageReaction("💾", messageID, threadID, () => {}, true); 

        await new Promise((resolve, reject) => {
            api.sendMessage(
                { body: title || "", attachment: fs.createReadStream(filePath) },
                threadID,
                (err) => {
                    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
                    if (err) return reject(err);
                    resolve();
                },
                messageID
            );
        });
    } catch (e) {
        if (filePath && fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (_) {}
        }
        console.error("videodl error:", e.message);
        if (!silent) {
            api.setMessageReaction("❎", messageID, threadID, () => {}, true);
            api.sendMessage(`❌ Error: ${e.message}`, threadID, messageID);
        }
    }
}

module.exports.run = async function ({ api, event, args, Threads }) {
    const { threadID, messageID, senderID, messageReply } = event;

    if (args[0]?.toLowerCase() === "--auto") {
        const sub = (args[1] || "").toLowerCase();
        if (sub !== "on" && sub !== "off") {
            return api.sendMessage("❌ Usage: vdl --auto on | vdl --auto off", threadID, messageID);
        }

        if (getUserLevel(senderID, threadID) < 1) {
            return api.sendMessage(
                "❌ Only Group Admins, Mods, or Bot Admins can change auto mode.",
                threadID, messageID
            );
        }

        const enable = sub === "on";
        await Threads.setData(threadID, { "data.vdlAuto": enable });

        const threadSetting = global.data.threadData.get(String(threadID)) || {};
        threadSetting.vdlAuto = enable;
        global.data.threadData.set(String(threadID), threadSetting);

        return api.sendMessage(
            enable
                ? "✅ Auto video download is now ON for this group. Anyone can just send a supported link (or share it directly) and I'll download it automatically."
                : "✅ Auto video download is now OFF. Only permitted users can use #vdl (reply) to download now.",
            threadID, messageID
        );
    }

    if (!messageReply) {
        return api.sendMessage(
            "❌ Reply to a message containing a video link with #vdl to download it.",
            threadID, messageID
        );
    }

    const candidates = collectCandidateUrls({ body: "", attachments: [], messageReply });
    if (!candidates.length) {
        return api.sendMessage("❌ No link found in the replied message.", threadID, messageID);
    }

    const resolved = await resolveUrl(candidates[0]);
    if (!isSupportedLink(resolved)) {
        return api.sendMessage(
            "❌ Unsupported link. Supported: YouTube, Facebook, Instagram, Threads, Twitter/X, TikTok, CapCut, Snapchat, Pinterest.",
            threadID, messageID
        );
    }

    await handleDownload({ api, threadID, messageID, url: resolved, silent: false });
};

module.exports.handleEvent = async function ({ api, event, Threads }) {
    const { threadID, messageID, senderID } = event;
    if (senderID == api.getCurrentUserID()) return;

    const candidates = collectCandidateUrls(event);
    if (!candidates.length) return; 

    let threadDoc;
    try {
        threadDoc = await Threads.getData(threadID);
    } catch (_) {
        return;
    }
    if (!threadDoc || !threadDoc.data || !threadDoc.data.vdlAuto) return; 

    for (const raw of candidates) {
        const resolved = await resolveUrl(raw);
        if (!isSupportedLink(resolved)) continue;
        await handleDownload({ api, threadID, messageID, url: resolved, silent: true });
    }
};
