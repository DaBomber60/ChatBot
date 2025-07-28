import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', ['PUT']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { characterId, groupId, newSortOrder } = req.body;

    if (!characterId || typeof characterId !== 'number') {
      return res.status(400).json({ error: 'Valid character ID is required' });
    }

    // Validate that the character exists
    const character = await prisma.character.findUnique({
      where: { id: characterId }
    });

    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // If groupId is provided, validate that the group exists
    if (groupId !== null && groupId !== undefined) {
      const group = await prisma.characterGroup.findUnique({
        where: { id: groupId }
      });

      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }
    }

    // Update the character
    const updateData: any = { groupId: groupId || null };
    if (newSortOrder !== undefined) {
      updateData.sortOrder = newSortOrder;
    }

    const updatedCharacter = await prisma.character.update({
      where: { id: characterId },
      data: updateData,
      include: {
        group: true
      }
    });

    res.status(200).json(updatedCharacter);
  } catch (error: any) {
    console.error('Error moving character:', error);
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Character not found' });
    } else {
      res.status(500).json({ error: 'Failed to move character' });
    }
  }
}
