const fs = require("fs-extra");
const path = require("path");

// ডাটা সেভ করার জন্য ক্যাশ ফাইলের পাথ নির্ধারণ
const cacheDir = path.join(__dirname, "cache");
const cacheFile = path.join(cacheDir, "autoreact.json");

// ফোল্ডার ও ফাইল না থাকলে তৈরি করার ফাংশন
function initializeData() {
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  if (!fs.existsSync(cacheFile)) {
    fs.writeFileSync(cacheFile, JSON.stringify({}), "utf8");
  }
}

// ডাটা পড়ার ফাংশন
function readData() {
  initializeData();
  try {
    return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  } catch (e) {
    return {};
  }
}

// ডাটা সেভ করার ফাংশন
function saveData(data) {
  initializeData();
  fs.writeFileSync(cacheFile, JSON.stringify(data, null, 4), "utf8");
}

module.exports.config = {
  name: "autoreact",
  version: "2.0.0",
  permission: 0, // ০ মানে সাধারণ মেম্বারও অন/অফ করতে পারবে (এডমিন করতে চাইলে ১ দিতে পারেন)
  prefix: true,  // প্রিফিক্স সহ কাজ করবে (যেমন: !autoreact on)
  author: "Adi.0",
  description: "Turn auto-react on or off for every message in the group",
  category: "Message Interaction ",
  usages: "[on/off]",
  cooldowns: 5
};

// চ্যাটের প্রতিটি মেসেজ হ্যান্ডেল করার ফাংশন
module.exports.handleEvent = async function ({ api, event }) {
  const { threadID, messageID, body, senderID } = event;
  
  // বটের নিজের মেসেজ হলে অথবা টেক্সট মেসেজ না হলে রিঅ্যাক্ট দেবে না
  if (!body || senderID == api.getCurrentUserID()) return;

  const db = readData();

  // যদি এই গ্রুপের জন্য অটো-রিঅ্যাক্ট 'on' থাকে, তবেই রিঅ্যাক্ট দেবে
  if (db[threadID] === true) {
    // 🎭 এখানে আপনার পছন্দমতো ইমোজির কালেকশন দিতে পারেন, বট এখান থেকে র্যান্ডমলি একটা বেছে নেবে
    const emojis = ["🤣", "😂", "😆", "🥲","😭"];
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

    api.setMessageReaction(randomEmoji, messageID, threadID, (err) => {
      if (err) console.error("Autoreact HandleEvent Error:", err);
    }, true);
  }
};

// অন বা অফ করার মেইন রান ফাংশন
module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;
  const status = args[0] ? args[0].toLowerCase() : "";

  if (status !== "on" && status !== "off") {
    return api.sendMessage("❌ Please choose the correct option.\nUsage method:\n🔹 To turn on auto-react: `autoreact on`\n🔹 To turn off auto-react: `autoreact off`", threadID, messageID);
  }

  const db = readData();

  if (status === "on") {
    db[threadID] = true;
    saveData(db);
    return api.sendMessage("✅ Auto-react to every message has been successfully turned ON for this group.", threadID, messageID);
  }

  if (status === "off") {
    db[threadID] = false;
    saveData(db);
    return api.sendMessage("🛑 Auto-react has been turned OFF for this group.", threadID, messageID);
  }
};