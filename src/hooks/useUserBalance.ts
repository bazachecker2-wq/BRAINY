import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

export const useUserBalance = (userId?: string) => {
  const [balance, setBalance] = useState<number>(0);

  useEffect(() => {
    if (!userId) {
      setBalance(0);
      return;
    }

    const userRef = doc(db, 'users', userId);
    const unsub = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        setBalance(doc.data().balance || 0);
      }
    });

    return () => unsub();
  }, [userId]);

  return balance;
};
