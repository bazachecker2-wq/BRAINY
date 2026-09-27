import React, { useState } from 'react';
import { auth, db } from '../lib/firebase';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { useAuthState } from 'react-firebase-hooks/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { LogIn, LogOut, User, AlertCircle, X, Loader2 } from 'lucide-react';

export const AuthButton: React.FC = () => {
  const [user, loading] = useAuthState(auth);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const login = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setAuthError(null);

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      const result = await signInWithPopup(auth, provider);
      const userRef = doc(db, 'users', result.user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          displayName: result.user.displayName || 'Пользователь',
          email: result.user.email || '',
          balance: 100, // Welcome bonus
          completedTasks: [],
          webhooks: { discord: '', telegram: '' },
          createdAt: serverTimestamp()
        });
      }
    } catch (error: any) {
      const errorCode = error?.code || '';
      if (errorCode === 'auth/cancelled-popup-request' || errorCode === 'auth/popup-closed-by-user') {
        // User closed or superseded the popup - normal user action, not a fatal failure
      } else if (errorCode === 'auth/popup-blocked') {
        setAuthError('Всплывающее окно заблокировано браузером. Разрешите всплывающие окна (pop-ups) в адресной строке и попробуйте снова.');
      } else {
        setAuthError(error?.message || 'Не удалось выполнить вход через Google.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = () => {
    setAuthError(null);
    signOut(auth);
  };

  if (loading) {
    return <div className="w-8 h-8 rounded-full bg-neutral-800 animate-pulse" />;
  }

  if (user) {
    return (
      <div className="flex items-center gap-3 font-mono">
        <div className="flex flex-col items-end hidden sm:flex">
          <span className="text-[11px] font-bold text-white leading-none">{user.displayName || 'Пользователь'}</span>
          <span className="text-[9px] text-orange-400">В сети</span>
        </div>
        <div className="group relative">
          <button 
            type="button"
            className="w-9 h-9 rounded-none bg-neutral-950 border border-white/10 flex items-center justify-center overflow-hidden hover:border-orange-500 transition focus:outline-none"
            aria-label="Профиль пользователя"
          >
            {user.photoURL ? (
              <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <User className="w-5 h-5 text-neutral-400" />
            )}
          </button>
          <div className="absolute top-full right-0 mt-2 w-48 bg-black border border-white/10 rounded-none shadow-2xl p-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition z-50">
            <button
              type="button"
              onClick={logout}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-none text-xs text-neutral-300 hover:bg-orange-500/10 hover:text-orange-400 transition"
            >
              <LogOut className="w-4 h-4" />
              Выйти
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative inline-flex flex-col items-end font-mono">
      <button
        type="button"
        onClick={login}
        disabled={isLoggingIn}
        className="flex items-center gap-2 px-4 py-2 rounded-none bg-orange-500 text-black text-xs font-bold hover:bg-orange-400 transition shadow-lg disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed border border-orange-600"
      >
        {isLoggingIn ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-black" />
            <span>Вход...</span>
          </>
        ) : (
          <>
            <LogIn className="w-4 h-4" />
            <span>Войти через Google</span>
          </>
        )}
      </button>

      {authError && (
        <div className="absolute top-full mt-2 right-0 w-72 p-3 bg-black border border-orange-500 rounded-none shadow-2xl z-50 text-[11px] text-neutral-200 space-y-2 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-1.5 text-orange-500">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="font-semibold uppercase tracking-wider">Внимание</span>
            </div>
            <button
              type="button"
              onClick={() => setAuthError(null)}
              className="text-neutral-400 hover:text-white p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-neutral-300 leading-relaxed">{authError}</p>
        </div>
      )}
    </div>
  );
};
