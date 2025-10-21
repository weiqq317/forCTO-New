const pino = require('pino');
const config = require('./config');

const logger = pino({
  level: config.logging.level,
  base: {
    service: 'sip-coze-bridge',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = logger;
