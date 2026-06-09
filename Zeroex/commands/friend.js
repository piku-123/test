module.exports.config = {
    name: "friend",
    aliases: ["fm"],
    version: "6.0.0",
    permission: 4,
    prefix: true,
    author: "Adi.0X",
    description: "Manage the bot's Facebook friends.",
    category: "System",
    usages: "[list/requests/suggest/addfriend/unfriend/block/unblock/accept/reject]",
    cooldowns: 10
};

// ─────────────────────────────────────────────
//  USAGE MESSAGE — help style (box drawing, no emoji)
// ─────────────────────────────────────────────
const USAGE_MSG =
`┏ FRIEND MANAGER
┗━━━━━━━━━━━━━━━━━━━━
┏ SUBCOMMANDS
┃ • list [page]
┃   Bot's friend list
┃
┃ • requests [page]
┃   Pending friend requests
┃   (reply number/range/all for accept/reject)
┃
┃ • suggest [page]
┃   People You May Know
┃   (reply number/range/all for add)
┃
┃ • addfriend [uid/link]
┃   Friend request send
┃
┃ • accept [uid/mention]
┃   Friend request accept
┃
┃ • reject [uid/mention]
┃   Friend request reject
┃
┃ • unfriend [uid/mention]
┃   Remove User From Friend
┃
┃ • block [uid/mention/link]
┃   User block
┃
┃ • unblock [uid/mention/link]
┃   User unblock
┗━━━━━━━━━━━━━━━━━━━━
┏ MULTI-SELECT (reply)
┃ • Single number  : reply 3
┃ • Range        : reply 2-5
┃ • Multiple     : reply 1 3 6
┃ • All     : reply all
┗━━━━━━━━━━━━━━━━━━━━`;

const PAGE_SIZE = 10;
const FB_GRAPHQL = "https://www.facebook.com/api/graphql/";

// ─────────────────────────────────────────────
//  GRAPHQL HELPER
// ─────────────────────────────────────────────
async function graphql(api, form) {
    const raw = await api.httpPost(FB_GRAPHQL, form);
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (data?.errors) throw new Error(JSON.stringify(data.errors));
    return data;
}

// ─────────────────────────────────────────────
//  FORMAT HELPERS
// ─────────────────────────────────────────────
function formatFriends(data, type) {
    const viewer = data?.data?.viewer;
    let edges;
    if (type === "requests" && viewer?.friend_requests?.edges) {
        edges = viewer.friend_requests.edges;
    } else if (type === "suggestions" && viewer?.people_you_may_know?.edges) {
        edges = viewer.people_you_may_know.edges;
    } else if (type === "list") {
        edges =
            data?.data?.node?.all_collections?.nodes?.[0]?.style_renderer?.collection?.pageItems?.edges ||
            data?.data?.node?.friends?.edges ||
            data?.data?.viewer?.all_friends?.edges ||
            null;
    }
    if (!edges) return [];
    return edges.map(edge => {
        const node = edge.node;
        return {
            userID: node.id || node.node?.id,
            name: node.name || node.title?.text,
            profilePicture: node.profile_picture?.uri || node.image?.uri,
            socialContext: node.social_context?.text || node.subtitle_text?.text,
            url: node.url
        };
    });
}

function paginate(array, page) {
    const totalPages = Math.ceil(array.length / PAGE_SIZE) || 1;
    const currentPage = Math.max(1, Math.min(page, totalPages));
    const slice = array.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    return { slice, currentPage, totalPages, total: array.length };
}

async function resolveUserID(input, mentionIDs) {
    if (!input) return null;
    if (mentionIDs && Object.keys(mentionIDs).length > 0) return Object.keys(mentionIDs)[0];
    if (/^\d+$/.test(input.trim())) return input.trim();
    const numericMatch = input.match(/facebook\.com\/(\d+)/i);
    if (numericMatch) return numericMatch[1];
    const slugMatch = input.match(/facebook\.com\/([a-zA-Z0-9._-]+)/i);
    if (slugMatch) {
        try {
            const https = require("https");
            const result = await new Promise((resolve, reject) => {
                https.get(
                    `https://zeroex-all-rest-api.onrender.com/api/fb/uid?url=https://facebook.com/${slugMatch[1]}`,
                    { headers: { "User-Agent": "Mozilla/5.0" } },
                    (res) => {
                        let d = "";
                        res.on("data", c => d += c);
                        res.on("end", () => { try { resolve(JSON.parse(d)); } catch { reject(); } });
                    }
                ).on("error", reject);
            });
            if (result?.status && result?.uid) return result.uid;
        } catch { return null; }
    }
    return null;
}

// ─────────────────────────────────────────────
//  MULTI-SELECT PARSER
//  Input: "all" | "1 3 6" | "2-5" | "3"
//  Returns: array of 0-based indices
// ─────────────────────────────────────────────
function parseSelection(input, totalItems) {
    const trimmed = input.trim().toLowerCase();
    if (trimmed === "all") {
        return Array.from({ length: totalItems }, (_, i) => i);
    }
    const indices = new Set();
    // Range: "2-5"
    const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
        const from = parseInt(rangeMatch[1]) - 1;
        const to   = parseInt(rangeMatch[2]) - 1;
        for (let i = Math.max(0, from); i <= Math.min(totalItems - 1, to); i++) indices.add(i);
        return [...indices];
    }
    // Space-separated numbers: "1 3 6"
    const parts = trimmed.split(/\s+/);
    for (const p of parts) {
        if (/^\d+$/.test(p)) {
            const idx = parseInt(p) - 1;
            if (idx >= 0 && idx < totalItems) indices.add(idx);
        }
    }
    return [...indices];
}

// ─────────────────────────────────────────────
//  SESSION STORE
// ─────────────────────────────────────────────
const pendingSessions = {};
const SESSION_TTL = 5 * 60 * 1000;

function saveSession(threadID, type, items) {
    pendingSessions[threadID] = { type, items, expires: Date.now() + SESSION_TTL };
}

function getSession(threadID) {
    const s = pendingSessions[threadID];
    if (!s || Date.now() > s.expires) { delete pendingSessions[threadID]; return null; }
    return s;
}

// ─────────────────────────────────────────────
//  BULK ACTION EXECUTOR
// ─────────────────────────────────────────────
async function executeBulk(api, items, action, botID, threadID, messageID) {
    const results = { ok: [], fail: [] };

    for (const { userID, name } of items) {
        try {
            if (action === "add") {
                await graphql(api, {
                    fb_api_caller_class: "RelayModern",
                    fb_api_req_friendly_name: "FriendingCometFriendRequestSendMutation",
                    variables: JSON.stringify({
                        input: {
                            friend_requestee_ids: [userID],
                            friending_channel: "FRIENDS_HOME_MAIN",
                            actor_id: botID,
                            client_mutation_id: Math.floor(Math.random() * 10 + 1).toString()
                        },
                        scale: 3
                    }),
                    doc_id: "23982103144788355"
                });
            } else if (action === "accept") {
                await graphql(api, {
                    fb_api_caller_class: "RelayModern",
                    fb_api_req_friendly_name: "FriendingCometFriendRequestConfirmMutation",
                    variables: JSON.stringify({
                        input: {
                            friend_requester_id: userID,
                            friending_channel: "FRIENDS_HOME_MAIN",
                            actor_id: botID,
                            client_mutation_id: Math.floor(Math.random() * 10 + 1).toString()
                        },
                        scale: 3
                    }),
                    doc_id: "24630768433181357"
                });
            } else if (action === "reject") {
                await api.handleFriendRequest(userID, false);
            } else if (action === "unfriend") {
                await api.unfriend(userID);
            } else if (action === "block") {
                await api.changeBlockedStatus(userID, true);
            } else if (action === "unblock") {
                await api.changeBlockedStatus(userID, false);
            }
            results.ok.push(name || userID);
        } catch (e) {
            results.fail.push(`${name || userID} (${e.message?.slice(0, 30)})`);
        }
    }
    return results;
}

// ─────────────────────────────────────────────
//  MAIN RUN
// ─────────────────────────────────────────────
module.exports.run = async function ({ api, event, args }) {
    const { threadID, messageID, messageReply, mentions } = event;
    const mentionIDs = mentions || {};
    const subcommand = args[0]?.toLowerCase();
    const botID = api.getCurrentUserID();

    // ─── REPLY HANDLER (multi-select) ────────────────────────
    if (messageReply) {
        const session = getSession(threadID);

        // Single confirm sessions (confirm_request / confirm_friend)
        if (session?.type === "confirm_request" && session.msgID === messageReply.messageID) {
            const input = args.join(" ").toLowerCase().trim();
            const { userID, name } = session;
            delete pendingSessions[threadID];

            if (input === "accept") {
                api.setMessageReaction("🔄", messageID, threadID, () => {}, true);
                try {
                    await graphql(api, {
                        fb_api_caller_class: "RelayModern",
                        fb_api_req_friendly_name: "FriendingCometFriendRequestConfirmMutation",
                        variables: JSON.stringify({
                            input: {
                                friend_requester_id: userID,
                                friending_channel: "FRIENDS_HOME_MAIN",
                                actor_id: botID,
                                client_mutation_id: Math.floor(Math.random() * 10 + 1).toString()
                            },
                            scale: 3
                        }),
                        doc_id: "24630768433181357"
                    });
                    api.setMessageReaction("✅", messageID, threadID, () => {}, true);
                    return api.sendMessage(
`┏ ACCEPTED
┃ Name : ${name}
┃ UID  : ${userID}
┗━━━━━━━━━━━━━━`, threadID, messageID);
                } catch (e) {
                    api.setMessageReaction("❌", messageID, threadID, () => {}, true);
                    return api.sendMessage(`❌ accept Error:\n${e.message}`, threadID, messageID);
                }
            }

            if (input === "reject") {
                api.setMessageReaction("🔄", messageID, threadID, () => {}, true);
                try {
                    await api.handleFriendRequest(userID, false);
                    api.setMessageReaction("✅", messageID, threadID, () => {}, true);
                    return api.sendMessage(
`┏ REJECTED
┃ Name : ${name}
┃ UID  : ${userID}
┗━━━━━━━━━━━━━━`, threadID, messageID);
                } catch (e) {
                    api.setMessageReaction("❌", messageID, threadID, () => {}, true);
                    return api.sendMessage(`❌ reject Error:\n${e.message}`, threadID, messageID);
                }
            }

            return api.sendMessage("❌ accept অথবা reject লিখো।", threadID, messageID);
        }

        if (session?.type === "confirm_friend" && session.msgID === messageReply.messageID) {
            const input = args.join(" ").toLowerCase().trim();
            const { userID, name } = session;
            delete pendingSessions[threadID];

            if (input === "unfriend" || input === "block") {
                api.setMessageReaction("🔄", messageID, threadID, () => {}, true);
                try {
                    if (input === "unfriend") await api.unfriend(userID);
                    else await api.changeBlockedStatus(userID, true);
                    api.setMessageReaction("✅", messageID, threadID, () => {}, true);
                    const label = input === "unfriend" ? "UNFRIENDED" : "BLOCKED";
                    return api.sendMessage(
`┏ ${label}
┃ Name : ${name}
┃ UID  : ${userID}
┗━━━━━━━━━━━━━━`, threadID, messageID);
                } catch (e) {
                    api.setMessageReaction("❌", messageID, threadID, () => {}, true);
                    return api.sendMessage(`❌ ${input} Error:\n${e.message}`, threadID, messageID);
                }
            }

            return api.sendMessage("❌ unfriend অথবা block লিখো।", threadID, messageID);
        }

        // ─── MULTI-SELECT reply ───────────────────────────────
        if (session && (session.type === "requests" || session.type === "suggest" || session.type === "list")) {
            const selectionInput = args.join(" ").trim();
            const indices = parseSelection(selectionInput, session.items.length);

            if (!indices.length) {
                return api.sendMessage(
`┏ SELECTION FORMAT
┃ • Single   : 3
┃ • Range    : 2-5
┃ • Multiple : 1 3 6
┃ • All      : all
┗━━━━━━━━━━━━━━`, threadID, messageID);
            }

            const selected = indices.map(i => session.items[i]).filter(Boolean);

            // requests → confirm action ager moto (single selection)
            if (session.type === "requests" && indices.length === 1) {
                const { userID, name } = selected[0];
                api.setMessageReaction("🔄", messageID, threadID, () => {}, true);
                return api.sendMessage(
`┏ SELECT ACTION
┃ Name : ${name}
┃ UID  : ${userID}
┃
┃ accept — request ta accept koro
┃ reject — request ta reject koro
┗━━━━━━━━━━━━━━━━━━━━
(Ei message e reply koro)`,
                    threadID,
                    (err, info) => {
                        if (!err) pendingSessions[threadID] = { type: "confirm_request", userID, name, msgID: info.messageID, expires: Date.now() + SESSION_TTL };
                    }
                );
            }

            // list → single confirm
            if (session.type === "list" && indices.length === 1) {
                const { userID, name } = selected[0];
                api.setMessageReaction("🔄", messageID, threadID, () => {}, true);
                return api.sendMessage(
`┏ SELECT ACTION
┃ Name : ${name}
┃ UID  : ${userID}
┃
┃ unfriend — bondhu theke remove koro
┃ block    — user ta block koro
┗━━━━━━━━━━━━━━━━━━━━
(Ei message e reply koro)`,
                    threadID,
                    (err, info) => {
                        if (!err) pendingSessions[threadID] = { type: "confirm_friend", userID, name, msgID: info.messageID, expires: Date.now() + SESSION_TTL };
                    }
                );
            }

            // BULK — multiple selection
            let action;
            if (session.type === "suggest") action = "add";
            else if (session.type === "requests") action = "accept";
            else action = "unfriend";

            api.setMessageReaction("🔄", messageID, threadID, () => {}, true);

            // Bulk confirm prompt
            const nameList = selected.map((s, i) => `┃ ${i + 1}. ${s.name || s.userID}`).join("\n");
            const actionLabel = { add: "Add (Friend Request)", accept: "Accept", reject: "Reject", unfriend: "Unfriend", block: "Block" }[action] || action;

            return api.sendMessage(
`┏ BULK ${actionLabel.toUpperCase()} — ${selected.length} jon
${nameList}
┃
┃ "confirm" lekho execute korte
┗━━━━━━━━━━━━━━━━━━━━
(Ei message e reply koro)`,
                threadID,
                (err, info) => {
                    if (!err) {
                        pendingSessions[threadID] = {
                            type: "bulk_confirm",
                            action,
                            items: selected,
                            msgID: info.messageID,
                            expires: Date.now() + SESSION_TTL
                        };
                    }
                }
            );
        }

        // bulk_confirm
        if (session?.type === "bulk_confirm" && session.msgID === messageReply.messageID) {
            const input = args.join(" ").toLowerCase().trim();
            if (input !== "confirm") return api.sendMessage("❌ \"confirm\" lekho execute korte।", threadID, messageID);

            delete pendingSessions[threadID];
            api.setMessageReaction("🔄", messageID, threadID, () => {}, true);

            const results = await executeBulk(api, session.items, session.action, botID, threadID, messageID);
            const total = session.items.length;
            const okList  = results.ok.map(n => `┃ + ${n}`).join("\n") || "┃ (none)";
            const failList = results.fail.map(n => `┃ x ${n}`).join("\n");

            api.setMessageReaction(results.fail.length === 0 ? "✅" : "⚠️", messageID, threadID, () => {}, true);
            return api.sendMessage(
`┏ BULK ${session.action.toUpperCase()} DONE
┃ Total  : ${total}
┃ OK     : ${results.ok.length}
┃ Failed : ${results.fail.length}
┗━━━━━━━━━━━━━━━━━━━━
┏ SUCCESS
${okList}
${results.fail.length ? `┗━━━━━\n┏ FAILED\n${failList}\n┗━━━━━` : "┗━━━━━"}`, threadID, messageID);
        }
    }

    const validCmds = ["list", "requests", "suggest", "addfriend", "unfriend", "block", "unblock", "accept", "reject"];
    if (!subcommand || !validCmds.includes(subcommand)) {
        return api.sendMessage(USAGE_MSG, threadID, messageID);
    }

    // ─── LIST ─────────────────────────────────────────────────
    if (subcommand === "list") {
        const page = parseInt(args[1]) || 1;
        api.setMessageReaction("🔄", messageID, threadID, () => {}, true);
        try {
            const raw = await api.getFriendsList();
            let friends = [];
            if (raw && typeof raw === "object") {
                friends = Array.isArray(raw) ? raw : Object.values(raw);
            }
            if (!friends.length) {
                api.setMessageReaction("✅", messageID, threadID, () => {}, true);
                return api.sendMessage("Bot er kono bondhu nei।", threadID, messageID);
            }
            const { slice, currentPage, totalPages, total } = paginate(friends, page);
            saveSession(threadID, "list", friends);
            const lines = slice.map((f, i) => {
                const num = (currentPage - 1) * PAGE_SIZE + i + 1;
                const name = f.fullName || f.name || "Unknown";
                const id = f.userID || f.vanity || "N/A";
                return `┃ ${num}. ${name}\n┃    UID: ${id}`;
            }).join("\n┃\n");
            api.setMessageReaction("✅", messageID, threadID, () => {}, true);
            return api.sendMessage(
`┏ BOT FRIENDS — ${total} jon
┃ Page ${currentPage}/${totalPages}
┗━━━━━━━━━━━━━━━━━━━━
${lines}
┏━━━━━━━━━━━━━━━━━━━━${currentPage < totalPages ? `\n┃ Next: friend list ${currentPage + 1}` : ""}
┃ Reply kore number/range/all
┃ diye unfriend/block korte paro
┗━━━━━━━━━━━━━━━━━━━━`, threadID, messageID);
        } catch (err) {
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            return api.sendMessage(`❌ friend list Error:\n${err.message}`, threadID, messageID);
        }
    }

    // ─── REQUESTS ─────────────────────────────────────────────
    if (subcommand === "requests") {
        const page = parseInt(args[1]) || 1;
        api.setMessageReaction("🔄", messageID, threadID, () => {}, true);
        try {
            const data = await graphql(api, {
                fb_api_caller_class: "RelayModern",
                fb_api_req_friendly_name: "FriendingCometRootContentQuery",
                variables: JSON.stringify({ scale: 3 }),
                doc_id: "9103543533085580"
            });
            const requests = formatFriends(data, "requests");
            if (!requests.length) {
                api.setMessageReaction("✅", messageID, threadID, () => {}, true);
                return api.sendMessage("Kono pending friend request nei।", threadID, messageID);
            }
            saveSession(threadID, "requests", requests);
            const { slice, currentPage, totalPages, total } = paginate(requests, page);
            const lines = slice.map((r, i) => {
                const num = (currentPage - 1) * PAGE_SIZE + i + 1;
                const ctx = r.socialContext ? `\n┃    Context: ${r.socialContext}` : "";
                return `┃ ${num}. ${r.name || "Unknown"}\n┃    UID: ${r.userID || "N/A"}${ctx}`;
            }).join("\n┃\n");
            api.setMessageReaction("✅", messageID, threadID, () => {}, true);
            return api.sendMessage(
`┏ FRIEND REQUESTS — ${total} ta
┃ Page ${currentPage}/${totalPages}
┗━━━━━━━━━━━━━━━━━━━━
${lines}
┏━━━━━━━━━━━━━━━━━━━━${currentPage < totalPages ? `\n┃ Next: friend requests ${currentPage + 1}` : ""}
┃ Reply kore number/range/all diye
┃ accept/reject korte paro
┗━━━━━━━━━━━━━━━━━━━━`, threadID, messageID);
        } catch (err) {
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            return api.sendMessage(`❌ friend requests Error:\n${err.message}`, threadID, messageID);
        }
    }

    // ─── SUGGEST ──────────────────────────────────────────────
    if (subcommand === "suggest") {
        const page = parseInt(args[1]) || 1;
        api.setMessageReaction("🔄", messageID, threadID, () => {}, true);
        try {
            const data = await graphql(api, {
                fb_api_caller_class: "RelayModern",
                fb_api_req_friendly_name: "FriendingCometPYMKPanelPaginationQuery",
                variables: JSON.stringify({ count: 50, cursor: null, scale: 3 }),
                doc_id: "9917809191634193"
            });
            const suggestions = formatFriends(data, "suggestions");
            if (!suggestions.length) {
                api.setMessageReaction("✅", messageID, threadID, () => {}, true);
                return api.sendMessage("Kono suggestion nei।", threadID, messageID);
            }
            saveSession(threadID, "suggest", suggestions);
            const { slice, currentPage, totalPages, total } = paginate(suggestions, page);
            const lines = slice.map((s, i) => {
                const num = (currentPage - 1) * PAGE_SIZE + i + 1;
                const ctx = s.socialContext ? `\n┃    Context: ${s.socialContext}` : "";
                return `┃ ${num}. ${s.name || "Unknown"}\n┃    UID: ${s.userID || "N/A"}${ctx}`;
            }).join("\n┃\n");
            api.setMessageReaction("✅", messageID, threadID, () => {}, true);
            return api.sendMessage(
`┏ PEOPLE YOU MAY KNOW — ${total} jon
┃ Page ${currentPage}/${totalPages}
┗━━━━━━━━━━━━━━━━━━━━
${lines}
┏━━━━━━━━━━━━━━━━━━━━${currentPage < totalPages ? `\n┃ Next: friend suggest ${currentPage + 1}` : ""}
┃ Reply kore number/range/all diye
┃ add (friend request pathano) korte paro
┗━━━━━━━━━━━━━━━━━━━━`, threadID, messageID);
        } catch (err) {
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            return api.sendMessage(`❌ friend suggest Error:\n${err.message}`, threadID, messageID);
        }
    }

    // ─── ADDFRIEND ────────────────────────────────────────────
    if (subcommand === "addfriend") {
        const targetID = await resolveUserID(args[1], mentionIDs);
        if (!targetID) return api.sendMessage("❌ Valid User ID, @mention ba Facebook link dao।", threadID, messageID);
        api.setMessageReaction("🔄", messageID, threadID, () => {}, true);
        try {
            await graphql(api, {
                fb_api_caller_class: "RelayModern",
                fb_api_req_friendly_name: "FriendingCometFriendRequestSendMutation",
                variables: JSON.stringify({
                    input: {
                        friend_requestee_ids: [targetID],
                        friending_channel: "FRIENDS_HOME_MAIN",
                        actor_id: botID,
                        client_mutation_id: Math.floor(Math.random() * 10 + 1).toString()
                    },
                    scale: 3
                }),
                doc_id: "23982103144788355"
            });
            api.setMessageReaction("✅", messageID, threadID, () => {}, true);
            return api.sendMessage(
`┏ FRIEND REQUEST SENT
┃ UID  : ${targetID}
┃ Link : https://facebook.com/${targetID}
┗━━━━━━━━━━━━━━━━━━━━`, threadID, messageID);
        } catch (err) {
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            return api.sendMessage(`❌ addfriend Error:\n${err.message}`, threadID, messageID);
        }
    }

    // ─── ACCEPT ───────────────────────────────────────────────
    if (subcommand === "accept") {
        const input = args.slice(1).join(" ").trim();
        const mentionID = Object.keys(mentionIDs)[0];
        const identifier = mentionID || input;
        if (!identifier) return api.sendMessage("❌ User ID, naam ba @mention dao।", threadID, messageID);
        api.setMessageReaction("🔄", messageID, threadID, () => {}, true);
        try {
            let targetID = identifier;
            if (isNaN(identifier)) {
                const data = await graphql(api, {
                    fb_api_caller_class: "RelayModern",
                    fb_api_req_friendly_name: "FriendingCometRootContentQuery",
                    variables: JSON.stringify({ scale: 3 }),
                    doc_id: "9103543533085580"
                });
                const requests = formatFriends(data, "requests");
                const found = requests.find(r => r.name?.toLowerCase().includes(identifier.toLowerCase()));
                if (!found) throw new Error(`"${identifier}" name e kono pending request nei।`);
                targetID = found.userID;
            }
            await graphql(api, {
                fb_api_caller_class: "RelayModern",
                fb_api_req_friendly_name: "FriendingCometFriendRequestConfirmMutation",
                variables: JSON.stringify({
                    input: {
                        friend_requester_id: targetID,
                        friending_channel: "FRIENDS_HOME_MAIN",
                        actor_id: botID,
                        client_mutation_id: Math.floor(Math.random() * 10 + 1).toString()
                    },
                    scale: 3
                }),
                doc_id: "24630768433181357"
            });
            api.setMessageReaction("✅", messageID, threadID, () => {}, true);
            return api.sendMessage(
`┏ ACCEPTED
┃ UID  : ${targetID}
┃ Link : https://facebook.com/${targetID}
┗━━━━━━━━━━━━━━━━━━━━`, threadID, messageID);
        } catch (err) {
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            return api.sendMessage(`❌ accept Error:\n${err.message}`, threadID, messageID);
        }
    }

    // ─── REJECT ───────────────────────────────────────────────
    if (subcommand === "reject") {
        const targetID = await resolveUserID(args[1], mentionIDs);
        if (!targetID) return api.sendMessage("❌ Valid User ID ba @mention dao।", threadID, messageID);
        api.setMessageReaction("🔄", messageID, threadID, () => {}, true);
        try {
            await api.handleFriendRequest(targetID, false);
            api.setMessageReaction("✅", messageID, threadID, () => {}, true);
            return api.sendMessage(
`┏ REJECTED
┃ UID  : ${targetID}
┗━━━━━━━━━━━━━━`, threadID, messageID);
        } catch (err) {
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            return api.sendMessage(`❌ reject Error:\n${err.message}`, threadID, messageID);
        }
    }

    // ─── UNFRIEND ─────────────────────────────────────────────
    if (subcommand === "unfriend") {
        const targetID = await resolveUserID(args[1], mentionIDs);
        if (!targetID) return api.sendMessage("❌ Valid User ID ba @mention dao।", threadID, messageID);
        api.setMessageReaction("🔄", messageID, threadID, () => {}, true);
        try {
            await api.unfriend(targetID);
            api.setMessageReaction("✅", messageID, threadID, () => {}, true);
            return api.sendMessage(
`┏ UNFRIENDED
┃ UID  : ${targetID}
┃ Link : https://facebook.com/${targetID}
┗━━━━━━━━━━━━━━━━━━━━`, threadID, messageID);
        } catch (err) {
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            return api.sendMessage(`❌ unfriend Error:\n${err.message}`, threadID, messageID);
        }
    }

    // ─── BLOCK / UNBLOCK ──────────────────────────────────────
    if (subcommand === "block" || subcommand === "unblock") {
        const isBlock = subcommand === "block";
        const targetID = await resolveUserID(args[1], mentionIDs);
        if (!targetID) return api.sendMessage("❌ Valid User ID, @mention ba Facebook link dao।", threadID, messageID);
        api.setMessageReaction("🔄", messageID, threadID, () => {}, true);
        try {
            await api.changeBlockedStatus(targetID, isBlock);
            api.setMessageReaction("✅", messageID, threadID, () => {}, true);
            const label = isBlock ? "BLOCKED" : "UNBLOCKED";
            return api.sendMessage(
`┏ ${label}
┃ UID  : ${targetID}
┃ Link : https://facebook.com/${targetID}
┗━━━━━━━━━━━━━━━━━━━━`, threadID, messageID);
        } catch (err) {
            api.setMessageReaction("❌", messageID, threadID, () => {}, true);
            return api.sendMessage(`❌ ${subcommand} Error:\n${err.message}`, threadID, messageID);
        }
    }
};
