import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const sessions = await prisma.chatSession.findMany({
        include: {
          persona: true,
          character: true,
          _count: {
            select: { messages: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      
      // Shape the response to include needed fields including summary, description and message count
      const shapedSessions = sessions.map(session => ({
        id: session.id,
        personaId: session.personaId,
        characterId: session.characterId,
        updatedAt: session.updatedAt,
        summary: session.summary,
        description: session.description,
        messageCount: session._count.messages,
        persona: {
          id: session.persona.id,
          name: session.persona.name,
          profileName: session.persona.profileName
        },
        character: {
          id: session.character.id,
          name: session.character.name,
          profileName: session.character.profileName
        }
      }));
      
      return res.status(200).json(shapedSessions);
    }
    if (req.method === 'POST') {
      const { personaId, characterId } = req.body;
      if (!personaId || !characterId) {
        return res.status(400).json({ error: 'Missing personaId or characterId' });
      }
      // create session
      const session = await prisma.chatSession.create({ data: { personaId, characterId } });
      // seed first assistant message
      const persona = await prisma.persona.findUnique({ where: { id: personaId } });
      const character = await prisma.character.findUnique({ where: { id: characterId } });
      if (persona && character) {
        const content = character.firstMessage
          .replace(/{{user}}/g, persona.name)
          .replace(/{{char}}/g, character.name);
        await prisma.chatMessage.create({ data: { sessionId: session.id, role: 'assistant', content } });
      }
      return res.status(201).json(session);
    }
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error: unknown) {
    console.error('Sessions API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    res.status(500).json({ error: errorMessage });
  }
}
