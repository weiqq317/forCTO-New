const http = require('node:http');
const config = require('./config');
const logger = require('./logger');
const sipClient = require('./sip/client');
const metrics = require('./telemetry/metrics');
const CallManager = require('./core/call-manager');

let healthServer;
let callManager;

async function start() {
  logger.info('initialising SIP ↔ Coze bridge service');

  callManager = new CallManager();
  await metrics.start();
  startHealthServer();
  sipClient.start();

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

function startHealthServer() {
  if (healthServer) {
    return;
  }

  healthServer = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          status: 'ok',
          registration: sipClient.registrationState,
          activeCalls: metrics.currentActive,
        })
      );
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  healthServer.listen(config.service.healthPort, () => {
    logger.info({ port: config.service.healthPort }, 'health server listening');
  });
}

async function shutdown() {
  logger.info('shutting down bridge service');
  try {
    sipClient.stop();
    await metrics.stop();
  } catch (err) {
    logger.error({ err }, 'error during shutdown');
  }
  if (healthServer) {
    healthServer.close();
  }
  process.exit(0);
}

start().catch((err) => {
  logger.error({ err }, 'fatal error during startup');
  process.exit(1);
});
