module.exports.config = {
    name: "unsend",
    aliases: ["u", "uns"],
    version: "3.0.0",
    permission: 0,
    prefix: false,
    author: "Adi.0X",
    description: "Remove bot messages. Supports reply and reaction trigger.",
    category: "System",
    usages: "[on/off]",
    cooldowns: 0
};

// ── Reactions that trigger auto-unsend ─────────────────────────────────────
// Edit this list to control which emojis will auto-unsend a bot message.
const UNSEND_REACTIONS = ["👎", "❌", "🗑️","👍", "❤️"];
module.exports.UNSEND_REACTIONS = UNSEND_REACTIONS;
// ───────────────────────────────────────────────────────────────────────────

const SCOPE = "unsend";

/**
 * Check if a user has permission=1 access:
 * Bot Admin, Group Admin, or mod.
 */
function hasPermission1(userID, threadID) {
    const id = String(userID);
    const isBotAdmin  = (global.config.ADMINBOT || []).includes(id);
    const isMod       = (global.config.mod       || []).includes(id);
    const threadInfo  = global.data.threadInfo.get(String(threadID)) || {};
    const adminIDs    = threadInfo.adminIDs || [];
    const isGroupAdmin = adminIDs.some(a => String(a.id || a.uid) === id);
    return isBotAdmin || isMod || isGroupAdmin;
}
module.exports.hasPermission1 = hasPermission1;

module.exports.run = async function ({ api, event, args, Settings }) {
    const { threadID, senderID, messageID, type, messageReply } = event;
    if (!threadID || !messageID) return;

    try {
        const perm1 = hasPermission1(senderID, threadID);

        // ── on/off toggle ──────────────────────────────────────────────────
        if (args.length > 0) {
            const modeInput = args[0].toLowerCase();
            if (modeInput === "on" || modeInput === "off") {
                if (!perm1) {
                    return api.sendMessage(
                        "❌ You don't have permission to change unsend mode.",
                        threadID, messageID
                    );
                }
                await Settings.setValue(SCOPE, threadID, modeInput);
                const replyMsg = modeInput === "on"
                    ? "✅ Unsend is now ON for everyone in this group."
                    : "✅ Unsend is now OFF. Only Group Admins, Bot Admins and Mods can use it.";
                return api.sendMessage(replyMsg, threadID, messageID);
            }
        }

        // ── must be a reply ────────────────────────────────────────────────
        if (type !== "message_reply") {
            return api.sendMessage(
                "📌 Reply to a bot message to unsend it.",
                threadID, messageID
            );
        }

        // ── target must be bot's own message ──────────────────────────────
        if (messageReply.senderID !== api.getCurrentUserID()) {
            return api.sendMessage(
                "❌ I can only unsend my own messages.",
                threadID, messageID
            );
        }

        // ── permission/mode check ─────────────────────────────────────────
        const mode = await Settings.getValue(SCOPE, threadID, "on");
        if (mode === "off" && !perm1) {
            return api.sendMessage(
                "⛔ Unsend is currently OFF. Only admins and mods can use it.",
                threadID, messageID
            );
        }

        // ── do the unsend ─────────────────────────────────────────────────
        return api.unsendMessage(messageReply.messageID, (err) => {
            if (err) {
                return api.sendMessage(
                    "❌ Could not unsend. The message may be too old.",
                    threadID, messageID
                );
            }
        });

    } catch (err) {
        console.error(err);
        return api.sendMessage("Error: " + err.message, threadID, messageID);
    }
};
