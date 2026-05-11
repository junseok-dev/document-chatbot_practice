import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Message } from '../../types';
import { Bot, User } from 'lucide-react';

interface Props {
  message: Message;
}

const MessageBubble: React.FC<Props> = ({ message }) => {
  const isUser = message.role === 'user';
  const timeString = new Date(message.timestamp).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-6 group`}>
      <div className={`flex max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end gap-2`}>
        
        {/* Avatar */}
        <div className="flex-shrink-0 mb-1">
          {isUser ? (
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shadow-sm border border-blue-200">
              <User size={18} />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 shadow-sm border border-brand-200">
              <Bot size={18} />
            </div>
          )}
        </div>

        {/* Message Content Area */}
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
          {!isUser && (
            <span className="text-xs text-gray-500 mb-1 ml-1 font-medium">
              CodeAI 상담원
            </span>
          )}
          
          <div
            className={`relative px-5 py-3.5 rounded-2xl shadow-sm text-[15px] leading-relaxed
              ${isUser 
                ? 'bg-brand-600 text-white rounded-br-none' 
                : 'bg-white border border-gray-100 text-gray-800 rounded-bl-none'
              }
            `}
          >
            {isUser ? (
              <div className="whitespace-pre-wrap">{message.content}</div>
            ) : (
              <div className="prose prose-sm prose-brand max-w-none 
                prose-p:my-1 prose-a:text-brand-600 prose-a:no-underline hover:prose-a:underline
                prose-ul:my-1 prose-li:my-0.5">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            )}
            
            {/* Source indicator for assistant messages */}
            {!isUser && message.source && message.source !== 'fallback' && (
              <div className="mt-2 pt-2 border-t border-gray-100/10 text-[10px] opacity-60 flex justify-end">
                {message.source === 'faq' ? '⚡ 빠른 응답' : '📚 AI 분석 응답'}
              </div>
            )}
          </div>
        </div>

        {/* Timestamp */}
        <div className="text-[11px] text-gray-400 font-medium px-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {timeString}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
