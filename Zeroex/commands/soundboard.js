const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

module.exports.config = {
name: "soundboard",
aliases: ["sound", "sb"],
version: "3.1.2",
permission: 0,
prefix: false,
author: "Adi.0X",
description: "Search and play meme sounds from MyInstants.",
category: "Media",
usages: "[sound name]",
cooldowns: 3
};

async function sendAudio(api, event, url, name, listMessageID, userMessageID) {
const { threadID } = event;

const cacheDir = path.join(__dirname, "cache");
fs.ensureDirSync(cacheDir);

const filePath = path.join(cacheDir, `sound_${Date.now()}.mp3`);

try {
    api.setMessageReaction("🆗", userMessageID, threadID, () => {}, true);

    const response = await axios({
        method: "GET",
        url,
        responseType: "stream"
    });

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
    });

    api.setMessageReaction("⏩", userMessageID, threadID, () => {}, true);

    if (listMessageID) {
        try {
            await api.editMessage(`Playing: ${name}`, listMessageID);
        } catch (e) {}
    }

    await new Promise((resolve, reject) => {
        api.sendMessage(
            {
                body: name,
                attachment: fs.createReadStream(filePath)
            },
            threadID,
            (err) => {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }

                if (err) {
                    api.setMessageReaction("❌", userMessageID, threadID, () => {}, true);
                    return reject(err);
                }

                api.setMessageReaction("🔊", userMessageID, threadID, () => {}, true);
                resolve();
            },
            userMessageID
        );
    });

} catch (e) {
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }

    api.setMessageReaction("❌", userMessageID, threadID, () => {}, true);

    return api.sendMessage(
        `Error: ${e.message}`,
        threadID,
        userMessageID
    );
}

}

module.exports.handleReply = async function ({ api, event, handleReply }) {
const { threadID, messageID, body, senderID } = event;

if (String(senderID) !== String(handleReply.author)) return;

const index = parseInt(body) - 1;

if (isNaN(index) || index < 0 || index >= handleReply.results.length) {
    api.setMessageReaction("❌", messageID, threadID, () => {}, true);

    return api.sendMessage(
        "Please reply with a valid number.",
        threadID,
        messageID
    );
}

const selected = handleReply.results[index];

if (global.client && global.client.handleReply) {
    const idx = global.client.handleReply.findIndex(
        item => item.messageID === handleReply.messageID
    );

    if (idx > -1) {
        global.client.handleReply.splice(idx, 1);
    }
}

await sendAudio(
    api,
    event,
    selected.sound,
    selected.name,
    handleReply.messageID,
    handleReply.userMessageID
);

};

module.exports.run = async function ({ api, event, args }) {
const { threadID, messageID, senderID } = event;

const keyword = args.join(" ").trim();

if (!keyword) {
    api.setMessageReaction("❌", messageID, threadID, () => {}, true);

    return api.sendMessage(
        "Please provide a sound name.\nUsage: sound [sound name]",
        threadID,
        messageID
    );
}

try {
    api.setMessageReaction("🔍", messageID, threadID, () => {}, true);

    const res = await axios.get(
        `https://zeroex-tools.onrender.com/api/myinstants/search?query=${encodeURIComponent(keyword)}`
    );

    const results = res.data.results || [];

    if (!results.length) {
        api.setMessageReaction("❌", messageID, threadID, () => {}, true);

        return api.sendMessage(
            "No sounds found for your search.",
            threadID,
            messageID
        );
    }

    if (results.length === 1) {
        return await sendAudio(
            api,
            event,
            results[0].sound,
            results[0].name,
            null,
            messageID
        );
    }

    const limitedResults = results.slice(0, 10);

    let msg = `┏ SOUNDBOARD
┃ • Search: ${keyword}
┃ • Results: ${limitedResults.length}
┣━━━━━━━━━━━━━━━━━━━━━\n`;

    limitedResults.forEach((item, i) => {
        let displayName = item.name;

        if (displayName.length > 35) {
            displayName = displayName.slice(0, 32) + "...";
        }

        msg += `┃ ${i + 1}. ${displayName}\n`;
    });

    msg += `┣━━━━━━━━━━━━━━━━━━━━━
┃ Reply with a number
┗━━━━━━━━━━━━━━━━━━━━━`;

    return api.sendMessage(
        msg,
        threadID,
        (err, info) => {
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
        },
        messageID
    );

} catch (e) {
    api.setMessageReaction("❌", messageID, threadID, () => {}, true);

    return api.sendMessage(
        `API Error: ${e.message}`,
        threadID,
        messageID
    );
}

};
