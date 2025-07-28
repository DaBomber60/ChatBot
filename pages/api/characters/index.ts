import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('[/api/characters] Incoming body:', req.body);
  if (req.method === 'GET') {
    const characters = await prisma.character.findMany({
      include: {
        group: true
      }
    });
    return res.status(200).json(characters);
  }

  if (req.method === 'POST') {
    const { name, profileName, bio, scenario, personality, firstMessage, exampleDialogue } = req.body;
    const missing: string[] = [];
    if (!name) missing.push('name');
    if (missing.length) {
      console.warn('[/api/characters] Missing required fields:', missing);
      return res.status(400).json({ error: 'Missing required fields', missing });
    }
    
    try {
      const character = await prisma.character.create({
        data: { 
          name, 
          scenario: scenario || '', 
          personality: personality || '', 
          firstMessage: firstMessage || "You didn't enter a first message for this character :(", 
          exampleDialogue: exampleDialogue || '',
          ...(profileName && { profileName }),
          ...(bio && { bio })
        }
      });
      return res.status(201).json(character);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        return res.status(400).json({ 
          error: 'A character with this name and profile name combination already exists' 
        });
      }
      throw error;
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
