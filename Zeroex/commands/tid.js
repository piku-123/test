module.exports.config = {
    name: "tid",
    aliases: ["threadid", "gid"],
    version: "2.0.0",
    permission: 0,
    prefix: true,
    author: "Adi.0X",
    description: "Show current thread ID.",
    category: "Information & Help",
    usages: "",
    cooldowns: 3
};

module.exports.run = async function ({ api, event }) {
    return api.sendMessage(String(event.threadID), event.threadID, event.messageID);
};
