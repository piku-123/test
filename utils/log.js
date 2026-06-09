const chalk = require('chalk');

module.exports = (text, type) => {
  switch (type) {
    case 'warn':
      console.warn(
        chalk.hex('#FF00FF').bold('[ Error ] » ') +
        chalk.hex('#b4ff33')(text)
      );
      break;
    case 'error':
      console.error(
        chalk.hex('#FF00FF').bold('[ Error ] » ') +
        chalk.hex('#ff334b')(text)
      );
      break;
    default:
      console.log(
        chalk.hex('#b4ff33').bold('[ Zeroex ] » ') +
        chalk.hex('#FF00FF')(text)
      );
      break;
  }
};

module.exports.loader = (text, type) => {
  switch (type) {
    case 'warn':
      console.warn(
        chalk.hex('#b4ff33').bold('[ ZeroEx ] » ') +
        chalk.hex('#FF00FF')(text)
      );
      break;
    case 'error':
      console.error(
        chalk.hex('#FF00FF').bold('[ Error ] » ') +
        chalk.hex('#ff334b')(text)
      );
      break;
    default:
      console.log(
        chalk.hex('#b4ff33').bold('[ ZeroEx ] » ') +
        chalk.hex('#FF00FF')(text)
      );
      break;
  }
};