#!/usr/bin/env python3
"""
Upload a production build to the Contabo deploy service (bundle API).

Usage:
  1. npm run build
  2. Set DEPLOY_TOKEN (see .env.example or docs/DEPLOY.md)
  3. python3 deploy.py

Credentials are read from environment variables or an optional local
deploy.local.json file (gitignored). Nothing secret is printed to stdout.
"""

from __future__ import annotations

import io
import json
import os
import sys
import zipfile
from pathlib import Path
from typing import Any, Optional

import requests

DEFAULT_PROJECT_NAME = "cave-crystals"
DEFAULT_BUILD_DIR = "dist"
DEFAULT_CONTABO_BASE_URL = "https://storage.noahcohn.com"
DEFAULT_DEPLOY_FOLDER = ""
LOCAL_CONFIG_FILENAME = "deploy.local.json"


def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return value


def load_deploy_config() -> dict[str, Any]:
    """Merge defaults, optional local JSON file, and environment variables."""
    config: dict[str, Any] = {
        "project_name": DEFAULT_PROJECT_NAME,
        "build_dir": DEFAULT_BUILD_DIR,
        "contabo_base_url": DEFAULT_CONTABO_BASE_URL,
        "deploy_folder": DEFAULT_DEPLOY_FOLDER,
        "deploy_token": None,
    }

    config_path = Path(_env("DEPLOY_CONFIG", LOCAL_CONFIG_FILENAME) or LOCAL_CONFIG_FILENAME)
    if config_path.is_file():
        try:
            file_data = json.loads(config_path.read_text(encoding="utf-8"))
            if isinstance(file_data, dict):
                config.update({k: v for k, v in file_data.items() if v is not None})
        except (OSError, json.JSONDecodeError) as exc:
            print(f"ERROR: Could not read deploy config '{config_path}': {exc}")
            sys.exit(1)

    env_map = {
        "project_name": "DEPLOY_PROJECT_NAME",
        "build_dir": "DEPLOY_BUILD_DIR",
        "contabo_base_url": "DEPLOY_CONTABO_BASE_URL",
        "deploy_folder": "DEPLOY_FOLDER",
        "deploy_token": "DEPLOY_TOKEN",
    }
    for key, env_name in env_map.items():
        if env_name in os.environ:
            config[key] = os.environ[env_name]

    return config


def build_zip(build_path: Path) -> bytes:
    """Zip the contents of build_path into an in-memory archive."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for file in sorted(build_path.rglob("*")):
            if file.is_dir():
                continue
            rel = file.relative_to(build_path)
            parts = rel.parts
            if any(p in (".git", "node_modules", "__pycache__") for p in parts):
                continue
            zf.write(file, str(rel))
            print(f"  + {rel}")
    return buf.getvalue()


def deploy_bundle(build_path: Path, config: dict[str, Any]) -> bool:
    """Zip the build and upload it as a single bundle."""
    project_name = config["project_name"]
    target_folder = config["deploy_folder"] or project_name
    base_url = str(config["contabo_base_url"]).rstrip("/")
    deploy_token = config.get("deploy_token")

    if not deploy_token:
        print("ERROR: DEPLOY_TOKEN is required.")
        print("Set it in the environment or in deploy.local.json (see .env.example / docs/DEPLOY.md).")
        return False

    url = f"{base_url}/api/deploy/{project_name}/bundle"
    headers = {"X-Deploy-Token": deploy_token}

    print("Building zip archive...")
    zip_bytes = build_zip(build_path)
    print(f"Archive size: {len(zip_bytes) / 1024:.1f} KB\n")

    print("Uploading bundle...")
    try:
        response = requests.post(
            url,
            files={"bundle": ("build.zip", zip_bytes, "application/zip")},
            data={"target_folder": target_folder},
            headers=headers,
            timeout=300,
        )
    except Exception as exc:
        print(f"  Upload failed: {exc}")
        return False

    if response.status_code == 200:
        data = response.json()
        print(f"  OK — {data.get('uploaded', 0)} files uploaded")
        if data.get("failed"):
            print("  Failures:")
            for item in data["failed"]:
                path = item.get("path", "<unknown>")
                error = item.get("error", "unknown error")
                print(f"    {path}: {error}")
        return not data.get("failed")

    print(f"  Upload failed with HTTP {response.status_code}")
    return False


def main() -> None:
    config = load_deploy_config()
    project_name = config["project_name"]
    build_dir = config["build_dir"]
    base_url = str(config["contabo_base_url"]).rstrip("/")

    if not config.get("deploy_token"):
        print("ERROR: DEPLOY_TOKEN is required.")
        print("Set it in the environment or in deploy.local.json (see .env.example / docs/DEPLOY.md).")
        sys.exit(1)

    print(f"\n=== Deploying '{project_name}' ===\n")

    build_path = Path(build_dir)
    if not build_path.is_dir():
        print(f"ERROR: Build directory '{build_dir}/' does not exist.")
        print("Run your build first (e.g. `npm run build`).")
        sys.exit(1)

    try:
        health = requests.get(f"{base_url}/api/deploy/health", timeout=10)
        if health.status_code == 200:
            print(f"Deploy service: {health.json().get('status', 'unknown')}")
    except Exception:
        print("Warning: Could not reach deploy service health endpoint (continuing).")

    print()
    success = deploy_bundle(build_path, config)

    print(f"\n=== {'Deployment complete' if success else 'Deployment finished with errors'} ===")
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
