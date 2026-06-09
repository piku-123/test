module.exports.config = {
  name: "profile",
  aliases: ["setprofile"],
  version: "1.0.0",
  permission: 4, // এডমিন অনলি, বট একাউন্টের প্রোফাইল চেঞ্জ করবে
  prefix: true,
  author: "Adi.0X",
  description: "Change the bot's Facebook avatar or bio.",
  category: "System",
  usages: "[avatar / bio] [...args]",
  cooldowns: 10
};

const USAGE_MSG =
  "⚠️ Usage:\n\n" +
  "🖼️ Change Avatar:\n" +
  "profile avatar [reply to an image]\n" +
  "profile avatar [reply to an image] [caption]\n\n" +
  "📝 Change Bio:\n" +
  "profile bio [your new bio text]\n" +
  "profile bio [your new bio text] --publish\n" +
  "(use --publish to post the bio change on feed)";

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID, messageReply } = event;

  const subcommand = args[0]?.toLowerCase();

  if (!subcommand || !["avatar", "bio"].includes(subcommand)) {
    return api.sendMessage(USAGE_MSG, threadID, messageID);
  }

  // ─── AVATAR ───────────────────────────────────────────────
  if (subcommand === "avatar") {
    // রিপ্লাইতে ইমেজ আছে কিনা চেক
    const attachment = messageReply?.attachments?.[0];

    if (!attachment || attachment.type !== "photo") {
      return api.sendMessage(
        "❌ Please reply to an image to set it as the bot's avatar.\n\n" +
        "🖼️ Example: reply to a photo and type:\nprofile avatar\nprofile avatar My new look!",
        threadID, messageID
      );
    }

    const imageUrl = attachment.largePreviewUrl || attachment.previewUrl || attachment.url;
    if (!imageUrl) {
      return api.sendMessage("❌ Could not retrieve the image URL from the replied message.", threadID, messageID);
    }

    // caption নেওয়া (args[1] থেকে বাকি সব)
    const caption = args.slice(1).join(" ") || "";

    api.setMessageReaction("🔄", messageID, threadID, () => {}, true);

    try {
      const https = require("https");
      const http = require("http");

      // ইমেজ URL থেকে readable stream বানানো
      const imageStream = await new Promise((resolve, reject) => {
        const protocol = imageUrl.startsWith("https") ? https : http;
        protocol.get(imageUrl, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
          resolve(res); // res নিজেই একটা readable stream
        }).on("error", reject);
      });

      await api.changeAvatar(imageStream, caption);

      api.setMessageReaction("✅", messageID, threadID, () => {}, true);
      return api.sendMessage(
        `✅ Bot avatar updated successfully!${caption ? `\n📝 Caption: "${caption}"` : ""}`,
        threadID, messageID
      );

    } catch (err) {
      api.setMessageReaction("❌", messageID, threadID, () => {}, true);
      const errMsg = err.error || err.message || "Unknown error";
      return api.sendMessage(`❌ changeAvatar Error:\n${errMsg}`, threadID, messageID);
    }
  }

  // ─── BIO ──────────────────────────────────────────────────
  if (subcommand === "bio") {
    // --publish ফ্ল্যাগ চেক
    const publishFlag = args.includes("--publish");

    // --publish বাদ দিয়ে বাকি টেক্সট bio
    const bioText = args
      .slice(1)
      .filter(a => a !== "--publish")
      .join(" ")
      .trim();

    if (!bioText) {
      return api.sendMessage(
        "❌ Bio text cannot be empty!\n\n" +
        "📝 Example:\nprofile bio Just a bot, doing bot things.\nprofile bio Hello world! --publish",
        threadID, messageID
      );
    }

    if (bioText.length > 101) {
      return api.sendMessage(
        `❌ Bio is too long! (${bioText.length}/101 characters)\nFacebook bio limit is 101 characters.`,
        threadID, messageID
      );
    }

    api.setMessageReaction("🔄", messageID, threadID, () => {}, true);

    try {
      await api.changeBio(bioText, publishFlag);

      api.setMessageReaction("✅", messageID, threadID, () => {}, true);
      return api.sendMessage(
        `✅ Bot bio updated successfully!\n\n` +
        `📝 New Bio: "${bioText}"\n` +
        `📢 Posted on feed: ${publishFlag ? "Yes" : "No"}`,
        threadID, messageID
      );

    } catch (err) {
      api.setMessageReaction("❌", messageID, threadID, () => {}, true);
      const errMsg = err.error || err.message || "Unknown error";
      return api.sendMessage(`❌ changeBio Error:\n${errMsg}`, threadID, messageID);
    }
  }
};