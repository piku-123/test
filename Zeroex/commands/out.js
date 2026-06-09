module.exports.config = {
    name: "out",
    aliases: ["leave"],
    version: "1.0.0",
    permission: 1,
    prefix: true,
    author: "Adi.0X",
    description: "Bot leaves the current group.",
    category: "Group Mod",
    usages: "",
    cooldowns: 5
};

module.exports.run = async function ({ api, event }) {
    const { threadID, messageID } = event;

    const threadInfo = await api.getThreadInfo(threadID);
    if (!threadInfo.isGroup) {
        return api.sendMessage("❌ This command only works in groups.", threadID, messageID);
    }

    await api.sendMessage("👋 Goodbye! Leaving the group now.", threadID);
    return api.removeUserFromGroup(api.getCurrentUserID(), threadID);
};
