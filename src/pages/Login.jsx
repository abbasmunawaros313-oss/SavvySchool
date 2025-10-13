import React, { useState } from 'react';
// Firebase Imports
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

// --- Firebase Configuration ---
// Using the configuration you provided.
const firebaseConfig = {
  apiKey: "AIzaSyC7S0PP0wPQZlupFYT7CBgoFAGXfbvAjik",
  authDomain: "savvyschoolportal.firebaseapp.com",
  projectId: "savvyschoolportal",
  storageBucket: "savvyschoolportal.appspot.com", // Corrected storage bucket URL
  messagingSenderId: "647882587919",
  appId: "1:647882587919:web:1f87256c43cc020113487a",
  measurementId: "G-MKB1F7HHFJ"
};

// --- Initialize Firebase and Authentication ---
// This is done once when the module is loaded.
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);


// --- Login Page Component ---
const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Function to handle the login process
  const handleLogin = async (e) => {
    e.preventDefault(); // Prevent form from reloading the page
    setError('');
    setLoading(true);

    // Basic validation
    if (!email || !password) {
      setError('Please enter both email and password.');
      setLoading(false);
      return;
    }

    try {
      // Attempt to sign in with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      console.log('User signed in successfully:', user.uid);
      // On successful login, you can redirect the user or update the UI
      // For demonstration, we'll just show an alert.
      alert('Login Successful!');

    } catch (error) {
      // Handle different authentication errors
      const errorCode = error.code;
      if (errorCode === 'auth/user-not-found' || errorCode === 'auth/wrong-password' || errorCode === 'auth/invalid-credential') {
        setError('Invalid email or password. Please try again.');
      } else {
        setError('An error occurred. Please try again later.');
        console.error("Firebase Auth Error:", errorCode, error.message);
      }
    } finally {
      // Reset loading state regardless of outcome
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen font-sans bg-gray-100">
      <div className="w-full max-w-md p-8 m-4 space-y-6 bg-white rounded-2xl shadow-xl">
        
        {/* Logo and Welcome Header */}
        <div className="text-center">
          <img
            className="w-auto h-20 mx-auto"
            src="https://savvyschool.edu.pk/wp-content/uploads/2022/05/savvy.png"
            alt="Savvy School Logo"
          />
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">
            Management System
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Savvy School | Quaid-e-Azam Campus
          </p>
        </div>

        {/* Login Form */}
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="space-y-4 rounded-md">
            <div>
              <label htmlFor="email-address" className="sr-only">
                Email address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="relative block w-full px-4 py-3 text-gray-900 placeholder-gray-500 border border-gray-300 rounded-md appearance-none focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="relative block w-full px-4 py-3 text-gray-900 placeholder-gray-500 border border-gray-300 rounded-md appearance-none focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>
          
          {/* Display error message if it exists */}
          {error && (
             <div className="p-3 text-sm font-medium text-red-800 bg-red-100 border border-red-200 rounded-md">
                {error}
             </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="relative flex justify-center w-full px-4 py-3 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md group hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors duration-300"
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
