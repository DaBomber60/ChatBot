import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      // If the Prisma client does not know about userPrompt, return empty list
      if (!('userPrompt' in prisma)) {
        return res.status(200).json([]);
      }
      const prompts = await prisma.userPrompt.findMany({ orderBy: { createdAt: 'desc' } });
      return res.status(200).json(prompts);
    }
    if (req.method === 'POST') {
      if (!('userPrompt' in prisma)) {
        return res.status(400).json({ error: 'UserPrompt model not available.' });
      }
      const { title, body } = req.body;
      if (!title || !body) {
        return res.status(400).json({ error: 'Missing title or body' });
      }
      const prompt = await prisma.userPrompt.create({ data: { title, body } });
      return res.status(201).json(prompt);
    }
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error: unknown) {
    console.error('User-prompts API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return res.status(500).json({ error: errorMessage });
  }
}
