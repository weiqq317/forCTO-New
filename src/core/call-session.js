const { performance } = require('node:perf_hooks');
const { v4: uuidv4 } = require('uuid');
const sipClient = require('../sip/client');
const cozeClient = require('../coze/client');
const rtpEngineClient = require('../rtpengine/client');
const metrics = require('../telemetry/metrics');
const logger = require('../logger');

class CallSession {
  constructor(inviteRequest, manager) {
    this.invite = inviteRequest;
    this.manager = manager;
    this.callId = inviteRequest.headers['call-id'];
    this.sipFromTag = inviteRequest.headers.from?.params?.tag;
    this.localTag = null;
    this.webrtcTag = uuidv4().replace(/-/g, '');
    this.cozeSession = null;
    this.state = 'created';
    this.createdAt = performance.now();
    this.bridgedAt = null;
    this.remoteContact = inviteRequest.headers.contact?.[0]?.uri;
    this.uasFromHeader = inviteRequest.headers.to ? JSON.parse(JSON.stringify(inviteRequest.headers.to)) : {};
    this.uasToHeader = inviteRequest.headers.from ? JSON.parse(JSON.stringify(inviteRequest.headers.from)) : {};
    this.localCseq = 1;
  }

  async accept() {
    if (this.state !== 'created') {
      return;
    }

    this.state = 'pending';
    sipClient.sendTrying(this.invite);

    try {
      this.cozeSession = await this._startCozeSession();
    } catch (err) {
      logger.error({ err, callId: this.callId }, 'failed to start Coze session');
      metrics.incrementFailure('coze_start');
      sipClient.sendResponse(this.invite, 500, 'Coze Session Failed');
      this.state = 'failed';
      return;
    }

    let offerResponse;
    try {
      offerResponse = await this._sendOfferToRtpEngine();
    } catch (err) {
      logger.error({ err, callId: this.callId }, 'RTPEngine offer failed');
      metrics.incrementFailure('rtpengine_offer_failed');
      sipClient.sendResponse(this.invite, 488, 'Not Acceptable Here');
      this.state = 'failed';
      await this._abortCoze();
      return;
    }

    const sdp = offerResponse?.sdp || offerResponse?.answer || offerResponse?.['sdp-answer'];
    if (!sdp) {
      logger.error({ offerResponse }, 'RTPEngine did not return SIP-side SDP');
      sipClient.sendResponse(this.invite, 500, 'Internal Server Error');
      this.state = 'failed';
      await this._abortCoze();
      return;
    }

    this.localTag = sipClient.sendResponse(this.invite, 200, 'OK', {
      content: sdp,
      toTag: this.localTag,
      contactUri: sipClient.contactUri,
    });
    this.uasFromHeader.params = this.uasFromHeader.params || {};
    this.uasFromHeader.params.tag = this.localTag;

    sipClient.registerDialog(this.callId, this.sipFromTag, this.localTag, this);
    metrics.incActiveCalls();
    this.state = 'answered';
    logger.info({ callId: this.callId }, 'call answered');

    this._sendAnswerToCoze()
      .catch(async (err) => {
        logger.error({ err, callId: this.callId }, 'failed to finalize WebRTC negotiation');
        metrics.incrementFailure('coze_answer_failed');
        await this.terminate('webrtc-negotiation-failed');
      });
  }

  async onInvite(request) {
    logger.info({ callId: this.callId }, 'received re-INVITE');
    const sdp = this.offerResponse?.sdp || this.offerResponse?.answer || this.offerResponse?.['sdp-answer'];
    sipClient.sendResponse(request, 200, 'OK', {
      content: sdp || request.content,
      toTag: this.localTag,
    });
  }

  async _startCozeSession() {
    return cozeClient.startSession(this.callId, {
      from: this.invite.headers.from?.uri,
      to: this.invite.headers.to?.uri,
    });
  }

  async _sendOfferToRtpEngine() {
    const flags = ['replace-origin', 'replace-session-connection', 'trust address', 'symmetric'];
    const payload = await rtpEngineClient.offer({
      callId: this.callId,
      fromTag: this.sipFromTag,
      sdp: this.invite.content,
      direction: 'internal',
      flags,
    });
    this.offerResponse = payload;
    return payload;
  }

  async _sendAnswerToCoze() {
    const webrtcOffer = this.cozeSession?.offer?.sdp || this.cozeSession?.offer;
    if (!webrtcOffer) {
      throw new Error('Coze session response missing WebRTC offer');
    }

    const flags = ['ICE', 'rtcp-mux', 'trust address', 'asymmetric'];
    const answer = await rtpEngineClient.answer({
      callId: this.callId,
      fromTag: this.webrtcTag,
      toTag: this.sipFromTag,
      sdp: webrtcOffer,
      flags,
    });
    const sdp = answer?.sdp || answer?.answer || answer?.['sdp-answer'];
    if (!sdp) {
      throw new Error('RTPEngine answer response missing SDP');
    }
    await cozeClient.sendAnswer(this.cozeSession.sessionId, sdp);
  }

  async _abortCoze() {
    if (!this.cozeSession) {
      return;
    }
    try {
      await cozeClient.endSession(this.callId, this.cozeSession.sessionId);
    } catch (err) {
      logger.warn({ err, callId: this.callId }, 'failed to abort Coze session');
    }
  }

  onAck() {
    if (this.state !== 'answered') {
      return;
    }
    this.state = 'established';
    this.bridgedAt = performance.now();
    const latency = (this.bridgedAt - this.createdAt) / 1000;
    metrics.observeCallLatency(latency);
    logger.info({ callId: this.callId, latency }, 'call established');
  }

  async onBye(request) {
    sipClient.sendResponse(request, 200, 'OK', { toTag: this.localTag });
    await this.terminate('remote');
  }

  async terminate(reason = 'local') {
    if (this.state === 'terminated') {
      return;
    }
    this.state = 'terminated';

    if (reason !== 'remote' && this.remoteContact && this.localTag) {
      const byeSeq = ++this.localCseq;
      sipClient.sendBye({
        uri: this.remoteContact,
        callId: this.callId,
        from: this.uasFromHeader,
        to: this.uasToHeader,
        cseq: byeSeq,
      });
    }

    metrics.decActiveCalls();
    sipClient.removeDialog(this.callId, this.sipFromTag, this.localTag);

    if (this.cozeSession) {
      try {
        await cozeClient.endSession(this.callId, this.cozeSession.sessionId);
      } catch (err) {
        logger.warn({ err, callId: this.callId }, 'failed to end Coze session');
      }
    }

    try {
      await rtpEngineClient.delete({
        callId: this.callId,
        fromTag: this.sipFromTag,
        toTag: this.webrtcTag,
      });
    } catch (err) {
      logger.warn({ err, callId: this.callId }, 'RTPEngine delete failed');
    }

    if (this.manager) {
      this.manager.removeSession(this);
    }

    logger.info({ callId: this.callId, reason }, 'call terminated');
  }

  async cancel() {
    metrics.incrementFailure('sip_cancelled');
    await this.terminate('cancelled');
  }
}

module.exports = CallSession;
