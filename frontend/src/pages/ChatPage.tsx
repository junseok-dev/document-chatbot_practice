import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, HelpCircle } from 'lucide-react';
import ChatWindow from '../components/chat/ChatWindow';

const ChatPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shrink-0 shadow-sm z-10 relative">
        <div className="max-w-4xl mx-auto w-full h-16 flex items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="p-2 -ml-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
              aria-label="홈으로 돌아가기"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-inner">
                AI
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 leading-tight">CodeAI 입과 상담</h1>
                <p className="text-xs text-brand-600 font-medium">실시간 AI 상담원 대기중</p>
              </div>
            </div>
          </div>
          
          <button className="text-gray-400 hover:text-gray-600 transition-colors p-2" title="도움말">
            <HelpCircle size={20} />
          </button>
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="flex-1 relative overflow-hidden bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed">
        <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px]"></div>
        <div className="h-full relative z-10 shadow-2xl max-w-4xl mx-auto bg-white border-x border-gray-100">
          <ChatWindow />
        </div>
      </main>
    </div>
  );
};

export default ChatPage;
