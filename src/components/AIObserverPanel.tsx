import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Eye,
  MessageSquare,
  History,
  Send,
  RefreshCw,
  Zap,
  HelpCircle,
  Clock,
  Layers,
  Bot,
  Copy,
  Check,
  ChevronRight,
  Radio,
  Sliders,
  X,
  Maximize2,
  Minimize2,
  Monitor,
  Code2,
  Tag,
  Lightbulb,
  FileText,
  Users2
} from 'lucide-react';
import { AIStreamEvent } from '../types/webrtc';

export interface AIObserverPanelProps {
  roomId: string;
  getActiveFrameBase64: () => string | null;
  streamEvents: AIStreamEvent[];
  onAddStreamEvent: (event: AIStreamEvent) => void;
  isDocked?: boolean;
  onToggleDock?: () => void;
  onClose?: () => void;
  isTranslucent?: boolean;
  className?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export const AIObserverPanel: React.FC<AIObserverPanelProps> = ({
  roomId,
  getActiveFrameBase64,
  streamEvents,
  onAddStreamEvent,
  isDocked = false,
  onToggleDock,
  onClose,
  isTranslucent = false,
  className = ''
}) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'events' | 'tools'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Привет! Я живой ИИ-наблюдатель и со-ведущий этого стрима на базе Gemini. Я вижу видеокадры и экран в реальном времени. Задавайте вопросы о происходящем, генерируйте названия, распознавайте код или пользуйтесь умными инструментами Gemini!',
      timestamp: Date.now()
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzingFrame, setIsAnalyzingFrame] = useState(false);
  const [autoVisionEnabled, setAutoVisionEnabled] = useState(false);
  const [visionIntervalSec, setVisionIntervalSec] = useState<number>(60);
  const [lastAnalyzedThumbnail, setLastAnalyzedThumbnail] = useState<string | null>(null);
  const [copiedEventId, setCopiedEventId] = useState<string | null>(null);
  const [toolExecuting, setToolExecuting] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const autoVisionTimerRef = useRef<any>(null);

  // Auto-scroll chat to latest message
  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  // Periodic automatic vision analysis
  useEffect(() => {
    if (!autoVisionEnabled) {
      if (autoVisionTimerRef.current) clearInterval(autoVisionTimerRef.current);
      return;
    }

    const performVisionCheck = async () => {
      const frame = getActiveFrameBase64();
      if (!frame) return;

      try {
        setLastAnalyzedThumbnail(frame);
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
            text: '⚠️ Квота Gemini исчерпана или запросы слишком частые. Авто-наблюдение временно отключено.',
            thumbnail: undefined
          });
          return;
        }

        if (data.success && data.comment) {
          const newEvent: AIStreamEvent = {
            id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            timestamp: Date.now(),
            text: data.comment,
            thumbnail: frame
          };
          onAddStreamEvent(newEvent);
        }
      } catch (err) {
        // quiet fail on background tick
      }
    };

    // First check after 2.5s, then periodic
    const firstCheck = setTimeout(performVisionCheck, 2500);
    autoVisionTimerRef.current = setInterval(performVisionCheck, visionIntervalSec * 1000);

    return () => {
      clearTimeout(firstCheck);
      if (autoVisionTimerRef.current) clearInterval(autoVisionTimerRef.current);
    };
  }, [autoVisionEnabled, visionIntervalSec, roomId, getActiveFrameBase64, onAddStreamEvent]);

  // Manual instant frame analysis
  const handleInstantAnalyze = async () => {
    const frame = getActiveFrameBase64();
    if (!frame) {
      setMessages((prev) => [
        ...prev,
        {
          id: `warn_${Date.now()}`,
          role: 'assistant',
          text: '⚠️ Видеопоток сейчас не активен для захвата кадра. Убедитесь, что камера или демонстрация экрана включены.',
          timestamp: Date.now()
        }
      ]);
      setActiveTab('chat');
      return;
    }

    setIsAnalyzingFrame(true);
    setLastAnalyzedThumbnail(frame);

    try {
      const res = await fetch('/api/ai/analyze-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: frame,
          roomId,
          customPrompt: 'Подробно и понятно опиши, что сейчас происходит на экране/в кадре видеотрансляции, назови открытые приложения, код, текст, ключевые детали и действия ведущего.'
        })
      });

      const data = await res.json();
      if (res.status === 429) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err_limit_${Date.now()}`,
            role: 'assistant',
            text: `⚠️ **Лимит превышен:** ${data.error || 'Слишком много запросов. Попробуйте позже.'}`,
            timestamp: Date.now()
          }
        ]);
        setActiveTab('chat');
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

        // Also post into chat so user can see it right away
        setMessages((prev) => [
          ...prev,
          {
            id: `vision_${Date.now()}`,
            role: 'assistant',
            text: `🎯 **Мгновенный анализ кадра и экрана (Gemini):**\n${data.comment}`,
            timestamp: Date.now()
          }
        ]);
        setActiveTab('chat');
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsAnalyzingFrame(false);
    }
  };

  // Run Gemini Action tool
  const handleExecuteGeminiTool = async (actionType: string, toolTitle: string) => {
    const frame = getActiveFrameBase64();
    if (!frame) {
      setMessages((prev) => [
        ...prev,
        {
          id: `warn_${Date.now()}`,
          role: 'assistant',
          text: '⚠️ Для работы инструментов Gemini требуется активный видеопоток (камера или экран).',
          timestamp: Date.now()
        }
      ]);
      setActiveTab('chat');
      return;
    }

    setToolExecuting(actionType);
    try {
      let resultText = '';
      if (actionType === 'summary') {
        const res = await fetch('/api/ai/summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: frame,
            streamEvents
          })
        });
        const data = await res.json();
        resultText = data.summary || 'Сводка сформирована.';
      } else {
        const res = await fetch('/api/ai/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actionType,
            imageBase64: frame
          })
        });
        const data = await res.json();
        resultText = data.result || 'Анализ завершён.';
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `tool_${Date.now()}`,
          role: 'assistant',
          text: `✨ **${toolTitle} (Gemini):**\n\n${resultText}`,
          timestamp: Date.now()
        }
      ]);
      setActiveTab('chat');
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          text: `Ошибка выполнения ${toolTitle}: ${err.message}`,
          timestamp: Date.now()
        }
      ]);
      setActiveTab('chat');
    } finally {
      setToolExecuting(null);
    }
  };

  // Send Chat message to Gemini
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
    setActiveTab('chat');

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
          text: `Ошибка связи с Gemini: ${err.message}`,
          timestamp: Date.now()
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const copyEventText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedEventId(id);
    setTimeout(() => setCopiedEventId(null), 2000);
  };

  const quickPrompts = [
    { label: '🔍 Что в кадре?', prompt: 'Подробно опиши, что сейчас происходит на экране и в видеопотоке стрима.' },
    { label: '💻 Распознать код', prompt: 'Проанализируй текст, код и интерфейс на экране и объясни его суть.' },
    { label: '💡 Совет ведущему', prompt: 'Оцени текущий кадр и дай совет стримеру по освещению, ракурсу и общению.' },
    { label: '📜 Что было интересного?', prompt: 'Сделай краткую сводку ключевых моментов стрима.' }
  ];

  const geminiTools = [
    {
      id: 'generate-title-tags',
      title: '📝 Название и хэштеги',
      desc: 'Генерация броских заголовков, тегов и категории по текущему кадру',
      icon: Tag,
      color: 'from-amber-500/20 to-rose-500/20 text-amber-300 border-amber-500/30'
    },
    {
      id: 'transcribe-ocr',
      title: '💻 OCR & Анализ кода/экрана',
      desc: 'Точное считывание текстов, кода программ, консоли и интерфейсов',
      icon: Code2,
      color: 'from-blue-500/20 to-cyan-500/20 text-cyan-300 border-cyan-500/30'
    },
    {
      id: 'detect-objects',
      title: '👥 Объекты, эмоции и окружение',
      desc: 'Распознавание людей, жестов, оборудования и обстановки',
      icon: Users2,
      color: 'from-emerald-500/20 to-teal-500/20 text-emerald-300 border-emerald-500/30'
    },
    {
      id: 'streamer-tips',
      title: '💡 Режиссёрский совет стримеру',
      desc: 'Практические подсказки по композиции, свету и удержанию внимания',
      icon: Lightbulb,
      color: 'from-yellow-500/20 to-orange-500/20 text-yellow-300 border-yellow-500/30'
    },
    {
      id: 'summary',
      title: '📊 Полный рекап стрима',
      desc: 'Интеллектуальная сводка всей трансляции для зрителей и соцсетей',
      icon: FileText,
      color: 'from-purple-500/20 to-indigo-500/20 text-purple-300 border-purple-500/30'
    }
  ];

  const containerBg = isTranslucent
    ? 'bg-black/85 backdrop-blur-md border-orange-500/30 shadow-xl'
    : 'bg-black/90 backdrop-blur-md border-orange-500/30 shadow-2xl';

  return (
    <div className={`flex flex-col border rounded-none overflow-hidden transition-all duration-300 font-mono text-neutral-200 ${containerBg} ${className}`}>
      {/* Top Header */}
      <div className="p-3.5 border-b border-orange-500/20 bg-black flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-8 h-8 rounded-none bg-orange-500 flex items-center justify-center text-black font-bold shadow-md">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-none bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-none h-2.5 w-2.5 bg-orange-500"></span>
            </span>
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5 uppercase">
              <span>ИИ-Наблюдатель Gemini</span>
              <span className="px-1.5 py-0.2 rounded-none text-[9px] bg-orange-500/10 text-orange-400 font-mono font-bold uppercase tracking-wider border border-orange-500/20">
                FLASH 1.5
              </span>
            </h3>
            <p className="text-[10px] text-neutral-400 font-mono uppercase">Зрение в реальном времени + диалог</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {onToggleDock && (
            <button
              onClick={onToggleDock}
              className="p-1.5 rounded-none text-neutral-400 hover:text-orange-500 hover:bg-neutral-900 transition text-xs border border-transparent hover:border-orange-500/20"
              title={isDocked ? 'Развернуть в плавающее окно' : 'Закрепить на боковой панели'}
            >
              {isDocked ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-none text-neutral-400 hover:text-orange-500 hover:bg-neutral-900 transition border border-transparent hover:border-orange-500/20"
              title="Закрыть панель ИИ"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Mode / Tabs Switcher */}
      <div className="p-1.5 bg-neutral-950/80 border-b border-orange-500/10 flex gap-1 shrink-0">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 py-1.5 px-2 rounded-none text-[11px] font-bold uppercase flex items-center justify-center gap-1.5 transition ${
            activeTab === 'chat'
              ? 'bg-orange-500 text-black'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Диалог</span>
        </button>

        <button
          onClick={() => setActiveTab('tools')}
          className={`flex-1 py-1.5 px-2 rounded-none text-[11px] font-bold uppercase flex items-center justify-center gap-1.5 transition ${
            activeTab === 'tools'
              ? 'bg-orange-500 text-black'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Инструменты</span>
        </button>

        <button
          onClick={() => setActiveTab('events')}
          className={`flex-1 py-1.5 px-2 rounded-none text-[11px] font-bold uppercase flex items-center justify-center gap-1.5 transition ${
            activeTab === 'events'
              ? 'bg-orange-500 text-black'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>События ({streamEvents.length})</span>
        </button>
      </div>

      {/* Vision Toolbar */}
      <div className="px-3 py-2 bg-neutral-950/40 border-b border-orange-500/10 flex items-center justify-between gap-2 shrink-0">
        <button
          onClick={handleInstantAnalyze}
          disabled={isAnalyzingFrame}
          className="px-2.5 py-1 rounded-none bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-orange-400 text-[10px] font-bold uppercase flex items-center gap-1.5 transition shadow-sm"
          title="Сделать моментальный снимок и анализ текущего кадра/экрана"
        >
          <Eye className={`w-3.5 h-3.5 ${isAnalyzingFrame ? 'animate-spin' : ''}`} />
          <span>{isAnalyzingFrame ? 'Анализ...' : 'Распознать кадр'}</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoVisionEnabled(!autoVisionEnabled)}
            className={`px-2 py-1 rounded-none text-[10px] font-bold uppercase flex items-center gap-1.5 transition border ${
              autoVisionEnabled
                ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                : 'bg-neutral-900 text-neutral-400 border-white/5'
            }`}
            title="Автоматический периодический анализ происходящего в кадре"
          >
            <span className={`w-1.5 h-1.5 rounded-none ${autoVisionEnabled ? 'bg-orange-500 animate-pulse' : 'bg-neutral-500'}`}></span>
            <span>Авто: {autoVisionEnabled ? `${visionIntervalSec}с` : 'Выкл'}</span>
          </button>
        </div>
      </div>

      {/* TAB 1: Live Interactive AI Chat & QA (Default) */}
      {activeTab === 'chat' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scroll">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-none bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0 mt-0.5 shadow-sm">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] p-3 rounded-none text-xs leading-relaxed border ${
                    msg.role === 'user'
                      ? 'bg-orange-500/10 text-orange-300 border-orange-500/30'
                      : 'bg-neutral-950 text-neutral-200 border-white/5'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  <span className="text-[9px] text-neutral-500 block text-right mt-1 font-mono">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-2.5 items-start animate-pulse">
                <div className="w-6 h-6 rounded-none bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="p-3 rounded-none bg-neutral-950 border border-orange-500/20 text-orange-400 text-xs flex items-center gap-2 font-mono">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-orange-500" />
                  <span>ИИ анализирует кадр...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Chips */}
          <div className="px-3 py-1.5 border-t border-orange-500/10 flex gap-1.5 overflow-x-auto shrink-0 bg-neutral-950/30">
            {quickPrompts.map((qp, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(qp.prompt)}
                disabled={isLoading}
                className="whitespace-nowrap px-2.5 py-1 rounded-none bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-orange-400 border border-orange-500/10 text-[10px] font-bold uppercase transition shrink-0"
              >
                {qp.label}
              </button>
            ))}
          </div>

          {/* Persistent Chat Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 border-t border-orange-500/20 bg-black flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Спросите о стриме, коде или о чём угодно..."
              disabled={isLoading}
              className="flex-1 bg-neutral-950 border border-orange-500/20 rounded-none px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 transition"
            />
            <button
              type="submit"
              disabled={!inputQuery.trim() || isLoading}
              className="p-2 rounded-none bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-black transition shrink-0"
              title="Отправить вопрос Gemini"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* TAB 2: Specialized Gemini Tools */}
      {activeTab === 'tools' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scroll">
          <p className="text-[10px] text-neutral-400 mb-2 uppercase font-bold tracking-wider">
            Все инструменты работают на моделях Gemini с прямым анализом кадра:
          </p>

          {geminiTools.map((tool) => {
            const Icon = tool.icon;
            const isRunning = toolExecuting === tool.id;
            return (
              <div
                key={tool.id}
                className="p-3 rounded-none bg-neutral-950 border border-orange-500/20 transition flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-orange-500" />
                    <span className="font-bold text-xs text-white uppercase">{tool.title}</span>
                  </div>
                  <button
                    onClick={() => handleExecuteGeminiTool(tool.id, tool.title)}
                    disabled={Boolean(toolExecuting)}
                    className="px-2.5 py-1 rounded-none bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 text-[10px] font-bold uppercase transition flex items-center gap-1.5 disabled:opacity-50 border border-orange-500/30"
                  >
                    {isRunning ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin text-orange-500" />
                        <span>...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3" />
                        <span>СТАРТ</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-neutral-400 leading-relaxed font-normal">
                  {tool.desc}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 3: Live Event Commentary Timeline */}
      {activeTab === 'events' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scroll">
            {streamEvents.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-neutral-400 my-auto">
                <div className="w-12 h-12 rounded-none bg-neutral-950 border border-orange-500/20 flex items-center justify-center mb-3 text-orange-500">
                  <Eye className="w-6 h-6 animate-pulse" />
                </div>
                <h4 className="font-bold text-white text-xs uppercase tracking-wider">ИИ-наблюдатель на связи</h4>
                <p className="text-[10px] text-neutral-400 mt-1 max-w-xs leading-relaxed uppercase">
                  Здесь будут появляться живые текстовые комментарии событий и деталей в кадре.
                </p>
                <button
                  onClick={handleInstantAnalyze}
                  disabled={isAnalyzingFrame}
                  className="mt-4 px-3 py-1.5 rounded-none bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 text-xs font-bold uppercase flex items-center gap-1.5 transition"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Создать первый комментарий</span>
                </button>
              </div>
            ) : (
              streamEvents.map((event, idx) => (
                <div
                  key={event.id || idx}
                  className="group p-3 rounded-none bg-neutral-950 border border-orange-500/10 hover:border-orange-500/30 transition flex flex-col gap-2 relative shadow-sm font-mono"
                >
                  <div className="flex items-center justify-between text-[9px] text-neutral-500">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-none bg-orange-500"></span>
                      <span className="font-mono text-neutral-400">
                        {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      {idx === 0 && (
                        <span className="px-1.5 py-0.2 rounded-none bg-orange-500/10 text-orange-400 text-[9px] font-bold uppercase border border-orange-500/20">
                          NEW
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => copyEventText(event.id, event.text)}
                        className="p-1 rounded-none hover:bg-neutral-900 text-neutral-400 hover:text-white"
                        title="Скопировать комментарий"
                      >
                        {copiedEventId === event.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={() => {
                          handleSendMessage(`Расскажи подробнее про этот момент: "${event.text}"`);
                        }}
                        className="p-1 rounded-none hover:bg-neutral-900 text-neutral-400 hover:text-white flex items-center gap-0.5 text-[10px]"
                        title="Спросить у Gemini подробнее"
                      >
                        <span>Спросить</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-neutral-200 leading-relaxed font-normal">
                    {event.text}
                  </p>
                </div>
              ))
            )}
          </div>

          {/* Quick ask bar at bottom of events tab */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 border-t border-orange-500/20 bg-black flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Задать вопрос Gemini по текущему кадру..."
              disabled={isLoading}
              className="flex-1 bg-neutral-950 border border-orange-500/20 rounded-none px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 transition"
            />
            <button
              type="submit"
              disabled={!inputQuery.trim() || isLoading}
              className="p-2 rounded-none bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-black transition shadow-md shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
