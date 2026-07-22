# Deployment

Production builds are uploaded with `deploy.py`, which zips `dist/` and sends it to the Contabo deploy service. SFTP credentials stay on the server; your machine only needs a deploy API token.

## Prerequisites

- `npm run build` (output in `dist/`)
- Python 3 with `requests` (`pip install requests`)
- A deploy token issued for this project on the storage manager

## Configure credentials (pick one)

### Option A — environment variables

```bash
cp .env.example .env
# Edit .env and set DEPLOY_TOKEN
set -a && source .env && set +a
python3 deploy.py
```

### Option B — local JSON file (gitignored)

```bash
cp deploy.local.json.example deploy.local.json
# Edit deploy.local.json and set deploy_token
python3 deploy.py
```

Environment variables override values from `deploy.local.json`.

| Variable | Default | Description |
|----------|---------|-------------|
| `DEPLOY_TOKEN` | *(required)* | API token for the bundle upload endpoint |
| `DEPLOY_PROJECT_NAME` | `cave-crystals` | Project slug on the deploy service |
| `DEPLOY_BUILD_DIR` | `dist` | Local build directory to zip |
| `DEPLOY_CONTABO_BASE_URL` | `https://storage.noahcohn.com` | Deploy service base URL |
| `DEPLOY_FOLDER` | *(empty → project name)* | Remote folder override |
| `DEPLOY_CONFIG` | `deploy.local.json` | Path to optional JSON config |

**Do not** print or commit tokens. Logs from `deploy.py` never echo secret values.

## Git remote authentication

Use a credential-free remote URL:

```bash
git remote set-url origin https://github.com/ford442/cave_crystals.git
# or
git remote set-url origin git@github.com:ford442/cave_crystals.git
```

Authenticate with your system credential manager, `gh auth login`, or SSH keys — not an embedded token in the remote URL.

## Full deploy flow

```bash
npm run build
python3 deploy.py
```

Exit code `0` means the bundle was accepted and extracted without per-file failures.

## Rotating exposed credentials

If a deploy token or legacy SFTP password was ever committed to git, treat it as compromised even after removal from the current tree — it remains in git history.

1. **Deploy API token** — issue a new token on the storage manager / VPS and revoke the old one. Update your local `.env` or `deploy.local.json` only; never commit the new value.
2. **Legacy SFTP password** (old `deploy_old.py` flow) — change the password on the hosting account if that script was ever used in production.
3. **Git history** — removing secrets from current files does not erase past commits. For a public or widely cloned repo, consider `git filter-repo` or GitHub secret scanning remediation after rotation.

After rotation, verify with `npm run build && python3 deploy.py` using the new token.
