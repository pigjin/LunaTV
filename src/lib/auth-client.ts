export const TOKEN_KEY = 'token';

export function getToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem(TOKEN_KEY);
}

export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getToken();
  const headers = new Headers(options.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(url, {
    ...options,
    headers,
  });
}
