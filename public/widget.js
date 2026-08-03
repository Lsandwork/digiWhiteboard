(function () {
  if (window.__rufflyWidgetLoaded) return;
  window.__rufflyWidgetLoaded = true;

  var script = document.currentScript;
  var key = (script && script.getAttribute("data-ruffly-key")) || "";
  var apiBase =
    (script && script.getAttribute("data-ruffly-api")) ||
    "https://staff.ruffops.com";
  var VISITOR_KEY = "ruffly_visitor_token";
  var visitorToken = null;
  var busy = false;
  try {
    visitorToken = window.localStorage.getItem(VISITOR_KEY);
  } catch (e) {
    visitorToken = null;
  }

  var URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,!?);:])/g;
  var STYLE_ID = "ruffly-widget-styles";

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var font = document.createElement("link");
    font.rel = "stylesheet";
    font.href = "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap";
    document.head.appendChild(font);

    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      "#ruffly-chat-root{--ruffly-orange:#ff6f26;--ruffly-ink:#1f2933;--ruffly-muted:#64748b;--ruffly-line:#ece7e2;--ruffly-soft:#fff7f2;--ruffly-bot:#f4f1ee;font-family:Figtree,ui-sans-serif,system-ui,sans-serif;}" +
      "#ruffly-chat-root *{box-sizing:border-box;}" +
      "#ruffly-chat-root .rw-launcher{background:var(--ruffly-orange);color:#fff;border:0;border-radius:999px;padding:13px 18px;font:600 14px Figtree,sans-serif;cursor:pointer;box-shadow:0 10px 28px rgba(255,111,38,.35);transition:transform .15s ease,box-shadow .15s ease;}" +
      "#ruffly-chat-root .rw-launcher:hover{transform:translateY(-1px);box-shadow:0 14px 30px rgba(255,111,38,.4);}" +
      "#ruffly-chat-root .rw-panel{width:min(380px,calc(100vw - 24px));height:min(560px,calc(100vh - 96px));margin-bottom:12px;background:#fff;border:1px solid var(--ruffly-line);border-radius:22px;box-shadow:0 24px 60px rgba(31,41,51,.18);display:flex;flex-direction:column;overflow:hidden;animation:rw-rise .22s ease;}" +
      "#ruffly-chat-root .rw-header{padding:14px 16px;background:linear-gradient(180deg,#fff9f5 0%,#fff 100%);border-bottom:1px solid var(--ruffly-line);display:flex;align-items:center;gap:12px;}" +
      "#ruffly-chat-root .rw-avatar{width:38px;height:38px;border-radius:12px;background:var(--ruffly-orange);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0;}" +
      "#ruffly-chat-root .rw-title{font-weight:700;font-size:15px;color:var(--ruffly-ink);line-height:1.2;}" +
      "#ruffly-chat-root .rw-status{display:flex;align-items:center;gap:6px;margin-top:3px;font-size:12px;color:var(--ruffly-muted);}" +
      "#ruffly-chat-root .rw-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.15);}" +
      "#ruffly-chat-root .rw-messages{flex:1;overflow:auto;padding:16px 14px;background:linear-gradient(180deg,#faf8f6 0%,#fff 48%);display:flex;flex-direction:column;gap:10px;}" +
      "#ruffly-chat-root .rw-row{display:flex;width:100%;}" +
      "#ruffly-chat-root .rw-row.bot{justify-content:flex-start;}" +
      "#ruffly-chat-root .rw-row.user{justify-content:flex-end;}" +
      "#ruffly-chat-root .rw-bubble{max-width:86%;padding:11px 13px;border-radius:16px;font-size:14px;line-height:1.45;word-break:break-word;animation:rw-pop .18s ease;}" +
      "#ruffly-chat-root .rw-bubble.bot{background:var(--ruffly-bot);color:var(--ruffly-ink);border-bottom-left-radius:6px;}" +
      "#ruffly-chat-root .rw-bubble.user{background:var(--ruffly-orange);color:#fff;border-bottom-right-radius:6px;}" +
      "#ruffly-chat-root .rw-bubble a{color:#9a3412;font-weight:600;text-decoration:underline;word-break:break-all;}" +
      "#ruffly-chat-root .rw-bubble.user a{color:#fff;}" +
      "#ruffly-chat-root .rw-meta{font-size:11px;color:var(--ruffly-muted);margin:0 4px;}" +
      "#ruffly-chat-root .rw-typing{display:inline-flex;align-items:center;gap:5px;padding:12px 14px;background:var(--ruffly-bot);border-radius:16px;border-bottom-left-radius:6px;}" +
      "#ruffly-chat-root .rw-typing span{width:7px;height:7px;border-radius:50%;background:#94a3b8;animation:rw-bounce 1.1s infinite ease-in-out;}" +
      "#ruffly-chat-root .rw-typing span:nth-child(2){animation-delay:.15s;}" +
      "#ruffly-chat-root .rw-typing span:nth-child(3){animation-delay:.3s;}" +
      "#ruffly-chat-root .rw-composer{display:flex;gap:8px;padding:12px;border-top:1px solid var(--ruffly-line);background:#fff;}" +
      "#ruffly-chat-root .rw-composer input{flex:1;border:1px solid #ddd6d0;border-radius:14px;padding:12px 13px;font:500 14px Figtree,sans-serif;color:var(--ruffly-ink);outline:none;background:#fff;}" +
      "#ruffly-chat-root .rw-composer input:focus{border-color:#fdba8c;box-shadow:0 0 0 3px rgba(255,111,38,.12);}" +
      "#ruffly-chat-root .rw-composer button{background:var(--ruffly-orange);color:#fff;border:0;border-radius:14px;padding:0 16px;font:700 14px Figtree,sans-serif;cursor:pointer;}" +
      "#ruffly-chat-root .rw-composer button:disabled{opacity:.55;cursor:not-allowed;}" +
      "@keyframes rw-bounce{0%,80%,100%{transform:translateY(0);opacity:.45}40%{transform:translateY(-4px);opacity:1}}" +
      "@keyframes rw-pop{from{opacity:0;transform:translateY(6px) scale(.98)}to{opacity:1;transform:none}}" +
      "@keyframes rw-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}";
    document.head.appendChild(style);
  }

  function appendLinkedText(container, text) {
    var parts = String(text || "").split(URL_RE);
    for (var i = 0; i < parts.length; i += 1) {
      var part = parts[i];
      if (!part) continue;
      if (/^https?:\/\//i.test(part)) {
        var link = document.createElement("a");
        link.href = part;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = part;
        container.appendChild(link);
      } else {
        container.appendChild(document.createTextNode(part));
      }
    }
  }

  function splitReply(text) {
    var raw = String(text || "").trim();
    if (!raw) return [];

    var tokens = [];
    var protectedText = raw
      .replace(URL_RE, function (url) {
        tokens.push(url);
        return "%%T" + (tokens.length - 1) + "%%";
      })
      .replace(/\b([ap])\.m\./gi, function (match) {
        tokens.push(match);
        return "%%T" + (tokens.length - 1) + "%%";
      });

    function restore(value) {
      return value.replace(/%%T(\d+)%%/g, function (_, index) {
        return tokens[Number(index)] || "";
      });
    }

    var parts = protectedText
      .split(/\s+(?=After that\b)|(?<=[.!?])\s+(?=[A-Z])/g)
      .map(function (part) {
        return restore(part).trim();
      })
      .filter(Boolean);

    var chunks = [];
    var buffer = "";
    for (var i = 0; i < parts.length; i += 1) {
      var part = parts[i];
      var candidate = buffer ? buffer + " " + part : part;
      var urlCount = (candidate.match(/https?:\/\//g) || []).length;
      if (buffer && (candidate.length > 170 || urlCount > 1 || /^after that\b/i.test(part))) {
        chunks.push(buffer);
        buffer = part;
      } else {
        buffer = candidate;
      }
    }
    if (buffer) chunks.push(buffer);

    // Prefer at most two bubbles so replies stay snappy.
    if (chunks.length > 2) {
      chunks = [chunks[0], chunks.slice(1).join(" ")].filter(Boolean);
    }
    return chunks.length ? chunks : [raw];
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function typingDelay(text, index) {
    var len = String(text || "").length;
    // Keep the human feel without making owners wait forever.
    var base = index === 0 ? 320 : 220;
    return Math.min(900, Math.max(base, 180 + len * 6));
  }

  ensureStyles();

  var root = document.createElement("div");
  root.id = "ruffly-chat-root";
  root.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:99999;";

  var button = document.createElement("button");
  button.type = "button";
  button.className = "rw-launcher";
  button.setAttribute("aria-label", "Open Fitdog chat");
  button.textContent = "Chat with Fitdog";

  var panel = document.createElement("div");
  panel.hidden = true;
  panel.className = "rw-panel";
  panel.innerHTML =
    '<div class="rw-header">' +
    '<div class="rw-avatar" aria-hidden="true">R</div>' +
    "<div>" +
    '<div class="rw-title">Fitdog Customer Care</div>' +
    '<div class="rw-status"><span class="rw-dot" aria-hidden="true"></span><span id="ruffly-chat-presence">Online · usually replies in a moment</span></div>' +
    "</div></div>" +
    '<div id="ruffly-chat-messages" class="rw-messages" role="log" aria-live="polite"></div>' +
    '<form id="ruffly-chat-form" class="rw-composer">' +
    '<input id="ruffly-chat-input" aria-label="Message" placeholder="Message Fitdog…" autocomplete="off" />' +
    '<button type="submit" id="ruffly-chat-send">Send</button>' +
    "</form>";

  button.addEventListener("click", function () {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      void greetIfNeeded();
      input.focus();
    }
  });

  root.appendChild(panel);
  root.appendChild(button);
  document.body.appendChild(root);

  var form = panel.querySelector("#ruffly-chat-form");
  var input = panel.querySelector("#ruffly-chat-input");
  var sendBtn = panel.querySelector("#ruffly-chat-send");
  var messages = panel.querySelector("#ruffly-chat-messages");
  var presence = panel.querySelector("#ruffly-chat-presence");
  var typingRow = null;

  function setBusy(next) {
    busy = next;
    input.disabled = next;
    sendBtn.disabled = next;
    presence.textContent = next ? "Ruffly is typing…" : "Online · usually replies in a moment";
  }

  function addBubble(role, text, linkify) {
    var row = document.createElement("div");
    row.className = "rw-row " + role;
    var bubble = document.createElement("div");
    bubble.className = "rw-bubble " + role;
    if (linkify) {
      appendLinkedText(bubble, text);
    } else {
      bubble.textContent = text;
    }
    row.appendChild(bubble);
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
    return row;
  }

  function showTyping() {
    hideTyping();
    typingRow = document.createElement("div");
    typingRow.className = "rw-row bot";
    typingRow.setAttribute("aria-label", "Ruffly is typing");
    typingRow.innerHTML = '<div class="rw-typing"><span></span><span></span><span></span></div>';
    messages.appendChild(typingRow);
    messages.scrollTop = messages.scrollHeight;
  }

  function hideTyping() {
    if (typingRow && typingRow.parentNode) {
      typingRow.parentNode.removeChild(typingRow);
    }
    typingRow = null;
  }

  async function deliverBotReply(fullText) {
    var sections = splitReply(fullText).slice(0, 2);
    for (var i = 0; i < sections.length; i += 1) {
      showTyping();
      await delay(typingDelay(sections[i], i));
      hideTyping();
      addBubble("bot", sections[i], true);
      if (i < sections.length - 1) {
        await delay(160);
      }
    }
  }

  var greeted = false;
  async function greetIfNeeded() {
    if (greeted) return;
    greeted = true;
    setBusy(true);
    showTyping();
    await delay(350);
    hideTyping();
    addBubble(
      "bot",
      "Hi — I’m Ruffly with Fitdog Customer Care. Ask me about hours, daycare, boarding, grooming, training, or sports — I can also get a teammate for you.",
      false
    );
    setBusy(false);
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (busy) return;
    var text = (input.value || "").trim();
    if (!text) return;

    addBubble("user", text, false);
    input.value = "";
    setBusy(true);
    showTyping();

    fetch(apiBase.replace(/\/$/, "") + "/api/ruffly/public/webchat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: text,
        siteKey: key,
        origin: location.origin,
        visitorToken: visitorToken || undefined
      })
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (body) {
        if (body && body.visitorToken) {
          visitorToken = body.visitorToken;
          try {
            window.localStorage.setItem(VISITOR_KEY, visitorToken);
          } catch (e) {
            /* ignore storage failures */
          }
        }
        hideTyping();
        return deliverBotReply(body.reply || body.error || "Thanks — our team will follow up.");
      })
      .catch(function () {
        hideTyping();
        return deliverBotReply("We couldn’t send that just now. Please try again shortly.");
      })
      .then(function () {
        setBusy(false);
        input.focus();
      });
  });
})();
