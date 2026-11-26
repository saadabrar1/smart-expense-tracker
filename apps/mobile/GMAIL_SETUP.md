# Gmail connection setup (on-device, read-only)

The app reads Gmail **on the phone** with the read-only Gmail permission (`gmail.readonly`). It searches only for bank and wallet alert emails and keeps only the parsed amount, merchant, date and category. No email content and no Google token are ever sent to our server.

## 1. Google Cloud project (once)
1. Go to https://console.cloud.google.com and create the project **Smart Expense**.
2. **APIs & Services → Library**: enable **Gmail API**.
3. **Google Auth Platform → Branding**: set the app name, support email and logo, and add links to the privacy policy and terms (both required for verification).
4. **Data Access → Add scopes**: `https://www.googleapis.com/auth/gmail.readonly`.
5. **Audience**: keep it **Testing** for now and add your own Gmail plus beta testers as **test users** (100 maximum, lifetime cap).
6. **Clients → Create client → Android**:
   - Package name: `pk.smartexpense.app` (from `app.json`)
   - SHA-1: the signing key of the build you install (see step 2). Debug, EAS and Play builds each have their own SHA-1. Add a client for each.

No web client ID or `google-services.json` is needed: we never request server-side ("offline") access.

## 2. Build and run (no Android Studio needed)
Google sign-in uses native code, so it **does not work in Expo Go**. You need a development build:

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --profile development --platform android   # cloud build → install the APK
npx eas-cli@latest credentials -p android                           # shows the SHA-1 for step 1.6
npx expo start --dev-client
```
If Android Studio is installed: `npx expo run:android` (debug SHA-1: `cd android && ./gradlew signingReport`).

`DEVELOPER_ERROR` at sign-in almost always means the package name or SHA-1 doesn't match the Android client in step 1.6.

## 3. How sync works
- **First connect:** imports the last 90 days of alert emails (at most 500 per pass, up to 3 passes).
- **After that:** only alerts newer than the last sync (`after:<time>` in the Gmail search), every ≥15 min in the background, on app open, or with the Sync button.
- **Search filter:** `src/gmail/query.ts`. Fill `KNOWN_SENDERS` with real bank alert addresses once samples are collected (gate G4); until then a keyword filter is used.
- Alerts that couldn't be parsed are recorded (id, sender and subject only) for an opt-in "help us support this bank" flow. Their bodies are never uploaded automatically.

## 4. Before going public (more than 100 users)
- Submit for **OAuth verification**: privacy policy, a demo video showing the Gmail consent and how the data is used, and a justification for `gmail.readonly`.
- Ask Google's review team **in writing** whether on-device-only processing is exempt from the CASA security assessment. If it isn't, budget for a CASA Tier 2 assessment (≈$540–720/yr, reported) before launch.
- Keep to Google's Limited Use rules: no ads, no selling data, no training general AI models on Gmail data, and no humans reading emails except with explicit consent or for security.
- Do **not** send Gmail-sourced text to an LLM or the server for parsing: that would break the on-device model.
