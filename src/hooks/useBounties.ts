import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

export interface Bounty {
  id: string;
  creatorId: string;
  creatorName: string;
  text: string;
  reward: number;
  status: 'active' | 'completed' | 'canceled';
  createdAt: any;
}

export const useBounties = (roomId: string) => {
  const [bounties, setBounties] = useState<Bounty[]>([]);

  useEffect(() => {
    if (!roomId) return;
    const q = query(
      collection(db, 'bounties'),
      where('roomId', '==', roomId)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Bounty));
      setBounties(docs.sort((a, b) => b.reward - a.reward));
    });

    return () => unsub();
  }, [roomId]);

  return bounties;
};
