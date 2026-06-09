const axios = require("axios");
const fs    = require("fs-extra");
const path  = require("path");

module.exports.config = {
    name: "spy",
    aliases: [],
    version: "8.0.0",
    permission: 2,
    prefix: true,
    author: "Adi.0X",
    description: "Show detailed user info with profile picture.",
    category: "Information & Help",
    usages: "[mention/reply/link/uid]",
    cooldowns: 5
};

// Wraps long text and keeps ┃ prefix on continuation lines
function wrap(text, limit = 25) {
    if (!text || text.length <= limit) return String(text);
    const words = String(text).split(" ");
    let lines = [], cur = "";
    words.forEach(w => {
        if ((cur + (cur ? " " : "") + w).length <= limit) {
            cur += (cur ? " " : "") + w;
        } else {
            if (cur) lines.push(cur);
            cur = w;
        }
    });
    if (cur) lines.push(cur);
    return lines.join("\n┃              ");
}

module.exports.run = async function ({ api, event, args }) {
    const { threadID, messageID, senderID, messageReply, mentions } = event;
    let uid;

    if (Object.keys(mentions).length > 0) {
        uid = Object.keys(mentions)[0];
    } else if (messageReply) {
        uid = messageReply.senderID;
    } else if (args.length > 0 && /^\d{5,20}$/.test(args[0])) {
        uid = args[0];
    } else if (args.length > 0 && args[0].includes("facebook.com")) {
        try {
            const res = await axios.get(
                `https://zeroex-all-rest-api.onrender.com/api/fb/uid?url=${encodeURIComponent(args[0])}`,
                { timeout: 10000 }
            );
            uid = res.data.uid || res.data.id;
        } catch {
            return api.sendMessage("Failed to resolve UID from link.", threadID, messageID);
        }
    } else {
        uid = senderID;
    }

    if (!uid) return api.sendMessage("Could not determine target user.", threadID, messageID);

    try {
        const userInfo = await api.getUserInfo(uid);
        const u = userInfo[uid];
        if (!u) return api.sendMessage("User not found.", threadID, messageID);

        const name       = u.name          || "Unknown";
        const firstName  = u.firstName     || name.split(" ")[0];
        const alterName  = u.alternateName || "";
        const vanity     = u.vanity        ? `@${u.vanity}` : "@no_username";
        const thumbSrc   = u.thumbSrc      || "";
        const profileUrl = u.profileUrl    || `https://facebook.com/${uid}`;
        const gender     = u.gender === "male"   ? "Male"
                         : u.gender === "female" ? "Female"
                         : u.gender              ? u.gender : "Not Set";
        const accType    = u.type   || "user";
        const isFriend   = u.isFriend   ? "Connected"   : "Not Connected";
        const isBirthday = u.isBirthday ? "Today!"      : "No";
        const searchTok  = Array.isArray(u.searchTokens) && u.searchTokens.length > 0
                           ? u.searchTokens.slice(0, 3).join(", ")
                           : "N/A";

        const msg =
`┏ SPY REPORT
┗━━━━━━━━━━━━━━━━━━━━
┏ IDENTITY
┃ • Name      : ${wrap(name)}
┃ • First     : ${wrap(firstName)}${alterName ? `\n┃ • Nickname  : ${wrap(alterName)}` : ""}
┃ • Username  : ${wrap(vanity)}
┃ • UID       : ${uid}
┗━━━━━━━━━━━━━━━━━━━━
┏ PROFILE
┃ • Gender    : ${gender}
┃ • Type      : ${accType}
┃ • Friend    : ${isFriend}
┃ • Birthday  : ${isBirthday}
┗━━━━━━━━━━━━━━━━━━━━
┏ LINKS
┃ • URL       : ${wrap(profileUrl)}
┃ • Tokens    : ${wrap(searchTok)}
┗━━━━━━━━━━━━━━━━━━━━`;

        const cacheDir = path.join(__dirname, "cache");
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
        const filePath = path.join(cacheDir, `spy_${uid}_${Date.now()}.jpg`);

        // Try pp API first, fall back to thumbSrc
        const ppUrl  = `https://zeroex-all-rest-api.onrender.com/api/fb/pp?url=${encodeURIComponent(profileUrl)}`;
        const imgSources = [ppUrl, thumbSrc].filter(Boolean);

        for (const src of imgSources) {
            try {
                const imgRes = await axios.get(src, { responseType: "arraybuffer", timeout: 12000 });
                if (imgRes.data && imgRes.data.byteLength > 0) {
                    fs.writeFileSync(filePath, Buffer.from(imgRes.data));
                    return api.sendMessage(
                        { body: msg, attachment: fs.createReadStream(filePath) },
                        threadID,
                        () => { try { fs.unlinkSync(filePath); } catch {} },
                        messageID
                    );
                }
            } catch {}
        }

        // No image available — send text only
        return api.sendMessage(msg, threadID, messageID);

    } catch (err) {
        return api.sendMessage(`Error: ${err.message}`, threadID, messageID);
    }
};
