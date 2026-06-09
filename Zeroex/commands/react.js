module.exports.config = {
  name: "react",
  aliases: ["postreact", "pr"],
  version: "1.2.1",
  permission: 0,
  prefix: true,
  author: "Adi.0X",
  description: "Give reaction to a Facebook post using Post ID or URL.",
  category: "Tools",
  usages: "[Post Link / Post ID] [like/love/haha/wow/sad/angry/unlike]",
  cooldowns: 5
};

function extractPostID(input) {
  if (!input) return null;
  if (!isNaN(input)) return input.trim();

  const fbidMatch = input.match(/fbid=(\d+)/i);
  if (fbidMatch) return fbidMatch[1];

  const postsMatch = input.match(/\/posts\/([a-zA-Z0-9_.-]+)/i);
  if (postsMatch) return postsMatch[1];

  const permalinkMatch = input.match(/\/permalink\/(\d+)/i);
  if (permalinkMatch) return permalinkMatch[1];

  const photoMatch = input.match(/\/photo\/?\?fbid=(\d+)/i);
  if (photoMatch) return photoMatch[1];

  const videoMatch = input.match(/\/videos\/(\d+)/i);
  if (videoMatch) return videoMatch[1];

  const storyMatch = input.match(/\/story\.php\?story_fbid=(\d+)/i);
  if (storyMatch) return storyMatch[1];

  return null;
}

async function resolveShortLink(url) {
  try {
    const https = require("https");
    const http = require("http");

    return await new Promise((resolve, reject) => {
      const protocol = url.startsWith("https") ? https : http;
      const req = protocol.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303) && res.headers.location) {
          resolveShortLink(res.headers.location).then(resolve).catch(reject);
        } else {
          resolve(res.headers.location || url);
        }
        res.resume();
      });
      req.on("error", reject);
      req.setTimeout(5000, () => { req.destroy(); reject(new Error("Timeout")); });
    });
  } catch {
    return null;
  }
}

const REACTION_MAP = {
  unlike:  { emoji: "👎", label: "unlike"  },
  like:    { emoji: "👍", label: "like"    },
  love:    { emoji: "🥰",  label: "care"    },
  heart:   { emoji: "❤️",  label: "love"    }, // alias
  haha:    { emoji: "😂", label: "haha"    },
  wow:     { emoji: "😮", label: "wow"     },
  sad:     { emoji: "😢", label: "sad"     },
  angry:   { emoji: "😡", label: "angry"   }
};

const USAGE_MSG =
  "⚠️ Usage:\n" +
  "react [Facebook Post Link] [Reaction Type]\n\n" +
  "💡 Available Reactions:\n" +
  "👍 like  ❤️ love  😂 haha\n" +
  "😮 wow  😢 sad  😡 angry\n" +
  "👎 unlike 🥰 care";

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;

  if (args.length < 2) {
    return api.sendMessage(USAGE_MSG, threadID, messageID);
  }

  const targetInput = args[0];
  const reactTypeInput = args[1].toLowerCase();

  if (!REACTION_MAP[reactTypeInput]) {
    return api.sendMessage(
      `❌ Invalid reaction type!\n\n` + USAGE_MSG,
      threadID, messageID
    );
  }

  api.setMessageReaction("🔄", messageID, threadID, () => {}, true);

  let resolvedInput = targetInput;

  const isShareLink = /facebook\.com\/share\//i.test(targetInput) || /fb\.watch\//i.test(targetInput);
  if (isShareLink) {
    const resolved = await resolveShortLink(targetInput);
    if (resolved) {
      resolvedInput = resolved;
    } else {
      api.setMessageReaction("❌", messageID, threadID, () => {}, true);
      return api.sendMessage("❌ Could not resolve the share link. It may be private or expired.", threadID, messageID);
    }
  }

  const postID = extractPostID(resolvedInput);

  if (!postID) {
    api.setMessageReaction("❌", messageID, threadID, () => {}, true);
    return api.sendMessage(
      "❌ Could not extract a valid Post ID.\nTry using the direct post URL or the numeric Post ID instead.",
      threadID, messageID
    );
  }

  try {
    await api.setPostReaction(postID, reactTypeInput);

    const { emoji } = REACTION_MAP[reactTypeInput];
    api.setMessageReaction("✅", messageID, threadID, () => {}, true);
    return api.sendMessage(
      `${emoji} Successfully reacted "${reactTypeInput}" to Post ID: ${postID}`,
      threadID, messageID
    );

  } catch (err) {
    api.setMessageReaction("❌", messageID, threadID, () => {}, true);
    const errorDetails = err.errors?.[0]?.message || err.error || err.message;
    return api.sendMessage(
      `❌ FCA setPostReaction Error:\n${errorDetails || "Unknown API limitation or block."}`,
      threadID, messageID
    );
  }
};