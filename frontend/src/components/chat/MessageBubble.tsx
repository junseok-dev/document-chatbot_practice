import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Message } from '../../types';

interface Props {
  message: Message;
  isStreaming?: boolean;
}

const THINKING_STATUSES = [
  '질문을 확인하고 있어요.',
  '핵심 의도를 파악하고 있어요.',
  '관련 안내를 찾아보고 있어요.',
  '필요한 내용만 고르고 있어요.',
  '쉽게 말할 답변으로 정리하고 있어요.',
];

const MessageBubble: React.FC<Props> = ({ message, isStreaming = false }) => {
  const isUser = message.role === 'user';
  const [statusIndex, setStatusIndex] = useState(0);
  const timeString = new Date(message.timestamp).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const assistantBubbles = message.content
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  useEffect(() => {
    if (!isStreaming) {
      setStatusIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setStatusIndex((current) => (current + 1) % THINKING_STATUSES.length);
    }, 3000);

    return () => window.clearInterval(timer);
  }, [isStreaming]);

  if (isUser) {
    return (
      <div className="flex justify-end items-end gap-1.5 mb-1 px-4">
        <span className="text-[10px] text-gray-400 mb-0.5 shrink-0">{timeString}</span>
        <div className="max-w-[70%] rounded-2xl rounded-br-sm bg-brand-500 px-4 py-2.5 text-[14px] leading-relaxed text-white shadow-sm">
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 mb-1 px-4">
      <div className="shrink-0 mt-1">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white text-xs font-bold shadow-sm">
          AI
        </div>
      </div>

      <div className="flex flex-col max-w-[72%]">
        <span className="mb-1 text-[12px] font-semibold text-gray-600">엔코아AI캠퍼스</span>
        <div className="flex items-end gap-1.5">
          <div className="flex flex-col items-start gap-1.5">
            {isStreaming ? (
              <div className="w-fit max-w-full rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 text-[14px] leading-relaxed text-gray-800 shadow-sm border border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="break-keep">{THINKING_STATUSES[statusIndex]}</span>
                  <span className="flex gap-0.5 pt-1">
                    <span className="h-1 w-1 rounded-full bg-brand-400 animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-1 w-1 rounded-full bg-brand-400 animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-1 w-1 rounded-full bg-brand-400 animate-bounce" />
                  </span>
                </div>
              </div>
            ) : (
              assistantBubbles.map((bubble, index) => (
                <div
                  key={index}
                  className={`w-fit max-w-full rounded-2xl bg-white px-4 py-2.5 text-[14px] leading-relaxed text-gray-800 shadow-sm border border-gray-100 ${
                    index === 0 ? 'rounded-tl-sm' : ''
                  }`}
                >
                  <div className="whitespace-pre-wrap break-keep">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <span>{children}</span>,
                        strong: ({ children }) => <strong className="font-semibold text-gray-950">{children}</strong>,
                      }}
                    >
                      {bubble}
                    </ReactMarkdown>
                  </div>
                </div>
              ))
            )}

            {message.source && !['fallback', 'handoff', 'guardrail'].includes(message.source) && (
              <div className="px-1 text-[10px] text-gray-400 text-right">
                {message.source === 'faq' ? 'FAQ 답변' : 'AI 분석 답변'}
              </div>
            )}

            {message.source === 'handoff' && (
              <div className="mt-1">
                {message.handoff_url ? (
                  <a
                    href={message.handoff_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600"
                  >
                    상담 매니저 연결하기
                  </a>
                ) : (
                  <p className="text-xs text-brand-600">
                    상담 매니저 연결이 필요합니다. 채널로 문의해 주세요.
                  </p>
                )}
              </div>
            )}
          </div>
          <span className="text-[10px] text-gray-400 mb-0.5 shrink-0">{timeString}</span>
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
