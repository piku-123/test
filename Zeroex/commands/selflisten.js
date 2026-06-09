module.exports.config = {
    name: "selflisten",
    aliases: ["selfmode"],
    version: "1.0.0",
    permission: 4,
    prefix: true,
    author: "Adi.0X",
    description: "Turn bot's self-listen mode on or off. State is saved in MongoDB.",
    category: "System",
    usages: "[on/off/status]",
    cooldowns: 5
};

module.exports.run = async function ({ api, event, args, SystemConfig }) {
    const { threadID, messageID } = event;

    const sub = (args[0] || "").toLowerCase();

    if (!sub || sub === "status") {
        const current = await SystemConfig.getSetting("selfListen", global.config?.FCAOption?.selfListen ?? true);
        return api.sendMessage(
            `🔍 Self-listen is currently: ${current ? "✅ ON" : "❌ OFF"}`,
            threadID, messageID
        );
    }

    if (sub !== "on" && sub !== "off") {
        return api.sendMessage(
            "❌ Usage: selflisten [on/off/status]",
            threadID, messageID
        );
    }

    const newValue = sub === "on";
    const current = await SystemConfig.getSetting("selfListen", global.config?.FCAOption?.selfListen ?? true);

    if (current === newValue) {
        return api.sendMessage(
            `⚠️ Self-listen is already ${newValue ? "ON" : "OFF"}.`,
            threadID, messageID
        );
    }

    const ok = await SystemConfig.setSetting("selfListen", newValue);
    if (!ok) {
        return api.sendMessage("❌ Failed to save setting to database.", threadID, messageID);
    }

    try {
        api.setOptions({ selfListen: newValue });
    } catch (_) {}

    return api.sendMessage(
        `✅ Self-listen turned ${newValue ? "ON" : "OFF"}`,
        threadID, messageID
    );
};
