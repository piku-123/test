module.exports.config = {
  name: "getlink",
  version: "1.0.0",
  permission: 0,
  credits: "Adi.0X",
  description: "Get direct download link of any replied media",
  commandCategory: "Tools",
  usages: "reply to any media",
  cooldowns: 5
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
