import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import ChatWindow from '../components/chat/ChatWindow';
import HistoryDropdown from '../components/chat/HistoryPanel';
import { useChat } from '../hooks/useChat';
import { Conversation } from '../types';

const ChatPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    messages,
    isLoading,
    streamingMessageId,
    suggestedQuestions,
    sendMessage,
    stopGenerating,
    loadConversation,
    convId,
  } = useChat();
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      <header className="relative z-10 shrink-0 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex h-16 w-full max-w-sm items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
              className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              aria-label="뒤로 가기"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-blue-600 text-sm font-bold text-white shadow-inner">
                AI
              </div>
              <div>
                <h1 className="text-lg font-bold leading-tight text-gray-900">엔코아AI캠퍼스 상담 챗봇</h1>
                <p className="text-xs font-medium text-brand-600">익명 세션으로만 동작하며 브라우저를 닫으면 기록이 사라집니다.</p>
              </div>
            </div>
          </div>

          <button
            ref={historyBtnRef}
            onClick={() => setHistoryOpen((v) => !v)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition-colors ${
              historyOpen
                ? 'border-brand-400 bg-brand-50 text-brand-700'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Search size={15} />
            <span className="hidden sm:inline text-[13px]">키워드로 대화 찾기</span>
          </button>
        </div>
      </header>

      <main className="relative flex-1 overflow-hidden">
        <div className="relative z-10 mx-auto h-full max-w-sm border-x border-gray-100 bg-white shadow-2xl">
          <ChatWindow
            messages={messages}
            isLoading={isLoading}
            streamingMessageId={streamingMessageId}
            suggestedQuestions={suggestedQuestions}
            sendMessage={sendMessage}
            stopGenerating={stopGenerating}
            convId={convId}
          />
        </div>
      </main>

      <HistoryDropdown
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelect={(conv: Conversation) => loadConversation(conv)}
        currentConvId={convId}
        anchorRef={historyBtnRef}
      />
    </div>
  );
};

export default ChatPage;
