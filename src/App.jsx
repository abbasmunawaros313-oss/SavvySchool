// App.jsx
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';

import Navbar from './Components/Navbar';
import Footer from './Components/Footer';
import LoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';
import StudentDetailsPage from './pages/StudentDetailsPage';
import StaffDetailsPage from './pages/StaffDetailsPage ';
import FeeSlipPaage from './pages/FeeSlipPage';
function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Track Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleLogout = async () => {
    await auth.signOut();
    setUser(null);
  };

  if (loading) {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>;
  }

  return (
    <Router>
      {user && <Navbar onLogout={handleLogout} />}
      <Routes>
        <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" />} />
        <Route path="/" element={user ? <DashboardPage /> : <Navigate to="/login" />} />
        <Route path="/students" element={user ? <StudentDetailsPage /> : <Navigate to="/login" />} />
        <Route path="/staff" element={user ? <StaffDetailsPage /> : <Navigate to="/login" />} />
        <Route path="/feeslipgen" element={user ? <FeeSlipPaage /> : <Navigate to="/login" />} />

      </Routes>
      {user && <Footer />}
    </Router>
  );
}

export default App;
