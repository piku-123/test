const axios = require("axios");

module.exports.config = {
  name: "group",
  aliases: ["gc", "thread"],
  version: "1.4.0",
  permission: 0,
  prefix: true,
  author: "Adi.0X",
  description: "Advanced group manager with filtering and info.",
  category: "Information & Help",
  usages: "[info/members/admins] [males/females]",
  cooldowns: 5
};

// টেক্সট র‍্যাপ করার ফাংশন
function wrapText(text, limit) {
    const words = text.split(' ');
    let lines = [];
    let currentLine = "";
    words.forEach(word => {
        if ((currentLine + word).length <= limit) {
            currentLine += (currentLine === "" ? "" : " ") + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    });
    lines.push(currentLine);
    return lines.join('\n┃   ');
}

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const prefix = global.config.PREFIX;

  if (args.length === 0) {
    let helpMsg = `┏ GROUP COMMANDS\n┃ • info: Full group details\n┃ • info members: Member stats\n┃ • info admins: Admin list\n┃ • members males: List of men\n┃ • members females: List of women\n┗━━━━━━━━━━━━━━━━━━━━\nUsage: ${prefix}group [sub-command]`;
    return api.sendMessage(helpMsg, threadID, messageID);
  }

  api.getThreadInfo(threadID, async (err, info) => {
    if (err) return api.sendMessage("❌ Error fetching group data.", threadID, messageID);

    const subCmd = args[0].toLowerCase();
    const subArg = args[1] ? args[1].toLowerCase() : null;

    // ১. মেম্বার ফিল্টারিং
    if (subCmd === "members" || subCmd === "member") {
      if (subArg === "males" || subArg === "male" || subArg === "females" || subArg === "female") {
        const genderType = (subArg === "males" || subArg === "male") ? "MALE" : "FEMALE";
        const members = info.userInfo.filter(u => u.gender === genderType);

        let msg = `┏ LIST OF ${genderType} MEMBERS (${members.length})\n`;
        members.forEach((m, i) => {
          msg += `┃ • ${m.name || "Unknown"}\n`;
        });
        msg += `┗━━━━━━━━━━━━━━━━━━━━`;
        return api.sendMessage(msg, threadID, messageID);
      }
    }

    // ২. ইনফো লজিক
    const name = info.threadName || "Unnamed Group";
    const totalMembers = info.participantIDs.length;
    const messageCount = info.messageCount;
    const approvalMode = info.approvalMode ? "Enabled" : "Disabled";
    const themeName = info.threadTheme ? info.threadTheme.accessibility_label : "Default";
    const groupEmoji = info.emoji || "None";
    const inviteLink = (info.inviteLink && info.inviteLink.enable) ? info.inviteLink.link : "Disabled";

    const adminNames = info.adminIDs.map(admin => {
        const user = info.userInfo.find(u => u.id === admin.id);
        return user ? user.name : admin.id;
    });

    let maleCount = info.userInfo.filter(u => u.gender === "MALE").length;
    let femaleCount = info.userInfo.filter(u => u.gender === "FEMALE").length;

    if (subCmd === "info") {
        if (subArg === "members") {
            let msg = `┏ GROUP MEMBERS STATS\n┃ • Total: ${totalMembers}\n┃ • Male: ${maleCount}\n┃ • Female: ${femaleCount}\n┗━━━━━━━━━━━━━━━━━━━━`;
            return api.sendMessage(msg, threadID, messageID);
        }

        if (subArg === "admins") {
            let msg = `┏ GROUP ADMINS (${adminNames.length})\n`;
            adminNames.forEach((name) => {
                msg += `┃ • ${name}\n`;
            });
            msg += `┗━━━━━━━━━━━━━━━━━━━━`;
            return api.sendMessage(msg, threadID, messageID);
        }

        // Full Info Default
        let fullMsg = `┏ GROUP INFO\n`;
        fullMsg += `┃ • Name: ${wrapText(name, 25)}\n`;
        fullMsg += `┃ • ID: ${threadID}\n`;
        fullMsg += `┃ • Theme: ${themeName}\n`;
        fullMsg += `┃ • Emoji: ${groupEmoji}\n`;
        fullMsg += `┃ • Link: ${inviteLink === "Disabled" ? "Disabled" : "Enabled"}\n`;
        fullMsg += `┃ • Approval: ${approvalMode}\n`;
        fullMsg += `┗━━━━━━━━━━━━━━━━━━━━\n`;
        fullMsg += `┏  STATISTICS\n`;
        fullMsg += `┃ • Members: ${totalMembers} (M:${maleCount}/F:${femaleCount})\n`;
        fullMsg += `┃ • Admins: ${adminNames.length}\n`;
        fullMsg += `┃ • Total Messages: ${messageCount}\n`;
        fullMsg += `┗━━━━━━━━━━━━━━━━━━━━\n`;
        fullMsg += `┏  ADMINS LIST\n`;
        adminNames.forEach((name) => {
            fullMsg += `┃ • ${name}\n`;
        });
        fullMsg += `┗━━━━━━━━━━━━━━━━━━━━\n`;

        if (info.imageSrc) {
            const img = (await axios.get(info.imageSrc, { responseType: "stream" })).data;
            return api.sendMessage({ body: fullMsg, attachment: img }, threadID, messageID);
        }
        return api.sendMessage(fullMsg, threadID, messageID);
    }
  });
};
