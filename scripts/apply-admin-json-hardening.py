#!/usr/bin/env python3
"""Replace raw Response.json() in admin UI with readResponseJson (522-safe)."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMPORT = 'import { readResponseJson } from "@/lib/http/read-response-json";'
TARGETS = [
    ROOT / "components" / "admin",
    ROOT / "hooks",
    ROOT / "lib" / "admin",
    ROOT / "lib" / "http",
]

SKIP_FILES = {
    ROOT / "lib" / "http" / "read-response-json.ts",
    ROOT / "lib" / "http" / "fetch-admin-json.ts",
}

JSON_CALL = re.compile(
    r"(?<!readResponseJson\()"
    r"(?<!\.)"  # keep property access
    r"(await\s+)?([A-Za-z_][A-Za-z0-9_]*)\.json\(\)"
)


def should_touch(path: Path) -> bool:
    if path in SKIP_FILES:
        return False
    if path.suffix not in {".ts", ".tsx"}:
        return False
    text = path.read_text()
    return ".json()" in text and "readResponseJson" in text or ".json()" in text


def transform(text: str) -> str:
    if ".json()" not in text:
        return text

    # .then((r) => r.json()) and .then((response) => response.json())
    text = re.sub(
        r"\.then\(\((\w+)\)\s*=>\s*\1\.json\(\)\)",
        r".then((\1) => readResponseJson(\1))",
        text,
    )
    text = re.sub(
        r"await\s+(\w+)\.json\(\)\.catch\(",
        r"await readResponseJson(\1).catch(",
        text,
    )
    text = re.sub(
        r"await\s+(\w+)\.json\(\)",
        r"await readResponseJson(\1)",
        text,
    )
    text = re.sub(
        r"(?<!readResponseJson\()(\w+)\.json\(\)",
        r"readResponseJson(\1)",
        text,
    )

    if "readResponseJson" in text and IMPORT not in text:
        # Insert after "use client" or first import block.
        if text.startswith('"use client";'):
            text = text.replace('"use client";\n', f'"use client";\n\n{IMPORT}\n', 1)
        elif "from " in text:
            first_import = re.search(r"^import .+$", text, re.M)
            if first_import:
                idx = first_import.end()
                text = text[:idx] + "\n" + IMPORT + text[idx:]
            else:
                text = IMPORT + "\n" + text
        else:
            text = IMPORT + "\n" + text
    return text


def main() -> None:
    changed = []
    for folder in TARGETS:
        if not folder.exists():
            continue
        for path in folder.rglob("*"):
            if not should_touch(path):
                continue
            original = path.read_text()
            next_text = transform(original)
            if next_text != original:
                path.write_text(next_text)
                changed.append(str(path.relative_to(ROOT)))
    print("updated", len(changed), "files")
    for name in changed:
        print(name)


if __name__ == "__main__":
    main()
