const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const { Canvas, loadImage } = require("skia-canvas");

// Music Download Function
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
//aliases: ["song", "ytmusic"],
  version: "2.7.0",
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
  const filePath = path.join(cacheDir, `audio_${Date.now()}.mp3`);

  try {
    // সার্চ ইমেজ আনসেন্ড করা
    api.unsendMessage(handleReply.messageID, threadID);

    // ডাউনলোড শুরু (Reaction) - format: (reaction, messageID, threadID, callback, force)
    api.setMessageReaction("💭", messageID, threadID, () => {}, true);

    await downloadMusic(selected.videoId, filePath);

    // আপলোড শুরু (Reaction)
    api.setMessageReaction("⏩", messageID, threadID, () => {}, true);

    await api.sendMessage({
      body: `🎵 Title: ${selected.title}\n👤 Artist: ${selected.artist}\n💿 Album: ${selected.album}`,
      attachment: fs.createReadStream(filePath)
    }, threadID, (err) => {
      // কাজ শেষ (Reaction)
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

  const cacheDir = path.join(__dirname, "cache");
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  try {
    // সার্চ শুরু (Reaction)
    api.setMessageReaction("🔍", messageID, threadID, () => {}, true);

    // লিমিট ৫ করে দেওয়া হয়েছে
    const searchRes = await axios.get(`https://zeroex-all-rest-api.onrender.com/api/ytmusic/search?q=${encodeURIComponent(query)}&limit=5`);
    const results = searchRes.data.results;
    if (!results || results.length === 0) return api.sendMessage("No songs found.", threadID, messageID);

    // ক্যানভাস সাইজ ছোট করা হয়েছে ৫টি রেজাল্টের জন্য (Height: 850)
    const canvas = new Canvas(1000, 850);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, 1000, 850);
    ctx.fillStyle = "#FF0000"; ctx.font = "bold 50px sans-serif";
    ctx.fillText("YouTube Music", 50, 80);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(50, 120); ctx.lineTo(950, 120); ctx.stroke();

    const thumbPromises = results.map(song => loadImage(song.thumbnail).catch(() => null));
    const thumbnails = await Promise.all(thumbPromises);

    const items = [];
    let y = 180;

    for (let i = 0; i < results.length; i++) {
      const song = results[i];
      items.push({ videoId: song.videoId, title: song.title, artist: song.artist, album: song.album });

      ctx.fillStyle = "#FF0000"; ctx.font = "bold 35px sans-serif";
      ctx.fillText(`${i + 1}`, 50, y + 60);

      if (thumbnails[i]) {
        ctx.save();
        ctx.beginPath(); ctx.roundRect(120, y, 100, 100, 10); ctx.clip();
        ctx.drawImage(thumbnails[i], 120, y, 100, 100);
        ctx.restore();
      }

      ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 30px sans-serif";
      let title = song.title || "Unknown";
      if (ctx.measureText(title).width > 650) title = title.slice(0, 35) + "...";
      ctx.fillText(title, 250, y + 40);

      ctx.fillStyle = "#aaaaaa"; ctx.font = "24px sans-serif";
      ctx.fillText(`${song.artist} • ${song.durationText}`, 250, y + 85);
      y += 130;
    }

    const imgPath = path.join(cacheDir, `search_${Date.now()}.png`);
    await canvas.toFile(imgPath);

    return api.sendMessage({
      attachment: fs.createReadStream(imgPath)
    }, threadID, (err, info) => {
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);

      global.client.handleReply.push({
        name: this.config.name,
        messageID: info.messageID,
        author: senderID,
        items
      });
    }, messageID);

  } catch (e) {
    return api.sendMessage("❌ Error: " + e.message, threadID, messageID);
  }
};
