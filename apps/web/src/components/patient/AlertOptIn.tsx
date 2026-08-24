"use client";
import React from 'react';
import { Bell, BellRing, Volume2, ShieldAlert } from 'lucide-react';
import { t, type PatientLang } from '../../lib/patientI18n';
import type { AlertCapabilities } from '../../lib/patientAlerts';

interface Props {
  lang: PatientLang;
  enabled: boolean;
  voice: boolean;
  capabilities: AlertCapabilities | null;
  onEnable: () => void;
  onDisable: () => void;
  onToggleVoice: (next: boolean) => void;
  onTest: () => void;
}

/**
 * Names the channels that will actually fire.
 *
 * Notifications need a secure context, and this system is frequently served over plain
 * HTTP from a machine on the hospital LAN. Saying "sound only on this connection" is far
 * better than implying a background alert that will never arrive.
 */
function describeChannels(caps: AlertCapabilities, lang: PatientLang): string {
  if (caps.notifications) {
    return caps.vibration ? t(lang, 'alertsFull') : t(lang, 'alertsSoundNotif');
  }
  if (!caps.secureContext) return t(lang, 'alertsSoundOnly');
  if (caps.notificationsBlocked) return t(lang, 'alertsBlocked');
  if (caps.vibration) return t(lang, 'alertsSoundVibe');
  return t(lang, 'alertsSoundOnly');
}

export default function AlertOptIn({
  lang,
  enabled,
  voice,
  capabilities,
  onEnable,
  onDisable,
  onToggleVoice,
  onTest,
}: Props) {
  if (!enabled) {
    return (
      <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800">
        <div className="flex items-start gap-3.5">
          <div className="bg-slate-800 text-amber-300 p-2.5 rounded-xl shrink-0">
            <Bell size={20} />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-base leading-tight">{t(lang, 'alertsTitle')}</h3>
            <p className="text-sm text-slate-300 mt-1 leading-snug">{t(lang, 'alertsBody')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onEnable}
          className="mt-4 w-full min-h-[48px] bg-blue-600 hover:bg-blue-500 active:scale-[0.99] rounded-xl px-5 py-3 font-bold transition-all shadow-lg shadow-blue-900/40 flex items-center justify-center gap-2"
        >
          <BellRing size={18} />
          {t(lang, 'alertsEnable')}
        </button>
      </div>
    );
  }

  const notificationsUnavailable =
    capabilities && !capabilities.notifications && (capabilities.notificationsBlocked || !capabilities.secureContext);

  return (
    <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 border border-slate-800 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-emerald-500/15 text-emerald-400 p-2 rounded-xl shrink-0">
            <BellRing size={18} />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm leading-tight">{t(lang, 'alertsOn')}</p>
            {capabilities && (
              <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                {describeChannels(capabilities, lang)}
              </p>
            )}
            {/* The alert is driven by a timer in this page, and mobile browsers throttle
                or suspend those once the tab is hidden. Say so rather than let the
                patient assume a locked phone will still buzz. */}
            <p className="text-xs text-slate-500 mt-1 leading-snug">
              {t(lang, 'alertsKeepOpen')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onTest}
          className="shrink-0 min-h-[44px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-bold transition-colors"
        >
          {t(lang, 'alertsTest')}
        </button>
      </div>

      {notificationsUnavailable && (
        <p className="flex items-start gap-2 text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 leading-snug">
          <ShieldAlert size={14} className="shrink-0 mt-0.5" />
          {capabilities?.notificationsBlocked && capabilities.secureContext
            ? t(lang, 'alertsBlocked')
            : t(lang, 'alertsSoundOnly')}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-800">
        <label className="flex items-center gap-2.5 text-sm font-semibold text-slate-300 cursor-pointer py-2 min-h-[44px]">
          <input
            type="checkbox"
            checked={voice}
            onChange={(e) => onToggleVoice(e.target.checked)}
            className="w-5 h-5 rounded accent-blue-500 cursor-pointer"
          />
          <Volume2 size={16} className="text-slate-400" />
          {t(lang, 'voiceLabel')}
        </label>
        <button
          type="button"
          onClick={onDisable}
          className="shrink-0 min-h-[44px] px-3 text-sm font-bold text-slate-400 hover:text-white transition-colors"
        >
          {t(lang, 'alertsDisable')}
        </button>
      </div>
    </div>
  );
}
