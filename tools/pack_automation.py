#!/usr/bin/env python3
"""Build a data-only Play Keeper .pkauto package from a manifest JSON file."""

import hashlib
import json
import pathlib
import sys
import zipfile


def fail(message: str) -> None:
    raise SystemExit(f"error: {message}")


def main() -> None:
    if len(sys.argv) not in (2, 3):
        fail("usage: pack_automation.py MANIFEST.json [OUTPUT.pkauto]")
    source = pathlib.Path(sys.argv[1])
    output = pathlib.Path(sys.argv[2]) if len(sys.argv) == 3 else source.with_suffix(".pkauto")
    raw = source.read_bytes()
    if len(raw) > 64 * 1024:
        fail("manifest must not exceed 64KB")
    try:
        manifest = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        fail(f"manifest is not valid UTF-8 JSON: {error}")
    for key in ("id", "name", "version", "allowedOrigins", "capabilities"):
        if key not in manifest:
            fail(f"manifest is missing {key}")
    metadata = {
        "format": "playkeeper.automation",
        "schemaVersion": 1,
        "manifestPath": "manifest.json",
        "manifestSha256": hashlib.sha256(raw).hexdigest(),
        "scriptId": manifest["id"],
        "scriptVersion": manifest["version"],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as package:
        package.writestr("package.json", json.dumps(metadata, ensure_ascii=False, separators=(",", ":")))
        package.writestr("manifest.json", raw)
    if output.stat().st_size > 256 * 1024:
        output.unlink(missing_ok=True)
        fail("package exceeds 256KB")
    print(output)


if __name__ == "__main__":
    main()
