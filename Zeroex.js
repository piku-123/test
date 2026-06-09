const moment = require("moment-timezone");
const { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } = require("fs-extra");
const { join, resolve } = require("path");
const { execSync } = require('child_process');
const logger = require("./utils/log.js");
const login = require("@dongdev/fca-unofficial"); 
const axios = require("axios");
const listPackage = JSON.parse(readFileSync('./package.json')).dependencies;
const listbuiltinModules = require("module").builtinModules;

global.client = new Object({
    commands: new Map(),
    events: new Map(),
    cooldowns: new Map(),
    eventRegistered: new Array(),
    handleSchedule: new Array(),
    handleReaction: new Array(),
    handleReply: new Array(),
    mainPath: process.cwd(),
    configPath: new String(),
    getTime: function (option) {
        switch (option) {
            case "seconds": return `${moment.tz("Asia/Dhaka").format("ss")}`;
            case "minutes": return `${moment.tz("Asia/Dhaka").format("mm")}`;
            case "hours": return `${moment.tz("Asia/Dhaka").format("HH")}`;
            case "date": return `${moment.tz("Asia/Dhaka").format("DD")}`;
            case "month": return `${moment.tz("Asia/Dhaka").format("MM")}`;
            case "year": return `${moment.tz("Asia/Dhaka").format("YYYY")}`;
            case "fullHour": return `${moment.tz("Asia/Dhaka").format("HH:mm:ss")}`;
            case "fullYear": return `${moment.tz("Asia/Dhaka").format("DD/MM/YYYY")}`;
            case "fullTime": return `${moment.tz("Asia/Dhaka").format("HH:mm:ss DD/MM/YYYY")}`;
        }
    }
});

global.data = new Object({
    threadInfo: new Map(),
    threadData: new Map(),
    userName: new Map(),
    userBanned: new Map(),
    threadBanned: new Map(),
    commandBanned: new Map(),
    threadAllowNSFW: new Array(),
    allUserID: new Array(),
    allCurrenciesID: new Array(),
    allThreadID: new Array()
});

global.utils = require("./utils");
global.nodemodule = new Object();
global.config = new Object();
global.configModule = new Object();
global.moduleData = new Array();
global.language = new Object();

//========= Find and Load Config =========//
var configValue;
try {
    global.client.configPath = join(global.client.mainPath, "config.json");
    configValue = require(global.client.configPath);
    logger.loader("Found file config: config.json");
} catch {
    const tempConfigPath = global.client.configPath.replace(/\.json/g, "") + ".temp";
    if (existsSync(tempConfigPath)) {
        configValue = JSON.parse(readFileSync(tempConfigPath, 'utf8'));
        logger.loader(`Found: ${tempConfigPath}`);
    } else {
        return logger.loader("config.json not found!", "error");
    }
}

try {
    for (const key in configValue) global.config[key] = configValue[key];
    logger.loader("Config Loaded!");
} catch {
    return logger.loader("Can't load file config!", "error");
}

const { connect: connectMongo, mongoose } = require("./includes/database");
writeFileSync(global.client.configPath + ".temp", JSON.stringify(global.config, null, 4), 'utf8');

//========= Load Language File =========//
const langPath = `${__dirname}/languages/${global.config.language || "en"}.lang`;
const langFile = readFileSync(langPath, { encoding: 'utf-8' }).split(/\r?\n|\r/);
const langData = langFile.filter(item => item.indexOf('#') != 0 && item != '');

for (const item of langData) {
    const getSeparator = item.indexOf('=');
    const itemKey = item.slice(0, getSeparator);
    const itemValue = item.slice(getSeparator + 1).replace(/\\n/gi, '\n');
    const head = itemKey.slice(0, itemKey.indexOf('.'));
    const key = itemKey.replace(head + '.', '');

    if (typeof global.language[head] == "undefined") global.language[head] = new Object();
    global.language[head][key] = itemValue;
}

global.getText = function (...args) {
    const langText = global.language;    
    if (!langText.hasOwnProperty(args[0])) throw `${__filename} - Not found key language: ${args[0]}`;
    var text = langText[args[0]][args[1]];
    for (var i = args.length - 1; i > 0; i--) {
        const regEx = RegExp(`%${i}`, 'g');
        text = text.replace(regEx, args[i + 1]);
    }
    return text;
};

//========= Check AppState =========//
try {
    var appStateFile = resolve(join(global.client.mainPath, global.config.APPSTATEPATH || "appstate.json"));
    var appState = require(appStateFile);
    logger.loader(global.getText("zeroex", "foundPathAppstate"));
} catch {
    return logger.loader(global.getText("zeroex", "notFoundPathAppstate"), "error");
}

//========= Login and Load Modules =========//
function onBot({ models: botModel }) {
    login({ appState }, async (loginError, api) => {
        if (loginError) {
            const msg = loginError instanceof Error
                ? (loginError.stack || loginError.message)
                : (typeof loginError === "object"
                    ? JSON.stringify(loginError, Object.getOwnPropertyNames(loginError))
                    : String(loginError));
            return logger(`Login error: ${msg}`, `ERROR`);
        }

        // Load system config from MongoDB and merge with config.json values
        try {
            const SystemConfigCtrl = require('./includes/controllers/systemconfig')({ models: botModel });
            const sysConf = await SystemConfigCtrl.get();
            if (sysConf) {
                // selfListen — DB value wins
                if (typeof sysConf.selfListen === 'boolean') {
                    global.config.FCAOption.selfListen = sysConf.selfListen;
                }
                // PREFIX — DB value wins if set
                if (sysConf.PREFIX) {
                    global.config.PREFIX = sysConf.PREFIX;
                }
                // ADMINBOT — union of config.json + MongoDB (deduplicated)
                if (Array.isArray(sysConf.ADMINBOT) && sysConf.ADMINBOT.length > 0) {
                    global.config.ADMINBOT = [...new Set([...(global.config.ADMINBOT || []), ...sysConf.ADMINBOT])];
                }
                // mod — union of config.json + MongoDB
                if (Array.isArray(sysConf.mod) && sysConf.mod.length > 0) {
                    global.config.mod = [...new Set([...(global.config.mod || []), ...sysConf.mod])];
                }
                // commandDisabled — union of config.json + MongoDB
                if (Array.isArray(sysConf.commandDisabled) && sysConf.commandDisabled.length > 0) {
                    global.config.commandDisabled = [...new Set([...(global.config.commandDisabled || []), ...sysConf.commandDisabled])];
                }
                // eventDisabled — union of config.json + MongoDB
                if (Array.isArray(sysConf.eventDisabled) && sysConf.eventDisabled.length > 0) {
                    global.config.eventDisabled = [...new Set([...(global.config.eventDisabled || []), ...sysConf.eventDisabled])];
                }
                // systemMode — DB value wins
                if (sysConf.systemMode && sysConf.systemMode !== "all") {
                    global.config.systemMode = sysConf.systemMode;
                }
            }
        } catch (e) {
            logger(`SystemConfig load error: ${e.message}`, "WARN");
        }

        api.setOptions(global.config.FCAOption);
        writeFileSync(appStateFile, JSON.stringify(api.getAppState(), null, '\x09'));

        global.client.api = api;
        global.config.version = '1.2.14';
        global.client.timeStart = Date.now();

        // Load Commands
        const commandFiles = readdirSync(global.client.mainPath + '/Zeroex/commands').filter(file => file.endsWith('.js') && !file.includes('example') && !global.config.commandDisabled.includes(file));

        for (const file of commandFiles) {
            try {
                const commandModule = require(global.client.mainPath + '/Zeroex/commands/' + file);
                if (!commandModule.config || !commandModule.run || !commandModule.config.category) throw new Error(global.getText('zeroex', 'errorFormat'));
                if (global.client.commands.has(commandModule.config.name)) throw new Error(global.getText('zeroex', 'nameExist'));

                // Auto-install dependencies
                if (commandModule.config.dependencies) {
                    for (const dep in commandModule.config.dependencies) {
                        if (!global.nodemodule.hasOwnProperty(dep)) {
                            try {
                                global.nodemodule[dep] = require(dep);
                            } catch {
                                logger.loader(global.getText('zeroex', 'notFoundPackage', dep, commandModule.config.name), 'warn');
                                execSync(`npm install --package-lock false --save ${dep}`, { stdio: 'inherit', shell: true, cwd: join(__dirname, 'nodemodules') });
                                global.nodemodule[dep] = require(dep);
                            }
                        }
                    }
                }

                if (commandModule.onLoad) commandModule.onLoad({ api, models: botModel });
                if (commandModule.handleEvent) global.client.eventRegistered.push(commandModule.config.name);

                global.client.commands.set(commandModule.config.name, commandModule);
                if (commandModule.config.aliases) {
                    for (const alias of commandModule.config.aliases) global.client.commands.set(alias, commandModule);
                }
                logger.loader(global.getText('zeroex', 'successLoadModule', commandModule.config.name));
            } catch (err) {
                logger.loader(global.getText('zeroex', 'failLoadModule', file, err), 'error');
            }
        }

        // Load Events
        const eventFiles = readdirSync(global.client.mainPath + '/Zeroex/events').filter(file => file.endsWith('.js') && !global.config.eventDisabled.includes(file));

        for (const file of eventFiles) {
            try {
                const eventModule = require(global.client.mainPath + '/Zeroex/events/' + file);
                if (!eventModule.config || !eventModule.run) throw new Error(global.getText('zeroex', 'errorFormat'));
                if (global.client.events.has(eventModule.config.name)) throw new Error(global.getText('zeroex', 'nameExist'));

                if (eventModule.onLoad) eventModule.onLoad({ api, models: botModel });
                global.client.events.set(eventModule.config.name, eventModule);
                logger.loader(global.getText('zeroex', 'successLoadModule', eventModule.config.name));
            } catch (err) {
                logger.loader(global.getText('zeroex', 'failLoadModule', file, err), 'error');
            }
        }

        logger.loader(global.getText('zeroex', 'finishLoadModule', global.client.commands.size, global.client.events.size));
        writeFileSync(global.client.configPath, JSON.stringify(global.config, null, 4), 'utf8');
        try { unlinkSync(global.client.configPath + '.temp'); } catch {}

        const listen = require('./includes/listen')({ api, models: botModel });

        // ===================== Dashboard Sync =====================
        const DASHBOARD_BASE = process.env.DASHBOARD_URL
            || process.env.RENDER_EXTERNAL_URL
            || `http://127.0.0.1:${process.env.PORT || 5000}`;

        const sendHeartbeat = () => {
            axios.post(`${DASHBOARD_BASE}/api/heartbeat`, { time: Date.now() }).catch(() => {});
        };
        sendHeartbeat();
        setInterval(sendHeartbeat, 5000);

        const pushGroups = async () => {
            try {
                const list = await api.getThreadList(100, null, ['INBOX']);
                const groups = (list || [])
                    .filter(t => t.isGroup || t.isSubscribed)
                    .filter(t => t.threadType === 2 || t.isGroup)
                    .map(t => ({
                        threadID: t.threadID,
                        name: t.name || 'Unnamed Group',
                        participants: (t.participantIDs || []).length,
                        emoji: t.emoji || null,
                        imageSrc: t.imageSrc || null
                    }));
                axios.post(`${DASHBOARD_BASE}/api/groups-update`, { groups }).catch(() => {});
            } catch (e) { /* ignore */ }
        };
        setTimeout(pushGroups, 5000);
        setInterval(pushGroups, 60000);

        setInterval(async () => {
            try {
                const r = await axios.get(`${DASHBOARD_BASE}/api/pending-actions`);
                const actions = r.data || [];
                for (const action of actions) {
                    if (action.type === 'leave' && action.threadID) {
                        try {
                            api.removeUserFromGroup(api.getCurrentUserID(), action.threadID, (err) => {
                                if (err) logger(`Failed to leave ${action.threadID}: ${err.message || err}`, "[ Dashboard ]");
                                else logger(`Left group ${action.threadID} via dashboard.`, "[ Dashboard ]");
                            });
                        } catch (e) {
                            logger(`Leave error: ${e.message}`, "[ Dashboard ]");
                        }
                    }
                    if (action.type === 'shutdown') {
                        logger(`${global.config.BOTNAME || 'Bot'} turned off via dashboard.`, "[ Dashboard ]");
                        setTimeout(() => process.exit(0), 250);
                    }

                    // ── Dashboard: config reload ──
                    if (action.type === 'config_reload' && action.config) {
                        try {
                            for (const key of Object.keys(action.config)) {
                                global.config[key] = action.config[key];
                            }
                            logger('Config reloaded from dashboard.', '[ Dashboard ]');
                        } catch (e) { logger('Config reload error: ' + e.message, '[ Dashboard ]'); }
                    }

                    // ── Dashboard: prefix change ──
                    if (action.type === 'set_prefix' && action.prefix !== undefined) {
                        try {
                            global.config.PREFIX = action.prefix;
                            const { writeFileSync } = require('fs');
                            const cfgPath = require('path').join(process.cwd(), 'config.json');
                            const cfg = JSON.parse(require('fs').readFileSync(cfgPath, 'utf8'));
                            cfg.PREFIX = action.prefix;
                            writeFileSync(cfgPath, JSON.stringify(cfg, null, 4), 'utf8');
                            logger(`System prefix set to "${action.prefix}" from dashboard.`, '[ Dashboard ]');
                        } catch (e) { logger('set_prefix error: ' + e.message, '[ Dashboard ]'); }
                    }

                    // ── Dashboard: system mode change ──
                    if (action.type === 'set_system_mode' && action.mode) {
                        try {
                            global.config.systemMode = action.mode;
                            const { writeFileSync } = require('fs');
                            const cfgPath = require('path').join(process.cwd(), 'config.json');
                            const cfg = JSON.parse(require('fs').readFileSync(cfgPath, 'utf8'));
                            cfg.systemMode = action.mode;
                            writeFileSync(cfgPath, JSON.stringify(cfg, null, 4), 'utf8');
                            logger(`System mode set to "${action.mode}" from dashboard.`, '[ Dashboard ]');
                        } catch (e) { logger('set_system_mode error: ' + e.message, '[ Dashboard ]'); }
                    }

                    // ── Dashboard: admin/mod list update ──
                    if (action.type === 'set_adminmod') {
                        try {
                            if (Array.isArray(action.ADMINBOT)) global.config.ADMINBOT = action.ADMINBOT;
                            if (Array.isArray(action.mod))      global.config.mod      = action.mod;
                            const { writeFileSync } = require('fs');
                            const cfgPath = require('path').join(process.cwd(), 'config.json');
                            const cfg = JSON.parse(require('fs').readFileSync(cfgPath, 'utf8'));
                            if (Array.isArray(action.ADMINBOT)) cfg.ADMINBOT = action.ADMINBOT;
                            if (Array.isArray(action.mod))      cfg.mod      = action.mod;
                            writeFileSync(cfgPath, JSON.stringify(cfg, null, 4), 'utf8');
                            logger('Admin/Mod list updated from dashboard.', '[ Dashboard ]');
                        } catch (e) { logger('set_adminmod error: ' + e.message, '[ Dashboard ]'); }
                    }

                    // ── Dashboard: command enable/disable ──
                    if (action.type === 'toggle_command') {
                        try {
                            const { commandDisabled } = action;
                            const { commands } = global.client;
                            const cmdDir = require('path').join(process.cwd(), 'Zeroex', 'commands');
                            const { readdirSync } = require('fs');
                            const allFiles = readdirSync(cmdDir).filter(f => f.endsWith('.js'));

                            for (const file of allFiles) {
                                const filePath = require('path').join(cmdDir, file);
                                if (commandDisabled.includes(file)) {
                                    // Disable — remove from Map
                                    try {
                                        const mod = require(filePath);
                                        commands.delete(mod.config?.name || file.replace('.js',''));
                                    } catch {}
                                } else {
                                    // Enable — load into Map
                                    try {
                                        delete require.cache[require.resolve(filePath)];
                                        const mod = require(filePath);
                                        commands.set(mod.config.name, mod);
                                    } catch {}
                                }
                            }
                            global.config.commandDisabled = commandDisabled;
                            logger('Commands toggled from dashboard.', '[ Dashboard ]');
                        } catch (e) { logger('toggle_command error: ' + e.message, '[ Dashboard ]'); }
                    }

                    // ── Dashboard: event enable/disable ──
                    if (action.type === 'toggle_event') {
                        try {
                            const { eventDisabled } = action;
                            const { events } = global.client;
                            const evtDir = require('path').join(process.cwd(), 'Zeroex', 'events');
                            const { readdirSync } = require('fs');
                            const allFiles = readdirSync(evtDir).filter(f => f.endsWith('.js'));

                            for (const file of allFiles) {
                                const filePath = require('path').join(evtDir, file);
                                if (eventDisabled.includes(file)) {
                                    try {
                                        const mod = require(filePath);
                                        events.delete(mod.config?.name || file.replace('.js',''));
                                    } catch {}
                                } else {
                                    try {
                                        delete require.cache[require.resolve(filePath)];
                                        const mod = require(filePath);
                                        events.set(mod.config.name, mod);
                                    } catch {}
                                }
                            }
                            global.config.eventDisabled = eventDisabled;
                            logger('Events toggled from dashboard.', '[ Dashboard ]');
                        } catch (e) { logger('toggle_event error: ' + e.message, '[ Dashboard ]'); }
                    }

                    // ── Dashboard: selfListen toggle ──
                    if (action.type === 'set_selflisten' && typeof action.selfListen === 'boolean') {
                        try {
                            api.setOptions({ selfListen: action.selfListen });
                            if (global.config.FCAOption) global.config.FCAOption.selfListen = action.selfListen;
                            // Persist to MongoDB
                            try {
                                const SysCtrl = require('./includes/controllers/systemconfig')({ models: botModel });
                                await SysCtrl.setSetting('selfListen', action.selfListen);
                            } catch (dbErr) { logger('selfListen DB persist error: ' + dbErr.message, '[ Dashboard ]'); }
                            logger(`selfListen set to "${action.selfListen}" from dashboard.`, '[ Dashboard ]');
                        } catch (e) { logger('set_selflisten error: ' + e.message, '[ Dashboard ]'); }
                    }
                }
            } catch (e) { /* ignore */ }
        }, 5000);

        api.listenMqtt(async (error, message) => {
            try {
                if (error) {
                    const errMsg = error instanceof Error
                        ? (error.stack || error.message)
                        : JSON.stringify(error, Object.getOwnPropertyNames(error || {}));
                    return logger(global.getText('zeroex', 'handleListenError', errMsg), 'error');
                }
                if (!message || !message.type) return;
                if (['presence', 'typ', 'read_receipt'].includes(message.type)) return;
                if (global.config.DeveloperMode) console.log(message);

                // ===== TEMPORARY DEBUG: raw event dump for group update investigation =====
                if (message.type === "event") {
                    try {
                        console.log("[RAW EVENT]", JSON.stringify({
                            type: message.type,
                            logMessageType: message.logMessageType,
                            logMessageData: message.logMessageData,
                            threadID: message.threadID,
                            author: message.author
                        }, null, 2));
                    } catch { /* ignore stringify errors */ }
                }
                // ===== END TEMPORARY DEBUG =====

                if ((message.type === "message" || message.type === "message_reply") && message.threadID && message.senderID) {
                    try {
                        const threadInfo = await api.getThreadInfo(message.threadID).catch(() => null);
                        const userInfo = await api.getUserInfo(message.senderID).catch(() => null);
                        const logData = {
                            threadID: message.threadID,
                            groupName: (threadInfo && threadInfo.threadName) || "Private Message",
                            senderID: message.senderID,
                            userName: (userInfo && userInfo[message.senderID] && userInfo[message.senderID].name) || "Unknown User",
                            message: message.body || "Attachment/Other",
                            timestamp: new Date()
                        };
                        axios.post(`${DASHBOARD_BASE}/api/live-logs`, logData).catch(() => {});
                    } catch (e) { /* ignore log errors */ }
                }
                return listen(message);
            } catch (e) {
                logger(`listenMqtt handler error: ${e && (e.stack || e.message) || e}`, 'error');
            }
        });
    });
}

//========= Database Connection & Start (MongoDB via Mongoose) =========//
(async () => {
    try {
        await connectMongo();
        const models = require('./includes/database/model')();
        logger("Connected to MongoDB successfully.", '[ DATABASE ]');
        onBot({ models });
    } catch (error) {
        logger("MongoDB connection error: " + (error && error.message ? error.message : String(error)), '[ DATABASE ]');
        process.exit(1);
    }
})();

mongoose.connection.on("error", (err) => {
    logger("MongoDB connection error: " + (err && err.message ? err.message : String(err)), '[ DATABASE ]');
});
mongoose.connection.on("disconnected", () => {
    logger("MongoDB disconnected.", '[ DATABASE ]');
});

function formatErr(err) {
    if (!err) return String(err);
    if (err instanceof Error) return err.stack || `${err.name}: ${err.message}`;
    if (typeof err === "object") {
        try { return JSON.stringify(err, Object.getOwnPropertyNames(err), 2); }
        catch { return String(err); }
    }
    return String(err);
}

process.on('unhandledRejection', (reason, promise) => {
    logger(`Unhandled Rejection: ${formatErr(reason)}`, "ERROR");
});

process.on('uncaughtException', (err) => {
    logger(`Uncaught Exception: ${formatErr(err)}`, "ERROR");
});
