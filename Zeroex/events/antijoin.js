module.exports.config = {
    name: "antiJoin",
    eventType: ["log:subscribe"],
    version: "3.0.0",
    author: "Adi.0X",
    description: "Kicks anyone who joins via link. Does NOT remove admin-added members. Default: OFF. Requires bot to be group admin."
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

module.exports.run = async function ({ api, event, Threads }) {
    const { threadID, logMessageData, author } = event;
    const added = logMessageData?.addedParticipants || [];
    if (!added.length) return;

    const botID = String(api.getCurrentUserID());
    if (added.some(p => String(p.userFbId) === botID)) return;

    // Bot-initiated add (antileave) — skip
    if (String(author) === botID) return;

    // Admin-added members — skip
    const tInfo      = global.data.threadInfo?.get(String(threadID)) || {};
    const adminIDs   = (tInfo.adminIDs || []).map(a => String(a.id || a.uid || a));
    if (adminIDs.includes(String(author))) return;

    try {
        const d = await Threads.getData(threadID);
        const isOn = d?.data?.events?.antijoin;
        if (!isOn) return;
    } catch { return; }

    const authorName = await getName(api, author);

    for (const p of added) {
        const uid  = String(p.userFbId);
        if (uid === botID) continue;

        const name = p.fullName || "Unknown";

        try {
            await api.removeUserFromGroup(uid, threadID);
            api.sendMessage({
                body: `${authorName} tried to add ${name}.\n${name} was removed.\nThis group is not accepting new members.`,
                mentions: [
                    { tag: authorName, id: author },
                    { tag: name,       id: uid    }
                ]
            }, threadID);
        } catch {
            api.sendMessage({
                body: `${name} joined but could not be removed. Make sure the bot has admin permission.`,
                mentions: [{ tag: name, id: uid }]
            }, threadID);
        }
    }
};
