# Firebase setup for Momentum

Follow these steps once. They take about 15 minutes. You need a Google account, Node.js 22, and an Anthropic API key from https://console.anthropic.com (the AI features use Claude).

## 1. Create the Firebase project

1. Go to https://console.firebase.google.com and click **Create a project**. Name it (for example `momentum`). Google Analytics is optional.
2. Write down the **Project ID** shown under the name, for example `momentum-1a2b3`. You use it below as `<PROJECT_ID>`.

## 2. Upgrade to the Blaze plan (required)

Cloud Functions, and the outbound calls they make to the Claude API, need the pay-as-you-go **Blaze** plan. New Storage buckets need it too.
Click the **Spark** label at the bottom left, then **Upgrade**, and attach a billing account. Personal use stays within the free quotas. Setting a budget alert (for example $5) under *Usage and billing* is a good idea.

## 3. Turn on Authentication

**Build → Authentication → Get started → Sign-in method**, then enable both of these:
- **Anonymous**: the app signs you in silently on first launch.
- **Email/Password**: used by "Secure your account" in Profile, which links your anonymous data to an email login.

## 4. Create the Firestore database

**Build → Firestore Database → Create database**. Choose **Production mode** and pick a location near you (for example `nam5` or `eur3`). The rules are deployed from this repo in step 8.

## 5. Create Storage

**Build → Storage → Get started**. Choose **Production mode** and the same location. The rules are deployed in step 8.

## 6. Register the app and fill in `.env`

1. Open **Project settings (gear icon) → General → Your apps** and click the **Web** icon (`</>`). Name it `momentum-app`. You do not need Firebase Hosting.
2. Copy the values from the `firebaseConfig` snippet into `momentum-app/.env`. Start from `.env.example`:

```bash
cd momentum-app
cp .env.example .env
```

```
EXPO_PUBLIC_FIREBASE_API_KEY=AIza...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=<PROJECT_ID>.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=<PROJECT_ID>
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=<PROJECT_ID>.firebasestorage.app
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1234567890
EXPO_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:abc123
```

The app uses the Firebase JS SDK, so the **Web** config is the right one for Android and iOS too. You do not need `google-services.json`. These values are not secrets. The Anthropic key never goes in `.env`.

## 7. Install the CLI and link this folder

```bash
npm i -g firebase-tools
firebase login
cd momentum-app
firebase use <PROJECT_ID>        # or edit .firebaserc and replace YOUR_FIREBASE_PROJECT_ID
```

## 8. Store the Claude API key and deploy

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
# paste your sk-ant-... key when prompted

cd functions && npm install && cd ..
firebase deploy --only functions,firestore,storage
```

The first deploy can take 3 to 5 minutes, because it enables Cloud Build, Artifact Registry and Secret Manager. If it fails with "API not enabled yet", wait one minute and run the same command again.
The deploy creates the callable function **`analyze`** in `us-central1`. It uses the model `claude-opus-5-5`, requires sign-in, and allows each user 60 AI calls per hour.

Optional check, a real Claude call from your machine without deploying:
```bash
cd functions && npm run build
ANTHROPIC_API_KEY=sk-ant-... node scripts/smoke.mjs path/to/health-screenshot.png path/to/food.jpg
```

## 9. Run the app

### Quick test in Expo Go (everything except Health Connect)
```bash
cd momentum-app
npm install
npx expo start
```
Scan the QR code with **Expo Go** on your phone. Photos, Storage uploads, the AI features (food photo and text, workout photo, health screenshot), CSV import and export, and sync all work in Expo Go. The direct Samsung Health / Health Connect sync shows "needs the Android build".

### Android development build (adds Samsung Health via Health Connect)
On your phone, install **Health Connect** (built into Android 14+). In **Samsung Health → Settings → Health Connect**, allow Samsung Health to share steps, activity, exercise and calories.

Choose one of these:
- **Local build**, which needs Android Studio and USB debugging: `npx expo run:android`
- **Cloud build with EAS**, which needs no Android Studio:
  ```bash
  npm i -g eas-cli
  eas login
  eas build -p android --profile development    # installable dev-client APK
  ```
  Install the APK from the link EAS gives you, then run `npx expo start --dev-client` and open the project in the dev build.
  Use `--profile preview` to get a standalone APK you can share without the dev server.

For EAS cloud builds, the `EXPO_PUBLIC_*` values must be available during the build. Either commit nothing and add them with `eas env:create` (environment *development* / *preview*), or keep `.env` locally, because EAS uploads the project files it can see, and `.env` must not be in `.easignore`.

## Local emulators (optional)

```bash
cd functions && npm run build && cd ..
echo "ANTHROPIC_API_KEY=sk-ant-..." > functions/.secret.local
firebase emulators:start
```
This starts Auth (9099), Firestore (8080), Storage (9199), Functions (5001) and the UI at http://localhost:4000.

## Troubleshooting

| Symptom | Fix |
|---|---|
| AI says "AI is not configured on the server" | The secret is missing or wrong. Run `firebase functions:secrets:set ANTHROPIC_API_KEY` again, then `firebase deploy --only functions`. |
| AI says "used AI 60 times this hour" | This is the per-user limit. Change `AI_CALLS_PER_HOUR` in `functions/src/rateLimit.ts` and redeploy. |
| `permission-denied` on save | Check that you deployed the rules (step 8) and that Anonymous sign-in is enabled (step 3). |
| Function call returns `unauthenticated` / 401 from Cloud Run | Some Google Workspace orgs block public invokers. In Cloud Run → `analyze` → Security, allow unauthenticated invocations. The function still checks Firebase Auth itself. |
| See logs, token usage and errors | Run `firebase functions:log --only analyze`. |
