import { useState, useCallback, useRef, useEffect } from 'react';
import { Message, SuggestedQuestion } from '../types';
import { chatApi } from '../services/api';
import { getStoredGoogleUser } from './useAuth';

const generateId = () => Math.random().toString(36).substring(2, 15);

const getOrCreateSessionId = (): string => {
  const googleUser = getStoredGoogleUser();
  if (googleUser) {
    // Google 유저: localStorage에 저장 → 브라우저 재시작해도 유지
    const key = `chatSessionId_${googleUser.sub}`;
    const stored = localStorage.getItem(key);
    if (stored) return stored;
    const newId = `gsession_${Date.now()}_${generateId()}`;
    localStorage.setItem(key, newId);
    return newId;
  } else {
    // 비회원: sessionStorage에 저장 → 브라우저 닫으면 초기화
    const stored = sessionStorage.getItem('chatSessionId');
    if (stored) return stored;
    const newId = `session_${Date.now()}_${generateId()}`;
    sessionStorage.setItem('chatSessionId', newId);
    return newId;
  }
};

export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([{
    id: 'welcome',
    role: 'assistant',
    content: '안녕하세요! CodeAI 부트캠프 교육 과정 안내 챗봇입니다. 무엇을 도와드릴까요?',
    timestamp: new Date().toISOString(),
  }]);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState<SuggestedQuestion[]>([]);

  const sessionIdRef = useRef(getOrCreateSessionId());

  useEffect(() => {
    // 추천 질문 초기 로드
    chatApi.getSuggestedQuestions()
      .then(res => setSuggestedQuestions(res.questions))
      .catch(err => console.error("Failed to load suggested questions:", err));
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
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
        timestamp: new Date().toISOString(),
      };
      
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error("Chat API Error:", error);
      const errorMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: '서버와 통신하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
        source: 'fallback',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  return {
    messages,
    isLoading,
    suggestedQuestions,
    sendMessage,
  };
};
