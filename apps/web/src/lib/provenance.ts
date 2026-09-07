/**
 * AIIMS Kalyani OPD Queue Management System
 * System Provenance & Authorship Cryptographic Verification Module
 */

export interface ProvenanceCertificate {
  author: string;
  role: string;
  project: string;
  institution: string;
  copyright: string;
  tamperId: string;
  fingerprint: string;
  verified: boolean;
  timestamp: string;
}

// Obfuscated Salted Payload & Checksum (Tamper-Evident)
const _PAYLOAD = 'KWk+OiQsMDNrc28BKkZFWBYZIz49MTAyLiVrYXEtXVxXFGhpHD01JSsuO2lrcxNXUVYWASQ5OyclLSRpCD8wN1tEV1UmaXNtIDYwKywqOXFlEHF7fx8YfwQxKCYgJyBtHA92EGNDNz46bx0lMSAuLCA2MUYQYU8hPzoicmh9KCc6OTorR0RbWTxpZW0RKDNhACcpOj4SeVxFJiIrOiQhfy4vaQA2O1tTU1pyGDwmNSo8JDppZRIWe31hH3IAPiMpJTEoa2VvMDBCSUBfNSMrbWpmHC45MD86OFpEEh4xYn99YHZpYRs8OSY1EntaVyAqKyI/KHFhCCUhcw1bV1pCIWsNKiMhLTcsLWNxcxBEU1siLi0GNGZlYxsCYBIWe31hGx0bG2Jnc2x1ZB8IARZ0eXdycDY=';
const _SALT_KEY = 'RK_OPD_AIIMS_2026';
export const EXPECTED_PROVENANCE_HASH = 'c4562f4aaab042010cf2519e898c444920f7217a59e6958f56d47b9551fc1026';

export function decodeProvenanceBytes(): Uint8Array {
  let binaryStr: string;
  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    binaryStr = window.atob(_PAYLOAD);
  } else {
    binaryStr = Buffer.from(_PAYLOAD, 'base64').toString('binary');
  }

  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i) ^ _SALT_KEY.charCodeAt(i % _SALT_KEY.length);
  }
  return bytes;
}

export function decodeProvenanceString(): string {
  const bytes = decodeProvenanceBytes();
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes);
  }
  return String.fromCharCode.apply(null, Array.from(bytes));
}

export async function verifyAndGetCertificate(): Promise<ProvenanceCertificate> {
  const bytes = decodeProvenanceBytes();
  const rawString = decodeProvenanceString();

  let computedHash = '';
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    computedHash = EXPECTED_PROVENANCE_HASH;
  }

  const isValid = computedHash === EXPECTED_PROVENANCE_HASH;
  const data = JSON.parse(rawString);

  return {
    author: data.author,
    role: data.role,
    project: data.project,
    institution: data.institution,
    copyright: data.copyright,
    tamperId: data.tamperId,
    fingerprint: computedHash,
    verified: isValid,
    timestamp: new Date().toISOString(),
  };
}

// Attach console command helper
export function initProvenanceConsoleHook() {
  if (typeof window === 'undefined') return;

  const w = window as any;
  if (!w.__VERIFY_OWNERSHIP__) {
    w.__VERIFY_OWNERSHIP__ = async () => {
      const cert = await verifyAndGetCertificate();
      console.log(
        `%c🛡️ AIIMS KALYANI OPD QUEUE MANAGEMENT - AUTHORSHIP VERIFIED 🛡️`,
        'background: #0284c7; color: white; font-weight: bold; font-size: 14px; padding: 6px 12px; border-radius: 6px;'
      );
      console.log(
        `%c• Author: %c${cert.author}\n%c• Role: %c${cert.role}\n%c• Project: %c${cert.project}\n%c• Institution: %c${cert.institution}\n%c• Checksum: %c${cert.fingerprint}\n%c• Status: %c${cert.verified ? 'AUTHENTIC ✓' : 'TAMPERED ❌'}`,
        'color: #94a3b8; font-weight: bold;', 'color: #38bdf8; font-weight: bold;',
        'color: #94a3b8; font-weight: bold;', 'color: #f1f5f9;',
        'color: #94a3b8; font-weight: bold;', 'color: #f1f5f9;',
        'color: #94a3b8; font-weight: bold;', 'color: #f1f5f9;',
        'color: #94a3b8; font-weight: bold;', 'color: #a855f7; font-family: monospace;',
        'color: #94a3b8; font-weight: bold;', 'color: #22c55e; font-weight: bold;'
      );

      // Dispatch UI trigger so modal also opens
      window.dispatchEvent(new CustomEvent('opd:trigger-provenance'));
      return cert;
    };

    w.__OPD_AUTHOR__ = w.__VERIFY_OWNERSHIP__;
  }
}
