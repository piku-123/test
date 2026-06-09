module.exports = function ({ models }) {
    const Currencies = models.use("Currencies");

    function buildProjection(attributes) {
        if (!Array.isArray(attributes) || attributes.length === 0) return null;
        const projection = {};
        for (const a of attributes) projection[a] = 1;
        return projection;
    }

    async function getAll(...data) {
        let where = {};
        let attributes;
        for (const i of data) {
            if (typeof i !== "object") throw global.getText("currencies", "needObjectOrArray");
            if (Array.isArray(i)) attributes = i;
            else where = i;
        }
        try {
            const projection = buildProjection(attributes);
            const query = Currencies.find(where);
            if (projection) query.select(projection);
            return await query.lean();
        } catch (error) {
            return console.error(error);
        }
    }

    async function getData(userID) {
        try {
            const data = await Currencies.findOne({ userID: String(userID) }).lean();
            return data ? data : false;
        } catch (error) {
            return console.error(error);
        }
    }

    async function setData(userID, options = {}) {
        try {
            const id = String(userID);
            const updated = await Currencies.findOneAndUpdate(
                { userID: id },
                { $set: options, $setOnInsert: { userID: id } },
                { new: true, upsert: true, setDefaultsOnInsert: true }
            ).lean();
            return updated;
        } catch (error) {
            return console.error(error);
        }
    }

    async function delData(userID) {
        try {
            return await Currencies.deleteOne({ userID: String(userID) });
        } catch (error) {
            return console.error(error);
        }
    }

    async function createData(userID, defaults = {}) {
        try {
            const id = String(userID);
            await Currencies.updateOne(
                { userID: id },
                { $setOnInsert: Object.assign({ userID: id }, defaults) },
                { upsert: true }
            );
            return true;
        } catch (error) {
            return console.error(error);
        }
    }

    async function increaseMoney(userID, money) {
        if (typeof money !== "number") return false;
        try {
            const id = String(userID);
            await Currencies.updateOne(
                { userID: id },
                { $inc: { money }, $setOnInsert: { userID: id } },
                { upsert: true }
            );
            return true;
        } catch (error) {
            return console.error(error);
        }
    }

    async function decreaseMoney(userID, money) {
        if (typeof money !== "number") return false;
        try {
            const id = String(userID);
            const data = await Currencies.findOne({ userID: id }).lean();
            if (!data || (data.money || 0) < money) return false;
            await Currencies.updateOne({ userID: id }, { $inc: { money: -money } });
            return true;
        } catch (error) {
            return console.error(error);
        }
    }

    return { getAll, getData, setData, delData, createData, increaseMoney, decreaseMoney };
};
