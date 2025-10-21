const dgram = require('node:dgram');
const { v4: uuidv4 } = require('uuid');
const bencode = require('bencode');
const config = require('../config');
const logger = require('../logger');
const metrics = require('../telemetry/metrics');

class RtpEngineClient {
  constructor() {
    this.host = config.rtpEngine.host;
    this.port = config.rtpEngine.port;
    this.timeoutMs = config.rtpEngine.timeoutMs;
    this.socket = dgram.createSocket('udp4');
    this.pending = new Map();

    this.socket.on('message', (msg) => {
      let decoded;
      try {
        decoded = bencode.decode(msg, 'utf8');
      } catch (err) {
        logger.error({ err }, 'failed to decode message from RTPEngine');
        return;
      }
      const transactionId = decoded['trans-id'] || decoded['transaction'] || decoded['cookie'];
      if (!transactionId) {
        logger.warn({ decoded }, 'received RTPEngine response without transaction id');
        return;
      }
      const pending = this.pending.get(transactionId);
      if (!pending) {
        logger.warn({ transactionId }, 'no pending RTPEngine transaction for incoming response');
        return;
      }
      clearTimeout(pending.timer);
      this.pending.delete(transactionId);
      pending.resolve(decoded);
    });

    this.socket.on('error', (err) => {
      logger.error({ err }, 'RTPEngine socket error');
    });
  }

  async sendCommand(command, payload) {
    const transactionId = uuidv4();
    const request = {
      command,
      'trans-id': transactionId,
      'call-id': payload['call-id'],
      'from-tag': payload['from-tag'],
      'to-tag': payload['to-tag'],
      direction: payload.direction,
      sdp: payload.sdp,
      flags: payload.flags,
      'codec-set': payload['codec-set'],
    };

    Object.keys(request).forEach((key) => {
      if (request[key] === undefined || request[key] === null || request[key] === '') {
        delete request[key];
      }
      if (Array.isArray(request[key]) && request[key].length === 0) {
        delete request[key];
      }
    });

    const encoded = bencode.encode(request);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(transactionId);
        const error = new Error(`RTPEngine command ${command} timed out after ${this.timeoutMs}ms`);
        metrics.incrementFailure('rtpengine_timeout');
        reject(error);
      }, this.timeoutMs);

      this.pending.set(transactionId, {
        resolve,
        reject,
        timer,
      });

      this.socket.send(encoded, this.port, this.host, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(transactionId);
          metrics.incrementFailure('rtpengine_send_error');
          reject(err);
        }
      });
    });
  }

  async offer({ callId, fromTag, sdp, direction = 'internal', flags = [] }) {
    const response = await this.sendCommand('offer', {
      'call-id': callId,
      'from-tag': fromTag,
      sdp,
      direction,
      flags,
      'codec-set': config.rtpEngine.codecPolicy,
    });
    return this.parseResponse(response, 'offer');
  }

  async answer({ callId, fromTag, toTag, sdp, flags = [] }) {
    const response = await this.sendCommand('answer', {
      'call-id': callId,
      'from-tag': fromTag,
      'to-tag': toTag,
      sdp,
      flags,
      direction: 'external',
      'codec-set': config.rtpEngine.codecPolicy,
    });
    return this.parseResponse(response, 'answer');
  }

  async delete({ callId, fromTag, toTag }) {
    try {
      await this.sendCommand('delete', {
        'call-id': callId,
        'from-tag': fromTag,
        'to-tag': toTag,
        sdp: '',
        flags: [],
        direction: '',
        'codec-set': [],
      });
    } catch (err) {
      logger.error({ err, callId }, 'failed to delete RTPEngine session');
      metrics.incrementFailure('rtpengine_delete_error');
    }
  }

  parseResponse(response, command) {
    if (!response) {
      throw new Error(`RTPEngine ${command} returned empty response`);
    }
    if (Array.isArray(response)) {
      // Some versions return ['OK', {...}]
      if (response[0] && String(response[0]).toLowerCase() !== 'ok') {
        const error = new Error(`RTPEngine ${command} returned failure status`);
        error.response = response;
        throw error;
      }
      return response[1] || {};
    }
    if (response.result && String(response.result).toLowerCase() !== 'ok') {
      const error = new Error(`RTPEngine ${command} returned failure status`);
      error.response = response;
      throw error;
    }
    if (response.result === 'error') {
      const error = new Error(`RTPEngine ${command} returned error`);
      error.response = response;
      throw error;
    }
    return response;
  }

  close() {
    this.socket.close();
  }
}

module.exports = new RtpEngineClient();
