/**
 * AIIMS Kalyani OPD Queue Management System
 * System Provenance & Authorship Cryptographic Verification Tool
 * 
 * Run: node scripts/verify-provenance.js
 */

const crypto = require('crypto');

// Obfuscated Salted Payload (Tamper-Evident)
const _PAYLOAD = 'KWk+OiQsMDNrc28BKkZFWBYZIz49MTAyLiVrYXEtXVxXFGhpHD01JSsuO2lrcxNXUVYWASQ5OyclLSRpCD8wN1tEV1UmaXNtIDYwKywqOXFlEHF7fx8YfwQxKCYgJyBtHA92EGNDNz46bx0lMSAuLCA2MUYQYU8hPzoicmh9KCc6OTorR0RbWTxpZW0RKDNhACcpOj4SeVxFJiIrOiQhfy4vaQA2O1tTU1pyGDwmNSo8JDppZRIWe31hH3IAPiMpJTEoa2VvMDBCSUBfNSMrbWpmHC45MD86OFpEEh4xYn99YHZpYRs8OSY1EntaVyAqKyI/KHFhCCUhcw1bV1pCIWsNKiMhLTcsLWNxcxBEU1siLi0GNGZlYxsCYBIWe31hGx0bG2Jnc2x1ZB8IARZ0eXdycDY=';
const _SALT_KEY = 'RK_OPD_AIIMS_2026';
const _EXPECTED_CHECKSUM = 'c4562f4aaab042010cf2519e898c444920f7217a59e6958f56d47b9551fc1026';

function decodeProvenance() {
  const buf = Buffer.from(_PAYLOAD, 'base64');
  const decoded = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    decoded[i] = buf[i] ^ _SALT_KEY.charCodeAt(i % _SALT_KEY.length);
  }
  return decoded.toString('utf8');
}

function verifySystemProvenance() {
  try {
    const raw = decodeProvenance();
    const computedHash = crypto.createHash('sha256').update(raw).digest('hex');
    const isValid = computedHash === _EXPECTED_CHECKSUM;
    const cert = JSON.parse(raw);

    console.log('\n===============================================================');
    console.log('       AIIMS KALYANI OPD QUEUE MANAGEMENT SYSTEM');
    console.log('        SYSTEM PROVENANCE & AUTHORSHIP CERTIFICATE');
    console.log('===============================================================\n');

    if (!isValid) {
      console.error('❌ TAMPER DETECTED: Cryptographic hash mismatch!');
      console.error('Expected:', _EXPECTED_CHECKSUM);
      console.error('Computed:', computedHash);
      process.exit(1);
    }

    console.log('✅ CRYPTOGRAPHIC INTEGRITY: VERIFIED AUTHENTIC');
    console.log('---------------------------------------------------------------');
    console.log(`• Original Author      : ${cert.author}`);
    console.log(`• System Role          : ${cert.role}`);
    console.log(`• Project              : ${cert.project}`);
    console.log(`• Institution          : ${cert.institution}`);
    console.log(`• Copyright Notice     : ${cert.copyright}`);
    console.log(`• Tamper-Evident ID    : ${cert.tamperId}`);
    console.log(`• SHA-256 Fingerprint  : ${computedHash}`);
    console.log('---------------------------------------------------------------');
    console.log('This software architecture, source code, and design were authored');
    console.log('by Rutuj Kharatmol. Any unauthorized appropriation or removal of');
    console.log('authorship violates intellectual property laws.\n');

    return { isValid, cert, hash: computedHash };
  } catch (err) {
    console.error('Error verifying provenance:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  verifySystemProvenance();
}

const PROVENANCE_HEADER_TAG = `RK-OPD-PROV-${_EXPECTED_CHECKSUM.slice(0, 12)}`;

module.exports = {
  verifySystemProvenance,
  _EXPECTED_CHECKSUM,
  EXPECTED_PROVENANCE_HASH: _EXPECTED_CHECKSUM,
  PROVENANCE_HEADER_TAG,
  _PAYLOAD,
  _SALT_KEY
};
