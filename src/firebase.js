// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore"; // 👈 import Firestore

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyC7S0PP0wPQZlupFYT7CBgoFAGXfbvAjik",
  authDomain: "savvyschoolportal.firebaseapp.com",
  projectId: "savvyschoolportal",
  storageBucket: "savvyschoolportal.appspot.com",
  messagingSenderId: "647882587919",
  appId: "1:647882587919:web:1f87256c43cc020113487a",
  measurementId: "G-MKB1F7HHFJ"
};

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);

// --- Initialize Services ---
const auth = getAuth(app);
const db = getFirestore(app); // 👈 create Firestore instance

// ✅ Export both so they can be imported anywhere
export { auth, db };
