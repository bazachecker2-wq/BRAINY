import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { 
  Trophy, 
  Coins, 
  CheckCircle2, 
  Bell, 
  Settings2,
  Disc as Discord,
  Send as Telegram,
  Check
} from 'lucide-react';

const TASKS = [
  { id: 'first_stream', title: 'Первый стрим', description: 'Запустите свою первую трансляцию', reward: 50 },
  { id: 'gather_viewers', title: 'Популярность', description: 'Соберите более 5 зрителей одновременно', reward: 100 },
  { id: 'chat_active', title: 'Общительность', description: 'Отправьте 10 сообщений в чат', reward: 30 },
  { id: 'ai_friend', title: 'Друг ИИ', description: 'Пообщайтесь с ИИ-агентом Gemini', reward: 40 }
];

export const UserDashboard: React.FC = () => {
  const [user] = useAuthState(auth);
  const [userData, setUserData] = useState<any>(null);
  const [discordWebhook, setDiscordWebhook] = useState('');
  const [telegramToken, setTelegramToken] = useState('');
  const [activeTab, setActiveTab] = useState<'tasks' | 'integrations'>('tasks');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserData(data);
        setDiscordWebhook(data.webhooks?.discord || '');
        setTelegramToken(data.webhooks?.telegram || '');
      }
    });
    return () => unsub();
  }, [user]);

  const saveIntegrations = async () => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        'webhooks.discord': discordWebhook,
        'webhooks.telegram': telegramToken
      });
      setSaveStatus('Настройки успешно сохранены!');
      setTimeout(() => setSaveStatus(null), 3500);
    } catch (e: any) {
      setSaveStatus('Ошибка сохранения настроек');
      setTimeout(() => setSaveStatus(null), 3500);
    }
  };

  if (!user || !userData) return null;

  return (
    <div className="bg-neutral-900/50 border border-white/5 rounded-3xl overflow-hidden flex flex-col h-full shadow-2xl">
      <div className="p-6 bg-gradient-to-br from-rose-600/20 to-amber-600/10 border-b border-white/5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-600 flex items-center justify-center shadow-lg shadow-rose-600/20">
              <Coins className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white leading-tight uppercase tracking-tighter">Ваш баланс</h3>
              <p className="text-xs text-neutral-400 font-mono">Токены LiveAI</p>
            </div>
          </div>
          <div className="text-3xl font-black text-white flex items-baseline gap-1">
            {userData.balance ?? 0}
            <span className="text-xs text-rose-400 uppercase tracking-widest font-bold">LST</span>
          </div>
        </div>
      </div>

      <div className="flex border-b border-white/5 p-1 bg-neutral-950/50">
        <button
          type="button"
          onClick={() => setActiveTab('tasks')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition ${
            activeTab === 'tasks' ? 'bg-white/5 text-white shadow-sm border border-white/10' : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          <Trophy className="w-3.5 h-3.5" />
          ЗАДАНИЯ
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('integrations')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition ${
            activeTab === 'integrations' ? 'bg-white/5 text-white shadow-sm border border-white/10' : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          <Settings2 className="w-3.5 h-3.5" />
          СЕРВИСЫ
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {activeTab === 'tasks' ? (
          TASKS.map((task) => {
            const isCompleted = userData.completedTasks?.includes(task.id);
            return (
              <div 
                key={task.id}
                className={`p-4 rounded-2xl border transition-all ${
                  isCompleted 
                    ? 'bg-emerald-500/5 border-emerald-500/20 opacity-60' 
                    : 'bg-neutral-800/50 border-white/5 hover:border-white/10'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-black uppercase tracking-widest ${isCompleted ? 'text-emerald-400' : 'text-neutral-400'}`}>
                    {isCompleted ? 'ВЫПОЛНЕНО' : `+${task.reward} LST`}
                  </span>
                  {isCompleted && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                </div>
                <h4 className="text-sm font-bold text-white">{task.title}</h4>
                <p className="text-[11px] text-neutral-500 leading-relaxed">{task.description}</p>
              </div>
            );
          })
        ) : (
          <div className="space-y-6 py-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                  <Discord className="w-3 h-3 text-[#5865F2]" /> Discord Webhook
                </label>
                <input
                  type="text"
                  value={discordWebhook}
                  onChange={(e) => setDiscordWebhook(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="w-full px-4 py-2.5 rounded-xl bg-neutral-950 border border-white/5 text-xs text-white focus:outline-none focus:border-rose-500/50 transition"
                />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                  <Telegram className="w-3 h-3 text-[#26A5E4]" /> Telegram Channel ID
                </label>
                <input
                  type="text"
                  value={telegramToken}
                  onChange={(e) => setTelegramToken(e.target.value)}
                  placeholder="@your_channel"
                  className="w-full px-4 py-2.5 rounded-xl bg-neutral-950 border border-white/5 text-xs text-white focus:outline-none focus:border-rose-500/50 transition"
                />
              </div>
            </div>
            
            <div className="p-4 rounded-2xl bg-rose-600/5 border border-rose-600/10 space-y-2">
              <div className="flex items-center gap-2 text-[11px] font-bold text-rose-300">
                <Bell className="w-3.5 h-3.5" />
                <span>Уведомления</span>
              </div>
              <p className="text-[10px] text-neutral-500 leading-relaxed">
                Мы будем автоматически отправлять ссылку на ваш стрим в эти сервисы при каждом запуске эфира.
              </p>
            </div>

            {saveStatus && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
                <Check className="w-4 h-4 shrink-0" />
                <span>{saveStatus}</span>
              </div>
            )}

            <button
              type="button"
              onClick={saveIntegrations}
              className="w-full py-3 rounded-2xl bg-white text-black text-xs font-black uppercase tracking-widest hover:bg-neutral-200 transition shadow-lg"
            >
              Сохранить настройки
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
