const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const { Canvas, loadImage } = require("skia-canvas");

async function downloadVideo(videoUrl, filePath) {
  const apiUrl = `https://nayan-video-downloader.vercel.app/ytdown?url=${encodeURIComponent(videoUrl)}`;
  const res = await axios.get(apiUrl);
  const result = res.data.data?.data || res.data.data;
  if (!result || (!result.video && !result.video_hd)) throw new Error("Download link not found!");

  const finalUrl = result.video || result.video_hd;
  const response = await axios({ method: "get", url: finalUrl, responseType: "stream" });
  const writer = fs.createWriteStream(filePath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", () => resolve({ title: result.title, channel: result.channel }));
    writer.on("error", reject);
  });
}

module.exports.config = {
  name: "youtube",
  aliases: ["yt", "v", "video"],
  version: "6.1.4",
  permission: 0,
  prefix: true,
  author: "Adi.0X",
  description: "YouTube Search & Downloader with Canvas GUI",
  category: "Media",
  usages: "[name or link]",
  cooldowns: 5
};

module.exports.handleReply = async function ({ api, event, handleReply }) {
  const { threadID, messageID, body, senderID } = event;
  if (String(senderID) !== String(handleReply.author)) return;

  const choice = parseInt(body);
  if (isNaN(choice) || choice < 1 || choice > handleReply.links.length) {
    return api.sendMessage("❌ Please reply with a valid number.", threadID, messageID);
  }

  const cacheDir = path.join(__dirname, "cache");
  const videoUrl = handleReply.links[choice - 1];
  const filePath = path.join(cacheDir, `${Date.now()}.mp4`);

  // Instantly clean up tracking state to prevent fast multi-reply spamming
  if (global.client && global.client.handleReply) {
    const idx = global.client.handleReply.findIndex(item => item.messageID === handleReply.messageID);
    if (idx > -1) global.client.handleReply.splice(idx, 1);
  }

  try {
    api.unsendMessage(handleReply.messageID, threadID);
    api.setMessageReaction("🔅", messageID, threadID, () => {}, true);

    const waitMsg = await api.sendMessage("Processing your video request...", threadID);
    const info = await downloadVideo(videoUrl, filePath);

    try { await api.editMessage("Uploading video component...", waitMsg.messageID); } catch (e) {}

    await api.sendMessage({
      body: `🎬 ${info.title}\n📺 ${info.channel}`,
      attachment: fs.createReadStream(filePath)
    }, threadID, (err) => {
      api.unsendMessage(waitMsg.messageID, threadID);
      api.setMessageReaction("🎬", messageID, threadID, () => {}, true);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }, messageID);

  } catch (e) {
    api.sendMessage(`❌ Error processing media: ${e.message}`, threadID, messageID);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID, senderID } = event;
  const query = args.join(" ").trim();
  if (!query) return api.sendMessage("Please provide a song/video name or YouTube link.", threadID, messageID);

  const cacheDir = path.join(__dirname, "cache");
  fs.ensureDirSync(cacheDir);

  try {
    api.setMessageReaction("🔍", messageID, threadID, () => {}, true);

    const searchRes = await axios.get(`https://zeroex-tools.onrender.com/api/yt/search?q=${encodeURIComponent(query)}&limit=10`);
    const results = searchRes.data.results;

    if (!results || results.length === 0) return api.sendMessage("No results found matching your query.", threadID, messageID);

    const width = 1000; 
    const height = 1550;
    const canvas = new Canvas(width, height);
    const ctx = canvas.getContext("2d");

    // Render Base Interface Layout
    ctx.fillStyle = "#121212"; 
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#FFFFFF"; 
    ctx.font = "bold 42px sans-serif";
    ctx.fillText("YouTube Search Results", 50, 70);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"; 
    ctx.lineWidth = 2;
    ctx.beginPath(); 
    ctx.moveTo(50, 100); 
    ctx.lineTo(950, 100); 
    ctx.stroke();

    const links = []; 
    let y = 140;

    for (let i = 0; i < results.length; i++) {
      const video = results[i]; 
      links.push(video.url);

      // Attempt to load and clip image thumbnail safely
      try {
        const thumbImg = await loadImage(video.thumbnail);
        ctx.save(); 
        ctx.beginPath(); 
        ctx.roundRect(110, y, 200, 112, 12); 
        ctx.clip();
        ctx.drawImage(thumbImg, 110, y, 200, 112); 
        ctx.restore();
      } catch (e) {
        // Fallback graphical placeholder if image fails loading natively
        ctx.fillStyle = "#222222";
        ctx.beginPath();
        ctx.roundRect(110, y, 200, 112, 12);
        ctx.fill();
        ctx.fillStyle = "#444444";
        ctx.font = "20px sans-serif";
        ctx.fillText("No Preview", 160, y + 62);
      }

      // Draw Index Number
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)"; 
      ctx.font = "30px sans-serif";
      ctx.fillText(`${i + 1}`, 55, y + 65);

      // Draw Video Meta Header Strings
      ctx.fillStyle = "#FFFFFF"; 
      ctx.font = "bold 26px sans-serif";
      let displayTitle = video.title || "No Title";
      if (ctx.measureText(displayTitle).width > 600) {
        displayTitle = displayTitle.slice(0, 40) + "...";
      }
      ctx.fillText(displayTitle, 340, y + 35);

      ctx.fillStyle = "#999999"; 
      ctx.font = "20px sans-serif";
      ctx.fillText(`${video.author || "Unknown"} • ${video.duration || "N/A"}`, 340, y + 75);

      y += 140; 
    }

    const cardPath = path.join(cacheDir, `v_search_${Date.now()}.png`);
    await canvas.toFile(cardPath);

    return api.sendMessage({ 
      // body: "Reply with a number to download:",
      attachment: fs.createReadStream(cardPath)
    }, threadID, (err, info) => {
      if (fs.existsSync(cardPath)) fs.unlinkSync(cardPath);
      if (err) return;

      if (global.client && global.client.handleReply) {
        global.client.handleReply.push({ 
          name: module.exports.config.name, 
          messageID: info.messageID, 
          author: senderID, 
          links 
        });
      }
    }, messageID);

  } catch (e) {
    return api.sendMessage("❌ Interface Error: " + e.message, threadID, messageID);
  }
};
