const mongoose = require("mongoose");

const threadSchema = new mongoose.Schema(
    {
        threadID: { type: String, required: true, unique: true, index: true },
        threadInfo: { type: mongoose.Schema.Types.Mixed, default: {} },
        data: { type: mongoose.Schema.Types.Mixed, default: {} }
    },
    { timestamps: true, collection: "threads", minimize: false }
);

module.exports = mongoose.models.Threads || mongoose.model("Threads", threadSchema);
