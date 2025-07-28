import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    try {
      const { sessionId, role, content } = req.body;
      
      if (!sessionId || !role || !content) {
        return res.status(400).json({ error: 'sessionId, role, and content are required' });
      }

      if (!['user', 'assistant'].includes(role)) {
        return res.status(400).json({ error: 'role must be either "user" or "assistant"' });
      }

      const message = await prisma.chatMessage.create({
        data: {
          sessionId: parseInt(sessionId),
          role,
          content: content.trim()
        }
      });

      // Update session's updatedAt timestamp
      await prisma.chatSession.update({
        where: { id: parseInt(sessionId) },
        data: { updatedAt: new Date() }
      });

      return res.status(201).json(message);
    } catch (error) {
      console.error('Error creating message:', error);
      return res.status(500).json({ error: 'Failed to create message' });
    }
  }

  res.setHeader('Allow', ['POST']);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
