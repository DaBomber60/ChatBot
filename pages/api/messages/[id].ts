import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const messageId = Array.isArray(id) ? parseInt(id[0]!) : parseInt(id as string);

  if (isNaN(messageId)) {
    return res.status(400).json({ error: 'Invalid message ID' });
  }

  if (req.method === 'PUT') {
    // Update a single message's content
    try {
      const { content } = req.body;
      
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'Content is required' });
      }

      const updatedMessage = await prisma.chatMessage.update({
        where: { id: messageId },
        data: { content: content.trim() }
      });

      // Update session's updatedAt timestamp
      await prisma.chatSession.update({
        where: { id: updatedMessage.sessionId },
        data: { updatedAt: new Date() }
      });

      return res.status(200).json(updatedMessage);
    } catch (error) {
      console.error('Error updating message:', error);
      return res.status(500).json({ error: 'Failed to update message' });
    }
  }

  res.setHeader('Allow', ['PUT']);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
