import { THEME_STORAGE_KEY } from "@/lib/theme/constants";

/** Inline script applied before hydration to prevent theme flash. */
export const THEME_BOOT_SCRIPT = `(function(){try{var key=${JSON.stringify(THEME_STORAGE_KEY)};var stored=localStorage.getItem(key);var theme=stored==='light'||stored==='dark'||stored==='clear'?stored:(stored==='fitdog_light'?'light':stored==='fitdog_dark'?'dark':stored==='fitdog_clear'?'clear':null);if(!theme){theme='dark';}var root=document.documentElement;root.dataset.theme=theme;root.style.colorScheme=theme==='dark'?'dark':'light';root.classList.toggle('fitdog-light',theme==='light');root.classList.toggle('fitdog-dark',theme==='dark');root.classList.toggle('fitdog-clear',theme==='clear');}catch(e){document.documentElement.dataset.theme='dark';}})();`;
