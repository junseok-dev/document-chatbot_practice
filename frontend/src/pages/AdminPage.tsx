import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi, clearAdminPassword, getAdminPassword, saveAdminPassword } from '../services/api';
import { AdminDocument, AdminFaq, AdminSession, ChatLog, ProcessingLog, PromptConfig } from '../types';

const formatJson = (value: unknown) => JSON.stringify(value, null, 2);

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(() => !!getAdminPassword());
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [documents, setDocuments] = useState<AdminDocument[]>([]);
  const [prompts, setPrompts] = useState<PromptConfig[]>([]);
  const [faqText, setFaqText] = useState('[]');
  const [processingLogs, setProcessingLogs] = useState<ProcessingLog[]>([]);
  const [chatLogs, setChatLogs] = useState<ChatLog[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploading, setUploading] = useState(false);
  const [mdFile, setMdFile] = useState<File | null>(null);
  const [mdTitle, setMdTitle] = useState('');
  const [mdCategory, setMdCategory] = useState('');
  const [mdStatus, setMdStatus] = useState('');
  const [mdUploading, setMdUploading] = useState(false);
  const [catalogFile, setCatalogFile] = useState<File | null>(null);
  const [catalogMdFiles, setCatalogMdFiles] = useState<File[]>([]);
  const [catalogStatus, setCatalogStatus] = useState('');
  const [catalogImporting, setCatalogImporting] = useState(false);
  const [faqStatus, setFaqStatus] = useState('');
  const [promptStatus, setPromptStatus] = useState('');
  const [loadError, setLoadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mdFileInputRef = useRef<HTMLInputElement>(null);
  const catalogFileInputRef = useRef<HTMLInputElement>(null);
  const catalogMdInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const loadDashboard = async () => {
    setLoadError('');
    try {
      const [sessionData, docData, faqData, promptData, logData] = await Promise.all([
        adminApi.getSessions(),
        adminApi.getDocuments(),
        adminApi.getFaqs(),
        adminApi.getPrompts(),
        adminApi.getLogs(),
      ]);
      setSessions(sessionData);
      setDocuments(docData.documents);
      setFaqText(formatJson(faqData.faqs));
      setPrompts(promptData.prompts);
      setProcessingLogs(logData.processing_logs);
      setChatLogs(logData.chat_logs);
    } catch {
      setLoadError('관리자 데이터를 불러오지 못했습니다.');
    }
  };

  useEffect(() => {
    if (authenticated) loadDashboard();
  }, [authenticated]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim()) return;
    setLoginLoading(true);
    setLoginError('');
    saveAdminPassword(passwordInput.trim());
    try {
      await adminApi.getSessions();
      setAuthenticated(true);
    } catch {
      clearAdminPassword();
      setLoginError('비밀번호가 올바르지 않습니다.');
    } finally {
      setLoginLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm rounded-xl bg-white p-8 shadow space-y-4"
        >
          <h1 className="text-xl font-bold text-gray-900 text-center">관리자 로그인</h1>
          <input
            type="password"
            placeholder="관리자 비밀번호"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            autoFocus
          />
          {loginError && <p className="text-sm text-red-600">{loginError}</p>}
          <button
            type="submit"
            disabled={loginLoading || !passwordInput.trim()}
            className="w-full rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {loginLoading ? '확인 중...' : '로그인'}
          </button>
        </form>
      </div>
    );
  }

  const uploadMd = async () => {
    if (!mdFile) return;
    setMdUploading(true);
    setMdStatus('MD 파일을 처리하고 있습니다...');
    try {
      const result = await adminApi.uploadMd(mdFile, mdTitle || undefined, mdCategory || undefined);
      setMdStatus(result.message);
      setMdFile(null);
      setMdTitle('');
      setMdCategory('');
      if (mdFileInputRef.current) mdFileInputRef.current.value = '';
      await loadDashboard();
    } catch {
      setMdStatus('MD 업로드에 실패했습니다.');
    } finally {
      setMdUploading(false);
    }
  };

  const importCatalog = async () => {
    if (!catalogFile || catalogMdFiles.length === 0) return;
    setCatalogImporting(true);
    setCatalogStatus('catalog import를 처리하고 있습니다...');
    try {
      const result = await adminApi.importCatalog(catalogFile, catalogMdFiles);
      setCatalogStatus(result.message);
      setCatalogFile(null);
      setCatalogMdFiles([]);
      if (catalogFileInputRef.current) catalogFileInputRef.current.value = '';
      if (catalogMdInputRef.current) catalogMdInputRef.current.value = '';
      await loadDashboard();
    } catch {
      setCatalogStatus('catalog import에 실패했습니다.');
    } finally {
      setCatalogImporting(false);
    }
  };

  const uploadPdf = async () => {
    if (!pdfFile) return;
    setUploading(true);
    setUploadStatus('PDF를 처리하고 있습니다...');
    try {
      const result = await adminApi.uploadPdf(pdfFile);
      setUploadStatus(result.message);
      setPdfFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadDashboard();
    } catch {
      setUploadStatus('PDF 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const saveFaqs = async () => {
    setFaqStatus('');
    try {
      const parsed = JSON.parse(faqText) as AdminFaq[];
      const result = await adminApi.updateFaqs(parsed);
      setFaqStatus(result.message);
      await loadDashboard();
    } catch {
      setFaqStatus('FAQ JSON 형식이 올바르지 않거나 저장에 실패했습니다.');
    }
  };

  const savePrompts = async () => {
    try {
      const result = await adminApi.updatePrompts(prompts);
      setPromptStatus(result.message);
      await loadDashboard();
    } catch {
      setPromptStatus('프롬프트 저장에 실패했습니다.');
    }
  };

  const deleteDocument = async (documentId: number) => {
    if (!confirm('이 문서를 삭제할까요?')) return;
    await adminApi.deleteDocument(documentId);
    await loadDashboard();
  };

  const retryDocument = async (documentId: number) => {
    const result = await adminApi.retryDocument(documentId);
    alert(result.message);
  };

  const reindexAll = async () => {
    const result = await adminApi.reindex();
    setUploadStatus(`${result.message} (${result.strategy})`);
    await loadDashboard();
  };

  const latestFailed = useMemo(
    () => documents.find((doc) => doc.status === 'failed'),
    [documents],
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">관리자 화면</h1>
            <p className="text-sm text-gray-500">문서, FAQ, 프롬프트와 처리 로그를 관리합니다.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={reindexAll}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900"
            >
              전체 재색인
            </button>
            <button
              onClick={() => { clearAdminPassword(); setAuthenticated(false); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              로그아웃
            </button>
          </div>
        </div>

        {loadError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          사용자 채팅 데이터는 더 이상 서버에 저장하지 않습니다. 브라우저 세션이 끝나면 클라이언트 기록도 함께 사라집니다.
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-bold text-gray-800">PDF 업로드</h2>
            <div className="mb-4 flex gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
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
            <h2 className="mb-4 text-lg font-bold text-gray-800">MD 업로드</h2>
            <div className="space-y-3">
              <input
                ref={mdFileInputRef}
                type="file"
                accept=".md"
                onChange={(e) => setMdFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="문서 제목"
                value={mdTitle}
                onChange={(e) => setMdTitle(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="카테고리"
                value={mdCategory}
                onChange={(e) => setMdCategory(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                onClick={uploadMd}
                disabled={!mdFile || mdUploading}
                className="w-full rounded-lg bg-brand-600 px-5 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {mdUploading ? '처리 중...' : '업로드'}
              </button>
              {mdStatus && <p className="text-sm text-gray-600">{mdStatus}</p>}
            </div>
          </section>
        </div>

        <section className="rounded-xl bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-bold text-gray-800">Catalog import</h2>
          <p className="mb-3 text-xs text-gray-500">`catalog.json`과 관련 MD 파일을 한 번에 반영합니다.</p>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">catalog.json</label>
              <input
                ref={catalogFileInputRef}
                type="file"
                accept=".json"
                onChange={(e) => setCatalogFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">MD 파일들</label>
              <input
                ref={catalogMdInputRef}
                type="file"
                accept=".md"
                multiple
                onChange={(e) => setCatalogMdFiles(Array.from(e.target.files ?? []))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              {catalogMdFiles.length > 0 && (
                <p className="mt-1 text-xs text-gray-500">{catalogMdFiles.length}개 파일 선택됨</p>
              )}
            </div>
            <button
              onClick={importCatalog}
              disabled={!catalogFile || catalogMdFiles.length === 0 || catalogImporting}
              className="w-full rounded-lg bg-teal-600 px-5 py-2 font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {catalogImporting ? '가져오는 중...' : 'import 실행'}
            </button>
            {catalogStatus && <p className="text-sm text-gray-600">{catalogStatus}</p>}
          </div>
        </section>

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
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td className="px-4 py-3">{doc.original_filename}</td>
                    <td className="px-4 py-3">v{doc.version}</td>
                    <td className="px-4 py-3">{doc.status}</td>
                    <td className="px-4 py-3">{doc.is_active ? 'Y' : 'N'}</td>
                    <td className="px-4 py-3 text-red-600">{doc.error_message ?? '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => retryDocument(doc.id)} className="rounded bg-gray-200 px-3 py-1">
                          재처리 안내
                        </button>
                        <button
                          onClick={() => deleteDocument(doc.id)}
                          className="rounded bg-red-100 px-3 py-1 text-red-700"
                        >
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
              onChange={(e) => setFaqText(e.target.value)}
              className="h-[420px] w-full rounded-lg border border-gray-300 p-3 font-mono text-xs"
            />
            {faqStatus && <p className="mt-2 text-sm text-gray-600">{faqStatus}</p>}
          </section>

          <section className="rounded-xl bg-white p-6 shadow">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">Prompt 설정</h2>
              <button
                onClick={savePrompts}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
              >
                Prompt 저장
              </button>
            </div>
            <div className="space-y-4">
              {prompts.map((prompt) => (
                <div key={prompt.prompt_key}>
                  <label className="mb-1 block text-sm font-semibold text-gray-700">{prompt.label}</label>
                  <textarea
                    value={prompt.content}
                    onChange={(e) =>
                      setPrompts((current) =>
                        current.map((item) =>
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
              {processingLogs.map((log) => (
                <div key={log.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                  <div className="font-medium text-gray-800">
                    {log.status} / {log.message}
                  </div>
                  <div className="text-gray-500">{new Date(log.created_at).toLocaleString('ko-KR')}</div>
                  {log.detail && <div className="mt-1 text-red-600">{log.detail}</div>}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-bold text-gray-800">채팅 로그</h2>
            {chatLogs.length === 0 ? (
              <p className="text-sm text-gray-500">개인정보 보호 설정 때문에 더 이상 채팅 로그를 수집하지 않습니다.</p>
            ) : (
              <div className="max-h-[360px] space-y-3 overflow-y-auto">
                {chatLogs.map((log) => (
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
            )}
          </section>
        </div>

        <section className="rounded-xl bg-white p-6 shadow">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-800">상담 세션</h2>
            <span className="text-sm text-gray-500">총 {sessions.length}건</span>
          </div>
          {sessions.length === 0 ? (
            <p className="text-sm text-gray-500">익명 세션을 서버에 남기지 않도록 변경되어 조회할 세션이 없습니다.</p>
          ) : (
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
                  {sessions.map((session) => (
                    <tr key={session.id}>
                      <td className="px-4 py-3">{session.user_name ?? '익명'}</td>
                      <td className="px-4 py-3">{new Date(session.created_at).toLocaleString('ko-KR')}</td>
                      <td className="px-4 py-3">
                        {session.updated_at ? new Date(session.updated_at).toLocaleString('ko-KR') : '-'}
                      </td>
                      <td className="px-4 py-3">{session.message_count}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => navigate(`/admin/sessions/${session.id}`)}
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
          )}
        </section>
      </div>
    </div>
  );
}
