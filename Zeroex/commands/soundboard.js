const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

module.exports.config = {
    name: "soundboard",
    aliases: ["sound", "sb"],
    version: "3.1.1",
    permission: 0,
    prefix: false,
    author: "Adi.0X",
    description: "Search and play meme sounds from MyInstants with reaction tracker.",
    category: "Media",
    usages: "[sound name]",
    cooldowns: 3
};

// টেক্সট র‍্যাপ করার ফাংশন (লং টেক্সটের জন্য)
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
    return lines.join('\n┃ ');
}

async function sendAudio(api, event, url, name, listMessageID, userMessageID) {
    const { threadID } = event;
    const cacheDir = path.join(__dirname, "cache");
    fs.ensureDirSync(cacheDir);

    const cachePath = path.join(cacheDir, `sound_${Date.now()}.mp3`);

    try {
        // Download reaction
        api.setMessageReaction("😃", userMessageID, threadID, () => {}, true);

        // Download audio stream
        const response = await axios({ method: "GET", url, responseType: "stream" });
        const writer = fs.createWriteStream(cachePath);
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
        });

        // Upload reaction
        api.setMessageReaction("⏩", userMessageID, threadID, () => {}, true);

        // Update list message status if it exists
        if (listMessageID) {
            await api.editMessage(`┃ ▶ Now Playing: ${name}`, listMessageID);
        }

        // Send audio attachment
        await new Promise((resolve, reject) => {
            api.sendMessage({
                body: `┏━━━━━━━━━━━━━━━━━━━━\n┃ 🔊 NOW PLAYING\n┃\n┃ ${wrapText(name, 25)}\n┗━━━━━━━━━━━━━━━━━━━━`,
                attachment: fs.createReadStream(cachePath)
            }, threadID, (err) => {
                if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
                if (err) {
                    api.setMessageReaction("❌", userMessageID, threadID, () => {}, true);
                    return reject(err);
                }
                api.setMessageReaction("🔊", userMessageID, threadID, () => {}, true);
                resolve();
            }, userMessageID);
        });

    } catch (e) {
        if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
        api.setMessageReaction("❌", userMessageID, threadID, () => {}, true);
        return api.sendMessage(`┏━━━━━━━━━━━━━━━━━━━━\n┃ ❌ ERROR\n┃\n┃ ${wrapText(e.message, 25)}\n┗━━━━━━━━━━━━━━━━━━━━`, threadID, userMessageID);
    }
}

module.exports.handleReply = async function ({ api, event, handleReply }) {
    const { threadID, messageID, body, senderID } = event;

    // Only the original executor can choose an option
    if (String(senderID) !== String(handleReply.author)) return;

    const index = parseInt(body) - 1;

    if (isNaN(index) || index < 0 || index >= handleReply.results.length) {
        api.setMessageReaction("❌", messageID, threadID, () => {}, true);
        return api.sendMessage("┏━━━━━━━━━━━━━━━━━━━━\n┃ ❌ INVALID\n┃\n┃ Please reply with a valid number\n┗━━━━━━━━━━━━━━━━━━━━", threadID, messageID);
    }

    const selected = handleReply.results[index];

    // Instantly clear the handleReply object before async execution to prevent spamming/race-conditions
    if (global.client && global.client.handleReply) {
        const idx = global.client.handleReply.findIndex(item => item.messageID === handleReply.messageID);
        if (idx > -1) global.client.handleReply.splice(idx, 1);
    }

    // Pass off to media processing function
    await sendAudio(api, event, selected.sound, selected.name, handleReply.messageID, handleReply.userMessageID);
};

module.exports.run = async function ({ api, event, args }) {
    const { threadID, messageID, senderID } = event;
    const keyword = args.join(" ").trim();

    if (!keyword) {
        api.setMessageReaction("❌", messageID, threadID, () => {}, true);
        return api.sendMessage("┏━━━━━━━━━━━━━━━━━━━━\n┃ ❌ MISSING\n┃\n┃ Please provide a sound name!\n┃\n┃ Usage: sound [sound name]\n┗━━━━━━━━━━━━━━━━━━━━", threadID, messageID);
    }

    try {
        api.setMessageReaction("🧐", messageID, threadID, () => {}, true);

        const res = await axios.get(`https://zeroex-tools.onrender.com/api/myinstants/search?query=${encodeURIComponent(keyword)}`);
        const results = res.data.results;

        if (!results || results.length === 0) {
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            return api.sendMessage("┏━━━━━━━━━━━━━━━━━━━━\n┃ 🔍 NO RESULTS\n┃\n┃ No sounds found for your search.\n┗━━━━━━━━━━━━━━━━━━━━", threadID, messageID);
        }

        // Fast-path execution if exactly one sound profile matches the criteria
        if (results.length === 1) {
            return await sendAudio(api, event, results[0].sound, results[0].name, null, messageID);
        }

        const limitedResults = results.slice(0, 10);

        // ইউনিকোড বক্স ডিজাইন সহ মেসেজ তৈরি
        let msg = `┏━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `┃ 🔍 SOUND SEARCH\n`;
        msg += `┃\n`;
        msg += `┃ Keyword: ${wrapText(keyword, 23)}\n`;
        msg += `┃ Results: ${limitedResults.length}\n`;
        msg += `┣━━━━━━━━━━━━━━━━━━━━\n`;

        limitedResults.forEach((item, i) => {
            let displayName = item.name.length > 30 ? item.name.substring(0, 27) + "..." : item.name;
            msg += `┃ ${(i + 1).toString().padStart(2)}. ${displayName}\n`;
        });

        msg += `┣━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `┃ 💬 Reply with a number\n`;
        msg += `┃    to play the sound.\n`;
        msg += `┗━━━━━━━━━━━━━━━━━━━━`;

        return api.sendMessage(msg, threadID, (err, info) => {
            if (err) return;
            if (global.client && global.client.handleReply) {
                global.client.handleReply.push({
                    name: module.exports.config.name,
                    messageID: info.messageID,
                    author: senderID,
                    results: limitedResults,
                    userMessageID: messageID
                });
            }
        }, messageID);

    } catch (e) {
        api.setMessageReaction("❌", messageID, threadID, () => {}, true);
        return api.sendMessage(`┏━━━━━━━━━━━━━━━━━━━━\n┃ ❌ API ERROR\n┃\n┃ ${wrapText(e.message, 25)}\n┗━━━━━━━━━━━━━━━━━━━━`, threadID, messageID);
    }
};