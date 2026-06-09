const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
  name: "fbdl",
  aliases: ["fbdown", "fb"],
  version: "3.2.0",
  permission: 0,
  prefix: true,
  author: "Adi.0X",
  description: "Download Facebook videos/reels via link or reply.",
  category: "Media",
  usages: "[link] or reply to a Facebook post",
  cooldowns: 5
};

module.exports.run = async function ({ api, event, args }) {

  const {
    threadID,
    messageID,
    messageReply,
    type
  } = event;

  let url = args[0];

  // =========================
  // REPLY SUPPORT
  // =========================

  if (type === "message_reply" && messageReply) {

    // text body
    const replyBody = messageReply.body || "";

    const bodyMatch = replyBody.match(
      /\bhttps?:\/\/\S+/gi
    );

    if (bodyMatch && bodyMatch[0]) {
      url = bodyMatch[0];
    }

    // attachment url support
    if (!url && messageReply.attachments) {

      for (const att of messageReply.attachments) {

        if (
          att.url &&
          (
            att.url.includes("facebook.com") ||
            att.url.includes("fb.watch") ||
            att.url.includes("video")
          )
        ) {
          url = att.url;
          break;
        }

        if (
          att.href &&
          (
            att.href.includes("facebook.com") ||
            att.href.includes("fb.watch")
          )
        ) {
          url = att.href;
          break;
        }
      }
    }
  }

  // =========================
  // VALIDATION
  // =========================

  if (
    !url ||
    (
      !url.includes("facebook.com") &&
      !url.includes("fb.watch") &&
      !url.includes("fb.com") &&
      !url.includes("share")
    )
  ) {

    api.setMessageReaction(
      "❌",
      messageID,
      threadID,
      () => {},
      true
    );

    return api.sendMessage(
      "❌ Please provide a valid Facebook video link.",
      threadID,
      messageID
    );
  }

  // =========================
  // CACHE
  // =========================

  const cacheDir = path.join(__dirname, "cache");
  fs.ensureDirSync(cacheDir);

  try {

    // searching
    api.setMessageReaction(
      "🔍",
      messageID,
      threadID,
      () => {},
      true
    );

    // API request
    const res = await axios.get(
      `https://zeroex-all-rest-api.onrender.com/api/fb/dl?url=${encodeURIComponent(url)}`
    );

    if (
      !res.data ||
      !res.data.status ||
      !res.data.data
    ) {

      api.setMessageReaction(
        "❌",
        messageID,
        threadID,
        () => {},
        true
      );

      return api.sendMessage(
        "❌ Failed to fetch Facebook media.",
        threadID,
        messageID
      );
    }

    const {
      title,
      links,
      thumbnail
    } = res.data.data;

    // best quality
    const videoUrl =
      links?.find(v => v.quality === "HD")?.url ||
      links?.[0]?.url;

    // =========================
    // THUMBNAIL ONLY
    // =========================

    if (!videoUrl && thumbnail) {

      const thumbPath = path.join(
        cacheDir,
        `thumb_${Date.now()}.jpg`
      );

      const thumbRes = await axios({
        method: "GET",
        url: thumbnail,
        responseType: "stream"
      });

      const writer = fs.createWriteStream(thumbPath);

      thumbRes.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });

      // thumbnail reaction
      api.setMessageReaction(
        "🖼️",
        messageID,
        threadID,
        () => {},
        true
      );

      await new Promise((resolve, reject) => {

        api.sendMessage({
          body: `${title || "Facebook Thumbnail"}`,
          attachment: fs.createReadStream(thumbPath)

        }, threadID, (err) => {

          if (fs.existsSync(thumbPath)) {
            fs.unlinkSync(thumbPath);
          }

          if (err) return reject(err);

          resolve();

        }, messageID);

      });

      return;
    }

    // =========================
    // NO VIDEO
    // =========================

    if (!videoUrl) {

      api.setMessageReaction(
        "❌",
        messageID,
        threadID,
        () => {},
        true
      );

      return api.sendMessage(
        "❌ No downloadable video found.",
        threadID,
        messageID
      );
    }

    // =========================
    // VIDEO DOWNLOAD
    // =========================

    const filePath = path.join(
      cacheDir,
      `fb_${Date.now()}.mp4`
    );

    // downloading
    api.setMessageReaction(
      "💭",
      messageID,
      threadID,
      () => {},
      true
    );

    const videoRes = await axios({
      method: "GET",
      url: videoUrl,
      responseType: "stream"
    });

    const writer = fs.createWriteStream(filePath);

    videoRes.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    // video reaction
    api.setMessageReaction(
      "📽️",
      messageID,
      threadID,
      () => {},
      true
    );

    // send video
    await new Promise((resolve, reject) => {

      api.sendMessage({
        body: `${title || "Facebook Video"}`,
        attachment: fs.createReadStream(filePath)

      }, threadID, (err) => {

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }

        if (err) {

          api.setMessageReaction(
            "❌",
            messageID,
            threadID,
            () => {},
            true
          );

          return reject(err);
        }

        resolve();

      }, messageID);

    });

  } catch (e) {

    console.error(e);

    api.setMessageReaction(
      "❌",
      messageID,
      threadID,
      () => {},
      true
    );

    return api.sendMessage(
      `❌ Error:\n${e.message}`,
      threadID,
      messageID
    );
  }
};