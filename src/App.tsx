/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { HomeView } from './views/HomeView';
import { RoomView } from './views/RoomView';
import { ViewOnlyView } from './views/ViewOnlyView';
import { EmbedView } from './views/EmbedView';
import { SourceView } from './views/SourceView';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { auth, db } from './lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { AlertCircle, Lock } from 'lucide-react';

// Helper to generate 6-character room IDs
function generateRoomId(length = 6): string {
  const chars = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function App() {
  const [currentPath, setCurrentPath] = useState<string>(window.location.pathname);
  const [roomPassword, setRoomPassword] = useState<string | undefined>();
  const [user] = useAuthState(auth);
  const [accessDenied, setAccessDenied] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(false);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  const handleStartInstantCamera = () => {
    const newRoomId = generateRoomId();
    navigateTo(`/room/${newRoomId}`);
  };

  const handleCreateRoom = async (options: {
    name?: string;
    mode: 'public' | 'unlisted' | 'private';
    password?: string;
    sfuMode: boolean;
    customId?: string;
  }) => {
    const targetRoomId = options.customId || generateRoomId();
    setRoomPassword(options.password);

    try {
      await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customId: targetRoomId,
          name: options.name,
          mode: options.mode,
          password: options.password,
          sfuMode: options.sfuMode
        })
      });
    } catch (e) {
      console.warn('API room register failed, continuing with direct signaling:', e);
    }

    navigateTo(`/room/${targetRoomId}`);

    // Save room to Firestore if private or user is logged in
    if (user) {
      try {
        await setDoc(doc(db, 'rooms', targetRoomId), {
          ownerId: user.uid,
          name: options.name || `Стрим ${user.displayName}`,
          mode: options.mode,
          isPrivate: options.mode === 'private',
          invitedUsers: [],
          createdAt: serverTimestamp()
        });
      } catch (e) {
        console.warn('Failed to save room to Firestore:', e);
      }
    }
  };

  const handleJoinRoom = async (roomId: string, isViewer: boolean, password?: string) => {
    setRoomPassword(password);
    if (!roomId) {
      navigateTo('/');
      return;
    }

    // Access check for private rooms
    setIsCheckingAccess(true);
    try {
      const roomSnap = await getDoc(doc(db, 'rooms', roomId));
      if (roomSnap.exists()) {
        const roomData = roomSnap.data();
        if (roomData.isPrivate) {
          if (!user || (roomData.ownerId !== user.uid && !roomData.invitedUsers?.includes(user.uid))) {
            setAccessDenied(true);
            setIsCheckingAccess(false);
            return;
          }
        }
      }
    } catch (e) {
      console.warn('Access check failed:', e);
    } finally {
      setIsCheckingAccess(false);
    }

    if (isViewer) {
      navigateTo(`/view/${roomId}`);
    } else {
      navigateTo(`/room/${roomId}`);
    }
  };

  // Route matching
  const pathParts = currentPath.split('/').filter(Boolean);
  const routeType = pathParts[0]; // 'room', 'view', 'embed', 'source'
  const roomId = pathParts[1];

  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const urlRole = searchParams.get('role') === 'cohost' ? 'cohost' : 'publisher';

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full space-y-6 animate-in fade-in zoom-in duration-300">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <Lock className="w-10 h-10 text-rose-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Доступ ограничен</h2>
            <p className="text-neutral-400 text-sm leading-relaxed">
              Эта комната является приватной. Только владелец или приглашенные пользователи могут войти.
            </p>
          </div>
          <button
            onClick={() => {
              setAccessDenied(false);
              navigateTo('/');
            }}
            className="w-full py-3 rounded-2xl bg-white text-black text-xs font-black uppercase tracking-widest hover:bg-neutral-200 transition"
          >
            Вернуться на главную
          </button>
        </div>
      </div>
    );
  }

  if (isCheckingAccess) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6 text-center">
        <div className="space-y-4">
          <div className="w-12 h-12 border-4 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Проверка доступа...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {routeType === 'room' && roomId ? (
        <RoomView
          roomId={roomId}
          role={urlRole}
          password={roomPassword}
          onLeave={() => navigateTo('/')}
          onNavigateToRoom={(targetId, asViewer) => handleJoinRoom(targetId, Boolean(asViewer))}
        />
      ) : routeType === 'view' && roomId ? (
        <ViewOnlyView
          roomId={roomId}
          password={roomPassword}
          onNavigateToRoom={(targetId, asViewer) => handleJoinRoom(targetId, asViewer !== undefined ? asViewer : true)}
        />
      ) : routeType === 'embed' && roomId ? (
        <EmbedView roomId={roomId} />
      ) : routeType === 'source' && roomId ? (
        <SourceView roomId={roomId} />
      ) : (
        <HomeView
          onStartInstantCamera={handleStartInstantCamera}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
        />
      )}
      <PWAInstallPrompt />
    </>
  );
}
