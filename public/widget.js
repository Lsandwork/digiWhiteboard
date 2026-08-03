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
  try {
    visitorToken = window.localStorage.getItem(VISITOR_KEY);
  } catch (e) {
    visitorToken = null;
  }

  var URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,!?);:])/g;

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
        link.style.cssText = "color:#c2410c;text-decoration:underline;word-break:break-all;";
        container.appendChild(link);
      } else {
        container.appendChild(document.createTextNode(part));
      }
    }
  }

  function addMessage(prefix, text, linkify) {
    var bubble = document.createElement("p");
    bubble.style.cssText = "margin:0 0 10px;line-height:1.45;word-break:break-word;";
    bubble.appendChild(document.createTextNode(prefix));
    if (linkify) {
      appendLinkedText(bubble, text);
    } else {
      bubble.appendChild(document.createTextNode(text));
    }
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  }

  var root = document.createElement("div");
  root.id = "ruffly-chat-root";
  root.style.cssText =
    "position:fixed;right:16px;bottom:16px;z-index:99999;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;";

  var button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", "Open Fitdog chat");
  button.textContent = "Chat with Fitdog";
  button.style.cssText =
    "background:#ff6f26;color:#fff;border:0;border-radius:999px;padding:12px 16px;font-weight:600;cursor:pointer;box-shadow:0 8px 24px rgba(31,41,51,.18);";

  var panel = document.createElement("div");
  panel.hidden = true;
  panel.style.cssText =
    "width:min(360px,calc(100vw - 24px));height:420px;margin-bottom:12px;background:#fff;border:1px solid #e5e7eb;border-radius:18px;box-shadow:0 16px 40px rgba(31,41,51,.18);display:flex;flex-direction:column;overflow:hidden;";
  panel.innerHTML =
    '<div style="padding:14px 16px;background:#fff8f3;border-bottom:1px solid #ffe0cc;font-weight:700;color:#1f2933;">Ruffly · Fitdog Customer Care</div>' +
    '<div id="ruffly-chat-messages" style="flex:1;overflow:auto;padding:12px;font-size:14px;color:#334155;">' +
    "<p style=\"margin:0 0 10px;line-height:1.45;\">Hi — I’m Ruffly with Fitdog Customer Care. Ask me about hours, daycare, boarding, grooming, or training — I can also get a teammate for you.</p>" +
    "</div>" +
    '<form id="ruffly-chat-form" style="display:flex;gap:8px;padding:12px;border-top:1px solid #e5e7eb;">' +
    '<input id="ruffly-chat-input" aria-label="Message" placeholder="Type a message" style="flex:1;border:1px solid #d1d5db;border-radius:12px;padding:10px;" />' +
    '<button type="submit" style="background:#ff6f26;color:#fff;border:0;border-radius:12px;padding:10px 12px;font-weight:600;">Send</button>' +
    "</form>";

  button.addEventListener("click", function () {
    panel.hidden = !panel.hidden;
  });

  root.appendChild(panel);
  root.appendChild(button);
  document.body.appendChild(root);

  var form = panel.querySelector("#ruffly-chat-form");
  var input = panel.querySelector("#ruffly-chat-input");
  var messages = panel.querySelector("#ruffly-chat-messages");

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var text = (input.value || "").trim();
    if (!text) return;
    addMessage("You: ", text, false);
    input.value = "";
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
        addMessage("Fitdog: ", body.reply || body.error || "Thanks — our team will follow up.", true);
      })
      .catch(function () {
        addMessage("Fitdog: ", "We couldn’t send that just now. Please try again shortly.", false);
      });
  });
})();
