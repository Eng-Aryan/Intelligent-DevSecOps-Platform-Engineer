# Intelligent DevSecOps Platform (MERN)

A DevSecOps command center: GitHub, Jenkins, SonarQube, Trivy, Gitleaks, Docker, Prometheus/Grafana and an AI assistant behind one dashboard.
**React + Vite + Tailwind · Node/Express · MongoDB/Mongoose.** No demo data is faked: every number comes from the database, which is filled by the real tools.

## Quick start (Windows)
1. Install **Node.js 18+** and **MongoDB** (or Docker Desktop, then run `start-mongo-docker.bat`).
2. Double-click **`setup.bat`** - installs backend + frontend packages and creates `backend\.env` with random secrets and an admin password (printed on screen).
3. Double-click **`start.bat`** - opens the API (5000) and UI (5173). Sign in as `admin@devsecops.local`.

Linux/macOS: `cd backend && npm i && node scripts/init-env.js && npm run dev`, then `cd frontend && npm i && npm run dev`.
Production: `cd frontend && npm run build`; the API then serves `frontend/dist` itself on port 5000. Put it behind HTTPS.

## Connecting the tools (Integrations page, admin)
| Tool | What to enter |
|---|---|
| GitHub | token as credential; add a repo webhook -> `https://<host>/api/github/webhook`, content type JSON, secret = `GITHUB_WEBHOOK_SECRET` from `.env` |
| Jenkins | URL, username, API token. Link a job on the project (`folder/job`). Stages come from the Pipeline `wfapi` |
| SonarQube | URL, user token; set the Sonar project key on the project |
| Trivy / Gitleaks | run them in the Jenkins pipeline with `--format json`, then **Import JSON** in Security Center (Trivy can also be run on the API host for images) |
| Docker | local socket/named pipe, or `tcp://host:2375` |
| Prometheus / Grafana | base URLs (node_exporter / cAdvisor metrics used by the presets) |
| AI | any OpenAI-compatible endpoint (OpenAI, Ollama `http://localhost:11434/v1`, ...) + `{"model":"..."}` in Extra |

Typical Jenkins step for scan import: `trivy image --format json -o trivy.json $IMAGE` then `curl -H "Authorization: Bearer <platform JWT>" -d @payload ...` or upload manually in the UI.

## Design decisions worth knowing
* **RBAC is enforced in the backend** (`middleware/auth.js`, per-route `requireRole`, and project-membership scoping on every query).
* **Deployment gate** (`services/gates.js`) blocks releases using the latest real SonarQube gate, open CRITICAL Trivy findings and open Gitleaks secrets, per project policy. Production needs approval by a *different* DevOps/Admin user.
* **Findings are only "resolved"** by a later validated scan that no longer contains them, or by an authorised user with a note.
* **Severity**: Trivy's severity is stored verbatim. Gitleaks has none, so the documented policy is *every secret = HIGH*.
* **Secrets**: integration credentials are AES-256-GCM encrypted; Gitleaks values are never stored (masked only); logs/AI prompts/audit metadata are redacted.
* **Audit log** is append-only at the model level (update/delete hooks throw) and has no write API.
* **Webhooks**: HMAC-SHA256 verified on the raw body, duplicates dropped by delivery id.
* **Docker**: the browser never talks to Docker; only the API does, with an id allow-pattern and a protected-container list.
* **AI**: answers are built from build logs/stages/findings only; the system prompt demands "confirmed vs hypothesis" and the assistant never executes anything.

## Not included / honest limitations
Optional MFA, e-mail verification and SMTP e-mail delivery are **not implemented** (password-reset and invite links are shown/printed instead; hook your mail sender into `routes/auth.js`). Gitleaks is import-only. Deployment execution triggers a Jenkins deploy job (`VERSION`, `ENVIRONMENT`, `COMMIT` params) - the final outcome is recorded via the Deployments page or `POST /api/deployments/:id/result`. The integrations were written against the documented APIs but could not be exercised against live Jenkins/SonarQube/GitHub servers here, so run the "Test connection" buttons first. Run `npm test` in `backend` (7 unit tests).
#Intelligent DevSecOps Platfrom Engineer 
