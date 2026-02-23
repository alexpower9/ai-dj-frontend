import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Home from './pages/Home';
import Login from './pages/Login';

function AppRoutes() {
  const { isAuthenticated, isGuest, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0118] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const hasAccess = isAuthenticated || isGuest;

  return (
    <Routes>
      <Route path="/login" element={hasAccess ? <Navigate to="/dj" replace /> : <Login />} />
      <Route path="/dj" element={hasAccess ? <Home /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to={hasAccess ? "/dj" : "/login"} replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
