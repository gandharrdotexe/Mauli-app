# Hackathon Mobile App

Expo React Native app configured for JavaScript + JSX (no TypeScript), ready for rapid hackathon iteration.

<p align="center">
  <img src="assets/mauli-readme.png" alt="MAULI app splash screen" width="300"/>
</p>

## Run the app

1. Install dependencies:

```bash
npm install
```

2. Start Expo:

```bash
npm run start
```

3. Run on a platform:

```bash
npm run android
npm run ios
npm run web
```

## Folder structure

- `App.jsx`: App entry rendering the main navigator.
- `assets/images`: Image assets for app content.
- `assets/icons`: Icon assets used by app screens/components.
- `src/components`: Reusable UI building blocks.
- `src/screens`: Screen-level containers.
- `src/navigation`: Navigation stacks and route setup.
- `src/services`: API and integration clients.
- `src/hooks`: Reusable custom React hooks.
- `src/context`: React context providers/state containers.
- `src/utils`: General helper utilities.
- `constants`: Shared constants (colors, theme tokens, etc.).

## Where user data lives

- Logged-in user state is stored in `AsyncStorage` under the `auth_state` key.
- `src/context/AuthContext.jsx` loads that snapshot on app start and exposes `user`, `token`, `role`, `signIn`, and `signOut`.
- The patient demo data is stored in `src/data/users.json` and is read through `src/services/api.js`.
- Screens such as `PatientProfilePage.jsx`, `PatientDashboardMock.jsx`, and `VapiCallScreen.jsx` use the auth context first, then fall back to the frontend mock profile data.

## Voice agent setup

Set these Expo public env vars in `.env`:

- `EXPO_PUBLIC_VAPI_API_KEY`
- `EXPO_PUBLIC_VAPI_AGENT_ID`
- `EXPO_PUBLIC_VAPI_CALL_URL`
- `EXPO_PUBLIC_VAPI_PHONE_NUMBER_ID`
- `EXPO_PUBLIC_GROQ_API_KEY`
- `EXPO_PUBLIC_DEEPGRAM_API_KEY`

`EXPO_PUBLIC_VAPI_WEB_CALL_URL` is no longer required for the main call flow.

The Vapi call screen now starts the voice session directly from the app UI. It injects the active user summary and full system prompt into the call at launch, so the assistant can adapt to the current patient context without a hosted web-call page.

Note: direct calling uses the native Vapi SDK, so it needs a custom Expo native build or bare React Native build. It will not run inside Expo Go.
