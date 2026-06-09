module.exports = function ({ Users, Threads, Currencies, Settings }) {
    const logger = require("../../utils/log.js");

    return async function ({ event }) {
        const { allUserID, allCurrenciesID, allThreadID, userName, threadInfo } = global.data;
        const { autoCreateDB } = global.config;

        if (autoCreateDB == false) return;

        var { senderID, threadID } = event;
        senderID = String(senderID);
        threadID = String(threadID);

        try {
            // Group entry in MongoDB
            if (!allThreadID.includes(threadID) && event.isGroup == true) {
                const threadIn4 = await Threads.getInfo(threadID);
                const dataThread = {
                    threadName: threadIn4.threadName || "Facebook Group",
                    adminIDs: threadIn4.adminIDs || [],
                    nicknames: threadIn4.nicknames || {}
                };

                const defaultData = { prefix: global.config.PREFIX, groupMode: "mod" };

                await Threads.createData(threadID, {
                    threadInfo: dataThread,
                    data: defaultData
                });

                allThreadID.push(threadID);
                threadInfo.set(threadID, dataThread);
                global.data.threadData.set(threadID, defaultData);

                if (threadIn4.userInfo) {
                    for (let singleData of threadIn4.userInfo) {
                        const uID = String(singleData.id);
                        userName.set(uID, singleData.name);

                        if (!allUserID.includes(uID)) {
                            await Users.createData(uID, { name: singleData.name, data: {} });
                            allUserID.push(uID);
                        }
                    }
                }
                logger(global.getText('handleCreateDatabase', 'newThread', threadID), '[ DATABASE ]');
            }

            // User entry in MongoDB
            if (!allUserID.includes(senderID)) {
                const infoUsers = await Users.getInfo(senderID);
                const name = infoUsers.name || "Facebook User";

                await Users.createData(senderID, { name: name, data: {} });
                allUserID.push(senderID);
                userName.set(senderID, name);

                logger(global.getText('handleCreateDatabase', 'newUser', senderID), '[ DATABASE ]');
            }

            // Currency / Economy entry in MongoDB
            if (!allCurrenciesID.includes(senderID)) {
                await Currencies.createData(senderID, { money: 0, data: {} });
                allCurrenciesID.push(senderID);
            }

            return;
        } catch (err) {
            return console.error("[ Database Error ]:", err);
        }
    };
};
