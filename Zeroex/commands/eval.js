const util = require("util");

module.exports.config = {
  name: "eval",
  aliases: [],
  version: "1.0.0",
  permission: 4,
  prefix: true,
  author: "Adi.0X",
  description: "Evaluate JavaScript code (bot owner only)",
  category: "System",
  usages: "[code]",
  cooldowns: 0
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, messageID } = event;

  const code = args.join(" ").trim();
  if (!code) {
    return api.sendMessage("Please provide code to evaluate.", threadID, messageID);
  }

  let output;
  const start = Date.now();

  try {
    let result = eval(code);
    if (result instanceof Promise) result = await result;
    output = util.inspect(result, { depth: 4, compact: false });
  } catch (err) {
    output = `${err.name}: ${err.message}`;
    const elapsed = Date.now() - start;
    return api.sendMessage(
      `[ EVAL ERROR ] (${elapsed}ms)\n\n${output}`,
      threadID,
      messageID
    );
  }

  const elapsed = Date.now() - start;

  if (output.length > 1900) {
    output = output.slice(0, 1900) + "\n... (truncated)";
  }

  return api.sendMessage(
    `[ EVAL ] (${elapsed}ms)\n\n${output}`,
    threadID,
    messageID
  );
};