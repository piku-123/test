const axios = require("axios");
const fs    = require("fs-extra");
const path  = require("path");

module.exports.config = {
  name: "theme",
  aliases: ["threadtheme", "tc"],
  version: "2.0.0",
  permission: 0,
  prefix: true,
  author: "Adi.0X",
  description: "Change thread theme — AI generated or manual color.",
  category: "Group Mod",
  usages: "[ai / color / list] [...args]",
  cooldowns: 10
};

const THEMES = {
  "default":     { id: "788274591712719",  emoji: "💬", label: "Default Blue"    },
  "love":        { id: "217621039199400",  emoji: "❤️",  label: "Love"            },
  "tie-dye":     { id: "980963458735625",  emoji: "🌈", label: "Tie Dye"         },
  "candy":       { id: "1078392085981520", emoji: "🍬", label: "Candy"           },
  "galaxy":      { id: "417931042386624",  emoji: "🌌", label: "Galaxy"          },
  "aurora":      { id: "2129072900524888", emoji: "🌅", label: "Aurora"          },
  "ocean":       { id: "739126993214426",  emoji: "🌊", label: "Ocean"           },
  "strawberry":  { id: "174636906638566",  emoji: "🍓", label: "Strawberry"      },
  "lavender":    { id: "370054263873636",  emoji: "💜", label: "Lavender"        },
  "mint":        { id: "2136751179887052", emoji: "🌿", label: "Mint"            },
  "basketball":  { id: "815954925588933",  emoji: "🏀", label: "Basketball"      },
  "gameday":     { id: "662180774571643",  emoji: "🏈", label: "Gameday"         },
  "pride":       { id: "874312979674182",  emoji: "🏳️‍🌈", label: "Pride"          },
  "holiday":     { id: "10153919378568823",emoji: "🎄", label: "Holiday"         },
};

const USAGE_MSG =
  "🎨 Theme Changer:\n\n" +
  "🤖 theme ai [prompt]\n" +
  "   → AI দিয়ে custom theme বানাও\n" +
  "   Example: theme ai sunset over the ocean\n\n" +
  "🎨 theme color [name]\n" +
  "   → Built-in theme সেট করো\n" +
  "   Example: theme color galaxy\n\n" +
  "📋 theme list\n" +
  "   → সব available theme দেখাও";

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const subcommand = args[0]?.toLowerCase();

  if (!subcommand || !["ai", "color", "list"].includes(subcommand)) {
    return api.sendMessage(USAGE_MSG, threadID, messageID);
  }

  // ─── LIST ──────────────────────────────────────────────
  if (subcommand === "list") {
    const lines = Object.entries(THEMES).map(
      ([key, val]) => `${val.emoji} ${val.label}\n   → theme color ${key}`
    );
    return api.sendMessage(
      `🎨 Available Themes (${lines.length} টি):\n\n` + lines.join("\n\n"),
      threadID, messageID
    );
  }

  // ─── COLOR ─────────────────────────────────────────────
  if (subcommand === "color") {
    const themeName = args[1]?.toLowerCase();
    if (!themeName || !THEMES[themeName]) {
      const keys = Object.keys(THEMES).join(", ");
      return api.sendMessage(
        `❌ Invalid theme name!\n\nAvailable: ${keys}\n\n💡 সব দেখতে: theme list`,
        threadID, messageID
      );
    }
    api.setMessageReaction("🔄", messageID, threadID, () => {}, true);
    try {
      const { id, emoji, label } = THEMES[themeName];
      await api.changeThreadColor(id, threadID);
      api.setMessageReaction("✅", messageID, threadID, () => {}, true);
      return api.sendMessage(
        `${emoji} Thread theme changed to "${label}"!`,
        threadID, messageID
      );
    } catch (err) {
      api.setMessageReaction("❌", messageID, threadID, () => {}, true);
      return api.sendMessage(
        `❌ changeThreadColor Error:\n${err.error || err.message || "Unknown"}`,
        threadID, messageID
      );
    }
  }

  // ─── AI ────────────────────────────────────────────────
  if (subcommand === "ai") {
    const prompt = args.slice(1).join(" ").trim();
    if (!prompt) {
      return api.sendMessage(
        "❌ Prompt দাও!\nExample: theme ai beautiful cherry blossom night",
        threadID, messageID
      );
    }
    api.setMessageReaction("🔄", messageID, threadID, () => {}, true);
    try {
      const generated = await api.createThemeAI(prompt);
      if (!generated?.id) throw { error: "AI theme generation failed — no theme ID returned." };

      await api.changeThreadColor(generated.id, threadID);
      api.setMessageReaction("✅", messageID, threadID, () => {}, true);

      const label  = generated.accessibility_label || "AI Generated";
      const imgUrl = generated.background_asset?.image?.url;

      const body =
        `🤖 AI Theme Applied!\n\n` +
        `🎨 Theme: ${label}\n` +
        `🆔 ID: ${generated.id}`;

      if (imgUrl) {
        const cacheDir = path.join(__dirname, "cache");
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
        const filePath = path.join(cacheDir, `theme_ai_${Date.now()}.jpg`);
        try {
          const imgRes = await axios.get(imgUrl, { responseType: "arraybuffer", timeout: 10000 });
          fs.writeFileSync(filePath, Buffer.from(imgRes.data));
          return api.sendMessage(
            { body, attachment: fs.createReadStream(filePath) },
            threadID,
            () => { try { fs.unlinkSync(filePath); } catch {} },
            messageID
          );
        } catch {
          return api.sendMessage(body, threadID, messageID);
        }
      }
      return api.sendMessage(body, threadID, messageID);

    } catch (err) {
      api.setMessageReaction("❌", messageID, threadID, () => {}, true);
      return api.sendMessage(
        `❌ createThemeAI Error:\n${err.error || err.message || "Unknown"}`,
        threadID, messageID
      );
    }
  }
};
