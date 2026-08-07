import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'

const firebaseConfig = {
  apiKey: 'AIzaSyDWQ8cSK2nUeVs4j6_xRpBMl4kbUDRN2bI',
  authDomain: 'kaisen-x-anime.firebaseapp.com',
  projectId: 'kaisen-x-anime',
  storageBucket: 'kaisen-x-anime.firebasestorage.app',
  messagingSenderId: '840097496694',
  appId: '1:840097496694:web:56daf74eaeecbb8949a957',
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)

// Firebase App Check is enabled only when a reCAPTCHA v3 site key is present
// (VITE_RECAPTCHA_SITE_KEY). It hardens account creation and data access
// against bots. Firestore/Storage enforcement must also be switched on in the
// Firebase console (Security → App Check) for tokens to be enforced.
if (import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  })
}
