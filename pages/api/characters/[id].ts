import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const charId = Number(id);
  if (isNaN(charId)) return res.status(400).json({ error: 'Invalid character ID' });

  if (req.method === 'PUT') {
    const { name, profileName, bio, scenario, personality, firstMessage, exampleDialogue } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    try {
      const updated = await prisma.character.update({
        where: { id: charId },
        data: { 
          name, 
          scenario: scenario || '', 
          personality: personality || '', 
          firstMessage: firstMessage || "You didn't enter a first message for this character :(", 
          exampleDialogue: exampleDialogue || '',
          ...(profileName !== undefined && { profileName }),
          ...(bio !== undefined && { bio })
        }
      });
      return res.status(200).json(updated);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        return res.status(400).json({ 
          error: 'A character with this name and profile name combination already exists' 
        });
      }
      throw error;
    }
  }

  if (req.method === 'DELETE') {
    // delete all chat messages for sessions tied to this character
    await prisma.chatMessage.deleteMany({ where: { session: { characterId: charId } } });
    // delete all chat sessions for this character
    await prisma.chatSession.deleteMany({ where: { characterId: charId } });
    // delete the character itself
    await prisma.character.delete({ where: { id: charId } });
    return res.status(204).end();
  }

  res.setHeader('Allow', ['PUT', 'DELETE']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
