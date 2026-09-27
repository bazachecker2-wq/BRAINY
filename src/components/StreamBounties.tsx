import React, { useState } from 'react';
import { db, auth } from '../lib/firebase';
import { 
  collection, 
  addDoc, 
  doc, 
  updateDoc, 
  increment,
  getDoc,
  serverTimestamp
} from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { Target, Plus, Check, X, Clock, Flame } from 'lucide-react';
import { useBounties, Bounty } from '../hooks/useBounties';
import { ProposeTaskModal } from './ProposeTaskModal';

interface StreamBountiesProps {
  roomId: string;
  isStreamer: boolean;
}

export const StreamBounties: React.FC<StreamBountiesProps> = ({ roomId, isStreamer }) => {
  const [user] = useAuthState(auth);
  const bounties = useBounties(roomId);
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleCreateBounty = async (text: string, reward: number) => {
    if (!user) return;
    setIsSubmitting(true);
    setFormError(null);

    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      const currentBalance = userSnap.data()?.balance || 0;

      if (currentBalance < reward) {
        setFormError('Недостаточно токенов на балансе!');
        return;
      }

      // Deduct from creator
      await updateDoc(userRef, {
        balance: increment(-reward)
      });

      // Create bounty
      await addDoc(collection(db, 'bounties'), {
        creatorId: user.uid,
        creatorName: user.displayName || 'Аноним',
        roomId,
        text: text.trim(),
        reward: reward,
        status: 'active',
        createdAt: serverTimestamp()
      });
    } catch (e: any) {
      console.warn('Error creating bounty:', e);
      setFormError('Ошибка при создании задания. Попробуйте еще раз.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteBounty = async (bounty: Bounty) => {
    if (!isStreamer || !user) return;

    try {
      // Mark as completed
      await updateDoc(doc(db, 'bounties', bounty.id), {
        status: 'completed'
      });

      // Reward streamer
      await updateDoc(doc(db, 'users', user.uid), {
        balance: increment(bounty.reward)
      });
      
      // Visual feedback: simple console log is not enough, 
      // maybe add a temporary state or animation if I had time, 
      // but for now ensure this function is clearly called.
      console.log(`Payment processed for bounty ${bounty.id}: ${bounty.reward} tokens paid.`);
    } catch (e) {
      console.error('Error completing bounty:', e);
    }
  };

  const handleCancelBounty = async (bounty: Bounty) => {
    if (bounty.creatorId !== user?.uid) return;

    try {
      await updateDoc(doc(db, 'bounties', bounty.id), {
        status: 'canceled'
      });

      // Refund creator
      await updateDoc(doc(db, 'users', user.uid), {
        balance: increment(bounty.reward)
      });
    } catch (e) {
      console.error('Error canceling bounty:', e);
    }
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-rose-500" />
          <h3 className="text-sm font-black text-white uppercase tracking-tighter italic">Челенджи</h3>
        </div>
        {!isStreamer && (
          <button
            onClick={() => setShowModal(true)}
            className="p-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition shadow-lg shadow-rose-600/20"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {formError && (
        <p className="text-[11px] text-rose-400 font-medium px-4">{formError}</p>
      )}

      <ProposeTaskModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onPropose={handleCreateBounty}
        isSubmitting={isSubmitting}
      />

      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
        {bounties.length === 0 ? (
          <div className="py-12 text-center space-y-2 opacity-40">
            <Clock className="w-8 h-8 mx-auto text-neutral-600" />
            <p className="text-xs text-neutral-500">Активных челенджей нет</p>
          </div>
        ) : (
          bounties.map((b) => (
            <div 
              key={b.id}
              className="p-3.5 rounded-2xl bg-neutral-900 border border-white/5 hover:border-white/10 transition-all group"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                      {b.reward} LST
                    </span>
                    <span className="text-[10px] text-neutral-500 truncate">от {b.creatorName}</span>
                  </div>
                  <p className="text-xs text-white font-medium leading-relaxed">{b.text}</p>
                </div>
                {isStreamer ? (
                  <button
                    onClick={() => handleCompleteBounty(b)}
                    className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-lg shadow-emerald-600/20"
                    title="Выполнено"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                ) : b.creatorId === user?.uid && (
                  <button
                    onClick={() => handleCancelBounty(b)}
                    className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition"
                    title="Отменить"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 text-[9px]">
                {b.status === 'active' && (
                  <><Flame className="w-3 h-3 text-orange-500 animate-pulse" />
                  <span className="uppercase tracking-widest font-black text-orange-500">В процессе</span></>
                )}
                {b.status === 'completed' && (
                  <><Check className="w-3 h-3 text-emerald-500" />
                  <span className="uppercase tracking-widest font-black text-emerald-500">Выполнено</span></>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
