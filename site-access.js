(() => {
  const storageKey = "prismorar-site-unlocked";
  const expectedDigest =
    "b7d03a25e91ab7c78cef9325b7021da1a5bdbe516f71fa5ecf7545d6db3db20b";

  if (sessionStorage.getItem(storageKey) === "1") return;

  document.documentElement.classList.add("site-access-locked");

  const style = document.createElement("style");
  style.textContent = `
    html.site-access-locked body > :not(#site-access-gate) {
      visibility: hidden !important;
    }
    #site-access-gate {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: grid;
      place-items: center;
      padding: 24px;
      background: radial-gradient(circle at top, rgba(107, 124, 255, .2), transparent 40%), #07111f;
      color: #eef5ff;
      font: 16px/1.5 Inter, sans-serif;
      visibility: visible;
    }
    #site-access-gate, #site-access-gate * { box-sizing: border-box; }
    #site-access-gate .site-access-card {
      width: min(100%, 400px);
      padding: 32px;
      border: 1px solid rgba(255, 255, 255, .12);
      border-radius: 20px;
      background: rgba(13, 24, 39, .96);
      box-shadow: 0 30px 60px rgba(1, 7, 16, .45);
    }
    #site-access-gate h1 { margin: 0 0 8px; font-size: 1.6rem; }
    #site-access-gate p { margin: 0 0 20px; color: #a9bad0; }
    #site-access-gate label { display: block; margin-bottom: 8px; font-weight: 600; }
    #site-access-gate input {
      width: 100%;
      padding: 12px 14px;
      border: 1px solid rgba(255, 255, 255, .18);
      border-radius: 10px;
      background: #07111f;
      color: #eef5ff;
      font: inherit;
    }
    #site-access-gate button {
      width: 100%;
      margin-top: 14px;
      padding: 12px;
      border: 0;
      border-radius: 10px;
      background: linear-gradient(135deg, #6b7cff, #8b74ff);
      color: #fff;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    #site-access-gate button:disabled { cursor: wait; opacity: .7; }
    #site-access-message { min-height: 1.5em; margin: 12px 0 0 !important; color: #ff9aa7 !important; }
  `;
  document.head.append(style);

  const showGate = () => {
    const gate = document.createElement("main");
    gate.id = "site-access-gate";
    gate.innerHTML = `
      <section class="site-access-card" aria-labelledby="site-access-title">
        <h1 id="site-access-title">Şifre gerekli</h1>
        <p>Siteye devam etmek için şifrenizi girin.</p>
        <form>
          <label for="site-access-password">Şifre</label>
          <input id="site-access-password" type="password" autocomplete="current-password" required autofocus>
          <button type="submit">Siteyi aç</button>
          <p id="site-access-message" role="status" aria-live="polite"></p>
        </form>
      </section>
    `;
    document.body.append(gate);

    const form = gate.querySelector("form");
    const input = gate.querySelector("#site-access-password");
    const button = gate.querySelector("button");
    const message = gate.querySelector("#site-access-message");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      button.disabled = true;
      message.textContent = "";

      try {
        const inputDigest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(input.value),
        );
        const digest = Array.from(new Uint8Array(inputDigest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");

        if (digest !== expectedDigest) {
          message.textContent = "Şifre yanlış. Tekrar deneyin.";
          input.value = "";
          input.focus();
          button.disabled = false;
          return;
        }

        sessionStorage.setItem(storageKey, "1");
        document.documentElement.classList.remove("site-access-locked");
        gate.remove();
      } catch (error) {
        console.error("Site şifresi doğrulanamadı.", error);
        message.textContent = "Şifre doğrulanamadı. Sayfayı HTTPS üzerinden açıp tekrar deneyin.";
        button.disabled = false;
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showGate, { once: true });
  } else {
    showGate();
  }
})();
