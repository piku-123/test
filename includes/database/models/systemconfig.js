const mongoose = require("mongoose");

const systemConfigSchema = new mongoose.Schema(
    {
        selfListen:      { type: Boolean,  default: true },
        PREFIX:          { type: String,   default: null },
        ADMINBOT:        { type: [String], default: undefined },
        mod:             { type: [String], default: undefined },
        commandDisabled: { type: [String], default: undefined },
        eventDisabled:   { type: [String], default: undefined },
        systemMode:      { type: String,   default: "all" }
    },
    {
        timestamps: true,
        collection: "systemconfig",
        minimize: false
    }
);

module.exports = mongoose.models.SystemConfig
    || mongoose.model("SystemConfig", systemConfigSchema);
