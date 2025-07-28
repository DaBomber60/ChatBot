import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }
  
  const sessionId = parseInt(id, 10);
  
  if (isNaN(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID format' });
  }

  if (req.method === 'GET') {
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        persona: true,
        character: true,
        messages: { 
          orderBy: { createdAt: 'asc' },
          include: {
            versions: {
              orderBy: { version: 'asc' }
            }
          }
        }
      }
    });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    return res.status(200).json(session);
  }

  if (req.method === 'PUT') {
    const { messages } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages data' });
    }

    // Delete existing messages and recreate them with the new content
    // This is a simple approach - in production you might want to be more granular
    await prisma.chatMessage.deleteMany({ where: { sessionId } });
    
    // Recreate messages in order
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      await prisma.chatMessage.create({
        data: {
          sessionId: sessionId,
          role: message.role,
          content: message.content,
          createdAt: new Date(Date.now() + i) // Ensure proper ordering
        }
      });
    }

    // Update session's updatedAt timestamp
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() }
    });

    return res.status(200).json({ success: true });
  }

  if (req.method === 'PATCH') {
    const { description } = req.body;
    
    try {
      const updatedSession = await prisma.chatSession.update({
        where: { id: sessionId },
        data: { 
          description: description,
          updatedAt: new Date()
        }
      });

      return res.status(200).json(updatedSession);
    } catch (error) {
      console.error('Error updating session description:', error);
      return res.status(500).json({ error: 'Failed to update description' });
    }
  }

  if (req.method === 'DELETE') {
    // remove related messages first to satisfy FK constraints
    await prisma.chatMessage.deleteMany({ where: { sessionId } });
    await prisma.chatSession.delete({ where: { id: sessionId } });
    return res.status(204).end();
  }

  res.setHeader('Allow', ['GET', 'PUT', 'PATCH', 'DELETE']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
