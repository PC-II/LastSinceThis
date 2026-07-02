import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC95BG_pnUnGl8vr5KrkNq3vAu_GNzG8dg",
  authDomain: "last-since-this.firebaseapp.com",
  projectId: "last-since-this",
  storageBucket: "last-since-this.firebasestorage.app",
  messagingSenderId: "729878724667",
  appId: "1:729878724667:web:3ad835c6bbad6263de5c1e",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
