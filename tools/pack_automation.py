#!/usr/bin/env python3
"""Build a data-only Play Keeper .pkauto package from a manifest JSON file."""

import hashlib
import argparse
import base64
import json
import pathlib
import subprocess
import sys
import zipfile


def fail(message: str) -> None:
    raise SystemExit(f"error: {message}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=pathlib.Path)
    parser.add_argument("output", nargs="?", type=pathlib.Path)
    parser.add_argument("--sign", type=pathlib.Path, metavar="P256_PRIVATE_KEY_PEM")
    parser.add_argument("--publisher", help="publisher name embedded in a signed package")
    args = parser.parse_args()
    source = args.manifest
    output = args.output or source.with_suffix(".pkauto")
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
        "schemaVersion": 2,
        "manifestPath": "manifest.json",
        "manifestSha256": hashlib.sha256(raw).hexdigest(),
        "scriptId": manifest["id"],
        "scriptVersion": manifest["version"],
    }
    if bool(args.sign) != bool(args.publisher):
        fail("--sign and --publisher must be supplied together")
    if args.sign:
        try:
            public_key = subprocess.run(
                ["openssl", "pkey", "-in", str(args.sign), "-pubout", "-outform", "DER"],
                check=True, capture_output=True).stdout
        except (OSError, subprocess.CalledProcessError) as error:
            fail(f"OpenSSL could not read the EC P-256 key: {error}")
        fingerprint = hashlib.sha256(public_key).hexdigest()
        payload = "\n".join((
            "playkeeper.automation", "2", hashlib.sha256(raw).hexdigest(),
            str(manifest["id"]), str(manifest["version"]), args.publisher, fingerprint,
        )).encode("utf-8")
        try:
            signature = subprocess.run(
                ["openssl", "dgst", "-sha256", "-sign", str(args.sign)],
                input=payload, check=True, capture_output=True).stdout
        except (OSError, subprocess.CalledProcessError) as error:
            fail(f"OpenSSL could not sign the package: {error}")
        metadata["publisher"] = {
            "name": args.publisher,
            "algorithm": "SHA256withECDSA",
            "publicKeySpki": base64.b64encode(public_key).decode("ascii"),
            "fingerprintSha256": fingerprint,
            "signature": base64.b64encode(signature).decode("ascii"),
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
