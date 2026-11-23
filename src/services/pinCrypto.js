const crypto = require('crypto');

const hex = process.env.PIN_KEY || '';
if (!/^[0-9a-f]{64}$/i.test(hex)) {
  throw new Error(
    'PIN_KEY is missing or invalid in server/.env. It must be 64 hex characters.'
  );
}
const KEY = Buffer.from(hex, 'hex');

function encryptPin(pin) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([cipher.update(String(pin), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, data].map((b) => b.toString('hex')).join(':');
}

function decryptPin(stored) {
  const [iv, tag, data] = stored.split(':').map((h) => Buffer.from(h, 'hex'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

module.exports = { encryptPin, decryptPin };