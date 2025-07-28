import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const groups = await prisma.characterGroup.findMany({
        include: {
          characters: {
            orderBy: { sortOrder: 'asc' }
          }
        },
        orderBy: { sortOrder: 'asc' }
      });
      res.status(200).json(groups);
    } catch (error) {
      console.error('Error fetching character groups:', error);
      res.status(500).json({ error: 'Failed to fetch character groups' });
    }
  } else if (req.method === 'POST') {
    try {
      const { name, color = '#6366f1' } = req.body;
      
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Group name is required' });
      }

      // Get the next sort order
      const lastGroup = await prisma.characterGroup.findFirst({
        orderBy: { sortOrder: 'desc' }
      });
      const sortOrder = (lastGroup?.sortOrder || 0) + 1;

      const group = await prisma.characterGroup.create({
        data: {
          name: name.trim(),
          color,
          sortOrder
        },
        include: {
          characters: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      res.status(201).json(group);
    } catch (error: any) {
      console.error('Error creating character group:', error);
      if (error.code === 'P2002') {
        res.status(400).json({ error: 'A group with this name already exists' });
      } else {
        res.status(500).json({ error: 'Failed to create character group' });
      }
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
