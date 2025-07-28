import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const personas = await prisma.persona.findMany();
      return res.status(200).json(personas);
    }

    if (req.method === 'POST') {
      const { name, profileName, profile } = req.body;
      if (!name || !profile) {
        return res.status(400).json({ error: 'Missing name or profile' });
      }
      
      try {
        const persona = await prisma.persona.create({
          data: { 
            name, 
            profile,
            ...(profileName && { profileName })
          },
        });
        return res.status(201).json(persona);
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
          return res.status(400).json({ 
            error: 'A persona with this name and profile name combination already exists' 
          });
        }
        throw error;
      }
    }

    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error: unknown) {
    console.error('Error in /api/personas:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    res.status(500).json({ error: errorMessage });
  }
}
