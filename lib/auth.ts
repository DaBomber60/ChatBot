import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');

export function verifyToken(token: string): boolean {
  try {
    jwt.verify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

export function checkAuth(): boolean {
  if (typeof window === 'undefined') return false; // Server-side
  
  const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
  const token = localStorage.getItem('authToken');
  
  if (!isAuthenticated || !token) {
    return false;
  }

  // Optionally verify token client-side
  return true;
}

export function logout(): void {
  if (typeof window === 'undefined') return;
  
  localStorage.removeItem('isAuthenticated');
  localStorage.removeItem('authToken');
  window.location.href = '/login';
}
