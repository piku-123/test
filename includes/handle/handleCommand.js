module.exports = function ({ api, models, Users, Threads, Currencies, Settings, SystemConfig }) {
  const stringSimilarity = require('string-similarity'),
    escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    logger = require("../../utils/log.js");
  const moment = require("moment-timezone");

  function formatTime(seconds) {
    let h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.floor(seconds % 60);
    return `${h > 0 ? h + "h " : ""}${m > 0 ? m + "m " : ""}${s}s`.trim();
  }

  // ── Mode gate helpers ────────────────────────────────────────────────────
  const MODE_LEVELS = { all: 0, gcadmin: 1, mod: 3, admin: 4 };
  function getModeLevel(mode) { return MODE_LEVELS[mode] ?? 0; }
  function getUserModeLevel(userID, tid) {
    const id = String(userID);
    const cfg = global.config;
    if ((cfg.ADMINBOT || []).includes(id)) return 4;
    if ((cfg.mod       || []).includes(id)) return 3;
    const tInfo  = global.data.threadInfo.get(String(tid)) || {};
    const admins = tInfo.adminIDs || [];
    if (admins.some(a => String(a.id || a.uid) === id)) return 1;
    return 0;
  }
  // ─────────────────────────────────────────────────────────────────────────

  function findCommandByName(commands, name) {
    let cmd = commands.get(name);
    if (cmd) return cmd;
    for (const [, value] of commands.entries()) {
      if (value.config?.aliases?.includes(name)) return value;
    }
    return null;
  }

  return async function ({ event }) {
    const dateNow = Date.now();
    const { PREFIX, ADMINBOT, mod } = global.config;
    const { userBanned, threadBanned, threadData, threadInfo } = global.data;
    const { commands, cooldowns } = global.client;

    var { body, senderID, threadID, messageID } = event;
    if (!body) return;
    senderID = String(senderID); 
    threadID = String(threadID);

    const threadSetting = threadData.get(threadID) || {};
    const currentPrefix = threadSetting.PREFIX || PREFIX;

    const prefixRegex = new RegExp(`^(<@!?${senderID}>|${escapeRegex(currentPrefix)})\\s*`);
    const hasPrefix = prefixRegex.test(body);

    let command = null;
    let args = [];
    let commandName = "";
    let isNonPrefix = false;

    // --- কমান্ড ডিটেকশন (Prefix & Non-Prefix) ---
    if (hasPrefix) {
      const [matchedPrefix] = body.match(prefixRegex);
      args = body.slice(matchedPrefix.length).trim().split(/ +/);
      commandName = (args.shift() || "").toLowerCase();
      command = findCommandByName(commands, commandName);

      if (!command) {
        const allCommandName = Array.from(commands.keys());
        if (allCommandName.length === 0) return;
        const checker = stringSimilarity.findBestMatch(commandName, allCommandName);
        if (checker.bestMatch.rating >= 0.5) command = commands.get(checker.bestMatch.target);
        else return;
      }
    } else {
      const tokens = body.trim().split(/ +/);
      commandName = (tokens.shift() || "").toLowerCase();
      if (!commandName) return;

      const candidate = findCommandByName(commands, commandName);
      // 'prefix: false' মানে এটি প্রিফিক্স ছাড়াই কাজ করবে
      if (!candidate || candidate.config?.prefix !== false) return;

      command = candidate;
      args = tokens;
      isNonPrefix = true;
    }

    // --- ব্যান চেক ---
    if (userBanned.has(senderID) || threadBanned.has(threadID)) {
      if (!ADMINBOT.includes(senderID)) {
        const banInfo = userBanned.get(senderID) || threadBanned.get(threadID);
        return api.sendMessage(global.getText("handleCommand", userBanned.has(senderID) ? "userBanned" : "threadBanned", banInfo.reason, banInfo.dateAdded), threadID, async (err, info) => {
          await new Promise(resolve => setTimeout(resolve, 10000));
          return api.unsendMessage(info.messageID);
        }, messageID);
      }
    }

    // --- adminIDs রিফ্রেশ — সবসময় fresh নাও যাতে gcadmin mode সঠিক কাজ করে ---
    {
        const _ti = threadInfo.get(threadID) || {};
        try {
            const _fresh = await api.getThreadInfo(threadID);
            const _admins = _fresh.adminIDs || [];
            threadInfo.set(threadID, { ..._ti, adminIDs: _admins });
        } catch {}
    }

    // --- Mode Gate — কে বট ব্যবহার করতে পারবে এই গ্রুপে ---
    const systemModeLevel = getModeLevel(global.config.systemMode || "all");
    const groupModeLevel  = getModeLevel(threadSetting.groupMode  || "all");
    const effectiveMode   = Math.max(systemModeLevel, groupModeLevel);
    if (effectiveMode > 0 && getUserModeLevel(senderID, threadID) < effectiveMode) return;

    // --- পারমিশন সিস্টেম ---
    // 0 = সবাই ব্যবহার করতে পারবে
    // 1 = Bot Admins, Group Admins, mod
    // 2 = Bot Admins, Group Admins
    // 3 = Bot Admins, mod
    // 4 = শুধু Bot Admins
    const threadInfoData = threadInfo.get(threadID) || {};
    const adminIDs = threadInfoData.adminIDs || [];

    const isBotAdmin = ADMINBOT.includes(senderID);
    const isMod = (mod || []).includes(senderID);
    const isGroupAdmin = adminIDs.some(admin => String(admin.id || admin.uid) == senderID);

    const permissionLevel = isBotAdmin ? 4 : 0;

    const requiredPermission = command.config.permission ?? command.config.hasPermssion ?? 0;

    function hasAccess(required) {
      if (required === 0) return true;
      if (required === 1) return isBotAdmin || isGroupAdmin || isMod;
      if (required === 2) return isBotAdmin || isGroupAdmin;
      if (required === 3) return isBotAdmin || isMod;
      if (required === 4) return isBotAdmin;
      return false;
    }

    if (!hasAccess(requiredPermission)) {
      return api.sendMessage(global.getText("handleCommand", "permssionNotEnough", command.config.name), threadID, messageID);
    }

    // --- কুলডাউন চেক ---
    if (!cooldowns.has(command.config.name)) cooldowns.set(command.config.name, new Map());
    const timestamps = cooldowns.get(command.config.name);
    const expirationTime = (command.config.cooldowns || 1) * 1000;

    if (timestamps.has(senderID) && dateNow < timestamps.get(senderID) + expirationTime) {
      return api.sendMessage(`⏱ Wait ${formatTime(Math.ceil((timestamps.get(senderID) + expirationTime - dateNow) / 1000))}`, threadID, messageID);
    }

    // --- কমান্ড এক্সিকিউশন ---
    try {
      const getText = (v) => v; // ল্যাঙ্গুয়েজ সাপোর্ট মডিউলের ভেতর হ্যান্ডেল করার জন্য

      await command.run({ 
        api, event, args, models, Users, Threads, Currencies, Settings, SystemConfig,
        permission: permissionLevel, 
        isNonPrefix, 
        getText 
      });

      // এক্সপি (XP) সিস্টেম
      const userData = await Currencies.getData(senderID);
      if (userData) {
        let newExp = (userData.exp || 0) + 5;
        await Currencies.setData(senderID, { 
          exp: newExp, 
          level: Math.floor(Math.sqrt(1 + (8 * newExp) / 100) / 2) 
        });
      }

      timestamps.set(senderID, dateNow);
    } catch (e) {
      api.sendMessage(`[ ERROR ] ${commandName}: ${e.message || JSON.stringify(e)}`, threadID);
    }
  };
};
