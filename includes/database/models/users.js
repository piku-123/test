const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        userID: { type: String, required: true, unique: true, index: true },
        name: { type: String, default: "Facebook User" },
        data: { type: mongoose.Schema.Types.Mixed, default: {} }
    },
    { timestamps: true, collection: "users", minimize: false }
);

module.exports = mongoose.models.Users || mongoose.model("Users", userSchema);
