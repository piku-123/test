module.exports.config = {
    name: "antiLeave",
    eventType: ["log:unsubscribe"],
    version: "3.0.0",
    author: "Adi.0X",
    description: "Re-adds anyone who leaves on their own if antiLeave is ON. Does NOT re-add kicked members. Default: OFF."
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
    const leftID  = String(logMessageData?.leftParticipantFbId || "");
    if (!leftID) return;

    const botID   = String(api.getCurrentUserID());
    if (leftID === botID) return;

    // Bot-initiated removal (antijoin) — skip
    if (String(author) === botID) return;

    // Only handle self-leaves, NOT kicks
    const isKicked = String(author) !== leftID;
    if (isKicked) return;

    try {
        const d = await Threads.getData(threadID);
        const isOn = d?.data?.events?.antileave;
        if (!isOn) return;
    } catch { return; }

    const leftName = await getName(api, leftID);

    try {
        await api.addUserToGroup(leftID, threadID);
        api.sendMessage({
            body: `${leftName} tried to leave the group. Member has been re-added.`,
            mentions: [{ tag: leftName, id: leftID }]
        }, threadID);
    } catch {
        api.sendMessage({
            body: `${leftName} tried to leave the group. Could not re-add — bot needs admin access.`,
            mentions: [{ tag: leftName, id: leftID }]
        }, threadID);
    }
};
