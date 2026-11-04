/**
 * The browser fires `beforeinstallprompt` once, often before React has loaded, so this
 * runs in <head> (plain ES5) and keeps the event on window for the "Download App" menu
 * item (components/InstallApp.tsx). It doesn't block the browser's own install banner.
 *
 * It also remembers an install in localStorage, so the menu item stays hidden in an
 * ordinary browser tab after the app is installed. The browser only offers the prompt
 * when the app is not installed, so getting one clears that note (e.g. after uninstall).
 */
export const INSTALLED_KEY = 'opd-app-installed';

export const INSTALL_PROMPT_CATCHER = `(function(){try{
window.addEventListener('beforeinstallprompt',function(e){window.__opdInstallPrompt=e;try{localStorage.removeItem('${INSTALLED_KEY}');}catch(x){}window.dispatchEvent(new Event('opd:install-ready'));});
window.addEventListener('appinstalled',function(){window.__opdInstallPrompt=null;try{localStorage.setItem('${INSTALLED_KEY}','1');}catch(x){}window.dispatchEvent(new Event('opd:install-ready'));});
}catch(e){}})();`;
