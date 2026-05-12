import { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { adminApi } from '../services/api';
import { AdminSessionDetail } from '../types';

const SOURCE_BADGE: Record<string, { label: string; className: string }> = {
  faq:      { label: 'FAQ',  className: 'bg-green-100 text-green-700' },
  document: { label: '문서', className: 'bg-blue-100 text-blue-700' },
  ai:       { label: 'AI',   className: 'bg-purple-100 text-purple-700' },
  fallback: { label: '오류', className: 'bg-red-100 text-red-700' },
  user:     { label: '사용자', className: 'bg-gray-100 text-gray-600' },
};

export default function AdminSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const password = (location.state as { password: string })?.password ?? '';

  const [detail, setDetail] = useState<AdminSessionDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionId || !password) return;
    adminApi.getSessionDetail(password, sessionId)
      .then(setDetail)
      .catch(() => setError('세션 정보를 불러오지 못했습니다.'));
  }, [sessionId, password]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">불러오는 중...</p>
      </div>
    );
  }

  const { session, messages } = detail;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate('/admin', { state: { password } })}
          className="text-brand-600 hover:text-brand-800 text-sm font-medium mb-4 flex items-center gap-1"
        >
          ← 목록으로
        </button>

        <div className="bg-white rounded-xl shadow p-5 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-2">세션 상세</h2>
          <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
            <span>사용자</span>
            <span className="font-medium text-gray-800">{session.user_name ?? '익명'}</span>
            <span>시작</span>
            <span>{new Date(session.created_at).toLocaleString('ko-KR')}</span>
            <span>메시지 수</span>
            <span>{session.message_count}개</span>
          </div>
        </div>

        <div className="space-y-3">
          {messages.map(msg => {
            const isUser = msg.role === 'user';
            const badge = msg.source ? SOURCE_BADGE[msg.source] : null;
            return (
              <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                  {badge && !isUser && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium w-fit ${badge.className}`}>
                      {badge.label}
                    </span>
                  )}
                  <div
                    className={`px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap ${
                      isUser
                        ? 'bg-brand-600 text-white rounded-br-sm'
                        : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
                    }`}
                  >
                    {msg.content}
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
