module.exports = function ({ models }) {
    const Settings = models.use("Settings");

    async function getValue(scope, key, defaultValue = null) {
        try {
            const doc = await Settings.findOne({ scope, key: String(key) }).lean();
            return doc ? doc.value : defaultValue;
        } catch (error) {
            console.error(error);
            return defaultValue;
        }
    }

    async function setValue(scope, key, value) {
        try {
            await Settings.findOneAndUpdate(
                { scope, key: String(key) },
                { $set: { value }, $setOnInsert: { scope, key: String(key) } },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            return true;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    async function deleteValue(scope, key) {
        try {
            await Settings.deleteOne({ scope, key: String(key) });
            return true;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    async function getScope(scope) {
        try {
            const docs = await Settings.find({ scope }).lean();
            const out = {};
            for (const d of docs) out[d.key] = d.value;
            return out;
        } catch (error) {
            console.error(error);
            return {};
        }
    }

    async function setScope(scope, mapping = {}) {
        try {
            const ops = Object.keys(mapping).map((k) => ({
                updateOne: {
                    filter: { scope, key: String(k) },
                    update: { $set: { value: mapping[k] }, $setOnInsert: { scope, key: String(k) } },
                    upsert: true
                }
            }));
            if (ops.length === 0) return true;
            await Settings.bulkWrite(ops);
            return true;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    return { getValue, setValue, deleteValue, getScope, setScope };
};
