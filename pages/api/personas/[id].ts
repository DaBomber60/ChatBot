import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const personaId = Number(id);
  if (isNaN(personaId)) return res.status(400).json({ error: 'Invalid persona ID' });

  if (req.method === 'PUT') {
    const { name, profileName, profile } = req.body;
    if (!name || !profile) {
      return res.status(400).json({ error: 'Missing name or profile' });
    }
    
    try {
      const updated = await prisma.persona.update({
        where: { id: personaId },
        data: { 
          name, 
          profile,
          ...(profileName !== undefined && { profileName })
        }
      });
      return res.status(200).json(updated);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        return res.status(400).json({ 
          error: 'A persona with this name and profile name combination already exists' 
        });
      }
      throw error;
    }
  }

  if (req.method === 'DELETE') {
    // Delete all chat messages for sessions tied to this persona
    await prisma.chatMessage.deleteMany({ where: { session: { personaId } } });
    // Delete all chat sessions for this persona
    await prisma.chatSession.deleteMany({ where: { personaId } });
    // Delete the persona itself
    await prisma.persona.delete({ where: { id: personaId } });
    return res.status(204).end();
  }

  res.setHeader('Allow', ['PUT', 'DELETE']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
