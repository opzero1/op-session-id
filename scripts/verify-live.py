import fcntl
import hashlib
import json
import os
from pathlib import Path
import pty
import re
import select
import struct
import subprocess
import sys
import termios
import time
from urllib.parse import urlencode

root = Path(__file__).resolve().parent.parent
target = sys.argv[1] if len(sys.argv) > 1 else str(root)
sandbox = root / ".sandbox" / f"live-{hashlib.sha256(target.encode()).hexdigest()[:12]}"
sandbox.mkdir(parents=True, exist_ok=True)
(sandbox / "opencode.json").write_text(json.dumps({"plugins": ["-session-id", target]}) + "\n")


def api(method, path, data=None):
    if path.startswith("/api/plugin"):
        path += "?" + urlencode({"location[directory]": str(sandbox)})
    command = ["opencode", "api", method, path]
    if data is not None:
        command.extend(["--data", json.dumps(data)])
    output = subprocess.check_output(command, cwd=sandbox, timeout=60)
    return json.loads(output) if output.strip() else None


def attach_terminal():
    os.setsid()
    fcntl.ioctl(0, termios.TIOCSCTTY, 0)


def verify(command, session_id):
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 45, 140, 0, 0))
    child = subprocess.Popen(
        ["opencode", str(sandbox), "--session", session_id],
        stdin=slave, stdout=slave, stderr=slave,
        env={**os.environ, "TERM": "xterm-256color", "COLORTERM": "truecolor"},
        preexec_fn=attach_terminal,
    )
    os.close(slave)
    output = bytearray()
    ansi = re.compile(r"\x1b(?:\][^\x07]*(?:\x07|\x1b\\)|\[[0-?]*[ -/]*[@-~])")

    def wait_for(text, start=0, timeout=30):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if text in ansi.sub("", output[start:].decode("utf-8", errors="replace")):
                return
            if child.poll() is not None:
                raise RuntimeError(f"TUI exited with {child.returncode} before {text!r}")
            if not select.select([master], [], [], 0.1)[0]:
                continue
            data = os.read(master, 65536)
            output.extend(data)
            for query, response in [(b"\x1b[6n", b"\x1b[1;1R"), (b"\x1b[c", b"\x1b[?1;2c")]:
                if query in data:
                    os.write(master, response)
        raise TimeoutError(f"TUI did not display {text!r}; inspect {sandbox}/verify-*.txt")

    try:
        wait_for("ctrl+p commands")
        wait_for("Build")
        start = len(output)
        os.write(master, command.encode())
        wait_for("Copy the current session ID to the clipboard", start)
        start = len(output)
        os.write(master, b"\r")
        wait_for("Session ID copied", start)
        copied = subprocess.check_output(["pbpaste"]).decode()
        assert copied == session_id, f"{command} copied a different value"
        print(f"PASS: {command} copies the session ID and renders the native success toast", flush=True)
    finally:
        child.terminate()
        try:
            child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()
        os.close(master)
        (sandbox / f"verify-{command[1:]}.txt").write_text(ansi.sub("", output.decode("utf-8", errors="replace")))


api("post", "/api/plugin/await-activation")
plugins = api("get", "/api/plugin")["data"]
plugin = next(p for p in plugins if p.get("id") == "op-session-id")
assert plugin["state"]["status"] == "active", plugin
if not Path(target).is_absolute():
    assert plugin["source"]["type"] == "package" and plugin["source"]["target"] == target, plugin
session = api("post", "/api/session", {
    "title": "Session ID clipboard verification", "agent": "build", "location": {"directory": str(sandbox)},
})["data"]
previous = subprocess.check_output(["pbpaste"])
try:
    for command in ["/session-id", "/id"]:
        subprocess.run(["pbcopy"], input=b"clipboard verification pending", check=True)
        verify(command, session["id"])
finally:
    subprocess.run(["pbcopy"], input=previous, check=True)
    api("delete", f"/api/session/{session['id']}")
