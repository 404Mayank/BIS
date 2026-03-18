/**
 * Auth service — JWT token management and API helpers.
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';
const TOKEN_KEY = 'bis_token';
const USER_KEY = 'bis_user';
const EXPIRES_KEY = 'bis_expires';
const REMEMBER_KEY = 'bis_remember';

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'user' | 'guest';
  approved: boolean;
  session_minutes?: number;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// --- Storage helpers (sessionStorage vs localStorage based on remember me) ---

function getStore(): Storage {
  return localStorage.getItem(REMEMBER_KEY) === '1' ? localStorage : sessionStorage;
}

function setAllStores(key: string, value: string) {
  // Always write to the active store
  getStore().setItem(key, value);
}

// --- Token management ---

export function getToken(): string | null {
  // Check session expiry
  const expires = getStore().getItem(EXPIRES_KEY);
  if (expires && expires !== '0' && Date.now() > parseInt(expires)) {
    logout();
    return null;
  }
  return getStore().getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function getUser(): User | null {
  const raw = getStore().getItem(USER_KEY) || localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getSessionExpiry(): number | null {
  const expires = getStore().getItem(EXPIRES_KEY) || localStorage.getItem(EXPIRES_KEY) || sessionStorage.getItem(EXPIRES_KEY);
  return expires ? parseInt(expires) : null;
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export function isAdmin(): boolean {
  const user = getUser();
  return user?.role === 'admin';
}

export function isGuest(): boolean {
  const user = getUser();
  return user?.role === 'guest';
}

function saveAuth(data: AuthResponse, remember: boolean = false) {
  const store = remember ? localStorage : sessionStorage;

  if (remember) {
    localStorage.setItem(REMEMBER_KEY, '1');
  } else {
    localStorage.removeItem(REMEMBER_KEY);
  }

  store.setItem(TOKEN_KEY, data.token);
  store.setItem(USER_KEY, JSON.stringify(data.user));

  // Calculate expiry from session_minutes (0 = infinite)
  const sessionMin = data.user.session_minutes;
  if (sessionMin && sessionMin > 0) {
    const expiresAt = Date.now() + sessionMin * 60 * 1000;
    store.setItem(EXPIRES_KEY, String(expiresAt));
  } else {
    store.setItem(EXPIRES_KEY, '0');  // 0 = infinite, no expiry
  }
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(EXPIRES_KEY);
  localStorage.removeItem(REMEMBER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(EXPIRES_KEY);
}

// --- API helpers ---

export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    logout();
    window.location.hash = '#/login';
    throw new Error('Session expired');
  }

  return res;
}

// --- Auth actions ---

export async function login(username: string, password: string, remember: boolean = false): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || 'Login failed');
  }

  const data: AuthResponse = await res.json();
  saveAuth(data, remember);
  return data;
}

export async function register(username: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || 'Registration failed');
  }

  const data: AuthResponse = await res.json();
  saveAuth(data, false);
  return data;
}

export async function guestLogin(): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/api/auth/guest`, { method: 'POST' });
  if (!res.ok) throw new Error('Guest access unavailable');
  const data: AuthResponse = await res.json();
  saveAuth(data, false);
  return data;
}

export function getWsUrl(path: string): string {
  const token = getToken();
  return `${WS_URL}${path}?token=${token}`;
}
