import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { adminApi } from '../services/api';
import { AdminDocument, AdminFaq, AdminSession, ChatLog, ProcessingLog, PromptConfig } from '../types';

const formatJson = (value: unknown) => JSON.stringify(value, null, 2);

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [documents, setDocuments] = useState<AdminDocument[]>([]);
  const [prompts, setPrompts] = useState<PromptConfig[]>([]);
  const [faqText, setFaqText] = useState('[]');
  const [processingLogs, setProcessingLogs] = useState<ProcessingLog[]>([]);
  const [chatLogs, setChatLogs] = useState<ChatLog[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploading, setUploading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [pwStatus, setPwStatus] = useState('');
  const [faqStatus, setFaqStatus] = useState('');
  const [promptStatus, setPromptStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const loadDashboard = async (pw: string) => {
    const [sessionData, docData, faqData, promptData, logData] = await Promise.all([
      adminApi.getSessions(pw),
      adminApi.getDocuments(pw),
      adminApi.getFaqs(pw),
      adminApi.getPrompts(pw),
      adminApi.getLogs(pw),
    ]);
    setSessions(sessionData);
    setDocuments(docData.documents);
    setFaqText(formatJson(faqData.faqs));
    setPrompts(promptData.prompts);
    setProcessingLogs(logData.processing_logs);
    setChatLogs(logData.chat_logs);
  };

  useEffect(() => {
    const savedPassword =
      sessionStorage.getItem('adminPassword') ??
      (location.state as { password?: string } | null)?.password;
    if (!savedPassword) return;

    setPassword(savedPassword);
    loadDashboard(savedPassword)
      .then(() => setAuthed(true))
      .catch(() => sessionStorage.removeItem('adminPassword'));
  }, [location.state]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await loadDashboard(password);
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
    setUploadStatus('업로드 및 처리 중입니다...');
    try {
      const result = await adminApi.uploadPdf(password, pdfFile);
      setUploadStatus(result.message);
      setPdfFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadDashboard(password);
    } catch {
      setUploadStatus('업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const saveFaqs = async () => {
    setFaqStatus('');
    try {
      const parsed = JSON.parse(faqText) as AdminFaq[];
      const result = await adminApi.updateFaqs(password, parsed);
      setFaqStatus(result.message);
      await loadDashboard(password);
    } catch {
      setFaqStatus('FAQ JSON 형식이 잘못되었거나 저장에 실패했습니다.');
    }
  };

  const savePrompts = async () => {
    try {
      const result = await adminApi.updatePrompts(password, prompts);
      setPromptStatus(result.message);
      await loadDashboard(password);
    } catch {
      setPromptStatus('Prompt 저장에 실패했습니다.');
    }
  };

  const changePassword = async () => {
    if (!newPassword) return;
    try {
      const result = await adminApi.changePassword(password, newPassword);
      setPwStatus(result.message);
      sessionStorage.setItem('adminPassword', newPassword);
      setPassword(newPassword);
      setNewPassword('');
    } catch {
      setPwStatus('비밀번호 변경에 실패했습니다.');
    }
  };

  const deleteDocument = async (documentId: number) => {
    if (!confirm('이 문서를 삭제할까요?')) return;
    await adminApi.deleteDocument(password, documentId);
    await loadDashboard(password);
  };

  const retryDocument = async (documentId: number) => {
    const result = await adminApi.retryDocument(password, documentId);
    alert(result.message);
  };

  const reindexAll = async () => {
    const result = await adminApi.reindex(password);
    setUploadStatus(`${result.message} (${result.strategy})`);
    await loadDashboard(password);
  };

  const latestFailed = useMemo(
    () => documents.find((doc) => doc.status === 'failed'),
    [documents],
  );

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
          <h1 className="mb-6 text-center text-xl font-bold text-gray-800">관리자 로그인</h1>
          <form onSubmit={login} className="space-y-4">
            <input
              type="password"
              placeholder="관리자 비밀번호"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand-600 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
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
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">운영 관리자</h1>
            <p className="text-sm text-gray-500">문서 업로드, FAQ 수정, prompt 관리, 로그 확인</p>
          </div>
          <button
            onClick={reindexAll}
            className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900"
          >
            전체 재색인
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-bold text-gray-800">PDF 업로드</h2>
            <div className="mb-4 flex gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={e => setPdfFile(e.target.files?.[0] ?? null)}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                onClick={uploadPdf}
                disabled={!pdfFile || uploading}
                className="rounded-lg bg-brand-600 px-5 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {uploading ? '처리 중...' : '업로드'}
              </button>
            </div>
            {uploadStatus && <p className="text-sm text-gray-600">{uploadStatus}</p>}
            {latestFailed && (
              <p className="mt-3 text-sm text-red-600">
                최근 실패: {latestFailed.original_filename} / {latestFailed.error_message}
              </p>
            )}
          </section>

          <section className="rounded-xl bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-bold text-gray-800">관리자 비밀번호</h2>
            <div className="space-y-3">
              <input
                type="password"
                placeholder="새 비밀번호"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm"
              />
              <button
                onClick={changePassword}
                disabled={!newPassword}
                className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                비밀번호 변경
              </button>
              {pwStatus && <p className="text-sm text-gray-600">{pwStatus}</p>}
            </div>
          </section>
        </div>

        <section className="rounded-xl bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-bold text-gray-800">문서 상태</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-left text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-4 py-3">문서</th>
                  <th className="px-4 py-3">버전</th>
                  <th className="px-4 py-3">상태</th>
                  <th className="px-4 py-3">active</th>
                  <th className="px-4 py-3">실패 사유</th>
                  <th className="px-4 py-3">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {documents.map(doc => (
                  <tr key={doc.id}>
                    <td className="px-4 py-3">{doc.original_filename}</td>
                    <td className="px-4 py-3">v{doc.version}</td>
                    <td className="px-4 py-3">{doc.status}</td>
                    <td className="px-4 py-3">{doc.is_active ? 'Y' : 'N'}</td>
                    <td className="px-4 py-3 text-red-600">{doc.error_message ?? '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => retryDocument(doc.id)} className="rounded bg-gray-200 px-3 py-1">
                          재처리
                        </button>
                        <button onClick={() => deleteDocument(doc.id)} className="rounded bg-red-100 px-3 py-1 text-red-700">
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl bg-white p-6 shadow">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">FAQ JSON</h2>
              <button onClick={saveFaqs} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white">
                FAQ 저장
              </button>
            </div>
            <textarea
              value={faqText}
              onChange={e => setFaqText(e.target.value)}
              className="h-[420px] w-full rounded-lg border border-gray-300 p-3 font-mono text-xs"
            />
            {faqStatus && <p className="mt-2 text-sm text-gray-600">{faqStatus}</p>}
          </section>

          <section className="rounded-xl bg-white p-6 shadow">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">Prompt 설정</h2>
              <button onClick={savePrompts} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white">
                Prompt 저장
              </button>
            </div>
            <div className="space-y-4">
              {prompts.map(prompt => (
                <div key={prompt.prompt_key}>
                  <label className="mb-1 block text-sm font-semibold text-gray-700">{prompt.label}</label>
                  <textarea
                    value={prompt.content}
                    onChange={e =>
                      setPrompts(current =>
                        current.map(item =>
                          item.prompt_key === prompt.prompt_key ? { ...item, content: e.target.value } : item,
                        ),
                      )
                    }
                    className="h-24 w-full rounded-lg border border-gray-300 p-3 text-sm"
                  />
                </div>
              ))}
            </div>
            {promptStatus && <p className="mt-2 text-sm text-gray-600">{promptStatus}</p>}
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-bold text-gray-800">처리 로그</h2>
            <div className="max-h-[360px] space-y-3 overflow-y-auto">
              {processingLogs.map(log => (
                <div key={log.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                  <div className="font-medium text-gray-800">{log.status} / {log.message}</div>
                  <div className="text-gray-500">{new Date(log.created_at).toLocaleString('ko-KR')}</div>
                  {log.detail && <div className="mt-1 text-red-600">{log.detail}</div>}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-bold text-gray-800">채팅 로그</h2>
            <div className="max-h-[360px] space-y-3 overflow-y-auto">
              {chatLogs.map(log => (
                <div key={log.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                  <div className="font-medium text-gray-800">{log.question}</div>
                  <div className="mt-1 text-gray-600">{log.answer}</div>
                  <div className="mt-2 text-xs text-gray-500">
                    {log.source} / {log.processing_status} / llm ${log.llm_cost.toFixed(6)}
                  </div>
                  {log.error && <div className="mt-1 text-red-600">{log.error}</div>}
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="rounded-xl bg-white p-6 shadow">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-800">상담 세션</h2>
            <span className="text-sm text-gray-500">총 {sessions.length}건</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-left text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-4 py-3">사용자</th>
                  <th className="px-4 py-3">시작</th>
                  <th className="px-4 py-3">최근</th>
                  <th className="px-4 py-3">메시지 수</th>
                  <th className="px-4 py-3">상세</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessions.map(session => (
                  <tr key={session.id}>
                    <td className="px-4 py-3">{session.user_name ?? '익명'}</td>
                    <td className="px-4 py-3">{new Date(session.created_at).toLocaleString('ko-KR')}</td>
                    <td className="px-4 py-3">{session.updated_at ? new Date(session.updated_at).toLocaleString('ko-KR') : '-'}</td>
                    <td className="px-4 py-3">{session.message_count}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/admin/sessions/${session.id}`, { state: { password } })}
                        className="text-brand-600 hover:text-brand-800"
                      >
                        보기
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
