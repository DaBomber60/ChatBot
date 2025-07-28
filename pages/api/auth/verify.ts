import type { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { token } = req.body;

  if (!token) {
    return res.status(401).json({ valid: false, error: 'No token provided' });
  }

  try {
    // Verify the JWT token
    jwt.verify(token, JWT_SECRET);
    res.status(200).json({ valid: true });
  } catch {
    res.status(401).json({ valid: false, error: 'Invalid or expired token' });
  }
}
