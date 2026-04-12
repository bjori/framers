---
name: framers-ship-after-changes
description: >-
  After implementing or fixing something in the Greenbrook Framers repo, the
  agent must commit, push to GitHub, and deploy the main Cloudflare worker.
  Use for any substantive code or config work on framers.app when the user
  did not say to leave the tree dirty, skip deploy, or keep changes local only.
---

# Framers: commit, push, deploy

The project owner expects **shipping by default** when work on this repository is done. Treat this as the closing step of a task, not optional polish.

## When to run

- **Do ship:** You changed source, config, or rules under this repo and the user did not ask to hold commits, avoid deploy, or stay WIP-only.
- **Skip or stop early:** `git status` is clean (nothing to commit); the user explicitly said not to commit/push/deploy; or build/deploy failed—in the last case, fix if quick, otherwise report the error and leave the branch state honest.

## Order (always this sequence)

1. **Commit** — Stage only what belongs to the task. One clear commit message (imperative mood, what changed and why).
2. **Push** — Required SSH identity for `bjori/framers`:
   ```bash
   GIT_SSH_COMMAND="ssh -i /Users/hannes.magnusson/.ssh/id_ed25519-private-github -o IdentitiesOnly=yes" git push
   ```
3. **Deploy** — From repo root; do **not** pass `--name` to wrangler:
   ```bash
   npx opennextjs-cloudflare build
   npx wrangler deploy .open-next/worker.js
   ```

4. **Deploy everything (when the user asks)** — After the main worker: **`framers-cron`** is a separate Cloudflare Worker (not in this repo) that hits `/api/cron`; redeploy it from its own project if its script or bindings changed. In-repo: **`email-worker`** → `cd email-worker && npx wrangler deploy` when inbound email routing code changed (and confirm `RESEND_API_KEY` on that worker per `cloudflare-deployment.mdc`).

## Notes

- If the task truly only touched files the user asked never to commit (e.g. they forbade markdown churn), follow the user’s constraint—but otherwise **ship**.
- Same commands and warnings are documented in `.cursor/rules/project-overview.mdc` and `.cursor/rules/cloudflare-deployment.mdc`; keep them in sync if deploy steps change.
- Default ship flow is **main app only**. Cron logic lives in `src/app/api/cron/route.ts` on **`greenbrook-framers`** — deploying the main app updates what `/api/cron` runs. The **`framers-cron`** worker only needs a redeploy when its fetch URL, secrets, or trigger schedule change (rare).

## Handoff

End the turn with a short confirmation: commit hash, that `main` was pushed, and deploy success (or worker version id from wrangler output).
