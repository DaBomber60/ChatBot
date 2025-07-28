import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const sessionId = parseInt(id as string, 10);

  if (isNaN(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  try {
    if (req.method === 'GET') {
      // Get notes for the session
      const session = await prisma.chatSession.findUnique({
        where: { id: sessionId }
      });

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      return res.status(200).json({ notes: (session as any).notes || '' });
    }

    if (req.method === 'POST') {
      // Save notes for the session
      const { notes } = req.body;

      if (typeof notes !== 'string') {
        return res.status(400).json({ error: 'Notes must be a string' });
      }

      // Verify session exists
      const session = await prisma.chatSession.findUnique({
        where: { id: sessionId }
      });

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Update session with notes
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { notes } as any
      });

      return res.status(200).json({ success: true });
    }

    // Method not allowed
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Notes API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
