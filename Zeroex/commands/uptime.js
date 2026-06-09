const os = require("os");
const moment = require("moment-timezone");

const startTime = new Date();

// টেক্সট র‍্যাপ করার ফাংশন
function wrapText(text, limit) {
    const words = text.split(' ');
    let lines = [];
    let currentLine = "";
    words.forEach(word => {
        if ((currentLine + word).length <= limit) {
            currentLine += (currentLine === "" ? "" : " ") + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    });
    lines.push(currentLine);
    return lines.join('\n┃   ');
}

module.exports = {
  config: {
    name: "uptime",
    aliases: [],
    version: "1.3.0",
    permission: 0,
    prefix: true,
    author: "Adi.0X",
    description: "Detailed system uptime and original latency status",
    category: "Information & Help",
    usages: "",
    cooldowns: 5
  },

  run: async function ({ api, event }) {
    const { threadID, messageID } = event;

    try {
      const timeStart = Date.now();
      const checkMsg = await api.sendMessage("🔎 𝖢𝗁𝖾𝖼𝗄𝗂𝗇𝗀 𝗌𝗒𝗌𝗍𝖾𝗆 𝗌𝗍𝖺𝗍𝗎𝗌...", threadID);
      const ping = Date.now() - timeStart;

      const uptimeInSeconds = (new Date() - startTime) / 1000;
      const days = Math.floor(uptimeInSeconds / (3600 * 24));
      const hours = Math.floor((uptimeInSeconds % (3600 * 24)) / 3600);
      const minutes = Math.floor((uptimeInSeconds % 3600) / 60);
      const seconds = Math.floor(uptimeInSeconds % 60);
      const uptimeFormatted = `${days}d ${hours}h ${minutes}m ${seconds}s`;

      const totalMemoryGB = os.totalmem() / 1024 ** 3;
      const freeMemoryGB = os.freemem() / 1024 ** 3;
      const usedMemoryGB = totalMemoryGB - freeMemoryGB;
      const ramUsageMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

      const cpuModel = os.cpus()[0].model;
      const nodeVer = process.version;
      const allUsers = global.data.allUserID ? global.data.allUserID.length : 0;
      const allThreads = global.data.allThreadID ? global.data.allThreadID.length : 0;
      const time = moment.tz("Asia/Dhaka").format("hh:mm:ss A");
      const date = moment.tz("Asia/Dhaka").format("DD/MM/YYYY");
      let pingStatus = ping < 300 ? "Smooth" : (ping < 800 ? "Average" : "Laggy");

      // টেক্সট র‍্যাপিং অ্যাপ্লাই করা হয়েছে
      const wrappedCpu = cpuModel.length > 20 ? wrapText(cpuModel, 20) : cpuModel;

      const systemInfo = 
`┏ SYSTEM UPTIME INFO
┃ • Runtime: ${uptimeFormatted}
┗━━━━━━━━━━━━━━━━━━━━
┏ SYSTEM
┃ • OS: ${os.type()} ${os.arch()}
┃ • Node: ${nodeVer}
┃ • CPU: ${wrappedCpu}
┃ • Memory: ${usedMemoryGB.toFixed(2)}GB / ${totalMemoryGB.toFixed(2)}GB
┃ • RAM Usage: ${ramUsageMB} MB
┗━━━━━━━━━━━━━━━━━━━━
┏ BOT STATISTICS
┃ • Users: ${allUsers}
┃ • Groups: ${allThreads}
┗━━━━━━━━━━━━━━━━━━━━
┏ STATUS
┃ • Date: ${date}
┃ • Time: ${time}
┃ • Ping: ${ping}ms (${pingStatus})
┗━━━━━━━━━━━━━━━━━━━━`;

      return api.editMessage(systemInfo, checkMsg.messageID);

    } catch (error) {
      console.error(error);
      return api.sendMessage("❌ Error fetching system info.", threadID, messageID);
    }
  }
};
