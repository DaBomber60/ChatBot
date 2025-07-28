import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const groupId = parseInt(id as string);

  if (isNaN(groupId)) {
    return res.status(400).json({ error: 'Invalid group ID' });
  }

  if (req.method === 'GET') {
    try {
      const group = await prisma.characterGroup.findUnique({
        where: { id: groupId },
        include: {
          characters: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }

      res.status(200).json(group);
    } catch (error) {
      console.error('Error fetching character group:', error);
      res.status(500).json({ error: 'Failed to fetch character group' });
    }
  } else if (req.method === 'PUT') {
    try {
      const { name, color, isCollapsed } = req.body;
      
      const updateData: any = {};
      if (name !== undefined) updateData.name = name.trim();
      if (color !== undefined) updateData.color = color;
      if (isCollapsed !== undefined) updateData.isCollapsed = isCollapsed;

      const group = await prisma.characterGroup.update({
        where: { id: groupId },
        data: updateData,
        include: {
          characters: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      res.status(200).json(group);
    } catch (error: any) {
      console.error('Error updating character group:', error);
      if (error.code === 'P2002') {
        res.status(400).json({ error: 'A group with this name already exists' });
      } else if (error.code === 'P2025') {
        res.status(404).json({ error: 'Group not found' });
      } else {
        res.status(500).json({ error: 'Failed to update character group' });
      }
    }
  } else if (req.method === 'DELETE') {
    try {
      // First, move all characters in this group back to ungrouped
      await prisma.character.updateMany({
        where: { groupId },
        data: { groupId: null }
      });

      // Then delete the group
      await prisma.characterGroup.delete({
        where: { id: groupId }
      });

      res.status(200).json({ message: 'Group deleted successfully' });
    } catch (error: any) {
      console.error('Error deleting character group:', error);
      if (error.code === 'P2025') {
        res.status(404).json({ error: 'Group not found' });
      } else {
        res.status(500).json({ error: 'Failed to delete character group' });
      }
    }
  } else {
    res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
