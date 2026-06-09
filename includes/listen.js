module.exports = function ({ api, models }) {
    const Users = require("./controllers/users")({ models, api }),
        Threads = require("./controllers/threads")({ models, api }),
        Currencies = require("./controllers/currencies")({ models }),
        Settings = require("./controllers/settings")({ models }),
        SystemConfig = require("./controllers/systemconfig")({ models });
    const logger = require("../utils/log.js");
    const axios = require("axios");

    //========= LOAD ENVIRONMENT FROM MONGODB =========//
    (async function () {
        try {
            logger(global.getText('listen', 'startLoadEnvironment'), '[ Zeroex ]');
            let threads = await Threads.getAll(),
                users = await Users.getAll(['userID', 'name', 'data']),
                currencies = await Currencies.getAll(['userID']);

            for (const data of threads) {
                const idThread = String(data.threadID);
                global.data.allThreadID.push(idThread);
                global.data.threadData.set(idThread, data['data'] || {});
                global.data.threadInfo.set(idThread, data.threadInfo || {});

                if (data['data'] && data['data']['banned']) {
                    global.data.threadBanned.set(idThread, {
                        'reason': data['data']['reason'] || '',
                        'dateAdded': data['data']['dateAdded'] || ''
                    });
                }
            }

            for (const dataU of users) {
                const idUsers = String(dataU['userID']);
                global.data['allUserID']['push'](idUsers);
                if (dataU.name) global.data.userName['set'](idUsers, dataU.name);
                if (dataU.data && dataU.data.banned) {
                    global.data['userBanned']['set'](idUsers, {
                        'reason': dataU['data']['reason'] || '',
                        'dateAdded': dataU['data']['dateAdded'] || ''
                    });
                }
            }

            for (const dataC of currencies) global.data.allCurrenciesID.push(String(dataC['userID']));
            logger.loader(global.getText('listen', 'loadedEnvironmentUser'));
            logger(global.getText('listen', 'successLoadEnvironment'), '[ Zeroex ]');
        } catch (error) {
            return logger.loader(global.getText('listen', 'failLoadEnvironment', error), 'error');
        }
    }());

    //========= REQUIRE HANDLERS =========//
    const handleCommand = require("./handle/handleCommand")({ api, models, Users, Threads, Currencies, Settings, SystemConfig });
    const handleCommandEvent = require("./handle/handleCommandEvent")({ api, models, Users, Threads, Currencies, Settings, SystemConfig });
    const handleReply = require("./handle/handleReply")({ api, models, Users, Threads, Currencies, Settings, SystemConfig });
    const handleReaction = require("./handle/handleReaction")({ api, models, Users, Threads, Currencies, Settings, SystemConfig });
    const handleEvent = require("./handle/handleEvent")({ api, models, Users, Threads, Currencies, Settings, SystemConfig });
    const handleCreateDatabase = require("./handle/handleCreateDatabase")({ api, Threads, Users, Currencies, Settings, models });

    //========= EVENT MAIN LOOP =========//
    const safeCall = (fn, label) => {
        try {
            const result = fn();
            if (result && typeof result.then === "function") {
                result.catch(err => {
                    const msg = err instanceof Error ? (err.stack || err.message) : String(err);
                    logger(`${label} error: ${msg}`, "error");
                });
            }
        } catch (err) {
            const msg = err instanceof Error ? (err.stack || err.message) : String(err);
            logger(`${label} error: ${msg}`, "error");
        }
    };

    return async (event) => {
        if (!event || !event.type) return;
        switch (event.type) {
            case "message":
            case "message_reply":
            case "message_unsend":
                safeCall(() => handleCreateDatabase({ event }), "handleCreateDatabase");
                safeCall(() => handleCommand({ event }), "handleCommand");
                safeCall(() => handleReply({ event }), "handleReply");
                safeCall(() => handleCommandEvent({ event }), "handleCommandEvent");
                break;

            case "event":
                safeCall(() => handleEvent({ event }), "handleEvent");
                break;

            case "message_reaction":
                safeCall(() => handleReaction({ event }), "handleReaction");
                break;

            default:
                break;
        }
    };
};
