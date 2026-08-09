const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
  name: "catbox",
  version: "1.0.0",
  permission: 0,
  prefix: false,
  author: "Adi.0X",
  description: "Upload any file to Catbox and get direct URL",
  category: "Tools",
  usages: "Send/Reply to a file with catbox",
  cooldowns: 5
};

module.exports.run = async function ({ api, event }) {
  const { messageReply, attachments, threadID, messageID } = event;

  let targetAttachment = null;

  if (attachments && attachments.length > 0) {
    targetAttachment = attachments[0];
  } else if (messageReply && messageReply.attachments && messageReply.attachments.length > 0) {
    targetAttachment = messageReply.attachments[0];
  }

  if (!targetAttachment) {
    return api.sendMessage("❌ Please send or reply to a file (Photo, Video, Audio, or File).", threadID, messageID);
  }

  const cacheDir = path.join(__dirname, "cache");
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  let ext = "bin";
  
  if (targetAttachment.filename) {
    ext = path.extname(targetAttachment.filename).replace(".", "").toLowerCase() || ext;
  } else if (targetAttachment.url) {
    const urlExt = path.extname(targetAttachment.url.split("?")[0]).replace(".", "").toLowerCase();
    if (urlExt) ext = urlExt;
  }

  if (ext === "bin") {
    if (targetAttachment.type === "animated_image") ext = "gif";
    else if (targetAttachment.type === "photo") ext = "png";
    else if (targetAttachment.type === "video") ext = "mp4";
    else if (targetAttachment.type === "audio") ext = "mp3";
    else if (targetAttachment.type === "file") ext = "pdf"; 
  }

  const filePath = path.join(cacheDir, `catbox_${Date.now()}.${ext}`);

  try {
    api.setMessageReaction("☁️", messageID, threadID, () => {}, true);

    const response = await axios.get(targetAttachment.url, { responseType: 'arraybuffer' });
    fs.writeFileSync(filePath, Buffer.from(response.data));

    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("fileToUpload", fs.createReadStream(filePath));

    const uploadRes = await axios.post("https://catbox.moe/user/api.php", form, {
      headers: { ...form.getHeaders() }
    });

    const fileUrl = uploadRes.data.trim();

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    api.setMessageReaction("✅", messageID, threadID, () => {}, true);

    return api.sendMessage(`🔗 URL: ${fileUrl}`, threadID, messageID);

  } catch (err) {
    console.error(err);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    api.setMessageReaction("❌", messageID, threadID, () => {}, true);
    return api.sendMessage(`❌ Failed to upload: ${err.message}`, threadID, messageID);
  }
};
