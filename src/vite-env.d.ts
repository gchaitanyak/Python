/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_FUNCTIONS_REGION?: string;
  readonly VITE_USE_EMULATORS?: string;
  /** Google Analytics 4 measurement id; analytics (and the consent banner) are off without it. */
  readonly VITE_GA_MEASUREMENT_ID?: string;
  /** reCAPTCHA Enterprise site key for App Check; App Check is off without it. */
  readonly VITE_RECAPTCHA_ENTERPRISE_KEY?: string;
  /** App Check debug token for local testing against a real project (never in production builds). */
  readonly VITE_APPCHECK_DEBUG_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
