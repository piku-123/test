module.exports = function ({ api, models, Users, Threads, Currencies, Settings }) {
    const logger = require("../../utils/log.js");
    const moment = require("moment-timezone");

    function fmtErr(err) {
        if (!err) return String(err);
        if (err instanceof Error) return err.stack || `${err.name}: ${err.message}`;
        if (typeof err === "object") {
            try { return JSON.stringify(err, Object.getOwnPropertyNames(err)); }
            catch { return String(err); }
        }
        return String(err);
    }

    return async function ({ event }) {
        try {
            const timeStart = Date.now();
            const time = moment.tz("Asia/Dhaka").format("HH:mm:ss DD/MM/YYYY");
            const { userBanned, threadBanned } = global.data;
            const { events } = global.client;
            const { allowInbox, DeveloperMode } = global.config;

            if (!event) return;

            var { senderID, threadID } = event;
            senderID = senderID != null ? String(senderID) : "";
            threadID = threadID != null ? String(threadID) : "";

            // ব্যান এবং ইনবক্স চেক
            if (userBanned.has(senderID) || threadBanned.has(threadID) || (allowInbox == false && senderID && senderID == threadID)) return;

            if (event.type == "change_thread_image") event.logMessageType = "change_thread_image";

            for (const [key, value] of events.entries()) {
                if (!value || !value.config || !Array.isArray(value.config.eventType)) continue;
                if (value.config.eventType.indexOf(event.logMessageType) !== -1) {
                    const eventRun = events.get(key);
                    try {
                        const Obj = { api, event, models, Users, Threads, Currencies, Settings };
                        await Promise.resolve(eventRun.run(Obj));

                        if (DeveloperMode)
                            logger(global.getText('handleEvent', 'executeEvent', time, eventRun.config.name, threadID, Date.now() - timeStart), '[ Event ]');
                    } catch (error) {
                        logger(global.getText('handleEvent', 'eventError', eventRun.config.name, fmtErr(error)), "error");
                    }
                }
            }
        } catch (outer) {
            logger(`handleEvent fatal: ${fmtErr(outer)}`, "error");
        }
    };
};
