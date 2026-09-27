import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  MessageSquare,
  Sparkles,
  Users,
  Radio,
  Eye,
  Edit2,
  Check,
  Smile,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  Maximize2,
  Minimize2,
  Share2,
  Copy
} from 'lucide-react';
import { ChatMessage, RoomPresenceData, UserRole } from '../types/webrtc';
import { StreamBounties } from './StreamBounties';
import { Target } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { doc, getDoc, updateDoc, arrayUnion, increment } from 'firebase/firestore';

interface StreamChatPanelProps {
  isOpen?: boolean;
  isDocked?: boolean;
  onClose?: () => void;
  onToggleDock?: () => void;
  messages: ChatMessage[];
  presence?: RoomPresenceData | null;
  onSendMessage: (text: string) => void;
  onSendReaction: (emoji: string) => void;
  currentPeerId: string;
  currentDisplayName: string;
  onUpdateDisplayName?: (newName: string) => void;
  role?: UserRole;
  roomId?: string;
  className?: string;
  onInviteToCoHost?: (peerId: string) => void;
}

const QUICK_REACTIONS = ['🔥', '❤️', '👏', '🚀', '🎉', '💡', '💯', '🤯'];

export const StreamChatPanel: React.FC<StreamChatPanelProps> = ({
  isOpen = true,
  isDocked = true,
  onClose,
  onToggleDock,
  messages,
  presence,
  onSendMessage,
  onSendReaction,
  currentPeerId,
  currentDisplayName,
  onUpdateDisplayName,
  role = 'viewer',
  roomId,
  className = '',
  onInviteToCoHost
}) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'viewers' | 'bounties'>('chat');
  const [inputText, setInputText] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameText, setEditNameText] = useState(currentDisplayName);
  const [copiedLink, setCopiedLink] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [user] = useAuthState(auth);
  const sentCountRef = useRef(0);

  useEffect(() => {
    setEditNameText(currentDisplayName);
  }, [currentDisplayName]);

  // Auto-scroll when new messages arrive if user is at bottom
  useEffect(() => {
    if (activeTab === 'chat' && isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab, isAtBottom]);

  if (!isOpen) return null;

  const handleScroll = () => {
    if (!chatScrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatScrollContainerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 60;
    setIsAtBottom(atBottom);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
    setIsAtBottom(true);

    // Track for 'chat_active' task
    if (user) {
      sentCountRef.current += 1;
      if (sentCountRef.current === 10) {
        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const data = userSnap.data();
            if (!data.completedTasks?.includes('chat_active')) {
              await updateDoc(userRef, {
                completedTasks: arrayUnion('chat_active'),
                balance: increment(30)
              });
            }
          }
        } catch (e) {
          console.warn('Chat task update failed:', e);
        }
      }
    }
  };

  const handleSaveName = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (editNameText.trim() && onUpdateDisplayName) {
      onUpdateDisplayName(editNameText.trim());
    }
    setIsEditingName(false);
  };

  const handleCopyShare = () => {
    if (!roomId) return;
    const url = `${window.location.origin}/view/${roomId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  const publishers = presence?.peers.filter((p) => p.role === 'publisher' || p.role === 'cohost') || [];
  const viewers = presence?.peers.filter((p) => p.role === 'viewer') || [];
  const totalViewersCount = presence?.viewersCount ?? viewers.length;

  return (
    <div
      className={`flex flex-col bg-black/85 backdrop-blur-md border-orange-500/30 shadow-xl rounded-none overflow-hidden select-none border transition-all font-mono text-neutral-200 ${
        isDocked ? 'h-full w-full' : 'fixed top-4 right-4 bottom-4 z-50 w-full sm:w-[380px] border-orange-500/50'
      } ${className}`}
    >
      {/* Top Header & Tab Navigation */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-orange-500/20 bg-black shrink-0 drag-handle cursor-grab">
        <div className="flex items-center gap-1.5 p-0.5 rounded-none bg-neutral-950 border border-orange-500/10">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-none text-[11px] font-bold uppercase transition ${
              activeTab === 'chat'
                ? 'bg-orange-500 text-black'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Чат</span>
            {messages.length > 0 && (
              <span className={`text-[10px] px-1 py-0.2 rounded-none border ${activeTab === 'chat' ? 'bg-black/20 text-black border-transparent' : 'bg-neutral-900 text-neutral-300 border-orange-500/20'}`}>
                {messages.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('viewers')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-none text-[11px] font-bold uppercase transition ${
              activeTab === 'viewers'
                ? 'bg-orange-500 text-black'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Зрители</span>
            <span className={`text-[10px] px-1 py-0.2 rounded-none border ${activeTab === 'viewers' ? 'bg-black/20 text-black border-transparent' : 'bg-neutral-900 text-neutral-300 border-orange-500/20'}`}>
              {totalViewersCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('bounties')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-none text-[11px] font-bold uppercase transition ${
              activeTab === 'bounties'
                ? 'bg-orange-500 text-black'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            <span>Цели</span>
          </button>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1">
          {onToggleDock && (
            <button
              onClick={onToggleDock}
              className="p-1.5 rounded-none text-neutral-400 hover:text-orange-500 hover:bg-neutral-900 transition border border-transparent hover:border-orange-500/20"
              title={isDocked ? 'Открепить окно чата' : 'Закрепить в боковой панели'}
            >
              {isDocked ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-none text-neutral-400 hover:text-orange-500 hover:bg-neutral-900 transition border border-transparent hover:border-orange-500/20"
              title="Закрыть панель"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Quick Identity bar */}
      <div className="px-3.5 py-2 border-b border-orange-500/10 bg-neutral-950/80 flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center gap-2 truncate">
          <span className="text-neutral-400 text-[10px] uppercase font-bold">Вы вошли как:</span>
          {isEditingName ? (
            <form onSubmit={handleSaveName} className="flex items-center gap-1">
              <input
                type="text"
                value={editNameText}
                onChange={(e) => setEditNameText(e.target.value)}
                maxLength={24}
                className="w-28 px-1.5 py-0.5 rounded-none bg-neutral-900 border border-orange-500/30 text-xs text-white focus:outline-none focus:border-orange-500"
                autoFocus
              />
              <button
                type="submit"
                className="p-1 rounded-none bg-orange-500 hover:bg-orange-400 text-black transition"
              >
                <Check className="w-3 h-3" />
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-bold text-orange-400 truncate">{currentDisplayName}</span>
              {onUpdateDisplayName && (
                <button
                  onClick={() => setIsEditingName(true)}
                  className="text-neutral-500 hover:text-white p-0.5 rounded-none transition"
                  title="Изменить имя в чате"
                >
                  <Edit2 className="w-3 h-3 text-orange-400" />
                </button>
              )}
            </div>
          )}
        </div>

        <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-none bg-orange-500/10 text-orange-400 border border-orange-500/20 shrink-0">
          {role === 'publisher' ? '🔴 Стример' : role === 'cohost' ? '🎙️ Ведущий' : '👁️ Зритель'}
        </span>
      </div>

      {/* Tab 1: Live Chat Content */}
      {activeTab === 'chat' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Messages list */}
          <div
            ref={chatScrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 p-3.5 overflow-y-auto space-y-3 min-h-0 custom-scroll"
          >
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-neutral-500 text-xs p-6 space-y-2">
                <div className="w-12 h-12 rounded-none bg-neutral-950 flex items-center justify-center border border-orange-500/20 text-orange-400">
                  <MessageSquare className="w-6 h-6 opacity-80" />
                </div>
                <p className="font-bold text-neutral-200 uppercase tracking-wider">ЧАТ ТРАНСЛЯЦИИ ОТКРЫТ</p>
                <p className="text-[10px] text-neutral-400 max-w-[200px]">
                  Отправьте реакцию или первое сообщение ведущему и другим зрителям.
                </p>
                <div className="pt-2 flex flex-wrap gap-1.5 justify-center">
                  {QUICK_REACTIONS.slice(0, 4).map((em) => (
                     <button
                       key={em}
                       onClick={() => onSendReaction(em)}
                       className="px-2 py-1 rounded-none bg-neutral-900 hover:bg-neutral-800 border border-orange-500/20 text-sm transition"
                     >
                       {em}
                     </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => {
                const isMe = msg.fromPeerId === currentPeerId;
                const isAi = msg.isAi || msg.fromPeerId === 'ai-agent';
                const isHost = msg.role === 'publisher' || msg.role === 'cohost';

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      <span className="text-[10px] font-bold text-neutral-400 flex items-center gap-1">
                        {isAi ? (
                          <span className="flex items-center gap-1 text-orange-400 font-bold uppercase tracking-wider">
                            <Sparkles className="w-3 h-3" />
                            {msg.senderName}
                          </span>
                        ) : (
                          <>
                            {isHost && (
                              <span className="text-[9px] px-1 py-0.2 rounded-none bg-orange-500/10 text-orange-400 font-bold border border-orange-500/30">
                                ВЕДУЩИЙ
                              </span>
                            )}
                            <span className={isMe ? 'text-orange-300 font-bold' : 'text-neutral-300'}>
                              {msg.senderName}
                            </span>
                            {isMe && <span className="text-[10px] text-neutral-500 font-normal">(Вы)</span>}
                          </>
                        )}
                      </span>
                      <span className="text-[9px] text-neutral-600 font-mono">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div
                      className={`px-3 py-1.5 rounded-none text-xs max-w-[90%] break-words leading-relaxed shadow-sm border ${
                        isMe
                          ? 'bg-orange-500/10 text-orange-300 border-orange-500/30'
                          : isAi
                          ? 'bg-neutral-950 text-neutral-200 border-orange-500/30'
                          : 'bg-neutral-900/60 text-neutral-100 border-white/5'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Reaction Floating Bar */}
          <div className="px-3 py-1.5 bg-neutral-950/80 border-t border-orange-500/10 flex items-center justify-between shrink-0">
            <span className="text-[9px] text-neutral-400 uppercase font-bold tracking-wider flex items-center gap-1">
              <Smile className="w-3 h-3 text-orange-400" /> Реакции:
            </span>
            <div className="flex items-center gap-1 overflow-x-auto py-0.5">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => onSendReaction(emoji)}
                  className="w-7 h-7 rounded-none hover:bg-neutral-900 hover:text-orange-500 flex items-center justify-center text-sm transition transform hover:scale-125 border border-transparent hover:border-orange-500/20"
                  title={`Отправить реакцию ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Input Form */}
          <form
            onSubmit={handleSend}
            className="p-3 border-t border-orange-500/20 bg-black flex gap-2 shrink-0 animate-in fade-in duration-200"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Написать сообщение..."
              maxLength={400}
              className="flex-1 px-3 py-2 rounded-none bg-neutral-950 border border-orange-500/20 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30 transition"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="px-3.5 py-2 rounded-none bg-orange-500 hover:bg-orange-400 disabled:opacity-30 disabled:pointer-events-none text-black transition flex items-center justify-center shrink-0 shadow-md font-bold uppercase text-[10px]"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* Tab 2: Viewers & Participants List */}
      {activeTab === 'viewers' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 custom-scroll">
          {/* Presence Summary Stats */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-none bg-neutral-950 border border-orange-500/20 flex flex-col">
              <span className="text-[9px] text-neutral-400 uppercase font-bold tracking-widest">Ведущие</span>
              <span className="text-xl font-bold text-orange-400 mt-1">
                {presence?.publishersCount ?? publishers.length}
              </span>
            </div>
            <div className="p-3 rounded-none bg-neutral-950 border border-orange-500/20 flex flex-col">
              <span className="text-[9px] text-neutral-400 uppercase font-bold tracking-widest">Зрители</span>
              <span className="text-xl font-bold text-white mt-1">
                {totalViewersCount}
              </span>
            </div>
          </div>

          {/* Broadcasters Section */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-orange-400">
              <Radio className="w-3.5 h-3.5" />
              <span>Ведущие эфира</span>
            </div>
            {publishers.length === 0 ? (
              <div className="p-3 rounded-none bg-neutral-950 border border-orange-500/10 text-xs text-neutral-500 text-center">
                Нет подключённых ведущих
              </div>
            ) : (
              <div className="space-y-1.5">
                {publishers.map((peer) => {
                  const isMe = peer.id === currentPeerId;
                  return (
                    <div
                      key={peer.id}
                      className={`flex items-center justify-between p-2.5 rounded-none border text-xs ${
                        isMe
                          ? 'bg-orange-500/5 border-orange-500/30'
                          : 'bg-neutral-950 border border-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-none bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-xs font-bold text-orange-400 shrink-0">
                          {peer.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 truncate">
                          <p className="font-bold text-neutral-200 truncate flex items-center gap-1">
                            {peer.displayName}
                            {isMe && <span className="text-orange-400 font-normal">(Вы)</span>}
                          </p>
                          <span className="text-[9px] text-neutral-500 uppercase">
                            {peer.role === 'publisher' ? 'Главный ведущий' : 'Со-ведущий'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {peer.screenSharing && (
                          <span className="p-1 rounded-none bg-orange-500/10 text-orange-400 border border-orange-500/20" title="Показ экрана">
                            <Monitor className="w-3 h-3" />
                          </span>
                        )}
                        <span className={`p-1 rounded-none border ${peer.audioMuted ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : 'bg-neutral-900 text-neutral-300 border-white/10'}`}>
                          {peer.audioMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                        </span>
                        <span className={`p-1 rounded-none border ${peer.videoMuted ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : 'bg-neutral-900 text-neutral-300 border-white/10'}`}>
                          {peer.videoMuted ? <VideoOff className="w-3 h-3" /> : <Video className="w-3 h-3" />}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Viewers Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-neutral-300">
              <div className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-orange-400" />
                <span>Зрители ({totalViewersCount})</span>
              </div>
            </div>

            {viewers.length === 0 ? (
              <div className="p-4 rounded-none bg-neutral-950 border border-orange-500/10 text-center text-xs text-neutral-500 space-y-2">
                <Users className="w-6 h-6 mx-auto opacity-30 text-neutral-400" />
                <p>Других зрителей в комнате пока нет.</p>
                {roomId && (
                  <button
                    onClick={handleCopyShare}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none bg-neutral-900 hover:bg-neutral-800 text-neutral-200 transition text-[10px] font-bold uppercase border border-orange-500/20"
                  >
                    {copiedLink ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedLink ? 'Скопировано' : 'Скопировать ссылку'}</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto custom-scroll">
                {viewers.map((viewer) => {
                  const isMe = viewer.id === currentPeerId;
                  return (
                    <div
                      key={viewer.id}
                      className={`flex items-center justify-between p-2.5 rounded-none border text-xs transition ${
                        isMe
                          ? 'bg-orange-500/5 border-orange-500/30'
                          : 'bg-neutral-950 border border-white/5 hover:border-orange-500/10'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-none bg-neutral-950 border border-orange-500/20 flex items-center justify-center text-xs font-bold text-orange-400 shrink-0">
                          {viewer.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 truncate">
                          <p className="font-bold text-neutral-200 truncate flex items-center gap-1">
                            {viewer.displayName}
                            {isMe && <span className="text-orange-400 font-bold">(Вы)</span>}
                          </p>
                          <span className="text-[9px] text-neutral-500">
                            Вошёл: {new Date(viewer.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {viewer.handRaised && (
                          <span className="p-1 rounded-none bg-orange-500/10 border border-orange-500/20 text-orange-400 animate-pulse text-[11px]" title="Хочет сказать">
                            ✋
                          </span>
                        )}
                        {role === 'publisher' && !isMe && (
                          <button
                            onClick={() => onInviteToCoHost && onInviteToCoHost(viewer.id)}
                            className="px-2 py-1 rounded-none bg-orange-500 hover:bg-orange-400 text-black text-[9px] font-bold uppercase transition shadow-sm"
                            title="Пригласить в прямой эфир"
                          >
                            В эфир
                          </button>
                        )}
                        <span className="w-2 h-2 rounded-none bg-orange-400 shadow-sm" title="Онлайн"></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Share room box */}
          {roomId && (
            <div className="p-3 rounded-none bg-neutral-950 border border-orange-500/20 space-y-2 mt-4 font-mono">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-orange-400">
                <Share2 className="w-3.5 h-3.5" />
                <span>Пригласить на стрим</span>
              </div>
              <p className="text-[10px] text-neutral-400 leading-normal">
                Отправьте ссылку зрителям, чтобы они могли смотреть видеопоток и общаться в чате.
              </p>
              <button
                onClick={handleCopyShare}
                className="w-full py-1.5 px-3 rounded-none bg-orange-500 hover:bg-orange-400 text-black text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition shadow-sm"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Готово!' : 'Копировать ссылку'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Bounties / Challenges */}
      {activeTab === 'bounties' && (
        <div className="flex-1 overflow-hidden p-4 min-h-0">
          <StreamBounties roomId={roomId || ''} isStreamer={role === 'publisher'} />
        </div>
      )}
    </div>
  );
};
