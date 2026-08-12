import {
  SHELL_LAYOUT_DESKTOP_VIEWPORT,
  SHELL_LAYOUT_MOBILE_VIEWPORT,
  SHELL_LAYOUT_STORAGE_KEY
} from "./constants";

/** Inline script before hydration so a saved desktop/mobile choice applies immediately. */
export const SHELL_LAYOUT_BOOT_SCRIPT = `(function(){try{var key=${JSON.stringify(SHELL_LAYOUT_STORAGE_KEY)};var mode=localStorage.getItem(key);if(mode!=='mobile'&&mode!=='desktop')return;var root=document.documentElement;root.dataset.shell=mode;var meta=document.querySelector('meta[name="viewport"]');if(!meta){meta=document.createElement('meta');meta.setAttribute('name','viewport');document.head.appendChild(meta);}meta.setAttribute('content',mode==='desktop'?${JSON.stringify(SHELL_LAYOUT_DESKTOP_VIEWPORT)}:${JSON.stringify(SHELL_LAYOUT_MOBILE_VIEWPORT)});}catch(e){}})();`;
