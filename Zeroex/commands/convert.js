const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");

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
  const url = attachment.url;
  const type = attachment.type;

  if (type !== "audio" && type !== "video") {
    return api.sendMessage("❌ Invalid file type. Please reply to an audio or video file.", threadID, messageID);
  }

  const cacheDir = path.join(__dirname, "cache");
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  const inputPath = path.join(cacheDir, `input_${Date.now()}.${type === "audio" ? "mp3" : "mp4"}`);
  const outputPath = path.join(cacheDir, `output_${Date.now()}.${type === "audio" ? "mp4" : "mp3"}`);

  try {
    // ১. প্রসেস শুরু (সার্চ/ডাউনলোড ট্রিগার)
    api.setMessageReaction("💭", messageID, threadID, () => {}, true);

    const response = await axios.get(url, { responseType: "stream" });
    const writer = fs.createWriteStream(inputPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    // ২. কনভার্সন শুরু
    api.setMessageReaction("⚙️", messageID, threadID, () => {}, true);

    await new Promise((resolve, reject) => {
      if (type === "audio") {
        // Audio to Video Conversion (with black background)
        ffmpeg()
          .input("color=black:s=640x180")
          .inputOptions(["-f lavfi"])
          .input(inputPath)
          .outputOptions([
            "-map 0:v:0", 
            "-map 1:a:0", 
            "-c:v libx264",
            "-c:a aac",
            "-shortest"
          ])
          .save(outputPath)
          .on("end", resolve)
          .on("error", reject);
      } else {
        // Video to Audio Conversion
        ffmpeg(inputPath)
          .noVideo()
          .audioCodec("libmp3lame")
          .save(outputPath)
          .on("end", resolve)
          .on("error", reject);
      }
    });

    // ৩. আপলোড শুরু
    api.setMessageReaction("⏩", messageID, threadID, () => {}, true);

    await api.sendMessage({
    //body: `Here's your converted ${type === "audio" ? "video" : "audio"} file.`,
      attachment: fs.createReadStream(outputPath)
    }, threadID, (err) => {
      // ৪. সাকসেসফুলি ডেলিভারড
      api.setMessageReaction("✅", messageID, threadID, () => {}, true);

      // ক্লিনআপ ক্যাশ ফাইলস
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }, messageID);

  } catch (err) {
    console.error(err);
    api.setMessageReaction("❌", messageID, threadID, () => {}, true);

    // ক্লিনআপ অন ফেইলর
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    return api.sendMessage("❌ Conversion failed. Please try again.", threadID, messageID);
  }
};
