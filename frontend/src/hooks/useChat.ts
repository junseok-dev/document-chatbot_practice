import { useState, useCallback, useRef, useEffect } from 'react';
import { Message, SuggestedQuestion } from '../types';
import { chatApi } from '../services/api';

const generateId = () => Math.random().toString(36).substring(2, 15);

export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([{
    id: 'welcome',
    role: 'assistant',
    content: '안녕하세요! CodeAI 부트캠프 교육 과정 안내 챗봇입니다. 무엇을 도와드릴까요?',
    timestamp: new Date().toISOString(),
  }]);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState<SuggestedQuestion[]>([]);
  
  // 세션 ID는 한 번 생성 후 유지
  const sessionIdRef = useRef(`session_${Date.now()}_${generateId()}`);

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
      const response = await chatApi.sendMessage(sessionIdRef.current, content);
      
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
