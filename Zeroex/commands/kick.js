module.exports.config = {
    name: "kick",
    aliases: ["remove"],
    version: "1.1.0",
    permission: 2,
    prefix: true,
    author: "Adi.0X",
    description: "Kick a member from the group",
    category: "Group Mod",
    usages: "[mention/reply]",
    cooldowns: 3
};

module.exports.run = async function ({ api, event, args }) {
    const { threadID, messageID, senderID, messageReply, mentions } = event;

    const threadInfo = await api.getThreadInfo(threadID);
    if (!threadInfo.isGroup) {
        return api.sendMessage("❌ This command only works in groups.", threadID, messageID);
    }

    let targetUID = null;

    if (Object.keys(mentions).length > 0) {
        targetUID = Object.keys(mentions)[0];
    } else if (messageReply) {
        targetUID = messageReply.senderID;
    } else {
        return api.sendMessage(
            "❌ Usage:\n• Mention someone: kick @name\n• Reply to their message: kick",
            threadID, messageID
        );
    }

    if (targetUID === senderID) {
        return api.sendMessage("❌ You can't kick yourself.", threadID, messageID);
    }

    const botID = api.getCurrentUserID();
    if (targetUID === botID) {
        return api.sendMessage("❌ You can't kick the bot.", threadID, messageID);
    }

    if (!threadInfo.participantIDs.includes(targetUID)) {
        return api.sendMessage("❌ This user is not in the group.", threadID, messageID);
    }

    let targetName = "Unknown";
    try {
        const info = await api.getUserInfo(targetUID);
        targetName = info[targetUID]?.name || "Unknown";
    } catch (_) {}

    try {
        await api.removeUserFromGroup(targetUID, threadID);
        return api.sendMessage(
            `✅ ${targetName} has been removed from the group.`,
            threadID, messageID
        );
    } catch (err) {
        return api.sendMessage(
            `❌ Failed to kick ${targetName}.\nMake sure the bot is an admin.\n\nError: ${err.message}`,
            threadID, messageID
        );
    }
};
