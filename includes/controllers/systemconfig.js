/**
 * SystemConfig controller — singleton document in "systemconfig" collection.
 * Stores system-level bot settings: selfListen, PREFIX, ADMINBOT, mod, etc.
 * Any new system-wide toggle/config should be added here instead of config.json.
 */
module.exports = function ({ models }) {
    const SystemConfig = models.use("SystemConfig");

    const FILTER = {};

    /**
     * Get the full system config document.
     * Returns null if not yet seeded.
     */
    async function get() {
        try {
            return await SystemConfig.findOne(FILTER).lean();
        } catch (e) {
            console.error("[SystemConfig] get error:", e.message);
            return null;
        }
    }

    /**
     * Get a single setting value.
     * @param {string} key
     * @param {*} defaultValue
     */
    async function getSetting(key, defaultValue = null) {
        try {
            const doc = await SystemConfig.findOne(FILTER, { [key]: 1 }).lean();
            if (!doc || doc[key] === undefined) return defaultValue;
            return doc[key];
        } catch (e) {
            console.error("[SystemConfig] getSetting error:", e.message);
            return defaultValue;
        }
    }

    /**
     * Set a single setting value and sync global.config if applicable.
     * @param {string} key
     * @param {*} value
     */
    async function setSetting(key, value) {
        try {
            await SystemConfig.findOneAndUpdate(
                FILTER,
                { $set: { [key]: value } },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            _syncGlobal(key, value);
            return true;
        } catch (e) {
            console.error("[SystemConfig] setSetting error:", e.message);
            return false;
        }
    }

    /**
     * Set multiple settings at once.
     * @param {object} data  e.g. { selfListen: false, PREFIX: "!" }
     */
    async function setMultiple(data) {
        try {
            await SystemConfig.findOneAndUpdate(
                FILTER,
                { $set: data },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            for (const [k, v] of Object.entries(data)) _syncGlobal(k, v);
            return true;
        } catch (e) {
            console.error("[SystemConfig] setMultiple error:", e.message);
            return false;
        }
    }

    /**
     * Sync a key-value pair into global.config so the running bot reflects
     * the saved value without restart.
     */
    function _syncGlobal(key, value) {
        if (!global.config) return;
        switch (key) {
            case "selfListen":
                if (global.config.FCAOption) global.config.FCAOption.selfListen = value;
                break;
            case "PREFIX":
                if (value !== null) global.config.PREFIX = value;
                break;
            case "ADMINBOT":
                global.config.ADMINBOT = value;
                break;
            case "mod":
                global.config.mod = value;
                break;
            case "systemMode":
                global.config.systemMode = value;
                break;
            default:
                global.config[key] = value;
        }
    }

    return { get, getSetting, setSetting, setMultiple };
};
