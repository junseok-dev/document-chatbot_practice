import { useState, useCallback, useRef, useEffect } from 'react';
import { Message, SuggestedQuestion } from '../types';
import { chatApi } from '../services/api';
import { getStoredGoogleUser } from './useAuth';

const generateId = () => Math.random().toString(36).substring(2, 15);

const getOrCreateSessionId = (): string => {
  const googleUser = getStoredGoogleUser();
  if (googleUser) {
    const key = `chatSessionId_${googleUser.sub}`;
    const stored = localStorage.getItem(key);
    if (stored) return stored;
    const newId = `gsession_${Date.now()}_${generateId()}`;
    localStorage.setItem(key, newId);
    return newId;
  }

  const stored = sessionStorage.getItem('chatSessionId');
  if (stored) return stored;
  const newId = `session_${Date.now()}_${generateId()}`;
  sessionStorage.setItem('chatSessionId', newId);
  return newId;
};

export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        '안녕하세요. 플레이데이터 상담 챗봇입니다. 법률, 운영규정, 과정 상세, 플레이데이터 정보 4가지 카테고리를 기준으로 안내드릴 수 있어요. 아래 추천 버튼을 누르시거나 궁금한 점을 바로 질문해 주세요.',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState<SuggestedQuestion[]>([]);

  const sessionIdRef = useRef(getOrCreateSessionId());

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
        const googleUser = getStoredGoogleUser();
        const response = await chatApi.sendMessage(
          sessionIdRef.current,
          content,
          googleUser?.name,
        );

        const botMessage: Message = {
          id: generateId(),
          role: 'assistant',
          content: response.answer,
          source: response.source,
          handoff_url: response.handoff_url ?? null,
          timestamp: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, botMessage]);
      } catch (error) {
        console.error('Chat API Error:', error);
        const errorMessage: Message = {
          id: generateId(),
          role: 'assistant',
          content: '서버와 통신하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
          source: 'fallback',
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading],
  );

  return {
    messages,
    isLoading,
    suggestedQuestions,
    sendMessage,
  };
};
