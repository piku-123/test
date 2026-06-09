module.exports.config = {
    name: "joinNoti",
    eventType: ["log:subscribe"],
    version: "3.1.0",
    author: "Adi.0X",
    description: "Sends join notification when a member joins. Sends special notification when bot is added."
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

function getGroupAdminIDs(threadID) {
    const tInfo = global.data.threadInfo?.get(String(threadID)) || {};
    return (tInfo.adminIDs || []).map(a => {
        if (typeof a === "string") return a;
        return String(a.id || a.uid || a.userID || "");
    }).filter(Boolean);
}

module.exports.run = async function ({ api, event, Threads }) {
    const { threadID, logMessageData, author } = event;
    const added = logMessageData?.addedParticipants || [];
    if (!added.length) return;

    const botID      = String(api.getCurrentUserID());
    const logGroupID = global.config.BOT_NOTIFY_GROUP || "";
    const authorName = await getName(api, author);

    // ══ BOT WAS ADDED ══
    if (added.some(p => String(p.userFbId) === botID)) {
        if (logGroupID) {
            let groupName = "Unknown Group";
            try {
                const info = await api.getThreadInfo(threadID);
                groupName = info?.threadName || "Unknown Group";
            } catch {}

            api.sendMessage(
`╔══════════════════════╗
BOT ADDED NOTIFICATION
╚══════════════════════╝
Group Name : ${groupName}
Group ID   : ${threadID}
Added by   : ${authorName}
UID        : ${author}
Time       : ${getTime()}`, logGroupID);
        }

        return api.sendMessage({
            body: `Bot connected. Added by ${authorName}.`,
            mentions: [{ tag: authorName, id: author }]
        }, threadID);
    }

    // ══ BOT-INITIATED ADD (antileave) — skip ══
    if (String(author) === botID) return;

    // ══ REGULAR MEMBER JOINED ══
    let threadEvents = {};
    try {
        const d = await Threads.getData(threadID);
        threadEvents = d?.data?.events || {};
        if (threadEvents.joinnoti === false) return;
    } catch { return; }

    // If antijoin is ON, only skip if the adder is NOT a group admin
    // (admin-added members are not removed by antijoin, so joinnoti should still fire)
    if (threadEvents.antijoin === true) {
        const groupAdminIDs = getGroupAdminIDs(threadID);
        const authorIsAdmin = groupAdminIDs.includes(String(author));
        if (!authorIsAdmin) return; // antijoin will remove them and send its own message
    }

    for (const p of added) {
        const uid        = String(p.userFbId);
        if (uid === botID) continue;

        const name       = p.fullName || "Unknown";
        const isPending  = p.groupJoinStatus === "PENDING";
        const isSelfJoin = String(author) === uid;

        if (isPending) {
            if (isSelfJoin) {
                api.sendMessage({
                    body: `${name} has sent a join request. Awaiting admin approval.`,
                    mentions: [{ tag: name, id: uid }]
                }, threadID);
            } else {
                // Admin approved their pending request
                api.sendMessage({
                    body: `${authorName} approved ${name} to join the group.`,
                    mentions: [
                        { tag: authorName, id: author },
                        { tag: name,       id: uid    }
                    ]
                }, threadID);
            }
        } else {
            if (isSelfJoin) {
                api.sendMessage({
                    body: `${name} joined the group.`,
                    mentions: [{ tag: name, id: uid }]
                }, threadID);
            } else {
                api.sendMessage({
                    body: `${authorName} added ${name} to the group.`,
                    mentions: [
                        { tag: authorName, id: author },
                        { tag: name,       id: uid    }
                    ]
                }, threadID);
            }
        }
    }
};
