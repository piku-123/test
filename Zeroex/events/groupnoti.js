module.exports.config = {
  name: "groupUpdate",
  eventType: [
      "log:thread-name",
      "log:thread-image",
      "log:thread-color",
      "log:thread-admins",
      "log:user-nickname",
      "log:thread-call",
      "log:thread-poll",
      "log:thread-icon"
  ],
  version: "3.1.0",
  author: "Adi.0X",
  description: "Notifications for group changes: name, photo, theme, admin, nickname, call, poll, emoji."
};

async function getName(api, id) {
  if (!id) return "Someone";
  try {
      const cached = global.data.userName?.get(String(id));
      if (cached) return cached;
      const info = await api.getUserInfo(id);
      return info?.[id]?.name || "Someone";
  } catch { return "Someone"; }
}

async function isAntiChangeOn(Threads, threadID) {
  try {
      const d = await Threads.getData(threadID);
      return !!(d?.data?.events?.antichange);
  } catch { return false; }
}

module.exports.run = async function ({ api, event, Threads }) {
  const { threadID, logMessageType, logMessageData, author } = event;
  if (!logMessageType) return;

  const botID = String(api.getCurrentUserID());
  if (String(author) === botID) return;

  try {
      const d = await Threads.getData(threadID);
      const isOn = d?.data?.events?.groupupdate;
      if (isOn === false) return;
  } catch { return; }

  const authorName = await getName(api, author);

  switch (logMessageType) {

      // ══ GROUP NAME CHANGE ══
      case "log:thread-name": {
          if (await isAntiChangeOn(Threads, threadID)) return;
          const newName = logMessageData?.name || "";
          return api.sendMessage({
              body: `${authorName} changed the group name to "${newName}".`,
              mentions: [{ tag: authorName, id: author }]
          }, threadID);
      }

      // ══ GROUP PHOTO CHANGE ══
      case "log:thread-image": {
          if (await isAntiChangeOn(Threads, threadID)) return;
          const newURL = logMessageData?.image?.url || null;
          if (!newURL) {
              return api.sendMessage({
                  body: `${authorName} removed the group photo.`,
                  mentions: [{ tag: authorName, id: author }]
              }, threadID);
          }
          return api.sendMessage({
              body: `${authorName} changed the group photo.`,
              mentions: [{ tag: authorName, id: author }]
          }, threadID);
      }

      // ══ GROUP THEME CHANGE ══
      case "log:thread-color": {
          if (await isAntiChangeOn(Threads, threadID)) return;
          const data = logMessageData || {};
          const themeName = data.theme_name_with_subtitle || data.accessibility_label || "Unknown";
          const themeEmoji = data.theme_emoji ? `${data.theme_emoji} ` : "";
          return api.sendMessage({
              body: `${authorName} changed the group theme to ${themeEmoji}"${themeName}".`,
              mentions: [{ tag: authorName, id: author }]
          }, threadID);
      }

      // ══ ADMIN ADD / REMOVE ══
      case "log:thread-admins": {
          const data       = logMessageData || {};
          const targetID   = data.target_id || data.TARGET_ID || data.targetID;
          const adminEvent = data.admin_event || data.ADMIN_EVENT;
          const targetName = await getName(api, targetID);

          // Update global.data.threadInfo in memory so permission checks stay current
          if (targetID) {
              const tid = String(threadID);
              const uid = String(targetID);
              const tInfo = global.data.threadInfo.get(tid) || {};
              let adminIDs = [...(tInfo.adminIDs || [])];

              if (adminEvent === "add_admin") {
                  const alreadyAdmin = adminIDs.some(a => String(a.id || a.uid) === uid);
                  if (!alreadyAdmin) adminIDs.push({ id: uid });
              } else if (adminEvent === "remove_admin") {
                  adminIDs = adminIDs.filter(a => String(a.id || a.uid) !== uid);
              }

              tInfo.adminIDs = adminIDs;
              global.data.threadInfo.set(tid, tInfo);

              // Persist updated adminIDs to MongoDB
              try {
                  await Threads.setData(tid, { "threadInfo.adminIDs": adminIDs });
              } catch (e) {
                  console.error("[groupnoti] Failed to persist adminIDs:", e.message);
              }
          }

          if (adminEvent === "add_admin") {
              return api.sendMessage({
                  body: `${authorName} promoted ${targetName} to admin.`,
                  mentions: [
                      { tag: authorName, id: author },
                      { tag: targetName, id: targetID }
                  ]
              }, threadID);
          }

          if (adminEvent === "remove_admin") {
              return api.sendMessage({
                  body: `${authorName} removed ${targetName} from admin.`,
                  mentions: [
                      { tag: authorName, id: author },
                      { tag: targetName, id: targetID }
                  ]
              }, threadID);
          }
          return;
      }

      // ══ NICKNAME ══
      case "log:user-nickname": {
          const data       = logMessageData || {};
          const targetID   = data.participant_id || data.participantID || data.user_id;
          const nickname   = typeof data.nickname === "string" && data.nickname.trim()
              ? data.nickname.trim() : null;
          const targetName = await getName(api, targetID);

          if (nickname) {
              return api.sendMessage({
                  body: `${authorName} set ${targetName}'s nickname to "${nickname}".`,
                  mentions: [
                      { tag: authorName, id: author   },
                      { tag: targetName, id: targetID }
                  ]
              }, threadID);
          } else {
              return api.sendMessage({
                  body: `${authorName} cleared ${targetName}'s nickname.`,
                  mentions: [
                      { tag: authorName, id: author   },
                      { tag: targetName, id: targetID }
                  ]
              }, threadID);
          }
      }

      // ══ CALL ══
      case "log:thread-call": {
          const data = logMessageData || {};
          if (data.joining_user && !data.event) return;
          const isVideo  = data.video === "1" || data.group_call_type === "1";
          const callType = isVideo ? "video" : "audio";
          return api.sendMessage({
              body: `${authorName} started a group ${callType} call.`,
              mentions: [{ tag: authorName, id: author }]
          }, threadID);
      }

      // ══ POLL ══
      case "log:thread-poll": {
          const data      = logMessageData || {};
          const eventType = data.event_type || "";
          let pollTitle   = "";
          let pollOptions = [];
          try {
              const q    = JSON.parse(data.question_json || "{}");
              pollTitle  = q.text || "";
              pollOptions = (q.options || []).map(o => o.text);
          } catch {}

          if (eventType === "question_creation") {
              const optLines = pollOptions.map((o, i) => `  ${i + 1}. ${o}`).join("\n");
              return api.sendMessage({
                  body: `${authorName} created a poll.\n\nQuestion: ${pollTitle}\nOptions:\n${optLines || "  (none)"}`,
                  mentions: [{ tag: authorName, id: author }]
              }, threadID);
          }
          if (eventType === "question_update") {
              return api.sendMessage({
                  body: `${authorName} updated the poll: "${pollTitle}"`,
                  mentions: [{ tag: authorName, id: author }]
              }, threadID);
          }
          return;
      }

      // ══ EMOJI / ICON ══
      case "log:thread-icon": {
          const icon = logMessageData?.thread_icon || logMessageData?.threadIcon || "";
          return api.sendMessage({
              body: `${authorName} changed the group emoji to ${icon}.`,
              mentions: [{ tag: authorName, id: author }]
          }, threadID);
      }

      default:
          return;
  }
};
