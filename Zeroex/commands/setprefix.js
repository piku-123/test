const fs   = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(process.cwd(), "config.json");

function saveConfigFile(key, value) {
    try {
        const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
        cfg[key] = value;
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 4), "utf8");
        global.config[key] = value;
    } catch (e) {
        console.error("[setprefix] config.json write error:", e.message);
    }
}

module.exports.config = {
    name: "setprefix",
    aliases: ["prefix"],
    version: "1.4.0",
    permission: 0,
    prefix: false,
    author: "Adi.0X",
    description: "Change prefix with proper reaction confirmation handler.",
    category: "System",
    usages: "<prefix> | <prefix> --system | reset",
    cooldowns: 3
};

module.exports.run = async function ({ api, event, args, Threads, SystemConfig }) {
    const { threadID, messageID, senderID } = event;
    const sid = String(senderID);
    const isBotAdmin   = (global.config.ADMINBOT || []).includes(sid);
    const isMod        = (global.config.mod || []).includes(sid);
    const threadInfo   = global.data.threadInfo.get(String(threadID)) || {};
    const groupAdmins  = threadInfo.adminIDs || [];
    const isGroupAdmin = groupAdmins.some(a => String(a.id || a.uid) === sid);
    const hasPerm1     = isBotAdmin || isMod || isGroupAdmin;

    // ====== STATUS — no args ======
    if (!args[0]) {
        const threadSetting = global.data.threadData.get(String(threadID)) || {};
        const threadPrefix  = threadSetting.PREFIX || null;
        const systemPrefix  = global.config.PREFIX;
        return api.sendMessage(
            `💬 Group Prefix: ${threadPrefix ? `» ${threadPrefix} «` : `(Default: » ${systemPrefix} «)`}\n` +
            `🛸 System: » ${systemPrefix} «`,
            threadID, messageID
        );
    }

    const isSystemFlag = args.includes("--system");
    const newPrefix    = args.find(a => a !== "--system");

    // ====== RESET — remove group custom prefix ======
    if (newPrefix === "reset" && !isSystemFlag) {
        if (!hasPerm1) {
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            return api.sendMessage("Only Group Admins, Mods, or Bot Admins can reset the prefix.", threadID, messageID);
        }

        const threadData = global.data.threadData.get(String(threadID)) || {};
        delete threadData.PREFIX;
        global.data.threadData.set(String(threadID), threadData);
        await Threads.setData(threadID, { "data.PREFIX": null });

        api.setMessageReaction("✅", messageID, threadID, () => {}, true);
        return api.sendMessage(
            `Group prefix reset to system default: "${global.config.PREFIX}"`,
            threadID, messageID
        );
    }

    if (!newPrefix || newPrefix.length > 5) {
        api.setMessageReaction("❌", messageID, threadID, () => {}, true);
        return api.sendMessage("Prefix must be 1–5 characters.", threadID, messageID);
    }

    // ====== SYSTEM PREFIX VALIDATION ======
    if (isSystemFlag && !isBotAdmin) {
        api.setMessageReaction("❌", messageID, threadID, () => {}, true);
        return api.sendMessage("Only Bot Admins can change the system prefix.", threadID, messageID);
    }

    // ====== GROUP PREFIX VALIDATION ======
    if (!isSystemFlag && !hasPerm1) {
        api.setMessageReaction("❌", messageID, threadID, () => {}, true);
        return api.sendMessage("Only Group Admins, Mods, or Bot Admins can change the group prefix.", threadID, messageID);
    }

    // ====== CONFIRMATION FLOW ======
    const targetType = isSystemFlag ? "System" : "Group";
    const promptMsg = `Are you sure you want to change the ${targetType} prefix to » ${newPrefix} «?\n\n` +
                      `Please react to this message with any emoji to confirm.`;

    // ইউজারের মেসেজে সাথে সাথে ⚠️ রিঅ্যাক্ট করা হবে
    api.setMessageReaction("⚠️", messageID, threadID, () => {}, true);

    return api.sendMessage(promptMsg, threadID, (err, info) => {
        if (err) return;

        // বটের কোর হ্যান্ডলারে রিঅ্যাকশন অবজেক্ট পুশ (যা handleReaction.js ফাইল রিড করতে পারে)
        if (global.client && global.client.handleReaction) {
            global.client.handleReaction.push({
                name: this.config.name,
                messageID: info.messageID,
                author: sid,
                newPrefix: newPrefix,
                isSystemFlag: isSystemFlag,
                userMessageID: messageID
            });
        }
    }, messageID);
};

// ====== REACTION HANDLER ======
module.exports.handleReaction = async function ({ api, event, handleReaction, Threads, SystemConfig }) {
    const { threadID, userID, messageID } = event;

    // যে প্রিফিক্স চেঞ্জ করার রিকোয়েস্ট পাঠিয়েছে, সে ছাড়া অন্য কেউ রিঅ্যাক্ট করলে কাজ করবে না
    if (String(userID) !== String(handleReaction.author)) return;

    try {
        if (handleReaction.isSystemFlag) {
            // সিস্টেম প্রিফিক্স আপডেট
            await SystemConfig.setSetting("PREFIX", handleReaction.newPrefix);
            saveConfigFile("PREFIX", handleReaction.newPrefix);

            api.setMessageReaction("✅", handleReaction.userMessageID, threadID, () => {}, true);
            return api.editMessage(
                `System prefix changed to » ${handleReaction.newPrefix} «.\nSaved to config.json + MongoDB.`,
                handleReaction.messageID
            );
        } else {
            // গ্রুপ প্রিফিক্স আপডেট
            const threadData = global.data.threadData.get(String(threadID)) || {};
            await Threads.setData(threadID, { "data.PREFIX": handleReaction.newPrefix });
            threadData.PREFIX = handleReaction.newPrefix;
            global.data.threadData.set(String(threadID), threadData);

            api.setMessageReaction("✅", handleReaction.userMessageID, threadID, () => {}, true);
            return api.editMessage(
                `Group prefix changed to » ${handleReaction.newPrefix} «.\nThis only affects this group.`,
                handleReaction.messageID
            );
        }
    } catch (error) {
        return api.editMessage(`Error updating prefix: ${error.message}`, handleReaction.messageID);
    } finally {
        // কাজ শেষ হলে হ্যান্ডলার লিসেনার থেকে রিমুভ করে দেওয়া
        if (global.client && global.client.handleReaction) {
            const index = global.client.handleReaction.findIndex(e => e.messageID === handleReaction.messageID);
            if (index > -1) global.client.handleReaction.splice(index, 1);
        }
    }
};
