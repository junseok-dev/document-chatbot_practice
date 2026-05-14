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
    <div className="flex h-full flex-col bg-[#EEF0F5]">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto py-4 scroll-smooth">
        <div className="flex flex-col min-h-full">
          <div className="flex-1 flex flex-col justify-end">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex justify-start mb-1.5 px-3">
                <div className="flex gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brand-200 bg-brand-100 text-brand-600 shadow-sm">
                    <div className="w-4 h-4 border-2 border-brand-400/40 border-t-brand-500 rounded-full animate-spin" />
                  </div>
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-gray-100 bg-white px-4 py-3 shadow-sm">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce"></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Suggested Questions */}
          <div className="mt-3 px-3">
            {!isLoading && messages[messages.length - 1]?.role === 'assistant' && (
              <SuggestedQuestions
                questions={suggestedQuestions}
                onSelect={sendMessage}
                disabled={isLoading}
              />
            )}
            <div ref={messagesEndRef} className="h-2" />
          </div>
        </div>
      </div>

      {/* Input Area */}
      <InputBar onSendMessage={sendMessage} isLoading={isLoading} />
    </div>
  );
};

export default ChatWindow;
