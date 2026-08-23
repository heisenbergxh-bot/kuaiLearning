export function loginUrl(): string {
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `/api/v1/auth/login?return_to=${encodeURIComponent(returnTo)}`;
}

export function redirectToLogin(): void {
  window.location.replace(loginUrl());
}
