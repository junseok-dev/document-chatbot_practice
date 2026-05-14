import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Bot } from 'lucide-react';
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

  if (isUser) {
    return (
      <div className="flex justify-end mb-1.5 px-3">
        <div className="flex items-end gap-1.5 max-w-[72%]">
          <span className="shrink-0 mb-0.5 text-[11px] text-gray-400">{timeString}</span>
          <div className="bg-brand-500 text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed shadow-sm">
            <div className="whitespace-pre-wrap">{message.content}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-1.5 px-3">
      <div className="flex gap-2 max-w-[78%]">
        <div className="shrink-0 mt-0.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-brand-200 bg-brand-100 text-brand-600 shadow-sm">
            <Bot size={18} />
          </div>
        </div>
        <div className="flex flex-col">
          <span className="mb-1 ml-1 text-xs font-medium text-gray-500">엔코아AI캠퍼스 상담 챗봇</span>
          <div className="flex items-end gap-1.5">
            <div className="rounded-2xl rounded-tl-sm border border-gray-100 bg-white px-4 py-2.5 text-sm leading-relaxed text-gray-800 shadow-sm">
              <div className="prose prose-sm prose-brand max-w-none prose-p:my-0.5 prose-a:text-brand-600 prose-a:no-underline hover:prose-a:underline prose-ul:my-1 prose-li:my-0.5">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>

              {message.source && !['fallback', 'handoff', 'guardrail'].includes(message.source) && (
                <div className="mt-2 border-t border-gray-100 pt-1.5 text-[10px] text-gray-400 text-right">
                  {message.source === 'faq' ? 'FAQ 답변' : 'AI 분석 답변'}
                </div>
              )}

              {message.source === 'handoff' && (
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
            <span className="shrink-0 mb-0.5 text-[11px] text-gray-400">{timeString}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
