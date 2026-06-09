const axios = require("axios");

module.exports.config = {
    name: "adduser",
    aliases: ["add"],
    version: "1.0.0",
    permission: 2,
    prefix: true,
    author: "Adi.0X",
    description: "Add a user to the group by reply, mention, UID, or Facebook profile link.",
    category: "Group Mod",
    usages: "[reply / @mention / uid / fb link]",
    cooldowns: 5
};

function extractIdFromUrl(url) {
    if (!url || typeof url !== "string") return null;
    const profilePhpMatch = url.match(/profile\.php\?id=(\d+)/i);
    if (profilePhpMatch) return profilePhpMatch[1];
    const numericPathMatch = url.match(/facebook\.com\/(\d{5,})(?:[/?#]|$)/i);
    if (numericPathMatch) return numericPathMatch[1];
    return null;
}

function isFacebookLink(input) {
    if (!input || typeof input !== "string") return false;
    return /(facebook\.com|fb\.me|fb\.com|m\.facebook\.com|fb\.watch)/i.test(input);
}

async function resolveFacebookId(link) {
    const direct = extractIdFromUrl(link);
    if (direct) return direct;
    try {
        const apiUrl = `https://fb-pp-api.vercel.app/api/fb-uid?link=${encodeURIComponent(link)}`;
        const res = await axios.get(apiUrl);
        if (res.data && res.data.id) return String(res.data.id);
    } catch (e) {
        console.error("ZeroEx API Request Failed:", e.message);
    }
    return null;
}

module.exports.run = async function ({ api, event, args }) {
    const { threadID, messageID, mentions, messageReply } = event;

    const threadInfo = await api.getThreadInfo(threadID);
    if (!threadInfo.isGroup) {
        return api.sendMessage("❌ This command only works in groups.", threadID, messageID);
    }

    let targetUID = null;

    if (messageReply) {
        targetUID = messageReply.senderID;
    } else if (mentions && Object.keys(mentions).length > 0) {
        targetUID = Object.keys(mentions)[0];
    } else if (args[0]) {
        const input = args[0].trim();
        if (/^\d{5,}$/.test(input)) {
            targetUID = input;
        } else if (isFacebookLink(input)) {
            targetUID = await resolveFacebookId(input);
            if (!targetUID) {
                return api.sendMessage("❌ Could not resolve UID from the given Facebook link.", threadID, messageID);
            }
        } else {
            return api.sendMessage(
                "❌ Usage:\n• Reply to a message\n• Mention someone: adduser @name\n• Provide UID: adduser 123456789\n• Provide FB link: adduser https://facebook.com/...",
                threadID, messageID
            );
        }
    } else {
        return api.sendMessage(
            "❌ Usage:\n• Reply to a message\n• Mention someone: adduser @name\n• Provide UID: adduser 123456789\n• Provide FB link: adduser https://facebook.com/...",
            threadID, messageID
        );
    }

    targetUID = String(targetUID);

    if (threadInfo.participantIDs.includes(targetUID)) {
        return api.sendMessage("❌ This user is already in the group.", threadID, messageID);
    }

    let targetName = targetUID;
    try {
        const info = await api.getUserInfo(targetUID);
        targetName = info[targetUID]?.name || targetUID;
    } catch (_) {}

    try {
        await api.addUserToGroup(targetUID, threadID);
        return api.sendMessage(`✅ ${targetName} has been added to the group.`, threadID, messageID);
    } catch (err) {
        return api.sendMessage(
            `❌ Failed to add ${targetName}.\nMake sure the bot is an admin.\n\nError: ${err.message}`,
            threadID, messageID
        );
    }
};
