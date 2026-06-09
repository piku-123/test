const fs = require("fs");
const path = require("path");
const axios = require("axios");

module.exports.config = {
    name: "controller",
    aliases: ["ctrl"],
    version: "2.0.0",
    permission: 0,
    prefix: true,
    author: "Adi.0X",
    description: "Manage bot admins and moderators.",
    category: "System",
    usages: "admin add/remove | mod add/remove | list [admin/mod]",
    cooldowns: 3
};

const CONFIG_PATH = path.join(process.cwd(), "config.json");

function loadConfig() {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function saveConfig(cfg) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 4), "utf8");
    global.config = Object.assign(global.config || {}, cfg);
}

function extractIdFromUrl(url) {
    if (!url || typeof url !== "string") return null;
    const m1 = url.match(/profile\.php\?id=(\d+)/i);
    if (m1) return m1[1];
    const m2 = url.match(/facebook\.com\/(\d{5,})(?:[/?#]|$)/i);
    if (m2) return m2[1];
    return null;
}

function isFacebookLink(input) {
    return /(facebook\.com|fb\.me|fb\.com|m\.facebook\.com)/i.test(input || "");
}

async function resolveUID(api, event, args) {
    const { mentions, messageReply } = event;

    if (messageReply) return String(messageReply.senderID);

    if (mentions && Object.keys(mentions).length > 0)
        return String(Object.keys(mentions)[0]);

    if (args[0]) {
        const input = args[0].trim();

        if (/^\d{5,}$/.test(input)) return input;

        if (isFacebookLink(input)) {
            const direct = extractIdFromUrl(input);
            if (direct) return direct;

            try {
                const res = await axios.get(
                    `https://fb-pp-api.vercel.app/api/fb-uid?link=${encodeURIComponent(input)}`
                );
                if (res.data && res.data.id) return String(res.data.id);
            } catch (_) {}

            return null;
        }
    }

    return null;
}

async function getName(api, uid) {
    try {
        const info = await api.getUserInfo(uid);
        return (info && info[uid] && info[uid].name)
            ? info[uid].name
            : uid;
    } catch (_) {
        return uid;
    }
}

function mergeUnique(...arrays) {
    return [...new Set(arrays.flat().filter(Boolean))];
}

module.exports.run = async function ({ api, event, args, SystemConfig }) {
    const { threadID, messageID, senderID } = event;

    const isBotAdmin =
        (global.config.ADMINBOT || []).includes(String(senderID));

    const sub = (args[0] || "").toLowerCase();
    const action = (args[1] || "").toLowerCase();

    // ===== LIST =====
    if (sub === "list") {
        const cfg = loadConfig();
        const sysConf = (await SystemConfig.get()) || {};

        const showAdmin = !action || action === "admin";
        const showMod =
            !action ||
            action === "mod" ||
            action === "moderator";

        let msg = "";

        if (showAdmin) {
            const adminIDs = mergeUnique(
                cfg.ADMINBOT || [],
                sysConf.ADMINBOT || []
            );

            msg += `┏ BOT ADMINS (${adminIDs.length})\n`;

            for (const uid of adminIDs) {
                const name = await getName(api, uid);
                msg += `┃ • ${name}\n`;
                msg += `┃   UID: ${uid}\n`;
            }

            msg += `┗━━━━━━━━━━━━━━━━━━━━`;
        }

        if (showAdmin && showMod) msg += `\n\n`;

        if (showMod) {
            const modIDs = mergeUnique(
                cfg.mod || [],
                sysConf.mod || []
            );

            msg += `┏ MODERATORS (${modIDs.length})\n`;

            for (const uid of modIDs) {
                const name = await getName(api, uid);
                msg += `┃ • ${name}\n`;
                msg += `┃   UID: ${uid}\n`;
            }

            msg += `┗━━━━━━━━━━━━━━━━━━━━`;
        }

        return api.sendMessage(
            msg || "No entries found.",
            threadID,
            messageID
        );
    }

    // ===== PERMISSION =====
    if (!isBotAdmin) {
        return api.sendMessage(
            `┏ ACCESS DENIED\n┃ • Only Bot Admins can\n┃   modify Admin or Mod lists.\n┗━━━━━━━━━━━━━━━━━━━━`,
            threadID,
            messageID
        );
    }

    // ===== ADMIN / MOD =====
    if (
        sub === "admin" ||
        sub === "mod" ||
        sub === "moderator"
    ) {
        const listKey =
            sub === "admin" ? "ADMINBOT" : "mod";

        const listLabel =
            sub === "admin" ? "Admin" : "Moderator";

        if (
            action !== "add" &&
            action !== "remove"
        ) {
            return api.sendMessage(
`┏ CONTROLLER USAGE
┃ • controller ${sub} add
┃ • controller ${sub} remove
┃
┃ Target Methods:
┃ • Mention User
┃ • Reply User
┃ • UID
┃ • Facebook Link
┗━━━━━━━━━━━━━━━━━━━━`,
                threadID,
                messageID
            );
        }

        const targetUID = await resolveUID(
            api,
            event,
            args.slice(2)
        );

        if (!targetUID) {
            return api.sendMessage(
`┏ INVALID TARGET
┃ • Mention someone,
┃ • Reply to a user,
┃ • Provide UID,
┃ • Or Facebook profile link.
┗━━━━━━━━━━━━━━━━━━━━`,
                threadID,
                messageID
            );
        }

        const targetName = await getName(
            api,
            targetUID
        );

        const cfg = loadConfig();
        const sysConf =
            (await SystemConfig.get()) || {};

        if (!Array.isArray(cfg[listKey]))
            cfg[listKey] = [];

        const dbList = Array.isArray(sysConf[listKey])
            ? [...sysConf[listKey]]
            : [];

        // ===== ADD =====
        if (action === "add") {
            const alreadyInCfg =
                cfg[listKey].includes(targetUID);

            const alreadyInDB =
                dbList.includes(targetUID);

            if (alreadyInCfg && alreadyInDB) {
                return api.sendMessage(
`┏ ${listLabel.toUpperCase()} EXISTS
┃ • Name: ${targetName}
┃ • UID: ${targetUID}
┃
┃ Already added.
┗━━━━━━━━━━━━━━━━━━━━`,
                    threadID,
                    messageID
                );
            }

            if (!alreadyInCfg)
                cfg[listKey].push(targetUID);

            if (!alreadyInDB)
                dbList.push(targetUID);

            saveConfig(cfg);
            await SystemConfig.setSetting(
                listKey,
                dbList
            );

            return api.sendMessage(
`┏ ${listLabel.toUpperCase()} ADDED
┃ • Name: ${targetName}
┃ • UID: ${targetUID}
┃
┃ Successfully added.
┗━━━━━━━━━━━━━━━━━━━━`,
                threadID,
                messageID
            );
        }

        // ===== REMOVE =====
        if (action === "remove") {
            const cfgIdx =
                cfg[listKey].indexOf(targetUID);

            const dbIdx =
                dbList.indexOf(targetUID);

            if (
                cfgIdx === -1 &&
                dbIdx === -1
            ) {
                return api.sendMessage(
`┏ NOT FOUND
┃ • Name: ${targetName}
┃ • UID: ${targetUID}
┃
┃ Not in ${listLabel} list.
┗━━━━━━━━━━━━━━━━━━━━`,
                    threadID,
                    messageID
                );
            }

            if (cfgIdx !== -1)
                cfg[listKey].splice(cfgIdx, 1);

            if (dbIdx !== -1)
                dbList.splice(dbIdx, 1);

            saveConfig(cfg);

            await SystemConfig.setSetting(
                listKey,
                dbList
            );

            return api.sendMessage(
`┏ ${listLabel.toUpperCase()} REMOVED
┃ • Name: ${targetName}
┃ • UID: ${targetUID}
┃
┃ Successfully removed.
┗━━━━━━━━━━━━━━━━━━━━`,
                threadID,
                messageID
            );
        }
    }

    // ===== HELP =====
    return api.sendMessage(
`┏ CONTROLLER COMMANDS
┃ • admin add
┃ • admin remove
┃ • mod add
┃ • mod remove
┃ • list
┃ • list admin
┃ • list mod
┗━━━━━━━━━━━━━━━━━━━━

Usage:
${global.config.PREFIX}controller [option]`,
        threadID,
        messageID
    );
};