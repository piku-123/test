const mongoose = require("mongoose");

const interactionSchema = new mongoose.Schema(
    {
        threadID: { type: String, required: true },
        userID:   { type: String, required: true },
        count:    { type: Number, default: 0 },
        dailyData: [
            {
                day:   { type: String },
                count: { type: Number, default: 0 }
            }
        ]
    },
    { timestamps: true, collection: "interactions" }
);

interactionSchema.index({ threadID: 1, userID: 1 }, { unique: true });
interactionSchema.index({ threadID: 1, count: -1 });

module.exports = mongoose.models.Interaction || mongoose.model("Interaction", interactionSchema);
