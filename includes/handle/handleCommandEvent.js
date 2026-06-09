module.exports = function ({
    api,
    models,
    Users,
    Threads,
    Currencies,
    Settings,
}) {
    const logger = require("../../utils/log.js");

    return function ({ event }) {
        const { allowInbox } = global.config;
        const { userBanned, threadBanned } = global.data;
        const { commands, eventRegistered } = global.client;
        var { senderID, threadID } = event;

        senderID = String(senderID);
        threadID = String(threadID);

        // ব্যান চেক (ব্যান থাকলে ইভেন্ট রান করবে না)
        if (
            userBanned.has(senderID) ||
            threadBanned.has(threadID) ||
            (allowInbox == false && senderID == threadID)
        )
            return;

        // যে কমান্ডগুলোতে handleEvent রেজিস্টার করা আছে সেগুলো লুপ করা হচ্ছে
        for (const eventReg of eventRegistered) {
            const cmd = commands.get(eventReg);
            if (!cmd) continue;

            var getText2;
            if (
                cmd.languages &&
                typeof cmd.languages == "object" &&
                cmd.languages.hasOwnProperty(global.config.language)
            ) {
                getText2 = (...values) => {
                    var lang =
                        cmd.languages[global.config.language][values[0]] ||
                        values[0];
                    for (var i = values.length - 1; i >= 0; i--) {
                        const expReg = RegExp("%" + (i + 1), "g");
                        lang = lang.replace(expReg, values[i]);
                    }
                    return lang;
                };
            } else {
                getText2 = (key) => key; // ল্যাঙ্গুয়েজ না থাকলে কি-টাই রিটার্ন করবে
            }

            try {
                // কমান্ড মডিউলে ডাটা পাঠানো হচ্ছে
                cmd.handleEvent({
                    event,
                    api,
                    models,
                    Users,
                    Threads,
                    Currencies,
                    Settings,
                    getText: getText2,
                });
            } catch (error) {
                // লগার ব্যবহার করা হচ্ছে এরর দেখানোর জন্য
                logger(
                    global.getText(
                        "handleCommandEvent",
                        "moduleError",
                        cmd.config.name,
                    ) +
                        ": " +
                        error.message,
                    "error",
                );
            }
        }
    };
};
