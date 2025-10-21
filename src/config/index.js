const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

let envLoaded = false;

function loadEnv() {
  if (envLoaded) {
    return;
  }
  envLoaded = true;
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  } else {
    dotenv.config();
  }
}

function readEnv(key, options = {}) {
  const {
    defaultValue = undefined,
    required = false,
    parser = (value) => value,
    validator = undefined,
    sensitive = false,
  } = options;
  const raw = process.env[key];
  if (raw === undefined || raw === '') {
    if (required && defaultValue === undefined) {
      throw new Error(`Missing required environment variable ${key}`);
    }
    return defaultValue;
  }
  const parsed = parser(raw);
  if (validator && !validator(parsed)) {
    throw new Error(`Invalid value for environment variable ${key}`);
  }
  if (!sensitive) {
    return parsed;
  }
  // For sensitive values we still return the parsed content, but callers should avoid logging it.
  return parsed;
}

loadEnv();

const config = {
  service: {
    healthPort: readEnv('HEALTH_PORT', { parser: Number, defaultValue: 8080 }),
    metricsPort: readEnv('METRICS_PORT', { parser: Number, defaultValue: 9100 }),
  },
  logging: {
    level: readEnv('LOG_LEVEL', { defaultValue: 'info' }),
  },
  sip: {
    username: readEnv('SIP_USERNAME', { required: true }),
    password: readEnv('SIP_PASSWORD', { required: true, sensitive: true }),
    server: readEnv('SIP_SERVER', { required: true }),
    port: readEnv('SIP_PORT', { parser: Number, defaultValue: 5060 }),
    transport: readEnv('SIP_TRANSPORT', { defaultValue: 'udp' }),
    contactHost: readEnv('SIP_CONTACT_HOST', { defaultValue: '127.0.0.1' }),
    contactPort: readEnv('SIP_CONTACT_PORT', { parser: Number, defaultValue: 5062 }),
    registerExpires: readEnv('SIP_REGISTER_EXPIRES', { parser: Number, defaultValue: 300 }),
    keepAliveInterval: readEnv('SIP_KEEPALIVE_INTERVAL', { parser: Number, defaultValue: 30 }),
    localPort: readEnv('SIP_LOCAL_PORT', { parser: Number, defaultValue: 5062 }),
    userAgent: readEnv('SIP_USER_AGENT', { defaultValue: 'CozeBridge/1.0' }),
  },
  coze: {
    apiBase: readEnv('COZE_API_BASE', { required: true }),
    token: readEnv('COZE_PERSONAL_ACCESS_TOKEN', { required: true, sensitive: true }),
    spaceId: readEnv('COZE_SPACE_ID', { defaultValue: undefined }),
    model: readEnv('COZE_MODEL', { defaultValue: undefined }),
    sessionTtlSeconds: readEnv('COZE_SESSION_TTL_SECONDS', { parser: Number, defaultValue: 1800 }),
  },
  rtpEngine: {
    host: readEnv('RTPE_HOST', { defaultValue: '127.0.0.1' }),
    port: readEnv('RTPE_PORT', { parser: Number, defaultValue: 7722 }),
    timeoutMs: readEnv('RTPE_TIMEOUT_MS', { parser: Number, defaultValue: 2000 }),
    codecPolicy: readEnv('RTPE_TRANSCODING_POLICY', { defaultValue: 'opus,PCMU,PCMA' })
      .split(',')
      .map((codec) => codec.trim())
      .filter(Boolean),
  },
};

module.exports = config;
