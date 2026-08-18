import {
  TV_HARD_REFRESH_ENDPOINT,
  TV_HARD_REFRESH_POLL_MS,
  TV_HARD_REFRESH_QUERY
} from "@/lib/tv-hard-refresh";

/**
 * Inline, React-independent beacon for TV internet-browser apps.
 * Polls the Hard Refresh nonce and performs a fresh same-page visit.
 * Does not mark the nonce handled until the page actually navigates (retries).
 */
export const TV_HARD_REFRESH_BOOT_SCRIPT = `(function(){try{var path=location.pathname||"/";if(path.indexOf("/admin")===0||path.indexOf("/blog")===0||path.indexOf("/api")===0||path.indexOf("/ruffly")===0)return;var board=path==="/"||path.indexOf("/lobby")===0||path.indexOf("/cast")===0||path.indexOf("/staff-cast")===0||path.indexOf("/lobby-cast")===0||path.indexOf("/display")===0||path.indexOf("/boards")===0;if(!board)return;var q=${JSON.stringify(TV_HARD_REFRESH_QUERY)};try{var clean=new URL(location.href);if(clean.searchParams.has(q)){clean.searchParams.delete(q);history.replaceState(null,"",clean.pathname+clean.search+clean.hash);}}catch(e0){}var seen=null;var busy=false;function visit(){try{var url=new URL(location.href);url.searchParams.delete(q);url.searchParams.set(q,String(Date.now()));location.replace(url.toString());return;}catch(e1){}try{location.assign(location.pathname+location.search+location.hash);return;}catch(e2){}try{location.reload();}catch(e3){}}function poll(){if(busy)return;busy=true;fetch(${JSON.stringify(TV_HARD_REFRESH_ENDPOINT)},{cache:"no-store",credentials:"same-origin"}).then(function(res){return res.ok?res.json():null;}).then(function(body){if(!body)return;var nonce=Number(body.nonce);if(!isFinite(nonce))return;if(seen===null){seen=nonce;return;}if(nonce!==seen)visit();}).catch(function(){}).then(function(){busy=false;});}poll();setInterval(poll,${TV_HARD_REFRESH_POLL_MS});document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")poll();});}catch(e){}})();`;
