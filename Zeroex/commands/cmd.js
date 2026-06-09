const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
    name: "cmd",
    aliases: ["c"],
    version: "2.2.1",
    permission: 4,
    prefix: false,
    author: "Adi.0X",
    description: "Manage and reload modules with config.json sync",
    category: "System",
    usages: "[load/loadall/unload] [command/event] [name]",
    cooldowns: 2
};

module.exports.run = async function ({ api, event, args }) {
    const { threadID, messageID } = event;
    const { commands, events } = global.client;

    if (args.length < 1) return api.sendMessage("Usage: cmd [load/loadall/unload] [command/event] [name]", threadID, messageID);

    const action = args[0].toLowerCase();
    const type = args[1]?.toLowerCase();
    const name = args[2];

    const configPath = path.join(process.cwd(), "config.json");
    const commandPath = path.join(process.cwd(), "Zeroex", "commands");
    const eventPath = path.join(process.cwd(), "Zeroex", "events");

    let config = fs.readJsonSync(configPath);
    let successNames = [];

    // --- LOAD / LOADALL ---
    if (action === "load" || action === "loadall") {
        if (!type) return api.sendMessage("Specify type (command/event).", threadID, messageID);

        const targetDir = type === "event" ? eventPath : commandPath;
        const filesToLoad = action === "loadall" ? 
            fs.readdirSync(targetDir).filter(file => file.endsWith(".js")) : 
            [`${name}.js`];

        for (const file of filesToLoad) {
            try {
                const filePath = path.join(targetDir, file);
                if (!fs.existsSync(filePath)) continue;

                delete require.cache[require.resolve(filePath)];
                const module = require(filePath);
                const moduleName = module.config.name;

                if (type === "event") {
                    events.delete(moduleName);
                    events.set(moduleName, module);
                    config.eventDisabled = config.eventDisabled.filter(e => e !== file);
                } else {
                    commands.delete(moduleName);
                    commands.set(moduleName, module);
                    config.commandDisabled = config.commandDisabled.filter(c => c !== file);
                }
                successNames.push(moduleName);
            } catch (e) { console.error(e); }
        }

        if (successNames.length === 0) return api.sendMessage(`No ${type} was loaded. Check the name.`, threadID, messageID);

        fs.writeJsonSync(configPath, config, { spaces: 4 });
        return api.sendMessage(`Loaded ${successNames.length} ${type}(s): ${successNames.join(", ")}\nConfig updated.`, threadID, messageID);
    }

    // --- UNLOAD ---
    if (action === "unload") {
        if (!type || !name) return api.sendMessage("Specify type and name.", threadID, messageID);

        const fileName = `${name}.js`;
        if (type === "event") {
            if (!events.has(name)) return api.sendMessage("Event not found.", threadID, messageID);
            events.delete(name);
            if (!config.eventDisabled.includes(fileName)) config.eventDisabled.push(fileName);
        } else {
            if (!commands.has(name)) return api.sendMessage("Command not found.", threadID, messageID);
            commands.delete(name);
            if (!config.commandDisabled.includes(fileName)) config.commandDisabled.push(fileName);
        }

        fs.writeJsonSync(configPath, config, { spaces: 4 });
        return api.sendMessage(`Unloaded ${type}: ${name}\nAdded to disabled list.`, threadID, messageID);
    }

    return api.sendMessage("Invalid action.", threadID, messageID);
};
