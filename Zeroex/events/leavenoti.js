module.exports.config = {
    name: "leaveNoti",
    eventType: ["log:unsubscribe"],
    version: "3.0.0",
    author: "Adi.0X",
    description: "Sends leave/kick notification. Suppressed when antijoin or antileave handles the event."
};

async function getName(api, id) {
    if (!id) return "Someone";
    try {
        const cached = global.data.userName?.get(String(id));
        if (cached) return cached;
        const info = await api.getUserInfo(id);
        return info?.[id]?.name || "Someone";
    } catch { return "Someone"; }
}

function getTime() {
    return new Date().toLocaleString("en-US", {
        timeZone: "Asia/Dhaka",
        hour12: true,
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        day: "2-digit", month: "2-digit", year: "numeric"
    });
}

module.exports.run = async function ({ api, event, Threads }) {
    const { threadID, logMessageData, author } = event;
    const leftID   = String(logMessageData?.leftParticipantFbId || "");
    if (!leftID) return;

    const botID    = String(api.getCurrentUserID());
    const isKicked = String(author) !== leftID;

    // ══ BOT WAS REMOVED / LEFT ══
    if (leftID === botID) {
        const logGroupID = global.config.BOT_NOTIFY_GROUP || "";
        if (!logGroupID) return;

        const actorName = isKicked ? await getName(api, author) : "itself";
        let groupName = "Unknown Group";
        try {
            const cached = global.data.threadInfo?.get(String(threadID));
            groupName = cached?.threadName || "Unknown Group";
        } catch {}

        return api.sendMessage(
`╔══════════════════════╗
BOT LEAVE NOTIFICATION
╚══════════════════════╝
Group Name : ${groupName}
Group ID   : ${threadID}
${isKicked ? "Removed by" : "Left by"} : ${actorName}
UID        : ${isKicked ? author : botID}
Time       : ${getTime()}`, logGroupID);
    }

    // ══ BOT-INITIATED REMOVAL (antijoin) — skip ══
    // antijoin already sent its own message
    if (String(author) === botID) return;

    // ══ REGULAR MEMBER LEFT / KICKED ══
    let threadEvents = {};
    try {
        const d = await Threads.getData(threadID);
        threadEvents = d?.data?.events || {};
        if (threadEvents.leavenoti === false) return;
    } catch { return; }

    // Self-leave + antileave ON — antileave handles the message
    if (!isKicked && threadEvents.antileave === true) return;

    const leftName  = await getName(api, leftID);
    const actorName = isKicked ? await getName(api, author) : leftName;

    if (isKicked) {
        return api.sendMessage({
            body: `${actorName} removed ${leftName} from the group.`,
            mentions: [
                { tag: actorName, id: author },
                { tag: leftName,  id: leftID }
            ]
        }, threadID);
    } else {
        return api.sendMessage({
            body: `${leftName} left the group.`,
            mentions: [{ tag: leftName, id: leftID }]
        }, threadID);
    }
};
