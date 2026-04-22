# RT-SC Update Workflow

**How to push improvements to deployed schools.**

This is separate from the 6-step NEW school onboarding recipe
(see DEPLOY-PLAYBOOK.md). This doc is for day-to-day operations
once schools are live.

---

## Decision: what changed?

| What you edited | Deploy type |
|---|---|
| Files in `src/` (components, hooks, libs, types) | **Code** (`--hosting-only`) |
| `index.html`, `public/*`, `vite.config.ts` | **Code** (`--hosting-only`) |
| `package.json` (added/bumped dependencies) | **Code** (`--hosting-only`) |
| `firestore.rules` only | **Rules** (`--rules-only`) |
| Both source code AND rules | **Full** (no flag) |

---

## The 5-step workflow

### Step 1 — Edit locally and commit

```bash
cd ~/RT-SC
# (make your changes)

# Verify the build compiles cleanly
npm run build
```

**If `npm run build` fails → STOP. Fix errors before continuing.**
Deploying a broken build causes production outages.

If build succeeds, commit:

```bash
git add .
git commit -m "fix: describe what changed"
git push
```

Commit message conventions:
- `feat: add X` — new feature
- `fix: Y bug in Z` — bugfix
- `docs: update A` — documentation
- `refactor: restructure B` — code restructuring with no behavior change
- `chore: bump C dependency` — housekeeping
- `style: tweak D visual` — pure CSS/visual tweak

### Step 2 — Deploy to ONE pilot school

Pick a school where a small user impact is acceptable. NLG works
well as pilot. Deploy ONLY to that school first:

```bash
# Code-only changes
./deploy-school.sh schools/schoolconnect-nlg.json --hosting-only

# Rules-only changes
./deploy-school.sh schools/schoolconnect-nlg.json --rules-only

# Both code AND rules
./deploy-school.sh schools/schoolconnect-nlg.json
```

Wait for `✓ Deploy complete!`.

### Step 3 — Verify the pilot

Open in **incognito** on your phone (avoids cache confusion):

```
https://schoolconnect-nlg.web.app
```

Checklist:
- The thing you changed works as expected
- Other features still work (spot-check admin login, bulletin view, etc.)
- No console errors (if you can access DevTools)
- No permission errors if rules changed

### Step 4 — If something broke: rollback

Fast rollback via Firebase (no rebuild needed):

```bash
firebase hosting:rollback --project schoolconnect-nlg
```

Reverts to previous version instantly. Then:
- Fix the bug locally
- Restart from Step 1

### Step 5 — Batch-deploy to remaining schools

Only after pilot verifies cleanly. The loop skips hub + the
already-deployed pilot:

```bash
# For code-only updates
for config in schools/*.json; do
  case "$config" in *schoolconnect-1adfa*) continue ;; esac
  case "$config" in *schoolconnect-nlg*) continue ;; esac
  ./deploy-school.sh "$config" --hosting-only
done

# For rules-only updates
for config in schools/*.json; do
  case "$config" in *schoolconnect-1adfa*) continue ;; esac
  case "$config" in *schoolconnect-nlg*) continue ;; esac
  ./deploy-school.sh "$config" --rules-only
done

# For full updates (hosting + rules)
for config in schools/*.json; do
  case "$config" in *schoolconnect-1adfa*) continue ;; esac
  case "$config" in *schoolconnect-nlg*) continue ;; esac
  ./deploy-school.sh "$config"
done
```

Each school: ~2-3 minutes. If one fails mid-loop (network, quota),
the loop stops. Re-run that specific school manually, then continue
with any remaining.

---

## Tagging milestone releases

After a significant release:

```bash
git tag -a v1.1.0 -m "short description"
git push --tags
```

Rollback to any tag later:

```bash
git checkout v1.1.0 -- .
npm run build
./deploy-school.sh schools/<id>.json
git checkout main
```

---

## Hub deployment

The **hub** (`schoolconnect-1adfa`) serves a different flow (landing
page with code entry). Most RT-SC updates don't affect the hub.

Deploy to hub **separately and intentionally** when:
- You modified the landing page (`src/routes/landing/LandingPage.tsx`)
- You modified the hub CMS (`vendor-app/src/screens/HubCommandCenter.tsx`)
- You changed `firestore.rules` (hub shares same rules)
- You updated shared branding (logo, fonts, colors)

```bash
./deploy-school.sh schools/schoolconnect-1adfa.json --hosting-only
# or --rules-only, or full
```

---

## Dry run — preview without changes

Add `--dry-run` to any deploy command:

```bash
./deploy-school.sh schools/schoolconnect-nlg.json --dry-run
```

Shows what would happen without actually running the build or push.

---

## User experience during a deploy

- **Zero downtime** — Firebase atomic-swaps hosting versions
- **Old version served** to users currently browsing
- **New version on next refresh** — because `index.html` is `no-cache`
- **Active sessions persist** — no forced logout
- **PWA users** get the update on next app open
- **Offline users** unchanged until they reconnect

---

## Quick reference card

| Scenario | Command |
|---|---|
| New school onboarding (first time) | 6-step recipe in DEPLOY-PLAYBOOK.md |
| Code bugfix / feature | Pilot NLG `--hosting-only` → batch loop |
| Rules change | Pilot NLG `--rules-only` → batch loop |
| Both changed | Pilot NLG no-flag → batch loop |
| Major release | Tag with `git tag v1.X.0` + push tags |
| Production bug, need rollback | `firebase hosting:rollback --project <id>` |
| Preview deploy plan | Add `--dry-run` to any command |

---

## Common failure modes

### "Build failed" during pilot or batch
- TypeScript errors surfaced
- Missing dependency
- Fix locally, `npm run build`, re-deploy

### "Missing or insufficient permissions" after rules deploy
- Rules broke an existing flow
- **Rollback the rules via Firebase Console** (Firestore → Rules → History)
- Fix and redeploy

### Deploy hangs mid-way
- Network timeout
- Firebase CLI session expired (`firebase login --reauth`)
- Phone went to sleep (use `termux-wake-lock` before long runs)

### One school in batch fails but others succeed
- Loop stops on failure
- Failing school still has previous version (safe)
- Re-run just that school: `./deploy-school.sh schools/<failing>.json --hosting-only`
- Then batch the rest manually

---

## Before every batch deploy

Mental checklist:

- ✅ I ran `npm run build` and it succeeded
- ✅ I committed and pushed to git
- ✅ I deployed to pilot school first
- ✅ I verified the pilot in incognito
- ✅ No critical flow is broken on pilot
- ✅ Schools are not in the middle of a critical period (no exam week, no report-card day, etc.)

If all 6 are ✅ → batch deploy.

If any is ❌ → pause, fix, re-verify.
