import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const sessionId = parseInt(id as string);

  if (isNaN(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  if (req.method === 'POST') {
    const { summary } = req.body;

    if (typeof summary !== 'string') {
      return res.status(400).json({ error: 'Summary must be a string' });
    }

    try {
      const updatedSession = await prisma.chatSession.update({
        where: { id: sessionId },
        data: { 
          summary,
          updatedAt: new Date()
        },
      });

      return res.status(200).json(updatedSession);
    } catch (error) {
      console.error('Failed to update session summary:', error);
      return res.status(500).json({ error: 'Failed to save summary' });
    }
  }

  res.setHeader('Allow', ['POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
