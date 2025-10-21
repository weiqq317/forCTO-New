const http = require('node:http');
const { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } = require('prom-client');
const config = require('../config');
const logger = require('../logger');

class Metrics {
  constructor() {
    this.registry = new Registry();
    this.registry.setDefaultLabels({ service: 'sip-coze-bridge' });
    collectDefaultMetrics({ register: this.registry });

    this.activeCalls = new Gauge({
      name: 'coze_bridge_active_calls',
      help: 'Number of active bridged calls',
      registers: [this.registry],
    });

    this.callLatency = new Histogram({
      name: 'coze_bridge_call_setup_seconds',
      help: 'Call setup latency from INVITE to ACK in seconds',
      buckets: [0.5, 1, 2, 3, 5, 8, 13],
      registers: [this.registry],
    });

    this.callFailures = new Counter({
      name: 'coze_bridge_call_failures_total',
      help: 'Total number of call setup failures by category',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.requests = new Counter({
      name: 'coze_bridge_api_requests_total',
      help: 'Total external API requests made by the bridge',
      labelNames: ['service', 'method', 'status'],
      registers: [this.registry],
    });

    this.metricsServer = null;
    this.currentActive = 0;
  }

  incActiveCalls() {
    this.currentActive += 1;
    this.activeCalls.inc();
  }

  decActiveCalls() {
    if (this.currentActive === 0) {
      return;
    }
    this.currentActive -= 1;
    this.activeCalls.dec();
  }

  observeCallLatency(seconds) {
    this.callLatency.observe(seconds);
  }

  incrementFailure(reason) {
    this.callFailures.labels(reason || 'unknown').inc();
  }

  trackExternalRequest(service, method, status) {
    this.requests.labels(service, method, status).inc();
  }

  async start() {
    if (this.metricsServer) {
      return;
    }

    this.metricsServer = http.createServer(async (req, res) => {
      if (req.method === 'GET' && req.url === '/metrics') {
        const payload = await this.registry.metrics();
        res.statusCode = 200;
        res.setHeader('Content-Type', this.registry.contentType);
        res.end(payload);
        return;
      }
      res.statusCode = 404;
      res.end();
    });

    await new Promise((resolve, reject) => {
      this.metricsServer.listen(config.service.metricsPort, (err) => {
        if (err) {
          reject(err);
        } else {
          logger.info({ port: config.service.metricsPort }, 'metrics server listening');
          resolve();
        }
      });
    });
  }

  async stop() {
    if (!this.metricsServer) {
      return;
    }
    await new Promise((resolve) => {
      this.metricsServer.close(() => resolve());
    });
    this.metricsServer = null;
  }
}

module.exports = new Metrics();
