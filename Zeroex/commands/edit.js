const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
  name: "edit",
  version: "1.5.0",
  permission: 0,
  prefix: false,
  author: "Adi.0X",
  description: "AI image editing",
  category: "Tools",
  usages: "reply to image with [prompt]",
  cooldowns: 5
};

module.exports.run = async function ({ api, event, args }) {
  const { messageReply, threadID, messageID } = event;

  if (!messageReply || !messageReply.attachments || messageReply.attachments[0].type !== "photo") {
    return api.sendMessage("❌ Please reply to a photo.", threadID, messageID);
  }

  const prompt = args.join(" ");
  if (!prompt) return api.sendMessage("💡 Please provide a prompt.", threadID, messageID);

  const cacheDir = path.join(__dirname, "cache");
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  
  const inputPath = path.join(cacheDir, `in_${Date.now()}.jpg`);
  const outputPath = path.join(cacheDir, `out_${Date.now()}.jpg`);

  try {
    api.setMessageReaction("⚙️", messageID, threadID, () => {}, true);

    const response = await axios.get(messageReply.attachments[0].url, { responseType: 'arraybuffer' });
    fs.writeFileSync(inputPath, Buffer.from(response.data));

    api.setMessageReaction("☁️", messageID, threadID, () => {}, true);
    
    const form = new FormData();
    form.append("file", fs.createReadStream(inputPath));
    const uploadRes = await axios.post("https://tmpfiles.org/api/v1/upload", form, { headers: { ...form.getHeaders() } });
    const directDlLink = uploadRes.data.data.url.replace("tmpfiles.org/", "tmpfiles.org/dl/");

    api.setMessageReaction("🪄", messageID, threadID, () => {}, true);
    
    const editApi = `https://zeroex-all-rest-api.onrender.com/api/gemini/edit?url=${encodeURIComponent(directDlLink)}&prompt=${encodeURIComponent(prompt)}`;
    const editRes = await axios.get(editApi, { responseType: "arraybuffer" });
    
    fs.writeFileSync(outputPath, Buffer.from(editRes.data, 'binary'));

    await api.sendMessage({
      attachment: fs.createReadStream(outputPath)
    }, threadID, (err) => {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }, messageID);

    api.setMessageReaction("🔮", messageID, threadID, () => {}, true);

  } catch (err) {
    console.error(err);
    api.setMessageReaction("❌", messageID, threadID, () => {}, true);
    api.sendMessage(`❌ Error: ${err.message}`, threadID, messageID);
    
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
};
