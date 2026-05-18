import React, { useEffect, useRef } from 'react';
import { Message, SuggestedQuestion } from '../../types';
import MessageBubble from './MessageBubble';
import InputBar from './InputBar';
import SuggestedQuestions from './SuggestedQuestions';

interface Props {
  messages: Message[];
  isLoading: boolean;
  streamingMessageId: string | null;
  suggestedQuestions: SuggestedQuestion[];
  sendMessage: (content: string) => void;
  stopGenerating: () => void;
  convId?: string;
}

const SCROLL_STORAGE_PREFIX = 'chatScroll:v1:';
const NEAR_BOTTOM_THRESHOLD = 80;

const ChatWindow: React.FC<Props> = ({
  messages,
  isLoading,
  streamingMessageId,
  suggestedQuestions,
  sendMessage,
  stopGenerating,
  convId,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasRestoredRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const scrollKey = `${SCROLL_STORAGE_PREFIX}${convId ?? 'default'}`;

  // 대화가 바뀌면 복원 플래그 리셋
  useEffect(() => {
    hasRestoredRef.current = false;
    isNearBottomRef.current = true;
  }, [convId]);

  // 메시지 로드 후 첫 렌더에서 저장된 스크롤 위치 복원
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || hasRestoredRef.current || messages.length === 0) return;

    const saved = sessionStorage.getItem(scrollKey);
    if (saved !== null) {
      container.scrollTop = Number(saved);
    } else {
      container.scrollTop = container.scrollHeight;
    }
    const distanceFromBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);
    isNearBottomRef.current = distanceFromBottom < NEAR_BOTTOM_THRESHOLD;
    hasRestoredRef.current = true;
  }, [messages.length, scrollKey]);

  // 새 메시지/스트리밍: 사용자가 맨 아래 근처일 때만 따라감
  useEffect(() => {
    if (!hasRestoredRef.current || !isNearBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container || !hasRestoredRef.current) return;
    const distanceFromBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);
    isNearBottomRef.current = distanceFromBottom < NEAR_BOTTOM_THRESHOLD;
    sessionStorage.setItem(scrollKey, String(container.scrollTop));
  };

  const showSuggestions = !isLoading && messages[messages.length - 1]?.role === 'assistant';
  // 스트리밍 메시지가 아직 없을 때만 외부 로딩 인디케이터 표시
  const showLoadingDots = isLoading && !streamingMessageId;

  return (
    <div className="flex h-full flex-col bg-[#EEF4FF]">
      {/* 메시지 영역 */}
      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto py-4 space-y-0.5">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isStreaming={message.id === streamingMessageId && message.content === ''}
          />
        ))}

        {showLoadingDots && (
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
        <div className="shrink-0 border-t border-blue-100 bg-white px-3 py-2 sm:px-4 sm:py-2.5">
          <SuggestedQuestions
            questions={suggestedQuestions}
            onSelect={sendMessage}
            disabled={isLoading}
          />
        </div>
      )}

      <InputBar onSendMessage={sendMessage} onStop={stopGenerating} isLoading={isLoading} />
    </div>
  );
};

export default ChatWindow;
