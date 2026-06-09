module.exports.config = {
    name: "restart",
    aliases: ["r"],
    version: "1.0.0",
    permission: 3,
    prefix: true,
    author: "Adi.0X",
    description: "Restart the bot.",
    category: "System",
    usages: "",
    cooldowns: 10
};

module.exports.run = async function ({ api, event }) {
    const { threadID, messageID } = event;
    await api.sendMessage("Restarting bot... Please wait.", threadID, messageID);
    setTimeout(() => process.exit(1), 1000);
};
