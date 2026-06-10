const fs   = require("fs");
const path = require("path");

module.exports.config = {
    name: "setmode",
    aliases: ["mode"],
    version: "1.1.0",
    permission: 0,
    prefix: true,
    author: "Adi.0X",
    description: "Set who can use the bot in this group.",
    category: "System",
    usages: "[all / gcadmin / mod / admin] [--system]",
    cooldowns: 3
};

const MODE_LEVELS = { all: 0, gcadmin: 1, mod: 3, admin: 4 };
const VALID_MODES = Object.keys(MODE_LEVELS);

function getModeLevel(mode) { return MODE_LEVELS[mode] ?? 0; }

function getUserLevel(userID, threadID) {
    const id = String(userID);
    if ((global.config.ADMINBOT || []).includes(id)) return 4;
    if ((global.config.mod       || []).includes(id)) return 3;
    const tInfo  = global.data.threadInfo.get(String(threadID)) || {};
    const admins = tInfo.adminIDs || [];
    if (admins.some(a => String(a.id || a) === id)) return 1;
    return 0;
}

const MODE_LABEL = {
    all:     "🌐 Everyone can use",
    gcadmin: "👮 Group Admin, Mod & Bot Admin",
    mod:     "🛡️ Only Mod & Bot Admin",
    admin:   "👑 Only Bot Admin"
};

module.exports.run = async function ({ api, event, args, Threads, SystemConfig }) {
    const { threadID, messageID, senderID } = event;

    // Refresh adminIDs — ensuring gcadmin mode works correctly
    try {
        const fresh = await api.getThreadInfo(threadID);
        if (fresh && fresh.adminIDs) {
            const existing = global.data.threadInfo.get(String(threadID)) || {};
            global.data.threadInfo.set(String(threadID), { ...existing, adminIDs: fresh.adminIDs });
        }
    } catch {}

    const isSystemFlag  = args.includes("--system");
    const targetModeArg = args.find(a => a !== "--system")?.toLowerCase();
    const userLevel     = getUserLevel(senderID, threadID);

    // ══ STATUS — Show current mode if no argument is provided ══
    if (!targetModeArg) {
        const threadSetting = global.data.threadData.get(String(threadID)) || {};
        const groupMode     = threadSetting.groupMode  || "all";
        const systemMode    = global.config.systemMode || "all";
        const groupLevel    = getModeLevel(groupMode);
        const systemLevel   = getModeLevel(systemMode);

        const effectiveModeStr = systemLevel >= groupLevel ? systemMode : groupMode;
        const effectiveLabel   = MODE_LABEL[effectiveModeStr];

        let msg = `⚙️ Mode Status:\n`;
        msg += `  • Effective : ${effectiveModeStr} — ${effectiveLabel}\n`;

        if (systemLevel > groupLevel) {
            msg += `  (System-wide setting is overriding this group's setting)`;
        } else if (groupLevel > systemLevel) {
            msg += `  • System-wide : ${systemMode} — ${MODE_LABEL[systemMode]}\n`;
            msg += `  (The group's own mode is more restrictive)`;
        }

        msg += `\n\n📋 Available Modes:\n`;
        msg += `  all     → Everyone\n`;
        msg += `  gcadmin → Group Admin+\n`;
        msg += `  mod     → Mod+\n`;
        msg += `  admin   → Only Bot Admin\n`;
        msg += `\n💡 Usage: setmode gcadmin`;
        if (userLevel >= 4) msg += `\n💡 System: setmode all --system`;

        return api.sendMessage(msg, threadID, messageID);
    }

    // ══ Invalid mode check ══
    if (!VALID_MODES.includes(targetModeArg)) {
        return api.sendMessage(
            `❌ Invalid mode! Valid modes are: ${VALID_MODES.join(", ")}`,
            threadID, messageID
        );
    }

    const targetLevel = getModeLevel(targetModeArg);

    // ══ SYSTEM MODE — Only Bot Admin can modify ══
    if (isSystemFlag) {
        if (userLevel < 4) {
            return api.sendMessage("❌ System-wide mode can only be changed by a Bot Admin.", threadID, messageID);
        }
        await SystemConfig.setSetting("systemMode", targetModeArg);
        global.config.systemMode = targetModeArg;
        return api.sendMessage(
            `✅ System mode → "${targetModeArg}"\n${MODE_LABEL[targetModeArg]}\n(Applied globally across the bot)`,
            threadID, messageID
        );
    }

    // ══ GROUP MODE ══
    // Rules:
    // 1. Bot Admin (level 4) — Can set any mode
    // 2. Group Admin / Mod (level 1-3) — Can lock up to their level and unlock
    // 3. General user — Cannot perform changes

    if (userLevel < 1) {
        return api.sendMessage(
            "❌ Only Group Admins, Mods, or Bot Admins can change the mode.",
            threadID, messageID
        );
    }

    // Target mode cannot be more restrictive than the user's own level
    if (targetLevel > userLevel) {
        const needed = targetModeArg === "admin" ? "Bot Admin"
                     : targetModeArg === "mod"   ? "Mod or Bot Admin"
                     : "Group Admin, Mod, or Bot Admin";
        return api.sendMessage(
            `❌ You must be a ${needed} to set "${targetModeArg}" mode.`,
            threadID, messageID
        );
    }

    // Save to MongoDB
    await Threads.setData(threadID, { "data.groupMode": targetModeArg });

    // Update memory cache
    const threadSetting = global.data.threadData.get(String(threadID)) || {};
    threadSetting.groupMode = targetModeArg;
    global.data.threadData.set(String(threadID), threadSetting);

    return api.sendMessage(
        `✅ This group's mode → "${targetModeArg}"\n${MODE_LABEL[targetModeArg]}`,
        threadID, messageID
    );
};
