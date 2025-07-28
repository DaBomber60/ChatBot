import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
  
  const { id } = req.query;
  const sessionId = Array.isArray(id) ? id[0] : id;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'Missing session id' });
  }

  try {
    const result = await prisma.$queryRaw`SELECT lastApiRequest FROM chat_sessions WHERE id = ${parseInt(sessionId)}` as Array<{ lastApiRequest: string | null }>;
    
    if (!result || result.length === 0 || !result[0]?.lastApiRequest) {
      return res.status(404).json({ error: 'Request log not found' });
    }

    // Parse the JSON string back to an object
    const payload = JSON.parse(result[0].lastApiRequest);
    res.status(200).json(payload);
  } catch (error) {
    console.error('Error fetching request log:', error);
    return res.status(500).json({ error: 'Failed to fetch request log' });
  }
}
