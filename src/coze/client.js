const { setTimeout: sleep } = require('node:timers/promises');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../logger');
const metrics = require('../telemetry/metrics');

const DEFAULT_TIMEOUT_MS = 10_000;
const fetchImpl = global.fetch
  ? (...args) => global.fetch(...args)
  : async (...args) => {
      const mod = await import('node-fetch');
      return mod.default(...args);
    };

async function httpRequest(path, { method = 'GET', body, headers = {}, timeout = DEFAULT_TIMEOUT_MS }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetchImpl(new URL(path, config.coze.apiBase), {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.coze.token}`,
        'X-Request-ID': uuidv4(),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    metrics.trackExternalRequest('coze', method, String(response.status));
    if (!response.ok) {
      const errBody = await safeJson(response);
      const error = new Error(`Coze API ${method} ${path} failed with status ${response.status}`);
      error.details = errBody;
      throw error;
    }
    if (response.status === 204) {
      return null;
    }
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      metrics.trackExternalRequest('coze', method, 'timeout');
      throw new Error(`Coze API: ${method} ${path} timed out after ${timeout}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (err) {
    return null;
  }
}

class CozeClient {
  constructor() {
    this.sessionCache = new Map();
  }

  async startSession(callId, metadata = {}) {
    const payload = {
      callId,
      ttlSeconds: config.coze.sessionTtlSeconds,
      spaceId: config.coze.spaceId,
      model: config.coze.model,
      metadata,
    };

    logger.info({ callId }, 'starting Coze realtime session');
    const response = await httpRequest('/v1/realtime/sessions', {
      method: 'POST',
      body: payload,
    });
    if (!response || !response.sessionId || !response.webrtcOffer) {
      throw new Error('Coze API returned an unexpected payload when creating session');
    }
    this.sessionCache.set(callId, response.sessionId);
    return {
      sessionId: response.sessionId,
      offer: response.webrtcOffer,
      iceServers: response.iceServers || [],
    };
  }

  async sendAnswer(sessionId, answerSdp) {
    if (!answerSdp) {
      throw new Error('Missing answer SDP when sending to Coze');
    }
    logger.info({ sessionId }, 'sending WebRTC answer to Coze');
    await httpRequest(`/v1/realtime/sessions/${sessionId}/answer`, {
      method: 'POST',
      body: { sdp: answerSdp },
    });
  }

  async sendIceCandidate(sessionId, candidate) {
    await httpRequest(`/v1/realtime/sessions/${sessionId}/ice`, {
      method: 'POST',
      body: { candidate },
    });
  }

  async endSession(callId, sessionId) {
    const sid = sessionId || this.sessionCache.get(callId);
    if (!sid) {
      logger.warn({ callId }, 'attempted to end Coze session with no session id');
      return;
    }
    logger.info({ callId, sessionId: sid }, 'ending Coze realtime session');
    try {
      await httpRequest(`/v1/realtime/sessions/${sid}`, {
        method: 'DELETE',
      });
    } catch (err) {
      logger.error({ err, callId }, 'failed to close Coze session');
      throw err;
    } finally {
      this.sessionCache.delete(callId);
    }
  }

  async waitForIceGathering(sessionId, options = {}) {
    const { intervalMs = 500, timeoutMs = 10_000 } = options;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await sleep(intervalMs);
      const status = await httpRequest(`/v1/realtime/sessions/${sessionId}`, { method: 'GET' });
      if (status && status.iceGatheringState === 'complete') {
        return status;
      }
    }
    throw new Error('Timed out waiting for Coze ICE gathering to complete');
  }
}

module.exports = new CozeClient();
