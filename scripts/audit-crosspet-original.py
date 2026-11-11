#!/usr/bin/env python3
"""Check the imported CrossPet implementation and optionally an installed copy.

No account data, preferences or credentials are read. The baseline is pinned in
UPSTREAMS.json; adapting the backend must not replace original pet behaviour.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
BASE = json.loads((ROOT / "UPSTREAMS.json").read_text())["crosspet"]["commit"]
ADAPTERS = {
    "app/windows/src/Program.cs", "app/windows/src/Pet.cs",
    "app/windows/src/Pet.Autostart.cs", "app/windows/src/Pet.Menu.cs",
    "app/windows/src/Pet.Update.cs", "app/windows/src/Pet.Web.cs",
    "integrations/claude-code/mod/hooks/register.ts",
    "integrations/deepseek/dsh-plugin-crosspet/lib/index.js",
    "integrations/crosspet-hook.py",
}


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--installed-root", type=Path)
    args = parser.parse_args()
    failures = []
    counts = {}
    rows = git("ls-tree", "-rz", BASE, "app/windows/src", "app/windows/CrossPet.csproj",
               "app/web", "characters", "integrations", "tools").split(b"\0")
    for row in filter(None, rows):
        meta, raw_path = row.split(b"\t", 1)
        _, kind, expected = meta.split()
        if kind != b"blob":
            continue
        relative = raw_path.decode()
        path = ROOT / relative
        group = "/".join(relative.split("/")[:2]) if relative.startswith("app/") else relative.split("/")[0]
        counts[group] = counts.get(group, 0) + 1
        if not path.is_file():
            failures.append("Missing original file: " + relative)
            continue
        data = path.read_bytes()
        if relative == "app/web/index.html":
            # The Mac bridge added only a backend-disconnection cleanup entry.
            # All original animation, input, timer and task code stays identical.
            text = data.decode()
            marker = "// A disconnected Plus backend must not leave an asking pose"
            if marker in text:
                start = text.index(marker)
                end = text.index("function applyClientState", start)
                text = text[:start] + text[end:]
            data = text.encode()
        elif relative == "app/windows/src/Pet.Integrations.cs":
            data = data.replace(b'Open($"https://github.com/{Repo}/releases")',
                                b'Open("https://github.com/lokicorvus/crosspet/releases")')
        elif relative in ADAPTERS:
            continue
        actual = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        if actual != expected.decode():
            failures.append("Original behaviour/resource changed: " + relative)

    if (ROOT / "app/web/collaboration.js").exists():
        failures.append("Custom subagent animation override must stay removed")

    checked = 0
    if args.installed_root:
        pairs = [(ROOT / "app/web", "web"), (ROOT / "characters", "characters"),
                 (ROOT / "integrations", "integrations")]
        for source, destination in pairs:
            for path in source.rglob("*"):
                if not path.is_file():
                    continue
                target = args.installed_root / destination / path.relative_to(source)
                checked += 1
                if not target.is_file() or hashlib.sha256(path.read_bytes()).digest() != hashlib.sha256(target.read_bytes()).digest():
                    failures.append("Installed resource mismatch: " + str(target))
        for source, relative in [(ROOT / "tools/integrate.py", "tools/integrate.py"),
                                 (ROOT / "app/windows/apps.json", "apps.json")]:
            checked += 1
            target = args.installed_root / relative
            if not target.is_file() or target.read_bytes() != source.read_bytes():
                failures.append("Installed tool mismatch: " + relative)
        if (args.installed_root / "web/collaboration.js").exists():
            failures.append("Installed custom animation override is still present")
    print(json.dumps({"baseline": BASE, "originalFiles": counts,
                      "installedFilesChecked": checked, "failures": failures}, ensure_ascii=False, indent=2))
    return bool(failures)


if __name__ == "__main__":
    sys.exit(main())
