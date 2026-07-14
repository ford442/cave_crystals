"""Shared helper for verification scripts: serves dist/ over HTTP and configures Chromium.

Usage:
    from server import DistServer, CHROMIUM_ARGS, report_screenshot, report_failure

    with DistServer() as server:
        browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
        page.goto(server.url)
"""
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

# Explicit launch args so Chromium runs reliably in CI/containers where the
# default sandbox and /dev/shm size are unavailable or too small.
CHROMIUM_ARGS = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
]


def find_free_port():
    """Ask the OS for an unused localhost port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class DistServer:
    """Starts `python3 -m http.server` over a build directory on an available port.

    Blocks in start()/`__enter__` until the server actually answers requests,
    instead of a fixed sleep, and always stops it in stop()/`__exit__`.
    """

    def __init__(self, directory="dist", port=None, ready_timeout=10):
        self.directory = directory
        self.port = port or find_free_port()
        self.ready_timeout = ready_timeout
        self.process = None

    @property
    def url(self):
        return f"http://localhost:{self.port}"

    def start(self):
        self.process = subprocess.Popen(
            [sys.executable, "-m", "http.server", str(self.port), "--directory", self.directory],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        deadline = time.time() + self.ready_timeout
        last_error = None
        while time.time() < deadline:
            try:
                urllib.request.urlopen(self.url, timeout=0.5)
                return self
            except urllib.error.URLError as exc:
                last_error = exc
                time.sleep(0.1)
        self.stop()
        raise RuntimeError(
            f"Server did not become ready on {self.url} within {self.ready_timeout}s: {last_error}"
        )

    def stop(self):
        if self.process is None:
            return
        self.process.terminate()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()
        self.process = None

    def __enter__(self):
        return self.start()

    def __exit__(self, exc_type, exc, tb):
        self.stop()


def report_screenshot(path):
    """Print a consistently-tagged line so screenshots are easy to grep from verify output."""
    print(f"[screenshot] {path}")


def report_failure(path):
    """Print a consistently-tagged line marking a failure artifact (error screenshot, etc.)."""
    print(f"[failure] {path}")
