const fs   = require("fs");
const path = require("path");

module.exports.config = {
    name: "setmode",
    aliases: ["mode"],
    version: "1.0.0",
    permission: 0,
    prefix: true,
    author: "Adi.0X",
    description: "Set who can use the bot in this group. Use --system to apply globally.",
    category: "System",
    usages: "[all/gcadmin/mod/admin] [--system]",
    cooldowns: 3
};

// ── Level helpers (shared with handleCommand) ─────────────────────────────
const MODE_LEVELS = { all: 0, gcadmin: 1, mod: 3, admin: 4 };
const VALID_MODES = Object.keys(MODE_LEVELS);

function getModeLevel(mode) { return MODE_LEVELS[mode] ?? 0; }

function getUserModeLevel(userID, threadID) {
    const id = String(userID);
    if ((global.config.ADMINBOT || []).includes(id)) return 4;
    if ((global.config.mod       || []).includes(id)) return 3;
    const tInfo  = global.data.threadInfo.get(String(threadID)) || {};
    const admins = tInfo.adminIDs || [];
    if (admins.some(a => String(a.id || a.uid) === id)) return 1;
    return 0;
}

const MODE_LABEL = {
    all:     "🌐 All users (everyone)",
    gcadmin: "👮 Group Admins, Mods, Bot Admins",
    mod:     "🛡️ Mods & Bot Admins only",
    admin:   "👑 Bot Admins only"
};

module.exports.run = async function ({ api, event, args, Threads, SystemConfig }) {
    const { threadID, messageID, senderID } = event;

    const isSystemFlag  = args.includes("--system");
    const targetModeArg = args.find(a => a !== "--system")?.toLowerCase();

    const userLevel = getUserModeLevel(senderID, threadID);

    // ══════════════════════════════════════════════════
    //  STATUS — no target mode given
    // ══════════════════════════════════════════════════
    if (!targetModeArg) {
        const threadSetting = global.data.threadData.get(String(threadID)) || {};
        const groupMode   = threadSetting.groupMode  || "all";
        const systemMode  = global.config.systemMode || "all";
        const groupLevel  = getModeLevel(groupMode);
        const systemLevel = getModeLevel(systemMode);

        let msg = `⚙️ Mode Status:\n`;
        if (systemLevel > groupLevel) {
            // System mode is more restrictive — group setting has no effect
            msg += `  • Effective : ${systemMode} — ${MODE_LABEL[systemMode]}\n`;
            msg += `  (System-wide setting overrides this group)`;
        } else if (groupLevel > systemLevel) {
            // Group mode is more restrictive — both lines are relevant
            msg += `  • This group  : ${groupMode} — ${MODE_LABEL[groupMode]}\n`;
            msg += `  • System-wide : ${systemMode} — ${MODE_LABEL[systemMode]}`;
        } else {
            // Both are the same level
            msg += `  • Effective : ${groupMode} — ${MODE_LABEL[groupMode]}`;
            if (systemMode !== "all" || groupMode !== "all") {
                msg += `\n  (Group and system are both set to "${groupMode}")`;
            }
        }
        return api.sendMessage(msg, threadID, messageID);
    }

    if (!VALID_MODES.includes(targetModeArg)) {
        return api.sendMessage(
            `❌ Invalid mode. Valid: ${VALID_MODES.join(", ")}`,
            threadID, messageID
        );
    }

    const targetLevel = getModeLevel(targetModeArg);

    // ══════════════════════════════════════════════════
    //  SYSTEM MODE — permission=4 only
    // ══════════════════════════════════════════════════
    if (isSystemFlag) {
        if (userLevel < 4) {
            return api.sendMessage("❌ Only Bot Admins can change the system-wide mode.", threadID, messageID);
        }
        await SystemConfig.setSetting("systemMode", targetModeArg);
        return api.sendMessage(
            `✅ System mode changed to "${targetModeArg}".\n${MODE_LABEL[targetModeArg]}\nApplied across the entire bot.`,
            threadID, messageID
        );
    }

    // ══════════════════════════════════════════════════
    //  GROUP MODE — permission checks based on current mode
    // ══════════════════════════════════════════════════
    const threadSetting  = global.data.threadData.get(String(threadID)) || {};
    const currentMode    = threadSetting.groupMode || "all";
    const currentLevel   = getModeLevel(currentMode);

    // User must be able to interact in this group (pass current mode gate)
    if (userLevel < currentLevel) {
        return; // silently ignore — mode gate already applies in handleCommand, but safety check here
    }

    // From "all" mode: user can lock up to their own level
    // From locked mode: user can only UNLOCK (go to a less restrictive mode)
    let allowed = false;
    if (currentLevel === 0) {
        // From "all": must have at least level 1 and target <= user level
        allowed = userLevel >= 1 && targetLevel <= userLevel;
    } else {
        // From locked: can only go LOWER than current (unlock), user must meet current level
        allowed = userLevel >= currentLevel && targetLevel < currentLevel;
    }

    if (!allowed) {
        let hint = "";
        if (currentLevel === 0) {
            hint = `You need to be ${targetLevel >= 3 ? "a Mod or Bot Admin" : targetLevel >= 1 ? "a Group Admin, Mod, or Bot Admin" : "a Bot Admin"} to lock the group to "${targetModeArg}".`;
        } else {
            const unlockable = VALID_MODES.filter(m => getModeLevel(m) < currentLevel).join(", ");
            hint = `In "${currentMode}" mode you can only unlock to: ${unlockable || "none"}.`;
        }
        return api.sendMessage(`❌ Cannot change mode to "${targetModeArg}".\n${hint}`, threadID, messageID);
    }

    // Save to MongoDB Threads
    await Threads.setData(threadID, { "data.groupMode": targetModeArg });

    // Update in-memory cache
    threadSetting.groupMode = targetModeArg;
    global.data.threadData.set(String(threadID), threadSetting);

    return api.sendMessage(
        `✅ Group mode set to "${targetModeArg}".\n${MODE_LABEL[targetModeArg]}`,
        threadID, messageID
    );
};
