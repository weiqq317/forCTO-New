const CallSession = require('./call-session');
const sipClient = require('../sip/client');
const logger = require('../logger');

class CallManager {
  constructor() {
    this.sessions = new Map();
    sipClient.on('invite', (request) => this.handleInvite(request));
    sipClient.on('cancel', (request) => this.handleCancel(request));
  }

  _key(callId, fromTag) {
    return `${callId}:${fromTag}`;
  }

  async handleInvite(request) {
    const callId = request.headers['call-id'];
    const fromTag = request.headers.from?.params?.tag;
    if (!fromTag) {
      logger.warn({ callId }, 'INVITE missing from-tag');
      sipClient.sendResponse(request, 400, 'Bad Request');
      return;
    }

    const key = this._key(callId, fromTag);
    if (this.sessions.has(key)) {
      const existing = this.sessions.get(key);
      logger.info({ callId }, 're-INVITE routed to existing session');
      existing.onInvite(request);
      return;
    }

    const session = new CallSession(request, this);
    this.sessions.set(key, session);
    try {
      await session.accept();
    } catch (err) {
      logger.error({ err, callId }, 'failed to accept call');
      this.sessions.delete(key);
    }
    if (session.state === 'failed' || session.state === 'terminated') {
      this.sessions.delete(key);
    }
  }


  async handleCancel(request) {
    const callId = request.headers['call-id'];
    const fromTag = request.headers.from?.params?.tag;
    const session = this.sessions.get(this._key(callId, fromTag));
    if (!session) {
      return;
    }
    sipClient.sendResponse(session.invite, 487, 'Request Terminated');
    await session.cancel();
    this.sessions.delete(this._key(callId, fromTag));
  }

  removeSession(session) {
    const key = this._key(session.callId, session.sipFromTag);
    this.sessions.delete(key);
  }
}

module.exports = CallManager;
