import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';
import bcrypt from 'bcryptjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // Check if password is already set
    const authSetting = await prisma.setting.findUnique({
      where: { key: 'authPassword' }
    });

    return res.status(200).json({ 
      isSetup: !!authSetting?.value 
    });
  }

  if (req.method === 'POST') {
    // Set initial password
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    try {
      // Check if password is already set
      const existingAuth = await prisma.setting.findUnique({
        where: { key: 'authPassword' }
      });

      if (existingAuth?.value) {
        return res.status(400).json({ error: 'Authentication is already configured' });
      }

      // Hash and store the password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      await prisma.setting.create({
        data: {
          key: 'authPassword',
          value: hashedPassword
        }
      });

      res.status(200).json({ 
        success: true, 
        message: 'Initial password set successfully'
      });
    } catch (error) {
      console.error('Setup error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
