module.exports.config = {
  name: "mention",
  aliases: ["all"],
  version: "1.0.0",
  permission: 1,
  prefix: true,
  author: "Adi.0X",
  description: "Mention everyone or specific members in the group.",
  category: "Group Mod",
  usages: "[text?] | -p [name]",
  cooldowns: 5
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID, senderID } = event;

  try {
    const threadInfo = await api.getThreadInfo(threadID);
    const botID = api.getCurrentUserID();

    // বট আর sender বাদ দিয়ে বাকি সবাই
    const allIDs = (threadInfo.participantIDs || []).filter(
      id => id != botID && id != senderID
    );

    if (!allIDs.length) {
      return api.sendMessage("❌ No members found.", threadID, messageID);
    }

    // ─── CASE: /everyone -p [name] → নাম দিয়ে specific mention ──
    if (args[0]?.toLowerCase() === "-p") {
      const searchName = args.slice(1).join(" ").trim().toLowerCase();

      if (!searchName) {
        return api.sendMessage(
          "❌ type mame\nExample: /everyone -p Adi",
          threadID, messageID
        );
      }

      // threadInfo.userInfo থেকে নাম match করো
      const userInfoMap = {};
      (threadInfo.userInfo || []).forEach(u => {
        userInfoMap[String(u.id)] = u.name || u.fullName || String(u.id);
      });

      const matched = allIDs.filter(id => {
        const name = userInfoMap[String(id)] || "";
        return name.toLowerCase().includes(searchName);
      });

      if (!matched.length) {
        return api.sendMessage(
          `❌ "${args.slice(1).join(" ")}" No one found`,
          threadID, messageID
        );
      }

      // body = matched এর নামগুলো জোড়া দিয়ে
      let body = matched.map(id => userInfoMap[String(id)]).join(" ");
      if (body.length < matched.length) {
        body += " ".repeat(matched.length - body.length);
      }

      const mentions = [];
      let idx = 0;
      for (let i = 0; i < matched.length; i++) {
        const name = userInfoMap[String(matched[i])];
        mentions.push({ tag: name, id: matched[i], fromIndex: idx });
        idx += name.length + 1; // +1 for space
      }

      return api.sendMessage({ body, mentions }, threadID, messageID);
    }

    // ─── CASE: /everyone → "Mentioned you all" সবাই tag ─────
    // ─── CASE: /everyone text → text সবাই tag ────────────────
    let body = args.length > 0 ? args.join(" ") : "‌‌ ‌";

    // body যদি allIDs এর চেয়ে ছোট হয় → space দিয়ে বড় করো
    if (body.length < allIDs.length) {
      body += " ".repeat(allIDs.length - body.length);
    }

    const mentions = [];
    for (let i = 0; i < allIDs.length; i++) {
      mentions.push({
        tag: body[i],
        id: allIDs[i],
        fromIndex: i
      });
    }

    return api.sendMessage({ body, mentions }, threadID, messageID);

  } catch (err) {
    return api.sendMessage(`❌ Error: ${err.message || "Unknown"}`, threadID, messageID);
  }
};