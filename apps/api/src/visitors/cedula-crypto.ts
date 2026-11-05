import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM. ENCRYPTION_KEY must be exactly 32 bytes, hex-encoded (64 chars).
// Stored format: ivHex:authTagHex:ciphertextHex.
function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) throw new Error('ENCRYPTION_KEY is not set');
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 bytes (64 hex chars)');
  }
  return key;
}

export function encryptCedula(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptCedula(stored: string): string {
  const [ivHex, tagHex, dataHex] = stored.split(':');
  if (!ivHex || !tagHex || !dataHex) throw new Error('Malformed ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString(
    'utf8',
  );
}

// ponytail: self-check, no test framework. Run: node dist/visitors/cedula-crypto.js
if (require.main === module) {
  const assert = require('node:assert') as typeof import('node:assert');
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
  const cedula = '1.020.456.789';
  const enc = encryptCedula(cedula);
  assert.notEqual(enc, cedula); // actually encrypted
  assert.equal(enc.split(':').length, 3); // iv:tag:ciphertext
  assert.equal(decryptCedula(enc), cedula); // round-trips
  // Tampered ciphertext must fail the GCM auth tag.
  const tampered = enc.slice(0, -2) + (enc.endsWith('0') ? '1' : '0');
  assert.throws(() => decryptCedula(tampered));
  console.log('cedula-crypto self-check passed');
}
