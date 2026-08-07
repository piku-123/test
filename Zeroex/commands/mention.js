module.exports.config = {
  name: "mention",
  aliases: ["everyone", "tag", "e"],
  version: "2.1.0",
  permission: 1,
  prefix: true,
  author: "Adi.0X",
  description: "Mention everyone, a gender group (girls/boys), or a specific member in the group.",
  category: "Group Mod",
  usages: "[text?] | -g <girls|boys> [text?] | -p [name]",
  cooldowns: 5
};

const INVISIBLE_CHAR = "\u2063"; // INVISIBLE SEPARATOR

const FEMALE_ROOTS = ["girl", "female", "woman", "women", "meye", "মেয়ে"];
const MALE_ROOTS = ["boy", "male", "man", "men", "chele", "ছেলে"];

function matchGenderToken(token) {
  const t = token.toLowerCase();
  if (FEMALE_ROOTS.some(root => t.startsWith(root))) return "female";
  if (MALE_ROOTS.some(root => t.startsWith(root))) return "male";
  return null;
}

function detectGenderGroup(keyword) {
  if (!keyword) return null;
  const tokens = keyword.split(/[^a-zA-Zঀ-\u09FF]+/).filter(Boolean);
  for (const token of tokens) {
    const group = matchGenderToken(token);
    if (group) return group;
  }
  return null;
}

function isGender(genderRaw, group) {
  const g = String(genderRaw || "").toLowerCase();
  if (group === "female") return g.startsWith("female");
  if (group === "male") return g.startsWith("male");
  return false;
}

function buildMentionBody(ids, prefixText) {
  let body = prefixText && prefixText.length ? prefixText : "";
  if (body.length < ids.length) {
    body += INVISIBLE_CHAR.repeat(ids.length - body.length);
  }
  const mentions = ids.map((id, i) => ({
    tag: body[i],
    id,
    fromIndex: i
  }));
  return { body, mentions };
}

function buildNamedMentionBody(ids, nameOf) {
  const SEPARATOR = ", ";
  const body = ids.map(id => nameOf(id)).join(SEPARATOR);
  const mentions = [];
  let idx = 0;
  for (const id of ids) {
    const name = nameOf(id);
    mentions.push({ tag: name, id, fromIndex: idx });
    idx += name.length + SEPARATOR.length;
  }
  return { body, mentions };
}

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID, senderID } = event;

  try {
    const threadInfo = await api.getThreadInfo(threadID);
    const botID = api.getCurrentUserID();

    const allIDs = (threadInfo.participantIDs || []).filter(
      id => id != botID && id != senderID
    );

    if (!allIDs.length) {
      return api.sendMessage("❌ No members found.", threadID, messageID);
    }

    const userInfoMap = {};
    (threadInfo.userInfo || []).forEach(u => {
      userInfoMap[String(u.id)] = {
        name: u.name || u.fullName || String(u.id),
        gender: u.gender || null
      };
    });
    const nameOf = id => userInfoMap[String(id)]?.name || String(id);

    if (args[0]?.toLowerCase() === "-p") {
      const searchName = args.slice(1).join(" ").trim().toLowerCase();

      if (!searchName) {
        return api.sendMessage(
          "❌ Please type a name.\nExample: mention -p Adi",
          threadID, messageID
        );
      }

      const matched = allIDs.filter(id =>
        nameOf(id).toLowerCase().includes(searchName)
      );

      if (!matched.length) {
        return api.sendMessage(
          `❌ No one found matching "${args.slice(1).join(" ")}"`,
          threadID, messageID
        );
      }

      const { body, mentions } = buildNamedMentionBody(matched, nameOf);
      return api.sendMessage({ body, mentions }, threadID, messageID);
    }

    if (args[0]?.toLowerCase() === "-g") {
      const group = detectGenderGroup(args[1]);

      if (!group) {
        return api.sendMessage(
          "❌ Specify a group: girls/girl/female/woman or boys/boy/male/man\nExample: mention -g girls",
          threadID, messageID
        );
      }

      const matched = allIDs.filter(id =>
        isGender(userInfoMap[String(id)]?.gender, group)
      );

      if (!matched.length) {
        return api.sendMessage(
          `❌ No ${group === "female" ? "girl" : "boy"} members found in this group. ` +
          `(Members who haven't set a gender on their Facebook profile can't be detected.)`,
          threadID, messageID
        );
      }

      const customText = args.slice(2).join(" ").trim();

      const { body, mentions } = customText
        ? buildMentionBody(matched, customText)
        : buildNamedMentionBody(matched, nameOf);

      return api.sendMessage({ body, mentions }, threadID, messageID);
    }

    const customText = args.join(" ").trim();
    const { body, mentions } = buildMentionBody(allIDs, customText);

    return api.sendMessage({ body, mentions }, threadID, messageID);

  } catch (err) {
    return api.sendMessage(`❌ Error: ${err.message || "Unknown"}`, threadID, messageID);
  }
};
