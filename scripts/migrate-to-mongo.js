/*
 * One-time migration script: SQLite + local JSON files -> MongoDB.
 *
 * Reads:
 *   - data.sqlite (Sequelize tables: Threads, Users, Currencies) if present
 *   - Zeroex_Cache/unsend_settings.json (per-thread unsend mode)
 *   - Zeroex/commands/checktuongtac/*.json (interaction trackers)
 *
 * Writes to MongoDB collections:
 *   - threads, users, currencies, settings
 *
 * Usage:
 *   node scripts/migrate-to-mongo.js
 */

const path = require("path");
const fs = require("fs-extra");

process.chdir(path.join(__dirname, ".."));

global.config = {};
try {
    const cfg = require(path.join(process.cwd(), "config.json"));
    Object.assign(global.config, cfg);
} catch (e) {
    console.error("Failed to load config.json:", e.message);
}

const { connect, mongoose } = require("../includes/database");
const Users = require("../includes/database/models/users");
const Threads = require("../includes/database/models/threads");
const Currencies = require("../includes/database/models/currencies");
const Settings = require("../includes/database/models/settings");

function logStep(msg) {
    console.log(`[migrate] ${msg}`);
}

async function migrateSqlite() {
    const sqlitePath = path.join(process.cwd(), "data.sqlite");
    if (!fs.existsSync(sqlitePath)) {
        logStep("data.sqlite not found, skipping SQLite migration.");
        return { threads: 0, users: 0, currencies: 0 };
    }

    let Sequelize;
    try {
        Sequelize = require("sequelize");
    } catch (e) {
        logStep("Sequelize not installed; cannot read data.sqlite. Skipping.");
        return { threads: 0, users: 0, currencies: 0 };
    }

    const sequelize = new Sequelize.Sequelize({
        dialect: "sqlite",
        storage: sqlitePath,
        logging: false
    });

    const ThreadsModel = sequelize.define("Threads", {
        num: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        threadID: { type: Sequelize.BIGINT, unique: true },
        threadInfo: { type: Sequelize.JSON },
        data: { type: Sequelize.JSON }
    }, { freezeTableName: true, timestamps: true });

    const UsersModel = sequelize.define("Users", {
        num: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        userID: { type: Sequelize.BIGINT, unique: true },
        name: { type: Sequelize.STRING },
        data: { type: Sequelize.JSON, defaultValue: {} }
    }, { freezeTableName: true, timestamps: true });

    const CurrenciesModel = sequelize.define("Currencies", {
        num: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        userID: { type: Sequelize.BIGINT, unique: true },
        money: { type: Sequelize.BIGINT, defaultValue: 0 },
        exp: { type: Sequelize.BIGINT, defaultValue: 0 },
        level: { type: Sequelize.INTEGER, defaultValue: 1 },
        data: { type: Sequelize.JSON, defaultValue: {} }
    }, { freezeTableName: true, timestamps: true });

    await sequelize.authenticate();

    const result = { threads: 0, users: 0, currencies: 0 };

    try {
        const rows = await ThreadsModel.findAll();
        for (const r of rows) {
            const p = r.get({ plain: true });
            const threadID = String(p.threadID);
            await Threads.updateOne(
                { threadID },
                { $set: { threadInfo: p.threadInfo || {}, data: p.data || {} }, $setOnInsert: { threadID } },
                { upsert: true }
            );
            result.threads++;
        }
    } catch (e) {
        logStep(`Threads table read failed: ${e.message}`);
    }

    try {
        const rows = await UsersModel.findAll();
        for (const r of rows) {
            const p = r.get({ plain: true });
            const userID = String(p.userID);
            await Users.updateOne(
                { userID },
                { $set: { name: p.name || "Facebook User", data: p.data || {} }, $setOnInsert: { userID } },
                { upsert: true }
            );
            result.users++;
        }
    } catch (e) {
        logStep(`Users table read failed: ${e.message}`);
    }

    try {
        const rows = await CurrenciesModel.findAll();
        for (const r of rows) {
            const p = r.get({ plain: true });
            const userID = String(p.userID);
            await Currencies.updateOne(
                { userID },
                {
                    $set: {
                        money: Number(p.money) || 0,
                        exp: Number(p.exp) || 0,
                        level: Number(p.level) || 1,
                        data: p.data || {}
                    },
                    $setOnInsert: { userID }
                },
                { upsert: true }
            );
            result.currencies++;
        }
    } catch (e) {
        logStep(`Currencies table read failed: ${e.message}`);
    }

    await sequelize.close();
    return result;
}

async function migrateUnsendSettings() {
    const file = path.join(process.cwd(), "Zeroex_Cache", "unsend_settings.json");
    if (!fs.existsSync(file)) {
        logStep("unsend_settings.json not found, skipping.");
        return 0;
    }
    let data;
    try { data = JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (e) { logStep(`Failed to parse unsend_settings.json: ${e.message}`); return 0; }

    let count = 0;
    for (const threadID of Object.keys(data)) {
        await Settings.updateOne(
            { scope: "unsend", key: String(threadID) },
            { $set: { value: data[threadID] }, $setOnInsert: { scope: "unsend", key: String(threadID) } },
            { upsert: true }
        );
        count++;
    }
    return count;
}

async function migrateCheckTuongTac() {
    const dir = path.join(process.cwd(), "Zeroex", "commands", "checktuongtac");
    if (!fs.existsSync(dir)) {
        logStep("checktuongtac directory not found, skipping.");
        return 0;
    }
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
    let count = 0;
    for (const f of files) {
        const full = path.join(dir, f);
        let data;
        try { data = JSON.parse(fs.readFileSync(full, "utf8")); }
        catch (e) { logStep(`Failed to parse ${f}: ${e.message}`); continue; }
        const id = f.replace(".json", "");
        await Settings.updateOne(
            { scope: "checktuongtac", key: String(id) },
            { $set: { value: data }, $setOnInsert: { scope: "checktuongtac", key: String(id) } },
            { upsert: true }
        );
        count++;
    }
    return count;
}

(async () => {
    try {
        await connect();
        logStep("Connected to MongoDB.");

        const sql = await migrateSqlite();
        logStep(`SQLite migration complete: threads=${sql.threads}, users=${sql.users}, currencies=${sql.currencies}`);

        const unsendCount = await migrateUnsendSettings();
        logStep(`Unsend settings migrated: ${unsendCount}`);

        const ttCount = await migrateCheckTuongTac();
        logStep(`Interaction tracker entries migrated: ${ttCount}`);

        logStep("Migration finished successfully.");
        await mongoose.connection.close();
        process.exit(0);
    } catch (e) {
        console.error("[migrate] Migration failed:", e.message);
        try { await mongoose.connection.close(); } catch {}
        process.exit(1);
    }
})();
