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
    <div className="flex h-full flex-col bg-[#EEF4FF]">
      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto py-4 space-y-0.5">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {isLoading && (
          <div className="flex items-start gap-2.5 px-4 mb-1">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white text-xs font-bold shadow-sm">
              AI
            </div>
            <div className="flex flex-col">
              <span className="mb-1 text-[12px] font-semibold text-gray-600">엔코아AI캠퍼스</span>
              <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-sm border border-gray-100">
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

      {/* 퀵리플라이 버튼 */}
      {showSuggestions && (
        <div className="shrink-0 border-t border-blue-100 bg-white px-4 py-2.5">
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
