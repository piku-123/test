const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");

function extractVideoID(url) {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

async function downloadMusic(videoID, filePath) {
  const apiUrl = `https://zeroex-tools.onrender.com/api/yt/down?url=https://www.youtube.com/watch?v=${videoID}&format=mp3`;
  const res = await axios.get(apiUrl);

  if (!res.data || !res.data.status || !res.data.result || !res.data.result.downloadUrl) {
    throw new Error("Failed to get download URL from API");
  }

  return {
    downloadUrl: res.data.result.downloadUrl,
    title: res.data.result.title || "Audio Track"
  };
}

async function fetchAndSaveFile(downloadUrl, filePath) {
  const response = await axios({
    method: "get",
    url: downloadUrl,
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
  version: "3.3.0",
  permission: 0,
  prefix: false,
  author: "Adi.0X",
  description: "Instant YT Music Play",
  category: "Media",
  usages: "[song name or youtube url]",
  cooldowns: 2
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const query = args.join(" ").trim();
  if (!query) return api.sendMessage("Please provide a song name or YouTube link.", threadID, messageID);

  const cacheDir = path.join(__dirname, "cache");
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  const filePath = path.join(cacheDir, `audio_${Date.now()}.mp3`);

  try {
    api.setMessageReaction("🔍", messageID, threadID, () => {}, true);

    const directVideoID = extractVideoID(query);
    let videoID = directVideoID;
    let title = "";
    let artist = "";
    let album = "";

    if (!directVideoID) {
      const searchRes = await axios.get(`https://zeroex-all-rest-api.onrender.com/api/ytmusic/search?q=${encodeURIComponent(query)}&limit=1`);
      const results = searchRes.data.results;

      if (!results || results.length === 0) {
        api.setMessageReaction("❌", messageID, threadID, () => {}, true);
        return api.sendMessage("❌ No songs found.", threadID, messageID);
      }

      const selected = results[0];
      videoID = selected.videoId;
      title = selected.title || "Audio Track";
      artist = selected.artist || "Unknown";
      album = selected.album || "Single";
    }

    api.setMessageReaction("💭", messageID, threadID, () => {}, true);
    
    const downloadData = await downloadMusic(videoID, filePath);
    
    if (directVideoID) {
      title = downloadData.title;
    }

    await fetchAndSaveFile(downloadData.downloadUrl, filePath);

    api.setMessageReaction("⏩", messageID, threadID, () => {}, true);

    const messageBody = directVideoID 
      ? `🎵 Title: ${title}`
      : `🎵 Title: ${title}\n👤 Artist: ${artist}\n💿 Album: ${album}`;

    await api.sendMessage({
      body: messageBody,
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
