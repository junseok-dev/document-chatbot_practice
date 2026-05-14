import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Bot, User } from 'lucide-react';
import { Message } from '../../types';

interface Props {
  message: Message;
}

const MessageBubble: React.FC<Props> = ({ message }) => {
  const isUser = message.role === 'user';
  const timeString = new Date(message.timestamp).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`mb-6 flex w-full ${isUser ? 'justify-end' : 'justify-start'} group`}>
      <div className={`flex max-w-[85%] items-end gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className="mb-1 flex-shrink-0">
          {isUser ? (
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-blue-200 bg-blue-100 text-blue-600 shadow-sm">
              <User size={18} />
            </div>
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-brand-200 bg-brand-100 text-brand-600 shadow-sm">
              <Bot size={18} />
            </div>
          )}
        </div>

        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
          {!isUser && <span className="mb-1 ml-1 text-xs font-medium text-gray-500">Playdata Chatbot</span>}

          <div
            className={`relative rounded-2xl px-5 py-3.5 text-[15px] leading-relaxed shadow-sm ${
              isUser
                ? 'rounded-br-none bg-brand-600 text-white'
                : 'rounded-bl-none border border-gray-100 bg-white text-gray-800'
            }`}
          >
            {isUser ? (
              <div className="whitespace-pre-wrap">{message.content}</div>
            ) : (
              <div className="prose prose-sm prose-brand max-w-none prose-p:my-1 prose-a:text-brand-600 prose-a:no-underline hover:prose-a:underline prose-ul:my-1 prose-li:my-0.5">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            )}

            {!isUser && message.source && !['fallback', 'handoff', 'guardrail'].includes(message.source) && (
              <div className="mt-2 flex justify-end border-t border-gray-100/10 pt-2 text-[10px] opacity-60">
                {message.source === 'faq' ? 'FAQ 답변' : 'AI 분석 답변'}
              </div>
            )}

            {!isUser && message.source === 'handoff' && (
              <div className="mt-3">
                {message.handoff_url ? (
                  <a
                    href={message.handoff_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600"
                  >
                    상담 매니저 연결하기
                  </a>
                ) : (
                  <p className="text-xs text-amber-600">
                    상담 매니저와 연결이 필요합니다. 채널톡으로 문의해 주세요.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="px-1 text-[11px] font-medium text-gray-400 opacity-0 transition-opacity group-hover:opacity-100">
          {timeString}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
