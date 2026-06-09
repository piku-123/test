module.exports = function ({ api, models, Users, Threads, Currencies, Settings }) {
    return function ({ event }) {
        if (!event.messageReply) return;
        const { handleReply, commands } = global.client;
        const { messageID, threadID, messageReply } = event;

        if (handleReply.length !== 0) {
            const indexOfHandle = handleReply.findIndex(e => e.messageID == messageReply.messageID);
            if (indexOfHandle < 0) return;
            const indexOfMessage = handleReply[indexOfHandle];
            const handleNeedExec = commands.get(indexOfMessage.name);

            if (!handleNeedExec) return api.sendMessage(global.getText('handleReply', 'missingValue'), threadID, messageID);

            try {
                var getText2 = (...value) => {
                    if (handleNeedExec.languages && handleNeedExec.languages[global.config.language]) {
                        let lang = handleNeedExec.languages[global.config.language][value[0]] || value[0];
                        for (let i = value.length - 1; i > 0; i--) {
                            lang = lang.replace(new RegExp('%' + i, 'g'), value[i]);
                        }
                        return lang;
                    }
                    return value[0];
                };

                const Obj = { api, event, models, Users, Threads, Currencies, Settings, handleReply: indexOfMessage, getText: getText2 };
                handleNeedExec.handleReply(Obj);
            } catch (error) {
                return api.sendMessage(global.getText('handleReply', 'executeError', error), threadID, messageID);
            }
        }
    };
};
