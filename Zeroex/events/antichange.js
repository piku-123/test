module.exports.config = {
    name: "antiChange",
    eventType: [
        "log:thread-name",
        "log:thread-image",
        "log:thread-color"
    ],
    version: "3.1.0",
    author: "Adi.0X",
    description: "Reverts group name, photo, and theme changes if antiChange is ON."
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

async function getSnapshot(Threads, threadID) {
    try {
        const d = await Threads.getData(threadID);
        return d?.data?.antichangeSnapshot || null;
    } catch { return null; }
}

async function saveSnapshot(Threads, threadID, snap) {
    try {
        await Threads.setData(threadID, { "data.antichangeSnapshot": snap });
    } catch {}
}

async function restorePhoto(api, imageURL, threadID) {
    const axios = global.nodemodule?.axios || require("axios");
    const fs = require("fs-extra");
    const path = require("path");
    const cacheDir = path.join(__dirname, "cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    const filePath = path.join(cacheDir, `acphoto_${Date.now()}.jpg`);
    const res = await axios.get(imageURL, { responseType: "arraybuffer", timeout: 10000 });
    fs.writeFileSync(filePath, Buffer.from(res.data));
    await api.changeGroupImage(fs.createReadStream(filePath), threadID);
    try { fs.unlinkSync(filePath); } catch {}
}

module.exports.run = async function ({ api, event, Threads }) {
    const { threadID, logMessageType, logMessageData, author } = event;
    const botID = String(api.getCurrentUserID());

    if (String(author) === botID) return;

    try {
        const d = await Threads.getData(threadID);
        const isOn = d?.data?.events?.antichange;
        if (!isOn) return;
    } catch { return; }

    const authorName = await getName(api, author);
    const snapshot = await getSnapshot(Threads, threadID) || {};

    // ── NAME ────────────────────────────────────────────────
    if (logMessageType === "log:thread-name") {
        const newName = logMessageData?.name || "";

        if (!snapshot.name) {
            await saveSnapshot(Threads, threadID, { ...snapshot, name: newName });
            return;
        }

        if (snapshot.name === newName) return;

        try {
            await api.setTitle(snapshot.name, threadID);
            api.sendMessage({
                body: `${authorName} tried to rename the group. Name has been reverted.`,
                mentions: [{ tag: authorName, id: author }]
            }, threadID);
        } catch {
            await saveSnapshot(Threads, threadID, { ...snapshot, name: newName });
            api.sendMessage({
                body: `${authorName} changed the group name to "${newName}". Could not revert — bot needs admin access.`,
                mentions: [{ tag: authorName, id: author }]
            }, threadID);
        }
        return;
    }

    // ── IMAGE ────────────────────────────────────────────────
    if (logMessageType === "log:thread-image") {
        const newURL = logMessageData?.image?.url || null;

        if (!snapshot.imageCaptured) {
            await saveSnapshot(Threads, threadID, { ...snapshot, imageURL: newURL, imageCaptured: true });
            return;
        }

        if (snapshot.imageURL) {
            try {
                await restorePhoto(api, snapshot.imageURL, threadID);
                api.sendMessage({
                    body: `${authorName} tried to change the group photo. Previous photo has been restored.`,
                    mentions: [{ tag: authorName, id: author }]
                }, threadID);
            } catch {
                await saveSnapshot(Threads, threadID, { ...snapshot, imageURL: newURL || null });
                api.sendMessage({
                    body: `${authorName} changed the group photo. Could not revert — bot needs admin access.`,
                    mentions: [{ tag: authorName, id: author }]
                }, threadID);
            }
        } else {
            await saveSnapshot(Threads, threadID, { ...snapshot, imageURL: newURL });
            api.sendMessage({
                body: `${authorName} changed the group photo. No cached photo to restore.`,
                mentions: [{ tag: authorName, id: author }]
            }, threadID);
        }
        return;
    }

    // ── THEME / COLOR ─────────────────────────────────────────
    if (logMessageType === "log:thread-color") {
        const data = logMessageData || {};
        const newThemeID = data.theme_id || "";
        const newThemeName = data.theme_name_with_subtitle || data.accessibility_label || "Unknown";
        const themeEmoji = data.theme_emoji ? `${data.theme_emoji} ` : "";

        if (!snapshot.themeID) {
            await saveSnapshot(Threads, threadID, { ...snapshot, themeID: newThemeID, themeName: newThemeName });
            return;
        }

        if (snapshot.themeID === newThemeID) return;

        try {
            if (typeof api.changeThreadColor !== "function") {
                throw new Error("changeThreadColor not available");
            }
            await api.changeThreadColor(snapshot.themeID, threadID);
            api.sendMessage({
                body: `${authorName} tried to change the group theme. Theme has been reverted.`,
                mentions: [{ tag: authorName, id: author }]
            }, threadID);
        } catch {
            await saveSnapshot(Threads, threadID, { ...snapshot, themeID: newThemeID, themeName: newThemeName });
            api.sendMessage({
                body: `${authorName} changed the theme to ${themeEmoji}"${newThemeName}". Bot needs admin access or theme ID is unavailable to revert.`,
                mentions: [{ tag: authorName, id: author }]
            }, threadID);
        }
    }
};
