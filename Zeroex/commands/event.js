module.exports.config = {
    name: "event",
    aliases: ["ev"],
    version: "4.0.0",
    permission: 1,
    prefix: true,
    author: "Adi.0X",
    description: "Manage group event notifications per group or system-wide.",
    category: "Group Tools",
    usages: "[status / on / off / reset] [event / all] [--system]",
    cooldowns: 3
};

const EVENTS = {
    antijoin:    "Kick anyone who joins via link",
    antileave:   "Re-add anyone who self-leaves",
    antichange:  "Revert name, photo, theme changes",
    joinnoti:    "Notify when a member joins",
    leavenoti:   "Notify when a member leaves or is kicked",
    groupupdate: "Notify name/photo/theme/admin/nick/call/poll/emoji"
};

const EVENT_KEYS  = Object.keys(EVENTS);
const ANTI_EVENTS = ["antijoin", "antileave", "antichange"];
const NOTI_EVENTS = EVENT_KEYS.filter(k => !ANTI_EVENTS.includes(k));

function wrapText(text, limit) {
    const words = text.split(" ");
    let lines = [], cur = "";
    words.forEach(w => {
        if ((cur + w).length <= limit) { cur += (cur === "" ? "" : " ") + w; }
        else { lines.push(cur); cur = w; }
    });
    lines.push(cur);
    return lines.join("\n┃             ");
}

function isEventOn(settings, key) {
    const val = settings[key];
    return ANTI_EVENTS.includes(key) ? val === true : val !== false;
}

function parseAdminIDs(adminIDs = []) {
    return adminIDs.map(a => {
        if (typeof a === "string") return a;
        return String(a.id || a.uid || a.userID || "");
    }).filter(Boolean);
}

async function getSettings(Threads, threadID) {
    try {
        const d = await Threads.getData(threadID);
        return d?.data?.events || {};
    } catch { return {}; }
}

async function setSetting(Threads, threadID, key, value) {
    await Threads.setData(threadID, { [`data.events.${key}`]: value });
}

async function setSystemSetting(Threads, key, value) {
    const allIDs = global.data.allThreadID || [];
    let count = 0;
    for (const tid of allIDs) {
        try {
            await Threads.setData(tid, { [`data.events.${key}`]: value });
            count++;
        } catch {}
    }
    return count;
}

async function initAntiChangeSnapshot(api, Threads, threadID) {
    try {
        const tInfo = await api.getThreadInfo(threadID);
        const imageURL = tInfo?.imageSrc || null;
        const themeID  = tInfo?.threadTheme?.id || null;
        const themeName = tInfo?.threadTheme?.name || null;
        await Threads.setData(threadID, {
            "data.antichangeSnapshot": {
                name:          tInfo?.threadName || null,
                imageURL,
                imageCaptured: !!imageURL,
                themeID,
                themeName,
                themeColor:   tInfo?.color || null
            }
        });
    } catch (e) {
        console.error("[event] initAntiChangeSnapshot failed:", e?.message || e);
    }
}

async function clearAntiChangeSnapshot(Threads, threadID) {
    try {
        await Threads.setData(threadID, { "data.antichangeSnapshot": null });
    } catch {}
}

async function checkBotIsAdmin(api, threadID) {
    const botID = String(api.getCurrentUserID());
    try {
        const info    = await api.getThreadInfo(threadID);
        const admins  = parseAdminIDs(info?.adminIDs || []);
        return admins.includes(botID);
    } catch (e) {
        console.error("[event] getThreadInfo failed for admin check:", e?.message || e);
        return false;
    }
}

module.exports.run = async function ({ api, event, args, Threads }) {
    const { threadID, messageID, senderID } = event;
    const prefix = global.config.PREFIX;

    const sid        = String(senderID);
    const isBotAdmin = (global.config.ADMINBOT || []).includes(sid);
    const isMod      = (global.config.mod       || []).includes(sid);
    const tInfo      = global.data.threadInfo?.get(String(threadID)) || {};
    const isGrpAdmin = parseAdminIDs(tInfo.adminIDs || []).includes(sid);
    const hasPerm    = isBotAdmin || isMod || isGrpAdmin;

    const sysFlag   = args.includes("--system");
    const cleanArgs = args.filter(a => a !== "--system");
    const sub       = (cleanArgs[0] || "").toLowerCase();
    const target    = (cleanArgs[1] || "").toLowerCase();

    // ── PERMISSION CHECKS ────────────────────────────────────
    if (sysFlag && !isBotAdmin) {
        return api.sendMessage("❌ --system flag requires bot admin.", threadID, messageID);
    }

    if (!hasPerm && sub !== "status" && sub !== "") {
        return api.sendMessage("❌ Only group admins or bot admins can change event settings.", threadID, messageID);
    }

    // ── STATUS ───────────────────────────────────────────────
    if (!sub || sub === "status") {
        const settings = await getSettings(Threads, threadID);

        const antiLines = ANTI_EVENTS.map(k => {
            const on  = isEventOn(settings, k);
            const desc = EVENTS[k].length > 32 ? wrapText(EVENTS[k], 32) : EVENTS[k];
            return `┃ • ${k.padEnd(12)} ${on ? "ON " : "OFF"}  ${desc}`;
        }).join("\n");

        const notiLines = NOTI_EVENTS.map(k => {
            const on  = isEventOn(settings, k);
            const desc = EVENTS[k].length > 32 ? wrapText(EVENTS[k], 32) : EVENTS[k];
            return `┃ • ${k.padEnd(12)} ${on ? "ON " : "OFF"}  ${desc}`;
        }).join("\n");

        return api.sendMessage(
`┏ EVENT STATUS
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━

┏ ANTI EVENTS
${antiLines}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━

┏ NOTIFICATIONS
${notiLines}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━

┏ USAGE
┃ • ${prefix}event status
┃ • ${prefix}event on/off [name/all]
┃ • ${prefix}event on/off [name/all] --system
┃ • ${prefix}event reset
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━

Type: ${prefix}event on [name/all]`, threadID, messageID);
    }

    // ── ON / OFF ─────────────────────────────────────────────
    if (sub === "on" || sub === "off") {
        const enable = sub === "on";

        if (!target) {
            const list = EVENT_KEYS.map(k => `┃ • ${k}`).join("\n");
            return api.sendMessage(
`┏ EVENT NAME REQUIRED
┗━━━━━━━━━━━━━━━━━━━━
${list}
┃ • all
┗━━━━━━━━━━━━━━━━━━━━
Example: ${prefix}event on joinnoti`, threadID, messageID);
        }

        if (target !== "all" && !EVENTS[target]) {
            const list = EVENT_KEYS.map(k => `┃ • ${k}`).join("\n");
            return api.sendMessage(
`┏ INVALID EVENT: "${target}"
┗━━━━━━━━━━━━━━━━━━━━
┏ AVAILABLE
${list}
┃ • all
┗━━━━━━━━━━━━━━━━━━━━`, threadID, messageID);
        }

        const keysToSet = target === "all" ? EVENT_KEYS : [target];

        // Bot admin check before enabling antijoin
        if (enable && keysToSet.includes("antijoin") && !sysFlag) {
            const botIsAdmin = await checkBotIsAdmin(api, threadID);
            if (!botIsAdmin) {
                return api.sendMessage(
                    `Make bot a group admin first, then enable antijoin.`,
                    threadID, messageID
                );
            }
        }

        if (sysFlag) {
            let totalGroups = 0;
            for (const k of keysToSet) {
                totalGroups = await setSystemSetting(Threads, k, enable);
            }
            api.setMessageReaction("✅", messageID, threadID, () => {}, true);
            return api.sendMessage(
                `${target} event ${enable ? "enabled" : "disabled"} for all groups (${totalGroups} updated).`,
                threadID, messageID
            );
        }

        // Per-group
        for (const k of keysToSet) {
            await setSetting(Threads, threadID, k, enable);
        }

        if (keysToSet.includes("antichange")) {
            if (enable) await initAntiChangeSnapshot(api, Threads, threadID);
            else        await clearAntiChangeSnapshot(Threads, threadID);
        }

        api.setMessageReaction("✅", messageID, threadID, () => {}, true);
        return api.sendMessage(
            `${target} event ${enable ? "enabled" : "disabled"} for this group.`,
            threadID, messageID
        );
    }

    // ── RESET ────────────────────────────────────────────────
    if (sub === "reset") {
        for (const k of ANTI_EVENTS) {
            await setSetting(Threads, threadID, k, false);
        }
        for (const k of NOTI_EVENTS) {
            await setSetting(Threads, threadID, k, true);
        }
        await clearAntiChangeSnapshot(Threads, threadID);

        api.setMessageReaction("✅", messageID, threadID, () => {}, true);
        return api.sendMessage(
            `All events reset to default for this group.`,
            threadID, messageID
        );
    }

    // ── HELP (fallback) ──────────────────────────────────────
    const antiList = ANTI_EVENTS.map(k => `┃ • ${k.padEnd(12)} ${EVENTS[k]}`).join("\n");
    const notiList = NOTI_EVENTS.map(k => `┃ • ${k.padEnd(12)} ${EVENTS[k]}`).join("\n");

    return api.sendMessage(
`┏ EVENT MANAGER
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┏ ANTI EVENTS
${antiList}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┏ NOTIFICATIONS
${notiList}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┏ USAGE
┃ • ${prefix}event status
┃ • ${prefix}event on  [name/all]
┃ • ${prefix}event off [name/all]
┃ • ${prefix}event on  [name/all] --system
┃ • ${prefix}event off [name/all] --system
┃ • ${prefix}event reset
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, threadID, messageID);
};
