import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const all = await prisma.setting.findMany();
    const result: Record<string, string> = {};
    all.forEach((s: { key: string; value: string }) => { result[s.key] = s.value; });
    return res.status(200).json(result);
  }
  if (req.method === 'POST') {
    const updates: Record<string, unknown> = req.body;
    const upserts = Object.entries(updates).map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) }
      })
    );
    await Promise.all(upserts);
    return res.status(200).json({ success: true });
  }
  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
