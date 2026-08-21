const axios = require("axios");

module.exports.config = {
  name: "convert",
//aliases: ["conv", "mp3", "mp4"],
  version: "3.0.0",
  permission: 0,
  prefix: false,
  author: "Adi.0X",
  description: "Convert video to audio or audio to video seamlessly.",
  category: "Tools",
  usages: "reply to media",
  cooldowns: 5
};

module.exports.run = async function ({ api, event }) {
  const { messageReply, threadID, messageID } = event;

  if (!messageReply || !messageReply.attachments || messageReply.attachments.length === 0) {
    return api.sendMessage("Please reply to an audio or video file.", threadID, messageID);
  }

  const attachment = messageReply.attachments[0];
  const { url, type } = attachment;

  if (type !== "audio" && type !== "video") {
    return api.sendMessage("❌ Invalid file type. Please reply to an audio or video file.", threadID, messageID);
  }

  try {
    api.setMessageReaction("⚙️", messageID, threadID, () => {}, true);

    const response = await axios.post(
      "https://fb-pp-api.vercel.app/api/convert",
      {
        url: url,
        type: type
      },
      {
        responseType: "stream" 
      }
    );

    await api.sendMessage(
      {
       // body: `Here's your converted ${type === "audio" ? "video" : "audio"} file!`,
        attachment: response.data
      },
      threadID,
      (err) => {
        if (err) {
          api.setMessageReaction("❌", messageID, threadID, () => {}, true);
          return api.sendMessage("❌ Failed to send converted file.", threadID, messageID);
        }
        api.setMessageReaction("✅", messageID, threadID, () => {}, true);
      },
      messageID
    );

  } catch (err) {
    console.error("Conversion Error:", err.message);
    api.setMessageReaction("❌", messageID, threadID, () => {}, true);
    return api.sendMessage("❌ Conversion failed or server timed out. Please try with a smaller file.", threadID, messageID);
  }
};
