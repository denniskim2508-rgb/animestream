import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

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
