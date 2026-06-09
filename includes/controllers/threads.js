module.exports = function ({ models, api }) {
    const Threads = models.use("Threads");

    function toPlain(doc) {
        if (!doc) return doc;
        const obj = typeof doc.toObject === "function" ? doc.toObject() : doc;
        return obj;
    }

    function buildProjection(attributes) {
        if (!Array.isArray(attributes) || attributes.length === 0) return null;
        const projection = {};
        for (const a of attributes) projection[a] = 1;
        return projection;
    }

    async function getInfo(threadID) {
        try {
            return await api.getThreadInfo(threadID);
        } catch (error) {
            return {};
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
            const query = Threads.find(where);
            if (projection) query.select(projection);
            const docs = await query.lean();
            return docs;
        } catch (error) {
            return console.error(error);
        }
    }

    async function getData(threadID) {
        try {
            const data = await Threads.findOne({ threadID: String(threadID) }).lean();
            return data ? data : false;
        } catch (error) {
            return console.error(error);
        }
    }

    async function setData(threadID, options = {}) {
        try {
            const id = String(threadID);
            const updated = await Threads.findOneAndUpdate(
                { threadID: id },
                { $set: options, $setOnInsert: { threadID: id } },
                { new: true, upsert: true, setDefaultsOnInsert: true }
            ).lean();
            return updated;
        } catch (error) {
            return console.error(error);
        }
    }

    async function delData(threadID) {
        try {
            return await Threads.deleteOne({ threadID: String(threadID) });
        } catch (error) {
            return console.error(error);
        }
    }

    async function createData(threadID, defaults = {}) {
        try {
            const id = String(threadID);
            await Threads.updateOne(
                { threadID: id },
                { $setOnInsert: Object.assign({ threadID: id }, defaults) },
                { upsert: true }
            );
            return true;
        } catch (error) {
            return console.error(error);
        }
    }

    return { getInfo, getAll, getData, setData, delData, createData };
};
