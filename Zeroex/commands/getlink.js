module.exports.config = {
  name: "getlink",
  version: "1.0.0",
  permission: 0,
  author: "Adi.0X",
  category: "Tools",
  cooldowns: 5,
  description: "Get direct download link of any replied media"
};

module.exports.run = async function ({ api, event }) {
  const { messageReply, threadID, messageID } = event;

  if (!messageReply || !messageReply.attachments || messageReply.attachments.length === 0) {
    return api.sendMessage("❌ Please reply with any photos, videos, audio or stickers.", threadID, messageID);
  }

  const attachment = messageReply.attachments[0];
  const url = attachment.url;
  const type = attachment.type;

  let responseText = `${url}`;
  // responseText += `${type.toUpperCase()}\n`;

  return api.sendMessage(responseText, threadID, messageID);
};
