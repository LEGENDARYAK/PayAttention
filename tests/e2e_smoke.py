"""Smoke test for the built Chromium extension.

Run after `npm run build`:
    xvfb-run -a python tests/e2e_smoke.py
"""
from __future__ import annotations

import contextlib
import http.server
import socket
import socketserver
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures"
EXTENSION = ROOT / ".output" / "chrome-mv3"


def free_port() -> int:
    with contextlib.closing(socket.socket()) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def main() -> None:
    port = free_port()
    handler = lambda *args, **kwargs: http.server.SimpleHTTPRequestHandler(  # noqa: E731
        *args, directory=str(FIXTURES), **kwargs
    )
    server = socketserver.TCPServer(("127.0.0.1", port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    user_data = ROOT / ".tmp-playwright-profile"
    import shutil
    shutil.rmtree(user_data, ignore_errors=True)
    user_data.mkdir(exist_ok=True)

    try:
        with sync_playwright() as playwright:
            context = playwright.chromium.launch_persistent_context(
                str(user_data),
                executable_path="/usr/bin/chromium",
                headless=False,
                args=[
                    f"--disable-extensions-except={EXTENSION}",
                    f"--load-extension={EXTENSION}",
                    "--autoplay-policy=no-user-gesture-required",
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                ],
            )
            context.set_default_timeout(10000)
            print("launched", flush=True)
            print("service workers", [w.url for w in context.service_workers], flush=True)
            page = context.pages[0]
            print("goto media", flush=True)
            page.goto(f"http://127.0.0.1:{port}/media.html")
            print("waiting play", flush=True)
            page.wait_for_function("!document.querySelector('#media').paused")
            print("playing", flush=True)

            print("new page", flush=True)
            other = context.new_page()
            other.goto(f"http://127.0.0.1:{port}/blank.html")
            other.bring_to_front()
            print("waiting pause", flush=True)
            page.wait_for_function("document.querySelector('#media').paused")
            print("paused", flush=True)

            page.bring_to_front()
            page.wait_for_timeout(400)
            assert page.evaluate("document.querySelector('#media').paused") is True
            assert page.locator("#payattention-toast-host").count() == 1
            context.close()
            print("PASS: hidden-tab media paused, stayed paused on return, and toast appeared")
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
