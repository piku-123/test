const axios = require("axios");
const { createReadStream } = require("fs-extra");

module.exports.config = {
  name: "pp",
  version: "1.0.0",
  permission: 2,
  prefix: false,
  author: "Adi.0X",
  description: "Get user Facebook profile picture",
  category: "Tools",
  usages: "[reply/mention/link/none]",
  cooldowns: 5
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID, senderID, mentions, messageReply } = event;
  let targetID = "";

  // 1. Check for reply or mention
  if (messageReply) {
    targetID = messageReply.senderID;
  } else if (mentions && Object.keys(mentions).length > 0) {
    targetID = Object.keys(mentions)[0];
  } else if (args[0] && args[0].includes("facebook.com")) {
    // 2. Check for link (API will handle link directly)
    try {
      const apiUrl = `https://zeroex-all-rest-api.onrender.com/api/fb/pp?url=${encodeURIComponent(args[0])}`;
      return await sendImage(api, apiUrl, threadID, messageID);
    } catch (e) {
      return api.sendMessage("❌ Error fetching from link.", threadID, messageID);
    }
  } else {
    // 3. Default to senderID
    targetID = senderID;
  }

  // Final API call for UID
  const apiUrl = `https://zeroex-all-rest-api.onrender.com/api/fb/pp?uid=${targetID}`;
  return await sendImage(api, apiUrl, threadID, messageID);
};

async function sendImage(api, url, threadID, messageID) {
  try {
    api.setMessageReaction("🆗", messageID, threadID, () => {}, true);
    
    const response = await axios.get(url, { responseType: "stream" });
    
    return api.sendMessage({
  //  body: "✅ Here is the profile picture:",
      attachment: response.data
    }, threadID, messageID);
    
  } catch (err) {
    api.setMessageReaction("❌", messageID, threadID, () => {}, true);
    return api.sendMessage("❌ Could not fetch profile picture.", threadID, messageID);
  }
}
