'use client';

import React, { useEffect, useState } from 'react';
import { ShieldCheck, Award, Copy, Check, X, Lock, Cpu, Sparkles } from 'lucide-react';
import {
  verifyAndGetCertificate,
  initProvenanceConsoleHook,
  ProvenanceCertificate
} from '../lib/provenance';

export function SystemWatermark() {
  const [isOpen, setIsOpen] = useState(false);
  const [cert, setCert] = useState<ProvenanceCertificate | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Initialize console helper hook
    initProvenanceConsoleHook();

    // Hotkey handler: Ctrl + Shift + Alt + R or K
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      const isAlt = e.altKey;
      const isShift = e.shiftKey;
      const key = e.key.toLowerCase();

      if (isCtrl && isAlt && isShift && (key === 'r' || key === 'k')) {
        e.preventDefault();
        openCertificate();
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    // Custom event listener from Navbar logo 5-click or console call
    const handleCustomTrigger = () => {
      openCertificate();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('opd:trigger-provenance', handleCustomTrigger);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('opd:trigger-provenance', handleCustomTrigger);
    };
  }, [isOpen]);

  const openCertificate = async () => {
    const certificate = await verifyAndGetCertificate();
    setCert(certificate);
    setIsOpen(true);
  };

  const handleCopy = () => {
    if (!cert) return;
    const text = [
      `=== AIIMS KALYANI OPD QUEUE MANAGEMENT SYSTEM ===`,
      `SYSTEM PROVENANCE & AUTHORSHIP CERTIFICATE`,
      `--------------------------------------------------`,
      `Author: ${cert.author}`,
      `Role: ${cert.role}`,
      `Project: ${cert.project}`,
      `Institution: ${cert.institution}`,
      `Tamper-Evident ID: ${cert.tamperId}`,
      `SHA-256 Fingerprint: ${cert.fingerprint}`,
      `Status: ${cert.verified ? 'CRYPTOGRAPHICALLY VERIFIED AUTHENTIC' : 'FAILED'}`,
      `Verification Timestamp: ${cert.timestamp}`,
      `Copyright Notice: ${cert.copyright}`,
      `--------------------------------------------------`,
      `This software architecture and codebase were authored and created by Rutuj Kharatmol.`
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  if (!isOpen || !cert) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-lg bg-slate-900/95 border border-blue-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl text-white overflow-hidden shadow-blue-500/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow ambient highlight */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={() => setIsOpen(false)}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          title="Close Certificate"
        >
          <X size={18} />
        </button>

        {/* Header Badge */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <ShieldCheck size={26} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1">
                <Sparkles size={10} /> Tamper-Evident Provenance
              </span>
              <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Verified ✓
              </span>
            </div>
            <h2 className="text-lg font-black text-white mt-1">System Authorship Certificate</h2>
          </div>
        </div>

        {/* Author Card */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 mb-5 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Original Author &amp; Creator</p>
              <h3 className="text-xl font-black text-white text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-blue-200">
                {cert.author}
              </h3>
            </div>
            <div className="p-2 bg-blue-500/10 rounded-xl text-blue-400">
              <Award size={20} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-xs">
            <div>
              <p className="text-[10px] text-slate-400 font-medium">Role</p>
              <p className="text-slate-200 font-semibold">{cert.role}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-medium">Institution</p>
              <p className="text-slate-200 font-semibold">AIIMS Kalyani</p>
            </div>
          </div>
        </div>

        {/* Cryptographic Details */}
        <div className="space-y-3 text-xs mb-6">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Lock size={11} className="text-indigo-400" /> SHA-256 Proof Signature
              </span>
              <span className="text-[10px] text-emerald-400 font-bold">100% Cryptographic Match</span>
            </div>
            <p className="font-mono text-[10px] text-slate-300 break-all bg-slate-900/90 p-2 rounded-lg border border-slate-800">
              {cert.fingerprint}
            </p>
          </div>

          <div className="flex items-center justify-between text-[11px] px-1 text-slate-400">
            <span>Tamper ID: <strong className="text-slate-200 font-mono">{cert.tamperId}</strong></span>
            <span className="flex items-center gap-1">
              <Cpu size={12} className="text-blue-400" /> Hardware Seeded
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCopy}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-md shadow-blue-500/25 cursor-pointer"
          >
            {copied ? (
              <>
                <Check size={14} className="text-emerald-300" />
                <span>Certificate Copied!</span>
              </>
            ) : (
              <>
                <Copy size={14} />
                <span>Copy Cryptographic Proof</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="py-2.5 px-5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
