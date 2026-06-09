const Users = require("./models/users");
const Threads = require("./models/threads");
const Currencies = require("./models/currencies");
const Settings = require("./models/settings");
const SystemConfig = require("./models/systemconfig");
const Interaction = require("./models/interaction");

module.exports = function () {
    return {
        model: {
            Users,
            Threads,
            Currencies,
            Settings,
            SystemConfig,
            Interaction
        },
        use: function (modelName) {
            return this.model[modelName];
        }
    };
};
