import React, { useEffect, useRef } from 'react';
import { useChat } from '../../hooks/useChat';
import MessageBubble from './MessageBubble';
import InputBar from './InputBar';
import SuggestedQuestions from './SuggestedQuestions';

const ChatWindow: React.FC = () => {
  const { messages, isLoading, suggestedQuestions, sendMessage } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  return (
    <div className="flex flex-col h-full bg-[#F9FAFB]">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 scroll-smooth">
        <div className="max-w-4xl mx-auto flex flex-col min-h-full">
          <div className="flex-1">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            
            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex justify-start mb-6">
                <div className="flex items-center gap-2 bg-white px-5 py-4 rounded-2xl border border-gray-100 shadow-sm rounded-bl-none">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce"></div>
                  </div>
                  <span className="text-sm text-gray-500 font-medium ml-2">답변을 생성하고 있습니다...</span>
                </div>
              </div>
            )}
          </div>
          
          {/* Suggested Questions (only show if not loading and last message is from assistant) */}
          <div className="mt-4">
            {!isLoading && messages[messages.length - 1]?.role === 'assistant' && (
              <SuggestedQuestions
                questions={suggestedQuestions}
                onSelect={sendMessage}
                disabled={isLoading}
              />
            )}
            <div ref={messagesEndRef} className="h-4" />
          </div>
        </div>
      </div>

      {/* Input Area */}
      <InputBar onSendMessage={sendMessage} isLoading={isLoading} />
    </div>
  );
};

export default ChatWindow;
