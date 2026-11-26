"""
Take design-review screenshots of the running demo (http://localhost:5174).

Usage: python3 branding/screenshots.py [page ...]
Pages: dashboard, contacts, companies, deals, contact, login, dark
Output: /tmp/shots/<page>.png
"""

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:5174/"
OUT = Path("/tmp/shots")
OUT.mkdir(exist_ok=True)
pages = sys.argv[1:] or ["dashboard", "contacts", "deals", "login"]


def settle(page, ms=1500):
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(ms)


with sync_playwright() as p:
    browser = p.chromium.launch(args=["--disable-dev-shm-usage"])
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    # The dev server is configured for the HTTPS preview proxy (HMR on port 443).
    # Locally, point the HMR websocket back at the dev server so Vite's client
    # stays connected instead of falling back to polling + reloading.
    ctx.add_init_script("""
      (() => {
        const NativeWS = window.WebSocket;
        function PatchedWS(url, protocols) {
          url = String(url).replace('ws://localhost:443/', 'ws://localhost:5174/');
          return new NativeWS(url, protocols);
        }
        PatchedWS.prototype = NativeWS.prototype;
        Object.assign(PatchedWS, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
        window.WebSocket = PatchedWS;
      })();
    """)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on(
        "console",
        lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None,
    )
    page.goto(BASE, timeout=180_000)
    page.wait_for_selector("header", timeout=180_000)
    settle(page, 2500)
    print("URL after load:", page.url)

    for name in pages:
        if name == "dashboard":
            page.goto(BASE + "#/", timeout=120_000)
            page.wait_for_selector("main h1", timeout=240_000)
            page.wait_for_selector("main svg rect", timeout=240_000)  # deals chart
            settle(page, 2500)
            page.screenshot(path=OUT / "dashboard.png", full_page=True)
        elif name in ("contacts", "companies", "deals"):
            page.goto(BASE + f"#/{name}", timeout=120_000)
            settle(page, 2500)
            if name == "deals":
                page.wait_for_selector("[data-rfd-droppable-id], [data-rbd-droppable-id], main h3, main .flex-1", timeout=120_000)
                settle(page, 6000)
            page.screenshot(path=OUT / f"{name}.png")
        elif name == "contact":
            page.goto(BASE + "#/contacts", timeout=120_000)
            settle(page, 2000)
            page.locator("main a[href*='/contacts/']").first.click()
            settle(page, 2500)
            page.screenshot(path=OUT / "contact.png")
        elif name == "dark":
            page.evaluate("document.documentElement.classList.remove('light'); document.documentElement.classList.add('dark')")
            page.goto(BASE + "#/", timeout=120_000)
            settle(page, 1000)
            page.evaluate("document.documentElement.classList.remove('light'); document.documentElement.classList.add('dark')")
            page.wait_for_timeout(800)
            page.screenshot(path=OUT / "dark.png", full_page=True)
            page.evaluate("document.documentElement.classList.remove('dark'); document.documentElement.classList.add('light')")
        elif name == "login":
            page.evaluate("localStorage.removeItem('user')")
            page.goto(BASE + "#/login", timeout=120_000)
            settle(page, 2500)
            page.screenshot(path=OUT / "login.png")
        print("saved", name)

    if errors:
        print("\n".join(errors[:20]))
    browser.close()
