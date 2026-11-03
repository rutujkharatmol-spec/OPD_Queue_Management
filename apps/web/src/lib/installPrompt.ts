/**
 * The browser fires `beforeinstallprompt` once, often before React has loaded, so this
 * runs in <head> (plain ES5) and keeps the event on window for the "Download App" menu
 * item (components/InstallApp.tsx). It doesn't block the browser's own install banner.
 */
export const INSTALL_PROMPT_CATCHER = `(function(){try{
window.addEventListener('beforeinstallprompt',function(e){window.__opdInstallPrompt=e;window.dispatchEvent(new Event('opd:install-ready'));});
window.addEventListener('appinstalled',function(){window.__opdInstallPrompt=null;window.dispatchEvent(new Event('opd:install-ready'));});
}catch(e){}})();`;
