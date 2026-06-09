const mongoose = require("mongoose");
const { join } = require("path");
const { existsSync, readFileSync } = require("fs-extra");

function resolveMongoUri() {
    let uri = null;
    try {
        const configPath = join(process.cwd(), "config.json");
        if (existsSync(configPath)) {
            const config = JSON.parse(readFileSync(configPath, "utf8"));
            if (typeof config.MONGODB_URI === "string" && config.MONGODB_URI.trim()) {
                uri = config.MONGODB_URI.trim();
            } else if (config.DATABASE && typeof config.DATABASE.MONGODB_URI === "string" && config.DATABASE.MONGODB_URI.trim()) {
                uri = config.DATABASE.MONGODB_URI.trim();
            } else if (config.DATABASE && config.DATABASE.mongodb && typeof config.DATABASE.mongodb.uri === "string" && config.DATABASE.mongodb.uri.trim()) {
                uri = config.DATABASE.mongodb.uri.trim();
            }
        }
    } catch (e) {
        // fall back to env var below
    }

    if (!uri && process.env.MONGODB_URI && process.env.MONGODB_URI.trim()) {
        uri = process.env.MONGODB_URI.trim();
    }

    return uri;
}

async function connect() {
    const uri = resolveMongoUri();
    if (!uri) {
        throw new Error("MONGODB_URI was not found in config.json or environment variables.");
    }

    mongoose.set("strictQuery", false);

    await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 60000,
        maxPoolSize: 20,
        minPoolSize: 0
    });

    return mongoose.connection;
}

module.exports = {
    mongoose,
    connect,
    resolveMongoUri
};
