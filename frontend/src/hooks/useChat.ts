import { useCallback, useEffect, useRef, useState } from 'react';
import { Conversation, Message, SuggestedQuestion } from '../types';
import { chatApi } from '../services/api';

const generateId = () => Math.random().toString(36).substring(2, 15);

const CONVERSATIONS_KEY = 'chatConversations';
const CURRENT_CONV_KEY = 'chatCurrentConvId';

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    '안녕하세요! 엔코아AI캠퍼스 상담 챗봇입니다. 인터뷰, 교육 프로그램, 수강신청 등 궁금하신 내용을 편하게 물어봐 주세요 😊',
  timestamp: new Date().toISOString(),
};

const loadConversations = (): Conversation[] => {
  try {
    const stored = sessionStorage.getItem(CONVERSATIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const persistConversations = (convs: Conversation[]) => {
  try {
    sessionStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(convs));
  } catch {}
};

const saveConversation = (conv: Conversation) => {
  const convs = loadConversations();
  const idx = convs.findIndex((c) => c.id === conv.id);
  if (idx >= 0) {
    convs[idx] = conv;
  } else {
    convs.unshift(conv);
  }
  persistConversations(convs);
};

const makeConversation = (id: string, sessionId: string, messages: Message[]): Conversation => {
  const firstUser = messages.find((m) => m.role === 'user');
  const title = firstUser
    ? firstUser.content.slice(0, 28) + (firstUser.content.length > 28 ? '…' : '')
    : '새 대화';
  return { id, title, messages, startedAt: messages[0]?.timestamp ?? new Date().toISOString(), sessionId };
};

const newSessionId = () => `session_${Date.now()}_${generateId()}`;
const newConvId = () => `conv_${Date.now()}_${generateId()}`;

export const useChat = () => {
  const [convId, setConvId] = useState<string>(() => {
    return sessionStorage.getItem(CURRENT_CONV_KEY) ?? newConvId();
  });
  const [messages, setMessages] = useState<Message[]>(() => {
    const id = sessionStorage.getItem(CURRENT_CONV_KEY);
    if (!id) return [WELCOME_MESSAGE];
    const conv = loadConversations().find((c) => c.id === id);
    return conv ? conv.messages : [WELCOME_MESSAGE];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState<SuggestedQuestion[]>([]);
  const sessionIdRef = useRef(newSessionId());

  useEffect(() => {
    sessionStorage.setItem(CURRENT_CONV_KEY, convId);
  }, [convId]);

  useEffect(() => {
    const hasUser = messages.some((m) => m.role === 'user');
    if (!hasUser) return;
    saveConversation(makeConversation(convId, sessionIdRef.current, messages));
  }, [messages, convId]);

  useEffect(() => {
    chatApi
      .getSuggestedQuestions()
      .then((res) => setSuggestedQuestions(res.questions))
      .catch((err) => console.error('Failed to load suggested questions:', err));
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      const userMessage: Message = {
        id: generateId(),
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      try {
        const response = await chatApi.sendMessage(sessionIdRef.current, content);
        const botMessage: Message = {
          id: generateId(),
          role: 'assistant',
          content: response.answer,
          source: response.source,
          handoff_url: response.handoff_url ?? null,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, botMessage]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: 'assistant',
            content: '서버와 통신하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
            source: 'fallback',
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading],
  );

  const startNewChat = useCallback(() => {
    const id = newConvId();
    sessionIdRef.current = newSessionId();
    setConvId(id);
    setMessages([{ ...WELCOME_MESSAGE, id: 'welcome', timestamp: new Date().toISOString() }]);
  }, []);

  const loadConversation = useCallback((conv: Conversation) => {
    sessionIdRef.current = conv.sessionId;
    setConvId(conv.id);
    setMessages(conv.messages);
  }, []);

  return {
    messages,
    isLoading,
    suggestedQuestions,
    sendMessage,
    startNewChat,
    loadConversation,
  };
};

export const useConversations = () => {
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);

  const refresh = useCallback(() => {
    setConversations(loadConversations());
  }, []);

  const search = useCallback((keyword: string): Conversation[] => {
    const convs = loadConversations();
    if (!keyword.trim()) return convs;
    const lower = keyword.toLowerCase();
    return convs.filter(
      (c) =>
        c.title.toLowerCase().includes(lower) ||
        c.messages.some((m) => m.content.toLowerCase().includes(lower)),
    );
  }, []);

  return { conversations, refresh, search };
};
