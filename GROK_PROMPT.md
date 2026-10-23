# Prompt for Grok

Copy everything below the line into Grok and attach `tab-wraith-repo.zip`.

---

You're helping me publish my hackathon project, **Tab Wraith**, a finished Chrome extension (Manifest V3).
It's already built and tested (57/57 end-to-end checks passing). The Hackyard deadline is **Friday Oct 23, 18:00 UTC**,
so speed matters. Don't redesign or rewrite features. Your job is to get it into a clean public GitHub repo,
verify it, and give me a submission-ready link.

**What's in the attached zip (`tab-wraith-repo/`):**
- `extension/` — the extension itself (manifest.json, sw.js, content.js, popup/graveyard/options pages, util.js, ui.css, icons/)
- `tests/e2e.js` + `tests/fixtures/` — Playwright end-to-end tests (`npm test`)
- `scripts/package.sh` — builds `dist/tab-wraith-v1.0.0.zip` (`npm run package`)
- `.github/workflows/ci.yml` — runs tests and uploads the zip on every push
- `README.md`, `LICENSE` (MIT), `.gitignore`, `package.json`, `docs/` (guide, demo script, screenshots)

**Do this, in order:**
1. Unzip and keep the folder structure exactly as-is. Don't rename files or change code.
2. Create a new **public** GitHub repo named `tab-wraith` under my account (description:
   "Your abandoned tabs don't close, they die. A Chrome extension that haunts forgotten tabs.").
   Add topics: `chrome-extension`, `manifest-v3`, `hackathon`, `hackyard`, `productivity`, `halloween`.
3. Initialize git, commit everything with the message `Tab Wraith v1.0.0 — Hackyard submission`, and push to `main`.
4. Run locally before or right after pushing:
   ```
   npm install
   npx playwright install chromium
   npm test
   npm run package
   ```
   Confirm the output ends with `57/57 checks passed` and that `dist/tab-wraith-v1.0.0.zip` exists.
5. Check that the GitHub Actions **CI** run passes. If it fails, show me the exact error and propose
   the smallest fix. Only change test or CI config, never extension behavior, without asking me first.
6. Create a GitHub **Release** tagged `v1.0.0` titled "Tab Wraith v1.0.0" and attach `dist/tab-wraith-v1.0.0.zip`.
   Release notes: the pitch line, the 30-second install steps from the README, and the feature list.
7. Confirm the README renders correctly on GitHub, including both screenshots in `docs/`.

**Rules:**
- Never commit API keys, `.env` files, `node_modules/`, or `dist/` (they're already in `.gitignore`).
- If you can't do a step directly (for example, you can't access my GitHub), give me the exact
  copy-paste terminal commands for macOS instead, using `gh` (GitHub CLI) where possible.
- Keep replies short. Tell me which steps are done and which need me.

**When you're done, give me:**
1. The repo URL
2. The release URL with the zip download link
3. The CI status (pass/fail)
4. A 2-sentence project description I can paste into the Hackyard submission form
