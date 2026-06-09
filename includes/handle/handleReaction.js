module.exports = function ({ api, models, Users, Threads, Currencies, Settings, SystemConfig }) {
    const UNSEND_SCOPE = "unsend";

    return async function ({ event }) {
        const { handleReaction, commands } = global.client;
        const { messageID, threadID, reaction, userID } = event;

        // ── Reaction-based auto-unsend ──────────────────────────────────────
        if (messageID && threadID && reaction) {
            // Get configurable emoji list from the unsend command module
            const unsendCmd       = commands.get("unsend");
            const unsendReactions = (unsendCmd && unsendCmd.UNSEND_REACTIONS) || ["👎", "❌"];

            if (unsendReactions.includes(reaction)) {
                const mode = await Settings.getValue(UNSEND_SCOPE, String(threadID), "on");

                const canUse = mode !== "off" || (
                    unsendCmd &&
                    typeof unsendCmd.hasPermission1 === "function" &&
                    unsendCmd.hasPermission1(userID, threadID)
                );

                if (canUse) {
                    api.unsendMessage(messageID, (err) => { if (err) return; });
                }
                return;
            }
        }

        // ── Module handleReaction (registered bot messages) ────────────────
        if (handleReaction && handleReaction.length !== 0) {
            const indexOfHandle = handleReaction.findIndex(e => e.messageID == messageID);
            if (indexOfHandle < 0) return;

            const indexOfMessage = handleReaction[indexOfHandle];
            const handleNeedExec = commands.get(indexOfMessage.name);
            if (!handleNeedExec) return;

            try {
                const getText2 = (...value) => {
                    if (handleNeedExec.languages && handleNeedExec.languages[global.config.language]) {
                        let lang = handleNeedExec.languages[global.config.language][value[0]] || value[0];
                        for (let i = value.length - 1; i > 0; i--) {
                            lang = lang.replace(new RegExp('%' + i, 'g'), value[i]);
                        }
                        return lang;
                    }
                    return value[0];
                };

                const Obj = {
                    api, event, models,
                    Users, Threads, Currencies, Settings, SystemConfig,
                    handleReaction: indexOfMessage,
                    getText: getText2
                };

                if (typeof handleNeedExec.handleReaction === "function") {
                    handleNeedExec.handleReaction(Obj);
                }
            } catch (error) {
                console.error("HandleReaction Module Error:", error.message);
            }
        }
    };
};
