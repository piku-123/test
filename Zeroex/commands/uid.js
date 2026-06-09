const axios = require("axios");

module.exports.config = {
  name: "uid",
  aliases: [],
  version: "1.4.1",
  permission: 0,
  prefix: false,
  author: "Adi.0X",
  description: "Get user ID directly via ZeroEx API",
  category: "Tools",
  usages: "[reply/mention/fb link]",
  cooldowns: 5
};

function extractIdFromUrl(url) {
  if (!url || typeof url !== "string") return null;
  const profilePhpMatch = url.match(/profile\.php\?id=(\d+)/i);
  if (profilePhpMatch) return profilePhpMatch[1];
  const numericPathMatch = url.match(/facebook\.com\/(\d{5,})(?:[/?#]|$)/i);
  if (numericPathMatch) return numericPathMatch[1];
  return null;
}

function isFacebookLink(input) {
  if (!input || typeof input !== "string") return false;
  return /(facebook\.com|fb\.me|fb\.com|m\.facebook\.com|fb\.watch)/i.test(input);
}

async function resolveFacebookId(link) {
  const direct = extractIdFromUrl(link);
  if (direct) return direct;

  try {
    const apiUrl = `https://fb-pp-api.vercel.app/api/fb-uid?link=${encodeURIComponent(link)}`;
    const res = await axios.get(apiUrl);
    if (res.data && res.data.id) return String(res.data.id);
  } catch (e) {
    console.error("ZeroEx API Request Failed:", e.message);
  }
  return null;
}

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID, senderID, mentions, messageReply } = event;

  if (messageReply) return api.sendMessage(`${messageReply.senderID}`, threadID, messageID);

  if (mentions && Object.keys(mentions).length > 0) {
    const ids = Object.keys(mentions).join("\n");
    return api.sendMessage(ids, threadID, messageID);
  }

  if (!args || args.length === 0) return api.sendMessage(`${senderID}`, threadID, messageID);

  const input = args[0];
  if (!isFacebookLink(input)) {
    return api.sendMessage("Please provide a valid Facebook link, mention, or reply.", threadID, messageID);
  }

  try {
    const uid = await resolveFacebookId(input);
    if (uid && !isNaN(uid)) {
      return api.sendMessage(`${uid}`, threadID, messageID);
    }
    return api.sendMessage("❌ Could not extract UID.", threadID, messageID);
  } catch (err) {
    return api.sendMessage(`Error: ${err.message}`, threadID, messageID);
  }
};
