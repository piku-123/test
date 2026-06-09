const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");

module.exports.config = {
    name: "adc",
    aliases: [],
    version: "3.0.0",
    permission: 4,
    prefix: true,
    author: "Adi.0X",
    description: "Download command/event from URL, Pastebin, Buildtool, Google Drive, or plain text reply.",
    category: "System",
    usages: "[filename] | [url] [filename] [--load]",
    cooldowns: 5,
    dependencies: {
        "axios": "",
        "fs-extra": "",
        "cheerio": "",
        "request": "",
        "pastebin-api": ""
    }
};

// ─── cmd.js এর load logic ─────────────────────────────────────
function loadModule(type, fileName) {
    const { commands, events } = global.client;
    const configPath = path.join(process.cwd(), "config.json");
    const basePath = path.join(process.cwd(), "Zeroex", type === "event" ? "events" : "commands");
    const filePath = path.join(basePath, fileName);

    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

    let config = fs.readJsonSync(configPath);

    delete require.cache[require.resolve(filePath)];
    const mod = require(filePath);
    const moduleName = mod.config.name;

    if (type === "event") {
        events.delete(moduleName);
        events.set(moduleName, mod);
        config.eventDisabled = (config.eventDisabled || []).filter(e => e !== fileName);
    } else {
        commands.delete(moduleName);
        commands.set(moduleName, mod);
        config.commandDisabled = (config.commandDisabled || []).filter(c => c !== fileName);
    }

    fs.writeJsonSync(configPath, config, { spaces: 4 });
    return moduleName;
}

function detectType(fileName, content) {
    if (content.includes("eventType")) return "event";
    if (fileName.toLowerCase().includes("event")) return "event";
    return "command";
}

function normalizePastebin(url) {
    if (url.includes("pastebin.com/raw/")) return url;
    const match = url.match(/pastebin\.com\/([a-zA-Z0-9]+)$/);
    if (match) return `https://pastebin.com/raw/${match[1]}`;
    return url;
}

function getGDriveId(url) {
    const match = url.match(/[-\w]{25,}/);
    return match ? match[0] : null;
}

async function saveAndRespond({ api, event, fileContent, fileName, shouldLoad }) {
    const { threadID, messageID } = event;

    const type = detectType(fileName, fileContent);
    const targetDir = path.join(process.cwd(), "Zeroex", type === "event" ? "events" : "commands");

    fs.ensureDirSync(targetDir);
    fs.writeFileSync(path.join(targetDir, fileName), fileContent, "utf8");

    if (!shouldLoad) {
        return api.sendMessage(
            `Applied code to ${fileName}\nType: ${type}\nTo load: cmd load ${type} ${fileName.replace(".js", "")}`,
            threadID, messageID
        );
    }

    try {
        const moduleName = loadModule(type, fileName);
        return api.sendMessage(
            `Downloaded and loaded: ${fileName}\nType: ${type}\nName: ${moduleName}`,
            threadID, messageID
        );
    } catch (err) {
        return api.sendMessage(
            `File saved but load failed.\nError: ${err.message}\nTry: cmd load ${type} ${fileName.replace(".js", "")}`,
            threadID, messageID
        );
    }
}

module.exports.run = async function ({ api, event, args }) {
    const request = require("request");
    const cheerio = require("cheerio");

    const { threadID, messageID, messageReply, type } = event;

    if (args.length < 1) {
        return api.sendMessage(
            "Usage:\n\n" +
            "1. Reply to text/code message:\n" +
            "   adc filename [--load]\n\n" +
            "2. Reply to message with URL:\n" +
            "   adc filename [--load]\n\n" +
            "3. Direct URL:\n" +
            "   adc filename url [--load]\n\n" +
            "4. Export to Pastebin:\n" +
            "   adc filename (no reply)\n\n" +
            "Sources: Pastebin, Buildtool, TinyURL, Google Drive, any URL\n" +
            "--load flag: auto load after download",
            threadID, messageID
        );
    }

    const shouldLoad = args.includes("--load");
    const cleanArgs = args.filter(a => a !== "--load");

    // args থেকে url আর filename আলাদা করো
    const urlArg = cleanArgs.find(a => a.startsWith("http://") || a.startsWith("https://"));
    const nameArg = cleanArgs.find(a => !a.startsWith("http"));
    const fileName = nameArg
        ? (nameArg.endsWith(".js") ? nameArg : `${nameArg}.js`)
        : null;

    const replyBody = messageReply?.body || "";
    const replyUrl = replyBody.match(/https?:\/\/[^\s]+/)?.[0] || null;
    const sourceUrl = urlArg || replyUrl;

    api.setMessageReaction("🔄", messageID, threadID, () => {}, true);

    // ─── CASE 1: reply → plain text/code → file create ───────
    if (type === "message_reply" && !sourceUrl && replyBody && fileName) {
        try {
            await saveAndRespond({ api, event, fileContent: replyBody, fileName, shouldLoad });
            api.setMessageReaction("✅", messageID, threadID, () => {}, true);
        } catch (err) {
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            api.sendMessage(`Failed to save file: ${err.message}`, threadID, messageID);
        }
        return;
    }

    // ─── CASE 2: no reply, no url → export to Pastebin ───────
    if (!sourceUrl && fileName) {
        const cmdPath = path.join(process.cwd(), "Zeroex", "commands", fileName);
        const evtPath = path.join(process.cwd(), "Zeroex", "events", fileName);
        const readPath = fs.existsSync(cmdPath) ? cmdPath : fs.existsSync(evtPath) ? evtPath : null;

        if (!readPath) {
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            return api.sendMessage(`Command/event "${fileName}" does not exist.`, threadID, messageID);
        }

        try {
            const { PasteClient } = require("pastebin-api");
            const client = new PasteClient("R02n6-lNPJqKQCd5VtL4bKPjuK6ARhHb");
            const data = fs.readFileSync(readPath, "utf-8");

            const url = await client.createPaste({
                code: data,
                expireDate: "N",
                format: "javascript",
                name: fileName,
                publicity: 1
            });

            const rawUrl = `https://pastebin.com/raw/${url.split("/")[3]}`;
            api.setMessageReaction("✅", messageID, threadID, () => {}, true);
            return api.sendMessage(rawUrl, threadID, messageID);
        } catch (err) {
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            return api.sendMessage(`Pastebin export failed: ${err.message}`, threadID, messageID);
        }
    }

    if (!sourceUrl) {
        api.setMessageReaction("❌", messageID, threadID, () => {}, true);
        return api.sendMessage("No URL found. Reply to a message with a link, or provide a URL directly.", threadID, messageID);
    }

    if (!fileName) {
        api.setMessageReaction("❌", messageID, threadID, () => {}, true);
        return api.sendMessage("Provide a filename.\nExample: adc mycommand https://pastebin.com/xxx --load", threadID, messageID);
    }

    // ─── PASTEBIN ─────────────────────────────────────────────
    if (sourceUrl.includes("pastebin.com")) {
        try {
            const rawUrl = normalizePastebin(sourceUrl);
            const res = await axios.get(rawUrl, { timeout: 10000 });
            await saveAndRespond({ api, event, fileContent: String(res.data), fileName, shouldLoad });
            api.setMessageReaction("✅", messageID, threadID, () => {}, true);
        } catch (err) {
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            api.sendMessage(`Pastebin download failed: ${err.message}`, threadID, messageID);
        }
        return;
    }

    // ─── BUILDTOOL / TINYURL ──────────────────────────────────
    if (sourceUrl.includes("buildtool") || sourceUrl.includes("tinyurl.com")) {
        request({ method: "GET", url: sourceUrl }, async (error, response, body) => {
            if (error) {
                api.setMessageReaction("❌", messageID, threadID, () => {}, true);
                return api.sendMessage("Invalid buildtool/tinyurl link.", threadID, messageID);
            }
            const $ = cheerio.load(body);
            let code = null;
            $(".language-js").each((i, el) => {
                if (i !== 0) return;
                code = el.children[0]?.data;
            });
            if (!code) {
                api.setMessageReaction("❌", messageID, threadID, () => {}, true);
                return api.sendMessage("Could not extract code from buildtool page.", threadID, messageID);
            }
            try {
                await saveAndRespond({ api, event, fileContent: code, fileName, shouldLoad });
                api.setMessageReaction("✅", messageID, threadID, () => {}, true);
            } catch (err) {
                api.setMessageReaction("❌", messageID, threadID, () => {}, true);
                api.sendMessage(`Save failed: ${err.message}`, threadID, messageID);
            }
        });
        return;
    }

    // ─── GOOGLE DRIVE ─────────────────────────────────────────
    if (sourceUrl.includes("drive.google.com")) {
        const id = getGDriveId(sourceUrl);
        if (!id) {
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            return api.sendMessage("Could not extract Google Drive file ID.", threadID, messageID);
        }
        try {
            const fType = detectType(fileName, "");
            const targetDir = path.join(process.cwd(), "Zeroex", fType === "event" ? "events" : "commands");
            fs.ensureDirSync(targetDir);
            const savePath = path.join(targetDir, fileName);

            const res = await axios.get(
                `https://drive.google.com/u/0/uc?id=${id}&export=download`,
                { responseType: "arraybuffer", timeout: 15000 }
            );
            fs.writeFileSync(savePath, res.data);

            if (shouldLoad) {
                try {
                    const moduleName = loadModule(fType, fileName);
                    api.setMessageReaction("✅", messageID, threadID, () => {}, true);
                    return api.sendMessage(
                        `Downloaded and loaded: ${fileName}\nName: ${moduleName}`,
                        threadID, messageID
                    );
                } catch (err) {
                    api.setMessageReaction("⚠️", messageID, threadID, () => {}, true);
                    return api.sendMessage(
                        `Downloaded but load failed: ${err.message}\nTry: cmd load ${fType} ${fileName.replace(".js", "")}`,
                        threadID, messageID
                    );
                }
            }

            api.setMessageReaction("✅", messageID, threadID, () => {}, true);
            return api.sendMessage(
                `Downloaded from Google Drive: ${fileName}\nTo load: cmd load ${fType} ${fileName.replace(".js", "")}`,
                threadID, messageID
            );
        } catch (err) {
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            return api.sendMessage(`Google Drive download failed: ${err.message}`, threadID, messageID);
        }
    }

    // ─── Generic URL ──────────────────────────────────────────
    try {
        const res = await axios.get(sourceUrl, {
            timeout: 15000,
            responseType: "text",
            headers: { "User-Agent": "Mozilla/5.0" }
        });
        await saveAndRespond({ api, event, fileContent: String(res.data), fileName, shouldLoad });
        api.setMessageReaction("✅", messageID, threadID, () => {}, true);
    } catch (err) {
        api.setMessageReaction("❌", messageID, threadID, () => {}, true);
        api.sendMessage(`Download failed: ${err.message}`, threadID, messageID);
    }
};