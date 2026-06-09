module.exports = function ({ models, api }) {
    const Users = models.use("Users");

    function buildProjection(attributes) {
        if (!Array.isArray(attributes) || attributes.length === 0) return null;
        const projection = {};
        for (const a of attributes) projection[a] = 1;
        return projection;
    }

    async function getInfo(id) {
        try {
            return (await api.getUserInfo(id))[id];
        } catch {
            return {};
        }
    }

    async function getNameUser(id) {
        try {
            const sid = String(id);
            if (global.data.userName.has(sid)) return global.data.userName.get(sid);
            const user = await Users.findOne({ userID: sid }).lean();
            if (user && user.name) {
                global.data.userName.set(sid, user.name);
                return user.name;
            }
            return "Facebook User";
        } catch {
            return "Facebook User";
        }
    }

    async function getAll(...data) {
        let where = {};
        let attributes;
        for (const i of data) {
            if (Array.isArray(i)) attributes = i;
            else if (i && typeof i === "object") where = i;
        }
        try {
            const projection = buildProjection(attributes);
            const query = Users.find(where);
            if (projection) query.select(projection);
            return await query.lean();
        } catch (error) {
            return console.error(error);
        }
    }

    async function getData(userID) {
        try {
            const data = await Users.findOne({ userID: String(userID) }).lean();
            return data ? data : false;
        } catch (error) {
            return console.error(error);
        }
    }

    async function setData(userID, options = {}) {
        try {
            const id = String(userID);
            const updated = await Users.findOneAndUpdate(
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
            return await Users.deleteOne({ userID: String(userID) });
        } catch (error) {
            return console.error(error);
        }
    }

    async function createData(userID, defaults = {}) {
        try {
            const id = String(userID);
            await Users.updateOne(
                { userID: id },
                { $setOnInsert: Object.assign({ userID: id }, defaults) },
                { upsert: true }
            );
            return true;
        } catch (error) {
            return console.error(error);
        }
    }

    return { getInfo, getNameUser, getAll, getData, setData, delData, createData };
};
