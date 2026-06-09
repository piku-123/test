const mongoose = require("mongoose");

const currencySchema = new mongoose.Schema(
    {
        userID: { type: String, required: true, unique: true, index: true },
        money: { type: Number, default: 0 },
        exp: { type: Number, default: 0 },
        level: { type: Number, default: 1 },
        data: { type: mongoose.Schema.Types.Mixed, default: {} }
    },
    { timestamps: true, collection: "currencies", minimize: false }
);

module.exports = mongoose.models.Currencies || mongoose.model("Currencies", currencySchema);
