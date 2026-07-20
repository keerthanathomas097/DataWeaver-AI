import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import * as authApi from '../api/authApi';

const AuthContext = createContext(null);

const TOKEN_KEY = 'dw_access_token';
const USER_KEY = 'dw_user';

function readStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(() => readStoredUser());
  const [loading, setLoading] = useState(false);

  const isAuthenticated = Boolean(token);

  const logout = useCallback(() => {
    clearSession();
    setToken(null);
    setUser(null);
  }, []);

  // Background verification on mount/reload to ensure session is valid
  React.useEffect(() => {
    const verifySession = async () => {
      if (token) {
        try {
          const profile = await authApi.getMe();
          setUser(profile);
          persistSession(token, profile);
        } catch (err) {
          // Token has expired, been modified, or is invalid
          logout();
        }
      }
    };
    verifySession();
  }, [token, logout]);

  const login = useCallback(async ({ email, password }) => {
    setLoading(true);
    try {
      const { access_token } = await authApi.login({ email, password });
      
      // Store token locally and in state first so Axios interceptor picks it up for the next call
      localStorage.setItem(TOKEN_KEY, access_token);
      setToken(access_token);

      // Retrieve full user details from FastAPI database
      const userProfile = await authApi.getMe();

      persistSession(access_token, userProfile);
      setUser(userProfile);
      return userProfile;
    } catch (err) {
      clearSession();
      setToken(null);
      setUser(null);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const signup = useCallback(async ({ email, password, full_name }) => {
    setLoading(true);
    try {
      const createdUser = await authApi.signup({ email, password, full_name });
      const { access_token } = await authApi.login({ email, password });
      const sessionUser = {
        id: createdUser.id,
        email: createdUser.email,
        full_name: createdUser.full_name,
      };

      persistSession(access_token, sessionUser);
      setToken(access_token);
      setUser(sessionUser);
      return sessionUser;
    } finally {
      setLoading(false);
    }
  }, []);

 const redirectToGoogle = useCallback(() => {
  window.location.href = 'http://localhost:8000/auth/google/login';
}, []);

const applyGoogleToken = useCallback((access_token) => {
  localStorage.setItem(TOKEN_KEY, access_token);
  setToken(access_token);
  // The existing verifySession useEffect will now automatically
  // fire because `token` changed, fetching the real user via getMe()
}, []);

 const value = useMemo(
  () => ({
    user,
    token,
    loading,
    isAuthenticated,
    login,
    signup,
    logout,
    redirectToGoogle,
    applyGoogleToken,
  }),
  [user, token, loading, isAuthenticated, login, signup, logout, redirectToGoogle, applyGoogleToken]
);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
