# Pending patch: CI workflow update

The deploy token used for the security hardening push did not carry the
`workflow` scope, so GitHub blocked the update to
`.github/workflows/verify.yml`. Everything else is already on `main`.

Apply it yourself in under a minute — the new CI adds a security gate that
fails the build if secrets, card capture, or open RLS ever reappear.

## Option A — GitHub web UI (easiest)

1. Open `.github/workflows/verify.yml` on GitHub.
2. Click the pencil icon.
3. Replace the contents with `ci-workflow-verify.yml` from this repo root.
4. Commit to `main`.
5. Delete `ci-workflow-verify.yml` and this file.

## Option B — locally

```bash
git pull
cp ci-workflow-verify.yml .github/workflows/verify.yml
rm ci-workflow-verify.yml APPLY_CI.md
git add -A
git commit -m "Add security gate to CI"
git push
```

Pushing from your own machine works because your GitHub Desktop credentials
have the workflow scope.
