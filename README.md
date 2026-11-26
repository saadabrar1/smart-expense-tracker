# Smart Expense Tracker (Pakistan-first)

Reads bank and wallet alerts (Android notifications and forwarded emails), sorts spending into categories, and warns users:
*"You spend Rs 2,400/day. At this pace your balance runs out on 18 Dec, before payday."*

## Layout
```
packages/engine   parser → categoriser → forecast (pure TypeScript, no deps; Node ≥ 23.6)
apps/mobile       Expo / React Native app: Gmail on-device sync (done), notification capture (next)
apps/web          (after gates pass) Next.js dashboard
services/api      (after gates pass) API + inbound-email webhook
```

```
npm install                      # at the repo root (npm workspaces)
npm test                         # engine + mobile tests
cd apps/mobile && npx tsc --noEmit
```
Gmail connection setup (Google Cloud, SHA-1, development build): [apps/mobile/GMAIL_SETUP.md](apps/mobile/GMAIL_SETUP.md)

## Phase 0: check these gates before building more
- [ ] **G1 Gmail:** submit OAuth verification (gmail.readonly); get a CASA Tier 2 quote from TAC Security; ask Google in writing whether reading Gmail on-device only is exempt from CASA. *Fallback: email forwarding only.*
- [ ] **G2 Notifications:** prototype `NotificationListenerService` on Android 14/15/16. Check that alerts from HBL, Meezan, UBL, Alfalah, MCB, JazzCash, Easypaisa, SadaPay, NayaPay and Raast arrive readable (Android 15+ hides OTP-like content).
- [ ] **G3 Play Store:** upload the prototype to internal/closed testing with notification access and a privacy declaration.
- [ ] **G4 Email alerts:** list which banks send email alerts vs SMS only.
- [ ] **G5 Demand:** landing page and waitlist, plus 20 interviews ("would you pay Rs 300/month?").
- [ ] Collect about 200 **anonymised real alerts** → `packages/engine/test/fixtures/` → write a sender template for each format.

## Engine notes
- Test fixtures are currently **synthetic**. Real bank formats must come from collected samples, not guesses.
- Messages with low `confidence` or `ignored: failed` should go to an LLM fallback (planned). Turn each result into a new `Template`.
- When a user corrects a category, call `learnRule` (it becomes a user rule for that merchant).
