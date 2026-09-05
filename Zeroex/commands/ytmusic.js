const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");

async function downloadMusic(videoID, filePath) {
  const apiUrl = `https://zeroex-tools.onrender.com/api/yt-mp3?url=https://www.youtube.com/watch?v=${videoID}`;
  const response = await axios({
    method: "get",
    url: apiUrl,
    responseType: "stream"
  });

  const writer = fs.createWriteStream(filePath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

module.exports.config = {
  name: "ytmusic",
  // aliases: ["song", "ytmusic"],
  version: "3.6.0",
  permission: 0,
  prefix: false,
  author: "Adi.0X",
  description: "YT Music Search & Play",
  category: "Media",
  usages: "[song name]",
  cooldowns: 2
};

module.exports.handleReply = async function ({ api, event, handleReply }) {
  const { threadID, messageID, body, senderID } = event;
  if (senderID !== handleReply.author) return;

  const choice = parseInt(body);
  const selected = handleReply.items[choice - 1];
  if (!selected) return api.sendMessage("❌ Please reply with a valid number.", threadID, messageID);

  const cacheDir = path.join(__dirname, "cache");
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  const filePath = path.join(cacheDir, `audio_${Date.now()}.mp3`);

  try {
    api.unsendMessage(handleReply.messageID, threadID);

    api.setMessageReaction("💭", messageID, threadID, () => {}, true);

    await downloadMusic(selected.videoId, filePath);

    api.setMessageReaction("⏩", messageID, threadID, () => {}, true);

    await api.sendMessage({
      body: `🎵 Title: ${selected.title}\n👤 Artist: ${selected.artist}\n💿 Album: ${selected.album || "N/A"}`,
      attachment: fs.createReadStream(filePath)
    }, threadID, (err) => {
      api.setMessageReaction("🎧", messageID, threadID, () => {}, true);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }, messageID);

  } catch (e) {
    api.sendMessage(`❌ Error: ${e.message}`, threadID, messageID);
    api.setMessageReaction("❌", messageID, threadID, () => {}, true);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID, senderID } = event;
  const query = args.join(" ").trim();
  if (!query) return api.sendMessage("Please provide a song name.", threadID, messageID);

  try {
    api.setMessageReaction("🔍", messageID, threadID, () => {}, true);

    const searchRes = await axios.get(`https://zeroex-all-rest-api.onrender.com/api/ytmusic/search?q=${encodeURIComponent(query)}&limit=5`);
    const results = searchRes.data.results;
    if (!results || results.length === 0) return api.sendMessage("No songs found.", threadID, messageID);

    const items = [];
    let msgText = "🎧 𝗬𝗢𝗨𝗧𝗨𝗕𝗘 𝗠𝗨𝗦𝗜𝗖 𝗦𝗘𝗔𝗥𝗖𝗛\n";
    msgText += "━━━━━━━━━━━━━━━━━━━\n\n";

    results.forEach((song, index) => {
      items.push({
        videoId: song.videoId,
        title: song.title,
        artist: song.artist,
        album: song.album
      });

      const duration = song.durationText || song.duration || "N/A";
      const artist = song.artist || "Unknown Artist";

      msgText += `${index + 1}. ${song.title} - ${artist} (${duration})\n\n`;
    });

    msgText += "━━━━━━━━━━━━━━━━━━━\n";
    msgText += "👉 Reply with the song number (1-5) to download.";
    return api.sendMessage(msgText, threadID, (err, info) => {
      if (err) return console.error(err);

      global.client.handleReply.push({
        name: this.config.name,
        messageID: info.messageID,
        author: senderID,
        items
      });
    }, messageID);

  } catch (e) {
    api.setMessageReaction("❌", messageID, threadID, () => {}, true);
    return api.sendMessage("❌ Error: " + e.message, threadID, messageID);
  }
};
