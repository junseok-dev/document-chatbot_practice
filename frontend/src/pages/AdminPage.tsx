import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  const [documents, setDocuments] = useState<string[]>([]);
  const [newPassword, setNewPassword] = useState('');
  const [pwStatus, setPwStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const loadDocuments = async (pw: string) => {
    try {
      const res = await adminApi.getDocuments(pw);
      setDocuments(res.documents);
    } catch {}
  };

  useEffect(() => {
    const savedPassword =
      sessionStorage.getItem('adminPassword') ??
      (location.state as { password?: string })?.password;
    if (savedPassword) {
      setPassword(savedPassword);
      Promise.all([
        adminApi.getSessions(savedPassword),
        adminApi.getDocuments(savedPassword),
      ]).then(([sessionData, docData]) => {
        setSessions(sessionData);
        setDocuments(docData.documents);
        setAuthed(true);
      }).catch(() => {
        sessionStorage.removeItem('adminPassword');
      });
    }
  }, []);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const [sessionData, docData] = await Promise.all([
        adminApi.getSessions(password),
        adminApi.getDocuments(password),
      ]);
      setSessions(sessionData);
      setDocuments(docData.documents);
      sessionStorage.setItem('adminPassword', password);
      setAuthed(true);
    } catch {
      setError('비밀번호가 올바르지 않습니다.');
    } finally {
      setLoading(false);
    }
  };

  const uploadPdf = async () => {
    if (!pdfFile) return;
    setUploading(true);
    setUploadStatus('업로드 중... (변환에 1~2분 소요될 수 있습니다)');
    try {
      const result = await adminApi.uploadPdf(password, pdfFile);
      setUploadStatus(`✅ ${result.message}`);
      setPdfFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadDocuments(password);
    } catch {
      setUploadStatus('❌ 업로드 실패. 파일을 확인해주세요.');
    } finally {
      setUploading(false);
    }
  };

  const changePassword = async () => {
    if (!newPassword) return;
    try {
      const result = await adminApi.changePassword(password, newPassword);
      setPwStatus(`✅ ${result.message}`);
      sessionStorage.setItem('adminPassword', newPassword);
      setPassword(newPassword);
      setNewPassword('');
    } catch {
      setPwStatus('❌ 변경 실패.');
    }
  };

  const deleteDocument = async (filename: string) => {
    if (!confirm(`"${filename}" 을 삭제할까요?`)) return;
    try {
      await adminApi.deleteDocument(password, filename);
      await loadDocuments(password);
    } catch {
      alert('삭제 실패.');
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

          <hr className="my-5 border-gray-200" />
          <p className="text-xs font-medium text-gray-500 mb-3">🔒 비밀번호 변경</p>
          <div className="space-y-2">
            <input
              type="password"
              placeholder="현재 비밀번호"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <input
              type="password"
              placeholder="새 비밀번호"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              onClick={changePassword}
              disabled={!password || !newPassword}
              className="w-full bg-gray-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              변경
            </button>
            {pwStatus && (
              <p className={`text-sm ${pwStatus.startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>
                {pwStatus}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">

        {/* 문서 관리 */}
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">📄 문서 관리</h2>

          {/* 업로드 */}
          <div className="flex items-center gap-3 mb-4">
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
            <p className={`mb-4 text-sm ${uploadStatus.startsWith('✅') ? 'text-green-600' : uploadStatus.startsWith('❌') ? 'text-red-500' : 'text-gray-500'}`}>
              {uploadStatus}
            </p>
          )}

          {/* 문서 목록 */}
          {documents.length === 0 ? (
            <p className="text-sm text-gray-400">등록된 문서가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
              {documents.map(doc => (
                <li key={doc} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <span className="text-sm text-gray-700">{doc}</span>
                  <button
                    onClick={() => deleteDocument(doc)}
                    className="text-red-500 hover:text-red-700 text-sm font-medium"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 상담 세션 목록 */}
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
