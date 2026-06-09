const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema(
    {
        scope: { type: String, required: true, index: true },
        key: { type: String, required: true, index: true },
        value: { type: mongoose.Schema.Types.Mixed, default: null }
    },
    { timestamps: true, collection: "settings", minimize: false }
);

settingsSchema.index({ scope: 1, key: 1 }, { unique: true });

module.exports = mongoose.models.Settings || mongoose.model("Settings", settingsSchema);
