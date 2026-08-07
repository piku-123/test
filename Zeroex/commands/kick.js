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
            "❌ I'm not an admin in this group, so I can't kick anyone.\n" +
            "Please make the bot a group admin first, then try again.",
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

    let targetUID = null;

    if (Object.keys(mentions).length > 0) {
        targetUID = Object.keys(mentions)[0];
    } else if (messageReply) {
        targetUID = messageReply.senderID;
    } else {
        return api.sendMessage(
            "❌ Usage:\n• Mention someone: kick @name\n• Reply to their message: kick\n• Bulk kick: kick -f daily/monthly/total <N> | kick -f user",
            threadID, messageID
        );
    }

    if (targetUID === senderID) {
        return api.sendMessage("❌ You can't kick yourself.", threadID, messageID);
    }

    if (targetUID === botID) {
        return api.sendMessage("❌ You can't kick the bot.", threadID, messageID);
    }

    if (!threadInfo.participantIDs.includes(targetUID)) {
        return api.sendMessage("❌ This user is not in the group.", threadID, messageID);
    }

    const targetName = nameOf(targetUID);

    try {
        await api.removeUserFromGroup(targetUID, threadID);
        return api.sendMessage(
            `✅ ${targetName} has been removed from the group.`,
            threadID, messageID
        );
    } catch (err) {
        return api.sendMessage(
            `❌ Failed to kick ${targetName}.\n\nError: ${err.message}`,
            threadID, messageID
        );
    }
};

module.exports.handleReaction = async function ({ api, event, handleReaction }) {
    const { threadID, userID, messageID } = event;

    if (String(userID) !== String(handleReaction.author)) return;

    try {
        const botID = api.getCurrentUserID();
        const threadInfo = await api.getThreadInfo(threadID);

        if (!isBotAdmin(threadInfo, botID)) {
            api.setMessageReaction("❌", handleReaction.userMessageID, threadID, () => {}, true);
            return api.editMessage(
                "❌ I'm no longer an admin in this group, so I can't kick anyone.",
                handleReaction.messageID
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

        let summary = `✅ Kicked ${results.success.length} member(s).\n`;
        if (results.success.length) {
            summary += results.success.map(n => `• ${n}`).join("\n") + "\n";
        }
        if (results.failed.length) {
            summary += `\n❌ Failed to kick ${results.failed.length}:\n`;
            summary += results.failed.map(n => `• ${n}`).join("\n");
        }

        api.setMessageReaction(results.failed.length ? "⚠️" : "✅", handleReaction.userMessageID, threadID, () => {}, true);
        return api.editMessage(summary, handleReaction.messageID);
    } catch (error) {
        return api.editMessage(`❌ Error during bulk kick: ${error.message}`, handleReaction.messageID);
    } finally {
        if (global.client && global.client.handleReaction) {
            const index = global.client.handleReaction.findIndex(e => e.messageID === handleReaction.messageID);
            if (index > -1) global.client.handleReaction.splice(index, 1);
        }
    }
};
