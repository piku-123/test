const crypto = require('crypto');
const os = require("os");
const axios = require("axios");

/**
 * @param {string} command - Command name
 * @param {string} threadID - Thread ID
 * @param {string} messageID - Message ID
 * @returns {Promise} - Sends error message to user
 */
module.exports.throwError = function (command, threadID, messageID) {
  const threadSetting = global.data.threadData.get(parseInt(threadID)) || {};
  const prefix = (threadSetting.hasOwnProperty("PREFIX")) ? threadSetting.PREFIX : global.config.PREFIX;
  return global.client.api.sendMessage(global.getText("utils", "throwError", prefix, command), threadID, messageID);
}

/**
 * @param {string} url - File URL to download
 * @param {string} path - Local path to save the file
 * @returns {Promise} - Resolves when download is finished
 */
module.exports.downloadFile = async function (url, path) {
  const { createWriteStream } = require('fs');
  const response = await axios({
    method: 'GET',
    responseType: 'stream',
    url
  });

  const writer = createWriteStream(path);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
};

/**
 * @param {string} url - API or Content URL
 * @returns {Promise} - Returns the response object
 */
module.exports.getContent = async function(url) {
  try {
    const response = await axios({
      method: 'GET',
      url
    });
    return response;
  } catch (e) { 
    console.log(`[ Utils Error ] Cannot get content from: ${url}`);
    return null; 
  }
}

/**
 * @param {number} length - Desired string length
 * @returns {string} - Randomly generated string
 */
module.exports.randomString = function (length) {
  var result = '';
  var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

// AES Encryption/Decryption - কমান্ডে এনক্রিপশন দরকার হলে এটি কাজে লাগবে
module.exports.AES = {
  encrypt(cryptKey, crpytIv, plainData) {
    var encipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(cryptKey), Buffer.from(crpytIv));
    var encrypted = encipher.update(plainData);
    encrypted = Buffer.concat([encrypted, encipher.final()]);
    return encrypted.toString('hex');
  },
  decrypt(cryptKey, cryptIv, encrypted) {
    encrypted = Buffer.from(encrypted, "hex");
    var decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(cryptKey), Buffer.from(cryptIv, 'binary'));
    var decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return String(decrypted);
  },
  makeIv() { return Buffer.from(crypto.randomBytes(16)).toString('hex').slice(0, 16); }
}
