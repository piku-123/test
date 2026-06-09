const { exec } = require("child_process");

module.exports.config = {
  name: "shell",
  aliases: ["sh", "bash"],
  version: "1.0.0",
  permission: 4,
  prefix: true,
  author: "Adi.0X",
  description: "Execute shell commands (bot owner only)",
  category: "System",
  usages: "[command]",
  cooldowns: 0
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;

  const command = args.join(" ").trim();
  if (!command) {
    return api.sendMessage("Please provide a shell command to execute.", threadID, messageID);
  }

  const start = Date.now();

  return new Promise((resolve) => {
    exec(command, { timeout: 30000, maxBuffer: 1024 * 512 }, async (err, stdout, stderr) => {
      const elapsed = Date.now() - start;
      let output = "";

      if (stdout && stdout.trim()) output += stdout.trim();
      if (stderr && stderr.trim()) output += (output ? "\n\n[STDERR]\n" : "") + stderr.trim();
      if (!output) output = "(no output)";

      if (output.length > 1900) {
        output = output.slice(0, 1900) + "\n... (truncated)";
      }

      const label = err && !stdout.trim() ? "[ SHELL ERROR ]" : "[ SHELL ]";

      resolve(
        api.sendMessage(
          `${label} (${elapsed}ms)\n$ ${command}\n\n${output}`,
          threadID,
          messageID
        )
      );
    });
  });
};
