import React, { useEffect, useRef } from 'react';
import { Message, SuggestedQuestion } from '../../types';
import MessageBubble from './MessageBubble';
import InputBar from './InputBar';
import SuggestedQuestions from './SuggestedQuestions';

interface Props {
  messages: Message[];
  isLoading: boolean;
  suggestedQuestions: SuggestedQuestion[];
  sendMessage: (content: string) => void;
}

const ChatWindow: React.FC<Props> = ({ messages, isLoading, suggestedQuestions, sendMessage }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const showSuggestions = !isLoading && messages[messages.length - 1]?.role === 'assistant';

  return (
    <div className="flex h-full flex-col bg-[#EEF0F5]">
      {/* 메시지 영역 - 상단부터 시작 */}
      <div className="flex-1 overflow-y-auto py-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {isLoading && (
          <div className="flex justify-start mb-1.5 px-3">
            <div className="flex gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brand-200 bg-brand-100 text-brand-600 shadow-sm">
                <div className="w-4 h-4 border-2 border-brand-400/40 border-t-brand-500 rounded-full animate-spin" />
              </div>
              <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-gray-100 bg-white px-4 py-3 shadow-sm">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce" />
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} className="h-2" />
      </div>

      {/* 카테고리 버튼 - 스크롤 영역 밖 하단 고정 */}
      {showSuggestions && (
        <div className="shrink-0 border-t border-gray-200 bg-[#EEF0F5] px-3 py-2.5">
          <SuggestedQuestions
            questions={suggestedQuestions}
            onSelect={sendMessage}
            disabled={isLoading}
          />
        </div>
      )}

      <InputBar onSendMessage={sendMessage} isLoading={isLoading} />
    </div>
  );
};

export default ChatWindow;
