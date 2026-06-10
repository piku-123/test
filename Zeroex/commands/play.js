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
  name: "play",
  aliases: ["p", "song"],
  version: "3.1.0",
  permission: 0,
  prefix: false,
  author: "Adi.0X",
  description: "Instant YT Music Play",
  category: "Media",
  usages: "[song name]",
  cooldowns: 2
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const query = args.join(" ").trim();
  if (!query) return api.sendMessage("Please provide a song name.", threadID, messageID);

  const cacheDir = path.join(__dirname, "cache");
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  const filePath = path.join(cacheDir, `audio_${Date.now()}.mp3`);

  try {
    api.setMessageReaction("🔍", messageID, threadID, () => {}, true);

    const searchRes = await axios.get(`https://zeroex-all-rest-api.onrender.com/api/ytmusic/search?q=${encodeURIComponent(query)}&limit=1`);
    const results = searchRes.data.results;

    if (!results || results.length === 0) {
      api.setMessageReaction("❌", messageID, threadID, () => {}, true);
      return api.sendMessage("❌ No songs found.", threadID, messageID);
    }

    const selected = results[0];

    api.setMessageReaction("💭", messageID, threadID, () => {}, true);
    await downloadMusic(selected.videoId, filePath);

    api.setMessageReaction("⏩", messageID, threadID, () => {}, true);

    await api.sendMessage({
      body: `🎵 Title: ${selected.title}\n👤 Artist: ${selected.artist || "Unknown"}\n💿 Album: ${selected.album || "Single"}`,
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
