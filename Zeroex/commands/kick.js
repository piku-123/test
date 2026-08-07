module.exports.config = {
    name: "kick",
    aliases: ["remove"],
    version: "2.0.0",
    permission: 2,
    prefix: true,
    author: "Adi.0X",
    description: "Kick a member, or bulk-kick members by inactivity / deleted account, from the group.",
    category: "Group Mod",
    usages:
        "[mention/reply]\n" +
        "-f daily <N>   → kick members with N or fewer messages today\n" +
        "-f monthly <N> → kick members with N or fewer messages this month\n" +
        "-f total <N>   → kick members with N or fewer messages overall\n" +
        "-f user        → kick members whose Facebook account is deleted/deactivated",
    cooldowns: 3
};


const UNAVAILABLE_TYPES = ["UnavailableMessagingActor", "ReducedMessagingActor"];

const FILTER_ALIASES = {
    daily: "daily",
    monthly: "monthly",
    total: "total",
    all: "total",
    user: "deleted",
    fb: "deleted",
    deleted: "deleted"
};

function getDateStr(daysAgo = 0) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split("T")[0];
}

function isBotAdmin(threadInfo, botID) {
    const admins = threadInfo.adminIDs || [];
    return admins.some(a => {
        const id = typeof a === "string" ? a : (a.id || a.uid);
        return String(id) === String(botID);
    });
}

function isProtected(id, { botID, senderID, adminIDs, extraProtected }) {
    if (String(id) === String(botID)) return true;
    if (String(id) === String(senderID)) return true;
    if (adminIDs.some(a => String(typeof a === "string" ? a : (a.id || a.uid)) === String(id))) return true;
    if (extraProtected.has(String(id))) return true;
    return false;
}

module.exports.run = async function ({ api, event, args, models }) {
    const { threadID, messageID, senderID, messageReply, mentions } = event;

    const threadInfo = await api.getThreadInfo(threadID);
    if (!threadInfo.isGroup) {
        return api.sendMessage("❌ This command only works in groups.", threadID, messageID);
    }

    const botID = api.getCurrentUserID();

    if (!isBotAdmin(threadInfo, botID)) {
        return api.sendMessage(
            "I'm not a group admin.",
            threadID, messageID
        );
    }

    const userInfoMap = {};
    (threadInfo.userInfo || []).forEach(u => {
        userInfoMap[String(u.id)] = { name: u.name || "Facebook User", type: u.type || null };
    });
    const nameOf = id => userInfoMap[String(id)]?.name || "Facebook User";

    if (args[0]?.toLowerCase() === "-f" || args[0]?.toLowerCase() === "--filter") {
        const filterType = FILTER_ALIASES[(args[1] || "").toLowerCase()];

        if (!filterType) {
            return api.sendMessage(
                "❌ Usage:\n" +
                "• kick -f daily <N>\n" +
                "• kick -f monthly <N>\n" +
                "• kick -f total <N>\n" +
                "• kick -f user   (deleted/deactivated Facebook accounts)",
                threadID, messageID
            );
        }

        const extraProtected = new Set([
            ...((global.config?.ADMINBOT) || []).map(String),
            ...((global.config?.mod) || []).map(String)
        ]);
        const protectedOpts = { botID, senderID, adminIDs: threadInfo.adminIDs || [], extraProtected };

        const candidateIDs = (threadInfo.participantIDs || []).filter(
            id => !isProtected(id, protectedOpts)
        );

        let matched = [];

        if (filterType === "deleted") {
            matched = candidateIDs
                .filter(id => UNAVAILABLE_TYPES.includes(userInfoMap[String(id)]?.type))
                .map(id => ({ id, name: nameOf(id), detail: "Deleted/Deactivated account" }));
        } else {
            const threshold = parseInt(args[2], 10);
            if (isNaN(threshold) || threshold < 0) {
                return api.sendMessage(
                    `❌ Please give a valid number.\nExample: kick -f ${args[1]} 0`,
                    threadID, messageID
                );
            }

            const Interaction = models.use("Interaction");
            const dbData = await Interaction.find({ threadID });
            const today = getDateStr(0);
            const monthlyCutoff = getDateStr(30);

            const getCount = uid => {
                const d = dbData.find(d => d.userID === uid);
                if (!d) return 0;
                if (filterType === "daily") {
                    return d.dailyData.find(day => day.day === today)?.count || 0;
                }
                if (filterType === "monthly") {
                    return d.dailyData
                        .filter(day => day.day >= monthlyCutoff)
                        .reduce((sum, day) => sum + day.count, 0);
                }
                return d.count || 0; 
            };

            matched = candidateIDs
                .map(id => ({ id, count: getCount(id) }))
                .filter(u => u.count <= threshold)
                .map(u => ({ id: u.id, name: nameOf(u.id), detail: `${u.count} msg` }));
        }

        if (!matched.length) {
            return api.sendMessage(
                "✅ No members match this filter. Nobody was kicked.",
                threadID, messageID
            );
        }

        const filterLabel =
            filterType === "deleted" ? "deleted/deactivated accounts" : `${filterType} messages ≤ ${args[2]}`;

        let listMsg = `⚠️ Found ${matched.length} member(s) matching filter (${filterLabel}):\n\n`;
        matched.forEach((u, i) => {
            listMsg += `${i + 1}. ${u.name} — ${u.detail}\n`;
        });
        listMsg += `\nReact to this message with any emoji to confirm and kick all of them.`;

        api.setMessageReaction("⚠️", messageID, threadID, () => {}, true);

        return api.sendMessage(listMsg, threadID, (err, info) => {
            if (err) return;
            if (global.client && global.client.handleReaction) {
                global.client.handleReaction.push({
                    name: this.config.name,
                    messageID: info.messageID,
                    author: String(senderID),
                    targets: matched,
                    userMessageID: messageID
                });
            }
        }, messageID);
    }

    let targetUIDs = [];

    if (Object.keys(mentions).length > 0) {
        targetUIDs = [...new Set(Object.keys(mentions))];
    } else if (messageReply) {
        targetUIDs = [messageReply.senderID];
    } else {
        return api.sendMessage(
            "❌ Usage:\n• Mention someone: kick @name (multiple mentions supported)\n• Reply to their message: kick\n• Bulk kick: kick -f daily/monthly/total <N> | kick -f user",
            threadID, messageID
        );
    }

    const invalid = [];
    const validTargets = [];
    for (const uid of targetUIDs) {
        if (uid === senderID) {
            invalid.push(`${nameOf(uid)} — you can't kick yourself`);
        } else if (uid === botID) {
            invalid.push(`${nameOf(uid)} — can't kick the bot`);
        } else if (!threadInfo.participantIDs.includes(uid)) {
            invalid.push(`${nameOf(uid)} — not in the group`);
        } else {
            validTargets.push(uid);
        }
    }

    if (!validTargets.length) {
        api.setMessageReaction("❎", messageID, threadID, () => {}, true);
        return api.sendMessage(
            `❌ Couldn't kick anyone:\n${invalid.map(m => `• ${m}`).join("\n")}`,
            threadID, messageID
        );
    }

    const failed = [];
    for (const uid of validTargets) {
        try {
            await api.removeUserFromGroup(uid, threadID);
        } catch (err) {
            failed.push(`${nameOf(uid)} — ${err.message}`);
        }
    }

    if (!failed.length && !invalid.length) {
        api.setMessageReaction("✅", messageID, threadID, () => {}, true);
        return;
    }

    api.setMessageReaction("❎", messageID, threadID, () => {}, true);
    const errorLines = [...failed, ...invalid];
    return api.sendMessage(
        `⚠️ Some kicks failed:\n${errorLines.map(m => `• ${m}`).join("\n")}`,
        threadID, messageID
    );
};

module.exports.handleReaction = async function ({ api, event, handleReaction }) {
    const { threadID, userID, messageID } = event;

    if (String(userID) !== String(handleReaction.author)) return;

    try {
        const botID = api.getCurrentUserID();
        const threadInfo = await api.getThreadInfo(threadID);

        if (!isBotAdmin(threadInfo, botID)) {
            api.setMessageReaction("❎", handleReaction.userMessageID, threadID, () => {}, true);
            return api.sendMessage(
                "❌ I'm no longer an admin in this group, so I can't kick anyone.",
                threadID
            );
        }

        const results = { success: [], failed: [] };

        for (const target of handleReaction.targets) {
            if (!threadInfo.participantIDs.includes(target.id)) {
                continue; 
            }
            try {
                await api.removeUserFromGroup(target.id, threadID);
                results.success.push(target.name);
            } catch (err) {
                results.failed.push(`${target.name} (${err.message})`);
            }
        }

        if (!results.failed.length) {
            api.setMessageReaction("✅", handleReaction.userMessageID, threadID, () => {}, true);
            return;
        }

        api.setMessageReaction("❎", handleReaction.userMessageID, threadID, () => {}, true);
        return api.sendMessage(
            `⚠️ Kicked ${results.success.length}, failed ${results.failed.length}:\n` +
            results.failed.map(n => `• ${n}`).join("\n"),
            threadID
        );
    } catch (error) {
        api.setMessageReaction("❎", handleReaction.userMessageID, threadID, () => {}, true);
        return api.sendMessage(`❌ Error during bulk kick: ${error.message}`, threadID);
    } finally {
        if (global.client && global.client.handleReaction) {
            const index = global.client.handleReaction.findIndex(e => e.messageID === handleReaction.messageID);
            if (index > -1) global.client.handleReaction.splice(index, 1);
        }
    }
};
