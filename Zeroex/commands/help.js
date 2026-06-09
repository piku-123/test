module.exports.config = {
    name: "help",
    aliases: ["h"],
    version: "2.3.0",
    permission: 0,
    prefix: true,
    author: "Adi.0X",
    description: "View available commands categorized by type.",
    category: "Information & Help",
    usages: "[command name]",
    cooldowns: 5
};

const PERMISSION_LABELS = {
    0: "All Users",
    1: "Group Admins, Mod",
    2: "Bot Admins, Group Admins",
    3: "Bot Admins, Mod",
    4: "Bot Admins Only"
};

// টেক্সট র‍্যাপ করার ফাংশন
function wrapText(text, limit) {
    const words = text.split(' ');
    let lines = [];
    let currentLine = "";

    words.forEach(word => {
        if ((currentLine + word).length <= limit) {
            currentLine += (currentLine === "" ? "" : " ") + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    });
    lines.push(currentLine);
    return lines.join('\n┃   ');
}

module.exports.run = async function({ api, event, args }) {
    const { commands } = global.client;
    const { threadID, messageID } = event;
    const prefix = global.config.PREFIX;

    // COMMAND DETAILS (UPDATED UI)
    if (args[0]) {
        const command = commands.get(args[0].toLowerCase());
        if (!command)
            return api.sendMessage(`❌ Command "${args[0]}" not found.`, threadID, messageID);

        const { name, description, usages, category, cooldowns, aliases, permission, prefix: cmdPrefix } = command.config;

        const aliasText = aliases && aliases.length > 0 ? aliases.join(", ") : "None";
        const usageText = `${prefix}${name}${usages ? " " + usages : ""}`;

        // লাইন ব্রেকিং লজিক (সীমা ২৫ ক্যারেক্টার)
        const wrappedUsage = usageText.length > 25 ? wrapText(usageText, 25) : usageText;
        const wrappedDesc = (description || "N/A").length > 25 ? wrapText(description || "N/A", 25) : (description || "N/A");

        let detailMsg =
`┏ COMMAND DETAILS
┗━━━━━━━━━━━━━━━━━━━━
┏ ${name.toUpperCase()}
┃ • Aliases: ${aliasText}
┃ • Prefix: ${cmdPrefix ? "Required" : "Not Required"}
┃ • Category: ${category || "General"}
┃ • Permission: ${PERMISSION_LABELS[permission ?? 0]}
┃ • Cooldown: ${cooldowns || 0}s
┃ • Usage: ${wrappedUsage}
┃ • Description: ${wrappedDesc}
┗━━━━━━━━━━━━━━━━━━━━━`;

        return api.sendMessage(detailMsg, threadID, messageID);
    }

    // MAIN HELP LIST
    const categories = {};
    const distinctCommands = new Set();

    for (const [, value] of commands.entries()) {
        const cmdName = value.config.name;
        if (!distinctCommands.has(cmdName)) {
            distinctCommands.add(cmdName);
            const category = value.config.category || "Uncategorized";
            if (!categories[category]) categories[category] = [];
            categories[category].push(cmdName);
        }
    }

    let helpMessage =
`┏ ZEROEX BOT COMMANDS
┃ Total Commands: ${distinctCommands.size}
┗━━━━━━━━━━━━━━━━━━━━━━`;

    const categoryKeys = Object.keys(categories);
    categoryKeys.forEach((category) => {
        helpMessage += `\n\n┏ ${category.toUpperCase()}\n`;
        categories[category].forEach(cmd => {
            helpMessage += `┃ • ${cmd}\n`;
        });
        helpMessage += `┗━━━━━━━━━━━━━━`;
    });

    helpMessage += `\n\nType: ${prefix}help [command]`;
    return api.sendMessage(helpMessage, threadID, messageID);
};
