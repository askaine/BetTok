# TikTok Viral Prediction — Backend

## Project Structure
```
backend/
├── firebase.json              # Firebase project config
├── firestore.rules            # Security rules
├── firestore.indexes.json     # Composite indexes
├── firestore-schema.md        # Data model documentation
└── functions/
    ├── index.js               # All Cloud Functions
    └── package.json
```

## Setup

### 1. Install Firebase CLI
```bash
npm install -g firebase-tools
firebase login
```

### 2. Create Firebase Project
- Go to console.firebase.google.com
- Create new project (free Spark plan is fine to start)
- Enable Firestore, Authentication (Email/Password + Anonymous), Cloud Functions

### 3. Initialize
```bash
firebase init
# Select: Firestore, Functions, Emulators
# Use existing project → select yours
# Functions: JavaScript
# Don't overwrite files (we already have them)
```

### 4. Deploy rules + indexes first
```bash
firebase deploy --only firestore:rules,firestore:indexes
```

### 5. Install function dependencies
```bash
cd functions && npm install
```

### 6. Run locally with emulator (no cost, no API needed)
```bash
firebase emulators:start
```
Emulator UI: http://localhost:4000
Functions endpoint: http://localhost:5001

### 7. Deploy to production
```bash
firebase deploy --only functions
```
Note: Cloud Functions requires Blaze (pay-as-you-go) plan.
Free tier included: 125k invocations/month, 40k GHz-seconds compute.
You won't pay anything meaningful in early testing.

---

## Endpoints

All endpoints are Firebase Callable Functions — call them from the app with:
```js
const functions = getFunctions();
const fn = httpsCallable(functions, 'functionName');
const result = await fn({ ...params });
```

| Function | Trigger | Description |
|---|---|---|
| `ingestVideo` | Callable | Validates + adds a TikTok video to the pool |
| `placeBet` | Callable | Places a YES/NO bet with multiplier |
| `claimDailyBonus` | Callable | Awards 100 Sparks daily |
| `getFeed` | Callable | Paginated active video feed (sanitized) |
| `getTrendingResolved` | Callable | Past resolved videos sorted by bets |
| `createUser` | Auth trigger | Bootstraps user doc on registration |
| `resolveVideos` | Cron (hourly) | Checks and resolves due videos |

---

## TikTok API Status

**Right now:** The `ingestVideo` function uses oEmbed (free, no approval needed) for:
- Embed HTML ✅
- Author name/handle ✅
- Thumbnail ✅
- Title ✅

**Missing until Research API approved:**
- View count ❌ (used for resolution)
- Like count ❌ (used for eligibility criteria)
- Upload timestamp ❌ (used for age check)

**Workaround for development:** The `ingestVideo` endpoint accepts `mockLikes`, `mockViews`, and `mockUploadedAt` fields that the app can send during testing. In the app, show a simple form where the user inputs these manually, or hardcode test values.

**Apply for Research API:** https://developers.tiktok.com/products/research-api/
Takes 1–4 weeks. Apply today so it runs in parallel with your build.

**When approved:** Replace the mock logic in `processResolutionCheck()` with:
```js
const response = await axios.get(
  `https://open.tiktokapis.com/v2/video/query/?fields=view_count`,
  {
    headers: { Authorization: `Bearer ${TIKTOK_ACCESS_TOKEN}` },
    data: { filters: { video_ids: [videoId] } }
  }
);
const currentViews = response.data.data.videos[0].view_count;
```

---

## Anti-Contamination Design Notes

The backend enforces these rules to prevent bet counts from influencing decisions:

1. **Feed endpoint** (`getFeed`) strips `yesBets`, `noBets`, `totalBets` — clients never see real numbers
2. **Noisy range** (`noisyBetRange`) is a deliberately vague string updated server-side with bucket noise
3. **Resolved feed** (`getTrendingResolved`) only shows already-resolved videos — safe to show counts there
4. **Bet history** is private per user via Firestore rules — no social graph possible
5. **Resolution checks** happen server-side on a cron — clients can't trigger or observe them
