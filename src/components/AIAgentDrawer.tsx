import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  Sparkles,
  Bot,
  Eye,
  History,
  RefreshCw,
  MessageSquare,
  Zap,
  HelpCircle,
  Lightbulb,
  Radio
} from 'lucide-react';
import { AIStreamEvent } from '../types/webrtc';

interface AIAgentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  getActiveFrameBase64: () => string | null;
  streamEvents: AIStreamEvent[];
  onAddStreamEvent: (event: AIStreamEvent) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export const AIAgentDrawer: React.FC<AIAgentDrawerProps> = ({
  isOpen,
  onClose,
  roomId,
  getActiveFrameBase64,
  streamEvents,
  onAddStreamEvent
}) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'events'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Привет! Я твой живой ИИ-со-ведущий BeamLive. Я смотрю видеопоток в реальном времени, фиксирую ключевые события и могу ответить на любые вопросы по стриму или пообщаться на любую тему!',
      timestamp: Date.now()
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzingFrame, setIsAnalyzingFrame] = useState(false);
  const [autoVisionEnabled, setAutoVisionEnabled] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const autoVisionTimerRef = useRef<any>(null);

  // Scroll to bottom on new chat messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Periodic automatic vision analysis to track stream highlights
  useEffect(() => {
    if (!autoVisionEnabled) return;

    const performPeriodicVisionCheck = async () => {
      const frame = getActiveFrameBase64();
      if (!frame) return;

      try {
        const res = await fetch('/api/ai/analyze-frame', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: frame,
            roomId
          })
        });

        const data = await res.json();

        if (res.status === 429) {
          setAutoVisionEnabled(false);
          onAddStreamEvent({
            id: `err_${Date.now()}`,
            timestamp: Date.now(),
            text: '⚠️ Квота Gemini исчерпана. Авто-наблюдение отключено для экономии ресурсов.',
            thumbnail: undefined
          });
          return;
        }

        if (data.success && data.comment) {
          const newEvent: AIStreamEvent = {
            id: `evt_${Date.now()}`,
            timestamp: Date.now(),
            text: data.comment,
            thumbnail: frame
          };
          onAddStreamEvent(newEvent);
        }
      } catch (err) {
        // quiet fail on periodic check
      }
    };

    // Initial check after 5s, then every 90s
    const initialTimer = setTimeout(performPeriodicVisionCheck, 5000);
    autoVisionTimerRef.current = setInterval(performPeriodicVisionCheck, 90000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(autoVisionTimerRef.current);
    };
  }, [autoVisionEnabled, roomId, getActiveFrameBase64, onAddStreamEvent]);

  if (!isOpen) return null;

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputQuery).trim();
    if (!query || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      text: query,
      timestamp: Date.now()
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsLoading(true);

    try {
      const frame = getActiveFrameBase64();
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: query,
          roomId,
          history: messages.map((m) => ({ role: m.role, text: m.text })),
          recentEvents: streamEvents,
          imageBase64: frame
        })
      });

      const data = await res.json();
      if (data.success && data.reply) {
        setMessages((prev) => [
          ...prev,
          {
            id: `ai_${Date.now()}`,
            role: 'assistant',
            text: data.reply,
            timestamp: Date.now()
          }
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `ai_err_${Date.now()}`,
            role: 'assistant',
            text: 'Извините, произошла заминка при обработке ответа. Попробуйте еще раз.',
            timestamp: Date.now()
          }
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `ai_err_${Date.now()}`,
          role: 'assistant',
          text: `Ошибка связи с ИИ-моделью: ${err.message}`,
          timestamp: Date.now()
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInstantAnalyze = async () => {
    const frame = getActiveFrameBase64();
    if (!frame) return;

    setIsAnalyzingFrame(true);
    try {
      const res = await fetch('/api/ai/analyze-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: frame,
          roomId,
          customPrompt: 'Подробно опиши, что сейчас находится в кадре прямой трансляции и какие действия совершаются.'
        })
      });

      const data = await res.json();
      if (res.status === 429) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err_limit_${Date.now()}`,
            role: 'assistant',
            text: `⚠️ **Лимит превышен:** ${data.error || 'Слишком много запросов к ИИ. Попробуйте позже.'}`,
            timestamp: Date.now()
          }
        ]);
        return;
      }

      if (data.success && data.comment) {
        onAddStreamEvent({
          id: `evt_${Date.now()}`,
          timestamp: Date.now(),
          text: data.comment,
          thumbnail: frame
        });

        setMessages((prev) => [
          ...prev,
          {
            id: `vision_${Date.now()}`,
            role: 'assistant',
            text: `👁️ **Анализ текущего кадра:**\n${data.comment}`,
            timestamp: Date.now()
          }
        ]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzingFrame(false);
    }
  };

  return (
    <div className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-96 bg-neutral-900/95 border-l border-white/10 shadow-2xl flex flex-col backdrop-blur-xl animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-white/10 bg-neutral-950/70 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 flex items-center justify-center text-white shadow-md shadow-rose-600/30">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>ИИ-Агент Стрима</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 font-mono">
                VISION
              </span>
            </h3>
            <p className="text-[11px] text-neutral-400">Наблюдает за видео и комментирует в реальном времени</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center p-1.5 bg-neutral-950/50 border-b border-white/5">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
            activeTab === 'chat'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Диалог с ИИ</span>
        </button>

        <button
          onClick={() => setActiveTab('events')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
            activeTab === 'events'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>События стрима ({streamEvents.length})</span>
        </button>
      </div>

      {/* Tab 1: Live Chat */}
      {activeTab === 'chat' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Action Quick Bar */}
          <div className="px-3 py-2 border-b border-white/5 bg-neutral-950/30 flex items-center justify-between gap-2">
            <button
              onClick={handleInstantAnalyze}
              disabled={isAnalyzingFrame}
              className="px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-indigo-300 text-[11px] font-medium flex items-center gap-1 transition"
              title="Проанализировать видеокадр прямо сейчас"
            >
              <Eye className={`w-3.5 h-3.5 ${isAnalyzingFrame ? 'animate-spin' : ''}`} />
              <span>{isAnalyzingFrame ? 'Анализирую...' : 'Распознать кадр'}</span>
            </button>

            <button
              onClick={() => setAutoVisionEnabled(!autoVisionEnabled)}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 transition border ${
                autoVisionEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-neutral-800 text-neutral-400 border-white/5'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${autoVisionEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'}`}></span>
              <span>Авто-наблюдение: {autoVisionEnabled ? 'ВКЛ' : 'ВЫКЛ'}</span>
            </button>
          </div>

          {/* Messages list */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  <span className="text-[11px] font-semibold text-neutral-400 flex items-center gap-1">
                    {msg.role === 'assistant' ? (
                      <>
                        <Sparkles className="w-3 h-3 text-rose-400" />
                        <span>ИИ-Агент</span>
                      </>
                    ) : (
                      'Вы'
                    )}
                  </span>
                  <span className="text-[10px] text-neutral-600">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div
                  className={`px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed max-w-[90%] whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-rose-600 text-white rounded-tr-none'
                      : 'bg-neutral-800/90 text-neutral-100 rounded-tl-none border border-white/5 shadow-sm'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 p-3 rounded-2xl bg-neutral-800/60 border border-white/5 text-xs text-neutral-300 max-w-[80%]">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-400" />
                <span>ИИ думает и изучает видеокадр...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Chips */}
          <div className="px-3 py-1.5 bg-neutral-950/40 border-t border-white/5 flex gap-1.5 overflow-x-auto no-scrollbar">
            <button
              onClick={() => handleSendMessage('Что интересного произошло в стриме?')}
              className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px] whitespace-nowrap transition border border-white/5 flex items-center gap-1"
            >
              <Lightbulb className="w-3 h-3 text-amber-400" />
              Что интересного было?
            </button>
            <button
              onClick={() => handleSendMessage('Опиши, что сейчас происходит на экране?')}
              className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px] whitespace-nowrap transition border border-white/5 flex items-center gap-1"
            >
              <Eye className="w-3 h-3 text-indigo-400" />
              Что сейчас в кадре?
            </button>
            <button
              onClick={() => handleSendMessage('Предложи интересную тему или вопрос для стримера')}
              className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px] whitespace-nowrap transition border border-white/5 flex items-center gap-1"
            >
              <Zap className="w-3 h-3 text-rose-400" />
              Предложи тему
            </button>
          </div>

          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 border-t border-white/10 bg-neutral-950/70 flex gap-2"
          >
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Спросите ИИ о стриме или на любую тему..."
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-white/10 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-rose-500 transition"
            />
            <button
              type="submit"
              disabled={!inputQuery.trim() || isLoading}
              className="p-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white transition flex items-center justify-center shrink-0 shadow-md shadow-rose-600/30"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Tab 2: Chronological Stream Events */}
      {activeTab === 'events' && (
        <div className="flex-1 p-4 overflow-y-auto space-y-3">
          {streamEvents.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-neutral-500 text-xs p-6">
              <Bot className="w-10 h-10 mb-2 opacity-30 text-rose-400" />
              <p className="font-semibold text-neutral-300">События пока фиксируются</p>
              <p className="mt-1 text-neutral-500">ИИ анализирует кадры каждые 25 секунд и создает хронологию трансляции.</p>
              <button
                onClick={handleInstantAnalyze}
                className="mt-4 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md transition"
              >
                Создать первое наблюдение
              </button>
            </div>
          ) : (
            streamEvents.map((evt, idx) => (
              <div
                key={evt.id}
                className="p-3 rounded-xl bg-neutral-950/60 border border-white/5 space-y-1.5 hover:border-white/15 transition"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-rose-400 flex items-center gap-1">
                    <Radio className="w-3 h-3 text-rose-500 animate-pulse" />
                    Событие #{streamEvents.length - idx}
                  </span>
                  <span className="text-neutral-500 font-mono">
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-xs text-neutral-200 leading-relaxed">
                  {evt.text}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
