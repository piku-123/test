const fs   = require("fs");
const path = require("path");

module.exports.config = {
    name: "resend",
    aliases: ["rs"],
    version: "3.0.0",
    permission: 1,
    prefix: true,
    author: "Adi.0X",
    description: "Logs unsent messages/attachments and resends them to the group.",
    category: "Group Tools",
    usages: "[on/off/status]",
    cooldowns: 3
};

// ─────────────────────────────────────────────
//  HANDLE EVENT — unsend detect
// ─────────────────────────────────────────────
module.exports.handleEvent = async function ({ event, api, Users, Threads }) {
    const axios = global.nodemodule?.axios || require("axios");
    const { writeFileSync, createReadStream, unlinkSync, existsSync, mkdirSync } = require("fs-extra");

    const { messageID, senderID, threadID, body, attachments } = event;

    if (!global.logMessage) global.logMessage = new Map();
    if (!global.data.botID) global.data.botID = api.getCurrentUserID();

    // ── সব message store করো (bot নিজের message বাদে) ──
    if (event.type !== "message_unsend" && senderID !== global.data.botID) {
        global.logMessage.set(messageID, {
            msgBody: body || "",
            attachment: attachments || []
        });
        // memory limit: 500 message এর বেশি হলে পুরনো মুছে দাও
        if (global.logMessage.size > 5000) {
            const firstKey = global.logMessage.keys().next().value;
            global.logMessage.delete(firstKey);
        }
    }

    // ── UNSEND detect ──
    if (event.type !== "message_unsend") return;

    const unsentMsg = global.logMessage.get(messageID);
    if (!unsentMsg) return;
    global.logMessage.delete(messageID);

    // ── Log group ID config থেকে নাও ──
    const logGroupID = global.config.UNSEND_LOG_GROUP || "";

    // ── Thread resend setting check ──
    let resendEnabled = false;
    try {
        const threadData = await Threads.getData(threadID);
        resendEnabled = !!(threadData?.data?.resend);
    } catch {}

    // ── User name & thread name ──
    let userName = "Unknown User";
    let groupName = "Unknown Group";
    try {
        userName = global.data.userName.get(String(senderID)) || "Unknown User";
    } catch {}
    try {
        const tData = await Threads.getData(threadID);
        groupName = tData?.threadInfo?.threadName || "Unknown Group";
    } catch {}

    const timeBD = new Date().toLocaleString("en-US", {
        timeZone: "Asia/Dhaka",
        hour12: true,
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        day: "2-digit", month: "2-digit", year: "numeric"
    });

    const logHeader =
`━━━━━━━━━━━━━━━━━━━━
Group : ${groupName}
User  : ${userName}
UID   : ${senderID}
Time  : ${timeBD}
━━━━━━━━━━━━━━━━━━━━`;

    const validAttachments = (unsentMsg.attachment || []).filter(at => at.type !== "share");

    // ── cache folder ──
    const cacheDir = path.join(__dirname, "cache");
    if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

    // ─────────────────────────────────────────────
    //  TEXT ONLY — no attachment
    // ─────────────────────────────────────────────
    if (validAttachments.length === 0) {
        const msgContent = unsentMsg.msgBody || "(Attachment / Link)";

        // Group এ resend
        if (resendEnabled) {
            api.sendMessage(
`${userName} UNSENT MESSAGE:
${msgContent}`,
                threadID
            );
        }

        // Log group এ পাঠাও
        if (logGroupID) {
            api.sendMessage(
`${logHeader}
Message:
${msgContent}`,
                logGroupID
            );
        }

        return;
    }

    // ─────────────────────────────────────────────
    //  WITH ATTACHMENTS
    // ─────────────────────────────────────────────
    const cacheFiles = [];
    const resendAttachments = [];
    const logAttachments    = [];

    for (let i = 0; i < validAttachments.length; i++) {
        const at = validAttachments[i];
        try {
            const url = at.url;
            if (!url) continue;

            const response = await axios.get(url, { responseType: "arraybuffer", timeout: 15000 });

            let ext = "png";
            if (at.type === "audio" || at.type === "voice_message") ext = "mp3";
            else if (at.type === "video")  ext = "mp4";
            else if (at.type === "photo")  ext = "jpg";

            const filePath = path.join(cacheDir, `resend_${Date.now()}_${i}.${ext}`);
            writeFileSync(filePath, Buffer.from(response.data));
            cacheFiles.push(filePath);
            resendAttachments.push(createReadStream(filePath));
            logAttachments.push(createReadStream(filePath));
        } catch (e) {
            console.error(`[resend] attachment download error: ${e.message}`);
        }
    }

    function cleanCache() {
        for (const f of cacheFiles) {
            try { if (existsSync(f)) unlinkSync(f); } catch {}
        }
    }

    const msgNote = unsentMsg.msgBody
        ? `\nwith Message: ${unsentMsg.msgBody}`
        : "";

    // Group এ resend
    if (resendEnabled && resendAttachments.length > 0) {
        api.sendMessage({
            body:
`${userName} Unsent ${resendAttachments.length} Attachments ${msgNote}`,
            attachment: resendAttachments
        }, threadID);
    }

    // Log group এ পাঠাও
    if (logGroupID && logAttachments.length > 0) {
        api.sendMessage({
            body:
`${logHeader}
Attachments : ${logAttachments.length}${unsentMsg.msgBody ? `\nMessage: ${unsentMsg.msgBody}` : ""}`,
            attachment: logAttachments
        }, logGroupID, () => cleanCache());
    } else {
        // log group না থাকলে / attachment না গেলেও cache মুছে দাও
        setTimeout(cleanCache, 5000);
    }
};

// ─────────────────────────────────────────────
//  RUN — on/off/status
// ─────────────────────────────────────────────
module.exports.run = async function ({ api, event, args, Threads }) {
    const { threadID, messageID, senderID } = event;

    const sub = (args[0] || "").toLowerCase();

    // ── Permission check (group admin / mod / bot admin) ──
    const sid = String(senderID);
    const isBotAdmin   = (global.config.ADMINBOT || []).includes(sid);
    const isMod        = (global.config.mod || []).includes(sid);
    const threadInfo   = global.data.threadInfo.get(String(threadID)) || {};
    const groupAdmins  = threadInfo.adminIDs || [];
    const isGroupAdmin = groupAdmins.some(a => String(a.id || a.uid) === sid);
    const hasPerm      = isBotAdmin || isMod || isGroupAdmin;

    // ── STATUS (default) ──
    if (!sub || sub === "status") {
        const threadData = await Threads.getData(threadID);
        const isOn = !!(threadData?.data?.resend);
        const logGrp = global.config.UNSEND_LOG_GROUP || "(not set)";
        return api.sendMessage(
`┏ RESEND STATUS
┃ This Group  : ${isOn ? "ON" : "OFF"}
┃ Log Group   : ${logGrp}
┗━━━━━━━━━━━━━━━━━━━━
┏ USAGE
┃ resend on    — enable resend
┃ resend off   — disable resend
┗━━━━━━━━━━━━━━━━━━━━`, threadID, messageID);
    }

    if (!hasPerm) {
        return api.sendMessage(
`PERMISSION DENIED
Only Group Admins, Mods or Bot Admins can change resend settings.`, threadID, messageID);
    }

    if (sub === "on" || sub === "off") {
        const enable = sub === "on";
        try {
            await Threads.setData(threadID, { "data.resend": enable });
            // in-memory cache update
            const cached = global.data.threadData.get(String(threadID)) || {};
            cached.resend = enable;
            global.data.threadData.set(String(threadID), cached);

            api.setMessageReaction("✅", messageID, threadID, () => {}, true);
            return api.sendMessage(
` RESEND ${enable ? "ENABLED ✅" : "DISABLED ❎"}
Unsent messages will ${enable ? "be resent in the group" : "not be resent anymore"}`, threadID, messageID);
        } catch (e) {
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            return api.sendMessage(`❌ Error:\n${e.message}`, threadID, messageID);
        }
    }

    return api.sendMessage("❌ Valid option: on / off / status", threadID, messageID);
};
