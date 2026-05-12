import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../services/api';
import { AdminSession } from '../types';

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const uploadPdf = async () => {
    if (!pdfFile) return;
    setUploading(true);
    setUploadStatus('업로드 중... (변환에 1~2분 소요될 수 있습니다)');
    try {
      const result = await adminApi.uploadPdf(password, pdfFile);
      setUploadStatus(`✅ ${result.message}`);
      setPdfFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch {
      setUploadStatus('❌ 업로드 실패. 파일을 확인해주세요.');
    } finally {
      setUploading(false);
    }
  };

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await adminApi.getSessions(password);
      setSessions(data);
      setAuthed(true);
    } catch {
      setError('비밀번호가 올바르지 않습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <h1 className="text-xl font-bold text-gray-800 mb-6 text-center">관리자 로그인</h1>
          <form onSubmit={login} className="space-y-4">
            <input
              type="password"
              placeholder="관리자 비밀번호"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 text-white rounded-lg py-2 font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              {loading ? '확인 중...' : '로그인'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">

        {/* PDF 업로드 */}
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">📄 문서 업로드</h2>
          <p className="text-sm text-gray-500 mb-4">PDF를 업로드하면 자동으로 변환되어 챗봇에 즉시 반영됩니다.</p>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={e => setPdfFile(e.target.files?.[0] ?? null)}
              className="flex-1 text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-2"
            />
            <button
              onClick={uploadPdf}
              disabled={!pdfFile || uploading}
              className="bg-brand-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50 whitespace-nowrap"
            >
              {uploading ? '변환 중...' : '업로드'}
            </button>
          </div>
          {uploadStatus && (
            <p className={`mt-3 text-sm ${uploadStatus.startsWith('✅') ? 'text-green-600' : uploadStatus.startsWith('❌') ? 'text-red-500' : 'text-gray-500'}`}>
              {uploadStatus}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">상담 세션 목록</h1>
          <span className="text-sm text-gray-500">총 {sessions.length}건</span>
        </div>

        {sessions.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-12 text-center text-gray-400">
            아직 상담 세션이 없습니다.
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                <tr>
                  <th className="px-6 py-3 text-left">사용자명</th>
                  <th className="px-6 py-3 text-left">시작 시각</th>
                  <th className="px-6 py-3 text-left">마지막 활동</th>
                  <th className="px-6 py-3 text-center">메시지 수</th>
                  <th className="px-6 py-3 text-center">상세</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessions.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-800">
                      {s.user_name ?? <span className="text-gray-400 italic">익명</span>}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {new Date(s.created_at).toLocaleString('ko-KR')}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {s.updated_at ? new Date(s.updated_at).toLocaleString('ko-KR') : '-'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-brand-100 text-brand-700 px-2 py-1 rounded-full text-xs font-semibold">
                        {s.message_count}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => navigate(`/admin/sessions/${s.id}`, { state: { password } })}
                        className="text-brand-600 hover:text-brand-800 font-medium"
                      >
                        보기 →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
