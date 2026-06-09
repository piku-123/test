module.exports.config = {
    name: "count",
    aliases: ["checktt", "ct"],
    version: "2.1",
    permission: 0,
    prefix: true,
    author: "Adi.0X",
    description: "Check message interaction counts (daily, weekly, monthly, total).",
    category: "Group Management",
    usages: "[top | daily | weekly | monthly | all | page | reset | groups | @mention | reply]",
    cooldowns: 5
};

// Retention: keep last 31 days (covers daily + weekly 7d + monthly 30d windows)
const DAILY_RETENTION_DAYS = 31;

function getDateStr(daysAgo = 0) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split("T")[0];
}

// ==========================================
// handleEvent — tracks every message
// ==========================================
module.exports.handleEvent = async ({ event, models }) => {
    const { threadID, senderID } = event;
    if (!global.data.allThreadID.includes(threadID)) return;

    const Interaction = models.use("Interaction");
    const today    = getDateStr(0);
    const cutoff   = getDateStr(DAILY_RETENTION_DAYS);

    let user = await Interaction.findOne({ threadID, userID: senderID });
    if (!user) {
        user = new Interaction({ threadID, userID: senderID, dailyData: [] });
    }

    let todayData = user.dailyData.find(d => d.day === today);
    if (todayData) {
        todayData.count += 1;
    } else {
        user.dailyData.push({ day: today, count: 1 });
    }

    // Keep only last 31 days
    user.dailyData = user.dailyData.filter(d => d.day >= cutoff);

    user.count += 1;
    await user.save();
};

// ==========================================
// run — subcommands
// ==========================================
module.exports.run = async function ({ api, event, args, models, permission }) {
    const { threadID, senderID, mentions, messageReply } = event;
    const Interaction = models.use("Interaction");
    const subCommand  = args[0]?.toLowerCase();
    const today       = getDateStr(0);
    const PREFIX      = global.config.PREFIX;

    // Check if user can manage this group's data (bot admin, mod, or group admin)
    function hasElevatedAccess(uid) {
        const cfg = global.config;
        if ((cfg.ADMINBOT || []).includes(String(uid))) return true;
        if ((cfg.mod || []).includes(String(uid))) return true;
        const tInfo = global.data.threadInfo.get(String(threadID)) || {};
        return (tInfo.adminIDs || []).some(a => String(a.id || a.uid) === String(uid));
    }

    // ─── groups (bot admin only) ─────────────────────────────────────────────
    if (subCommand === "groups" && permission >= 4) {
        const groups = await Interaction.distinct("threadID");
        if (!groups.length) return api.sendMessage("No group data found.", threadID);

        let msg = "Groups in Database\n";
        msg += `\n`;
        for (let i = 0; i < groups.length; i++) {
            try {
                const info = await api.getThreadInfo(groups[i]);
                msg += `${i + 1}. ${info.threadName || "Unknown"}\n   ID: ${groups[i]}\n\n`;
            } catch {
                msg += `${i + 1}. Deleted/Private\n   ID: ${groups[i]}\n\n`;
            }
        }
        msg = msg.trimEnd();
        return api.sendMessage(msg, threadID, (err, info) => {
            if (err) return;
            global.client.handleReply.push({
                name: this.config.name,
                messageID: info.messageID,
                author: senderID,
                type: "deleteGroup",
                groups
            });
        });
    }

    // ─── reset ───────────────────────────────────────────────────────────────
    if (subCommand === "reset") {
        const type      = args[1]?.toLowerCase();
        const isSystem  = args.includes("--system");

        if (!type || !["daily", "weekly", "monthly", "all"].includes(type)) {
            return api.sendMessage(
                `Usage: ${PREFIX}count reset [daily | weekly | monthly | all] [--system]\n\n` +
                `Without --system: resets this group only.\n` +
                `With --system: resets all groups (bot admin only).`,
                threadID
            );
        }

        // --system requires bot admin
        if (isSystem && permission < 4) {
            return api.sendMessage("Permission denied. --system flag requires bot admin.", threadID);
        }

        // Per-group reset requires elevated access
        if (!isSystem && !hasElevatedAccess(senderID)) {
            return api.sendMessage("Permission denied. Only group admins or bot admins can reset data.", threadID);
        }

        const filter = isSystem ? {} : { threadID };
        const scope  = isSystem ? "all groups" : "this group";

        if (type === "daily") {
            await Interaction.updateMany(
                { ...filter, "dailyData.day": today },
                { $set: { "dailyData.$.count": 0 } }
            );
            return api.sendMessage(`Today's interaction data has been reset for ${scope}.`, threadID);
        }

        if (type === "weekly") {
            const cutoff = getDateStr(7);
            await Interaction.updateMany(
                filter,
                { $set: { "dailyData.$[elem].count": 0 } },
                { arrayFilters: [{ "elem.day": { $gte: cutoff } }] }
            );
            return api.sendMessage(`Last 7 days interaction data has been reset for ${scope}.`, threadID);
        }

        if (type === "monthly") {
            const cutoff = getDateStr(30);
            await Interaction.updateMany(
                filter,
                { $set: { "dailyData.$[elem].count": 0 } },
                { arrayFilters: [{ "elem.day": { $gte: cutoff } }] }
            );
            return api.sendMessage(`Last 30 days interaction data has been reset for ${scope}.`, threadID);
        }

        if (type === "all") {
            if (isSystem) {
                await Interaction.deleteMany({});
            } else {
                await Interaction.deleteMany({ threadID });
            }
            return api.sendMessage(`All interaction data has been cleared for ${scope}.`, threadID);
        }
    }

    // ─── top / all / page / daily / weekly / monthly ─────────────────────────
    if (["all", "top", "page", "daily", "weekly", "monthly"].includes(subCommand)) {
        let displayLimit = 15;
        let page = 1;
        let isCustomTop = false;
        const isWeekly  = subCommand === "weekly";
        const isDaily   = subCommand === "daily";
        const isMonthly = subCommand === "monthly";

        if (subCommand === "page") {
            page = parseInt(args[1]) || 1;
        } else if (subCommand === "top" && args[1]) {
            displayLimit = parseInt(args[1]);
            isCustomTop = true;
        } else if (subCommand === "all") {
            displayLimit = 999;
            isCustomTop = true;
        } else if (isWeekly || isDaily || isMonthly) {
            if (args[1] === "all") {
                displayLimit = 999;
                isCustomTop = true;
            } else {
                displayLimit = parseInt(args[1]) || 15;
                isCustomTop = !!args[1];
            }
        }

        let threadInfo;
        try {
            threadInfo = await api.getThreadInfo(threadID);
        } catch {
            return api.sendMessage("Error: Could not fetch group info.", threadID);
        }

        const dbData = await Interaction.find({ threadID });
        const userInfoMap = {};
        threadInfo.userInfo.forEach(u => userInfoMap[u.id] = u.name);

        const weeklyCutoff  = getDateStr(7);
        const monthlyCutoff = getDateStr(30);

        let fullList = threadInfo.participantIDs.map(id => {
            const d = dbData.find(d => d.userID === id);
            let count = 0;
            if (isDaily) {
                count = d?.dailyData.find(day => day.day === today)?.count || 0;
            } else if (isWeekly) {
                count = d?.dailyData
                    .filter(day => day.day >= weeklyCutoff)
                    .reduce((sum, day) => sum + day.count, 0) || 0;
            } else if (isMonthly) {
                count = d?.dailyData
                    .filter(day => day.day >= monthlyCutoff)
                    .reduce((sum, day) => sum + day.count, 0) || 0;
            } else {
                count = d?.count || 0;
            }
            return { userID: id, name: userInfoMap[id] || "Facebook User", count };
        }).sort((a, b) => b.count - a.count);

        const title = isDaily ? "Daily" : isWeekly ? "Weekly (7d)" : isMonthly ? "Monthly (30d)" : "Total";

        let msg = `┏ ${title} Interaction — ${threadInfo.threadName}\n`;
       // msg += `┗${"━".repeat(22)}\n`;

        let displayList = [];
        if (isCustomTop || isWeekly || isDaily || isMonthly) {
            displayList = fullList.slice(0, displayLimit);
        } else {
            const limit = 15;
            const totalPages = Math.ceil(fullList.length / limit) || 1;
            if (page < 1) page = 1;
            if (page > totalPages) page = totalPages;
            const start = (page - 1) * limit;
            displayList = fullList.slice(start, start + limit);
            msg += `Page ${page}/${totalPages}\n\n`;
        }

        displayList.forEach((user, i) => {
            const index = (isCustomTop || isWeekly || isDaily || isMonthly)
                ? i + 1
                : (page - 1) * 15 + i + 1;
            msg += `┃ ${index}. ${user.name} — ${user.count} msg\n`;
        });

        msg += `┗${"━".repeat(22)}\n`;
        msg += `Tip: ${PREFIX}count daily | weekly | monthly | top [N]`;
        return api.sendMessage(msg, threadID);
    }

    // ─── default: individual profile ─────────────────────────────────────────
    // Priority: @mention > reply > self
    let targetID;
    if (Object.keys(mentions).length > 0) {
        targetID = Object.keys(mentions)[0];
    } else if (messageReply?.senderID) {
        targetID = messageReply.senderID;
    } else {
        targetID = senderID;
    }
    targetID = String(targetID);

    const weeklyCutoff  = getDateStr(7);
    const monthlyCutoff = getDateStr(30);

    const userData = await Interaction.findOne({ threadID, userID: targetID });

    const totalCount   = userData?.count || 0;
    const dailyCount   = userData?.dailyData.find(d => d.day === today)?.count || 0;
    const weeklyCount  = userData?.dailyData
        .filter(d => d.day >= weeklyCutoff)
        .reduce((sum, d) => sum + d.count, 0) || 0;
    const monthlyCount = userData?.dailyData
        .filter(d => d.day >= monthlyCutoff)
        .reduce((sum, d) => sum + d.count, 0) || 0;

    let name;
    try {
        const info = await api.getUserInfo(targetID);
        name = info[targetID]?.name || "User";
    } catch {
        name = "User";
    }

    let msg = `┏ ${name}\n`;
    msg += `┃ • Total Messages: ${totalCount}\n`;
    msg += `┃ • Last 30 Days: ${monthlyCount} msg\n`;
    msg += `┃ • Last 7 Days: ${weeklyCount} msg\n`;
    msg += `┃ • Today: ${dailyCount} msg\n`;
    msg += `┗${"━".repeat(22)}\n`;
    msg += `Tip: ${PREFIX}count top | daily | weekly | monthly`;
    return api.sendMessage(msg, threadID);
};

// ==========================================
// handleReply — delete group data (admin)
// ==========================================
module.exports.handleReply = async function ({ api, event, handleReply, models }) {
    if (handleReply.type !== "deleteGroup" || event.senderID !== handleReply.author) return;
    const Interaction = models.use("Interaction");
    const index = parseInt(event.body) - 1;
    const tid = handleReply.groups[index];
    if (!tid) return api.sendMessage("Invalid selection.", event.threadID);
    await Interaction.deleteMany({ threadID: tid });
    api.sendMessage(`Data cleared for group ID: ${tid}`, event.threadID);
};
