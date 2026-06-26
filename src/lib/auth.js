const AUTH_STORAGE_KEY = 'cardrive-demo-session';

export function isAuthenticated() {
  return window.localStorage.getItem(AUTH_STORAGE_KEY) === 'active';
}

export function startDemoSession() {
  window.localStorage.setItem(AUTH_STORAGE_KEY, 'active');
}

export function endDemoSession() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}
