(function () {
  if (window.__rufflyWidgetLoaded) return;
  window.__rufflyWidgetLoaded = true;

  var script = document.currentScript;
  var key = (script && script.getAttribute("data-ruffly-key")) || "";
  var root = document.createElement("div");
  root.id = "ruffly-chat-root";
  root.style.cssText =
    "position:fixed;right:16px;bottom:16px;z-index:99999;font-family:system-ui,-apple-system,Segoe UI,sans-serif;";

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
    '<p>Hi — I’m Fitdog’s virtual assistant (not a human). Ask about services, or leave your name and dog’s name for our team.</p>' +
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
    var bubble = document.createElement("p");
    bubble.textContent = "You: " + text;
    messages.appendChild(bubble);
    input.value = "";
    fetch("/api/ruffly/public/webchat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: text, siteKey: key, origin: location.origin })
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (body) {
        var reply = document.createElement("p");
        reply.textContent = "Fitdog: " + (body.reply || body.error || "Thanks — our team will follow up.");
        messages.appendChild(reply);
        messages.scrollTop = messages.scrollHeight;
      })
      .catch(function () {
        var reply = document.createElement("p");
        reply.textContent = "Fitdog: We couldn’t send that just now. Please try again shortly.";
        messages.appendChild(reply);
      });
  });
})();
