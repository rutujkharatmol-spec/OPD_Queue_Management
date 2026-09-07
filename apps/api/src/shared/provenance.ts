import * as crypto from 'crypto';

export interface SystemProvenanceCertificate {
  status: string;
  verified: boolean;
  system: string;
  author: string;
  role: string;
  institution: string;
  tamperId: string;
  copyright: string;
  fingerprint: string;
  timestamp: string;
}

// Obfuscated Salted Payload (Tamper-Evident)
const _PAYLOAD = 'KWk+OiQsMDNrc28BKkZFWBYZIz49MTAyLiVrYXEtXVxXFGhpHD01JSsuO2lrcxNXUVYWASQ5OyclLSRpCD8wN1tEV1UmaXNtIDYwKywqOXFlEHF7fx8YfwQxKCYgJyBtHA92EGNDNz46bx0lMSAuLCA2MUYQYU8hPzoicmh9KCc6OTorR0RbWTxpZW0RKDNhACcpOj4SeVxFJiIrOiQhfy4vaQA2O1tTU1pyGDwmNSo8JDppZRIWe31hH3IAPiMpJTEoa2VvMDBCSUBfNSMrbWpmHC45MD86OFpEEh4xYn99YHZpYRs8OSY1EntaVyAqKyI/KHFhCCUhcw1bV1pCIWsNKiMhLTcsLWNxcxBEU1siLi0GNGZlYxsCYBIWe31hGx0bG2Jnc2x1ZB8IARZ0eXdycDY=';
const _SALT_KEY = 'RK_OPD_AIIMS_2026';
export const EXPECTED_PROVENANCE_HASH = 'c4562f4aaab042010cf2519e898c444920f7217a59e6958f56d47b9551fc1026';
export const PROVENANCE_HEADER_TAG = `RK-OPD-PROV-${EXPECTED_PROVENANCE_HASH.slice(0, 12)}`;

export function decodeProvenanceData(): string {
  const buf = Buffer.from(_PAYLOAD, 'base64');
  const decoded = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    decoded[i] = buf[i] ^ _SALT_KEY.charCodeAt(i % _SALT_KEY.length);
  }
  return decoded.toString('utf8');
}

export function getSystemProvenanceCertificate(): SystemProvenanceCertificate {
  const raw = decodeProvenanceData();
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const isValid = hash === EXPECTED_PROVENANCE_HASH;
  const cert = JSON.parse(raw);

  return {
    status: isValid ? 'TAMPER_EVIDENT_PROVENANCE_VERIFIED' : 'INTEGRITY_COMPROMISED',
    verified: isValid,
    system: cert.project,
    author: cert.author,
    role: cert.role,
    institution: cert.institution,
    tamperId: cert.tamperId,
    copyright: cert.copyright,
    fingerprint: hash,
    timestamp: new Date().toISOString(),
  };
}
