const EventEmitter = require('node:events');
const sip = require('sip');
const digest = require('sip/digest');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../logger');

function buildSipUri(host, port, scheme = 'sip') {
  return port ? `${scheme}:${host}:${port}` : `${scheme}:${host}`;
}

class SipClient extends EventEmitter {
  constructor() {
    super();
    this.config = config.sip;
    this.stackStarted = false;
    this.registerCallId = uuidv4();
    this.registerFromTag = this._generateTag();
    this.registerCseq = 1;
    this.contactUri = `sip:${this.config.username}@${this.config.contactHost}` +
      (this.config.contactPort ? `:${this.config.contactPort}` : '') +
      `;transport=${this.config.transport}`;
    this.dialogs = new Map();
    this.registerTimer = null;
    this.keepAliveTimer = null;
    this.registrationState = 'idle';
  }

  start() {
    if (this.stackStarted) {
      return;
    }

    const transportOptions = {
      address: this.config.contactHost,
      port: this.config.localPort,
      udp: this.config.transport === 'udp' || this.config.transport === 'both',
      tcp: this.config.transport === 'tcp' || this.config.transport === 'both',
      ws_port: this.config.transport === 'ws' || this.config.transport === 'wss' ? this.config.localPort : undefined,
      tls: this.config.transport === 'tls' || this.config.transport === 'wss' ? {} : undefined,
      logger: {
        send: (m) => logger.debug({ direction: 'out', method: m.method, status: m.status }, 'SIP send'),
        recv: (m) => logger.debug({ direction: 'in', method: m.method, status: m.status }, 'SIP recv'),
        error: (err) => logger.error({ err }, 'SIP transport error'),
      },
      rport: true,
    };

    sip.start(transportOptions, this._onRequest.bind(this));
    this.stackStarted = true;
    logger.info({ port: this.config.localPort, transport: this.config.transport }, 'SIP stack started');
    this._scheduleRegistration(0);
    this._scheduleKeepAlive();
  }

  stop() {
    if (this.registerTimer) {
      clearTimeout(this.registerTimer);
      this.registerTimer = null;
    }
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.stackStarted && sip.stop) {
      sip.stop();
    }
    this.stackStarted = false;
    this.dialogs.clear();
  }

  _scheduleRegistration(delaySeconds) {
    if (this.registerTimer) {
      clearTimeout(this.registerTimer);
    }
    this.registerTimer = setTimeout(() => this._register(), delaySeconds * 1000);
  }

  _register(authHeader) {
    const request = {
      method: 'REGISTER',
      uri: buildSipUri(`${this.config.server}`, this.config.port),
      headers: {
        to: { uri: `sip:${this.config.username}@${this.config.server}` },
        from: { uri: `sip:${this.config.username}@${this.config.server}`, params: { tag: this.registerFromTag } },
        'call-id': this.registerCallId,
        cseq: { method: 'REGISTER', seq: this.registerCseq++ },
        contact: [
          {
            uri: this.contactUri,
            params: { expires: this.config.registerExpires },
          },
        ],
        expires: this.config.registerExpires,
        'user-agent': this.config.userAgent,
        'max-forwards': 70,
      },
      content: '',
    };

    if (authHeader) {
      request.headers.authorization = authHeader;
    }

    logger.info('sending SIP REGISTER');
    sip.send(request, (response) => {
      if (!response) {
        logger.error('No response received for REGISTER request');
        return;
      }
      logger.info({ status: response.status }, 'received REGISTER response');

      if (response.status === 401 || response.status === 407) {
        const credentials = { username: this.config.username, password: this.config.password };
        const auth = digest.authenticate(request, response, credentials);
        if (!auth) {
          logger.error('Failed to build digest auth header for REGISTER');
          this.emit('registrationFailed', response);
          return;
        }
        this._register(auth);
        return;
      }

      if (response.status >= 200 && response.status < 300) {
        this.registrationState = 'registered';
        this.emit('registered', response);
        const retrySeconds = Math.max(30, this.config.registerExpires - 30);
        this._scheduleRegistration(retrySeconds);
      } else {
        logger.error({ status: response.status }, 'REGISTER failed');
        this.registrationState = 'failed';
        this.emit('registrationFailed', response);
        const retrySeconds = 30;
        this._scheduleRegistration(retrySeconds);
      }
    });
  }

  _scheduleKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
    }
    if (!this.config.keepAliveInterval) {
      return;
    }

    this.keepAliveTimer = setInterval(() => {
      const request = {
        method: 'OPTIONS',
        uri: buildSipUri(this.config.server, this.config.port),
        headers: {
          to: { uri: `sip:${this.config.server}` },
          from: { uri: this.contactUri, params: { tag: this._generateTag() } },
          'call-id': uuidv4(),
          cseq: { method: 'OPTIONS', seq: 1 },
          contact: [{ uri: this.contactUri }],
          'user-agent': this.config.userAgent,
          'max-forwards': 70,
        },
        content: '',
      };

      sip.send(request, (response) => {
        if (response && response.status >= 200 && response.status < 300) {
          logger.debug('OPTIONS keepalive succeeded');
        } else {
          logger.warn({ status: response && response.status }, 'OPTIONS keepalive failed');
        }
      });
    }, this.config.keepAliveInterval * 1000);
  }

  _onRequest(request) {
    try {
      const method = request.method;
      if (!method) {
        return;
      }
      if (method === 'INVITE') {
        this._handleInvite(request);
      } else if (method === 'ACK') {
        this._dispatchDialog(request, 'ack');
      } else if (method === 'BYE') {
        this._handleBye(request);
      } else if (method === 'CANCEL') {
        this._handleCancel(request);
      } else if (method === 'OPTIONS') {
        this._handleOptions(request);
      } else {
        sip.send(sip.makeResponse(request, 405, 'Method Not Allowed'));
      }
    } catch (err) {
      logger.error({ err }, 'error handling SIP request');
    }
  }

  _handleInvite(request) {
    const callId = request.headers['call-id'];
    const fromTag = request.headers.from?.params?.tag;
    const toTag = request.headers.to?.params?.tag;

    if (toTag) {
      const session = this._lookupDialog(callId, fromTag, toTag);
      if (session && session.onInvite) {
        session.onInvite(request);
      } else {
        sip.send(sip.makeResponse(request, 481, 'Call/Transaction Does Not Exist'));
      }
      return;
    }

    this.emit('invite', request);
  }

  _handleBye(request) {
    const callId = request.headers['call-id'];
    const fromTag = request.headers.from?.params?.tag;
    const toTag = request.headers.to?.params?.tag;
    const session = this._lookupDialog(callId, fromTag, toTag);
    if (session && session.onBye) {
      session.onBye(request);
    } else {
      sip.send(sip.makeResponse(request, 481, 'Call/Transaction Does Not Exist'));
    }
  }

  _handleCancel(request) {
    sip.send(sip.makeResponse(request, 200, 'OK'));
    this.emit('cancel', request);
  }

  _handleOptions(request) {
    const response = sip.makeResponse(request, 200, 'OK');
    response.headers.allow = 'INVITE, ACK, BYE, CANCEL, OPTIONS';
    response.headers['content-length'] = 0;
    sip.send(response);
  }

  _dispatchDialog(request, event) {
    const callId = request.headers['call-id'];
    const fromTag = request.headers.from?.params?.tag;
    const toTag = request.headers.to?.params?.tag;
    const key = this._dialogKey(callId, fromTag, toTag);
    const session = this.dialogs.get(key);
    if (session && session.onAck && event === 'ack') {
      session.onAck(request);
    }
  }

  sendTrying(request) {
    sip.send(sip.makeResponse(request, 100, 'Trying'));
  }

  sendResponse(request, status, reason, options = {}) {
    const response = sip.makeResponse(request, status, reason);
    response.headers.to.params = response.headers.to.params || {};
    if (options.toTag) {
      response.headers.to.params.tag = options.toTag;
    } else if (!response.headers.to.params.tag) {
      response.headers.to.params.tag = this._generateTag();
    }
    if (options.extraHeaders) {
      Object.assign(response.headers, options.extraHeaders);
    }
    if (options.contactUri || this.contactUri) {
      response.headers.contact = [{ uri: options.contactUri || this.contactUri }];
    }
    if (options.content) {
      response.content = options.content;
      response.headers['content-type'] = options.contentType || 'application/sdp';
    }
    sip.send(response);
    return response.headers.to.params.tag;
  }

  sendBye({ uri, callId, from, to, cseq = 1 }) {
    if (!uri) {
      logger.warn({ callId }, 'cannot send BYE without remote contact uri');
      return;
    }
    const request = {
      method: 'BYE',
      uri,
      headers: {
        to,
        from,
        'call-id': callId,
        cseq: { method: 'BYE', seq: cseq },
        via: [],
        'max-forwards': 70,
        contact: [{ uri: this.contactUri }],
      },
      content: '',
    };
    sip.send(request);
  }

  registerDialog(callId, fromTag, toTag, session) {
    const key = this._dialogKey(callId, fromTag, toTag);
    this.dialogs.set(key, session);
  }

  removeDialog(callId, fromTag, toTag) {
    const key = this._dialogKey(callId, fromTag, toTag);
    this.dialogs.delete(key);
  }

  _dialogKey(callId, fromTag, toTag) {
    return [callId, fromTag, toTag].join('::');
  }

  _lookupDialog(callId, fromTag, toTag) {
    const key = this._dialogKey(callId, fromTag, toTag);
    if (this.dialogs.has(key)) {
      return this.dialogs.get(key);
    }
    const invertedKey = this._dialogKey(callId, toTag, fromTag);
    return this.dialogs.get(invertedKey);
  }

  _generateTag() {
    return uuidv4().replace(/-/g, '').slice(0, 12);
  }
}

module.exports = new SipClient();
