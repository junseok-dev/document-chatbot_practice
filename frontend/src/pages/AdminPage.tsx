import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { adminApi, clearAdminToken, getAdminToken, saveAdminToken } from '../services/api';
import {
  AdminDocument,
  AdminDocumentDetail,
  AdminFaq,
  AdminSession,
  AuditLog,
  ChatLog,
  CustomTableDetail,
  CustomTableSummary,
  DbTableData,
  DbTableMeta,
  EncryptionSettings,
  ModelSettings,
  PermissionsData,
  ProcessingLog,
  PromptConfig,
  PromptPayload,
} from '../types';

type TabKey = 'documents' | 'faqs' | 'prompts' | 'chats' | 'data' | 'db' | 'settings' | 'permissions';

const MODEL_INFO: Record<string, { desc: string; speed: string; cost: string; badge?: string }> = {
  'gpt-4o':           { desc: '최신 멀티모달 모델. 텍스트·이미지 이해, 복잡한 추론에 강점', speed: '중간', cost: '높음', badge: '추천' },
  'gpt-4o-mini':      { desc: '경제적인 경량 모델. 일반 Q&A·요약에 충분한 성능', speed: '빠름', cost: '낮음' },
  'gpt-4-turbo':      { desc: '강력한 추론·코드 생성, 128k 컨텍스트 지원', speed: '중간', cost: '높음' },
  'gpt-4':            { desc: '고성능 범용 모델. 복잡한 지시 이행에 적합', speed: '느림', cost: '높음' },
  'gpt-3.5-turbo':    { desc: '가볍고 빠른 모델. 단순 질답·분류에 최적', speed: '매우 빠름', cost: '매우 낮음' },
  'o1':               { desc: '고급 추론 특화 모델. 수학·과학·코드 심층 분석', speed: '느림', cost: '매우 높음' },
  'o1-mini':          { desc: 'o1 경량 버전. 추론 능력과 비용 사이 균형', speed: '중간', cost: '높음' },
  'o3-mini':          { desc: '최신 추론 소형 모델. 빠른 속도·높은 정확도', speed: '빠름', cost: '중간' },
};

const EMPTY_FAQ: AdminFaq = {
  id: '',
  category: '',
  question: '',
  answer: '',
  keywords: [],
  aliases: [],
  search_hints: [],
  source_files: [],
  direct_answer: true,
  top_k: 4,
};

const EMPTY_PROMPT: PromptPayload = {
  prompt_key: '',
  label: '',
  content: '',
};

const INPUT_CLASS =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100';
const TEXTAREA_CLASS =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100';

function splitCsv(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function joinCsv(values: string[]): string {
  return values.join(', ');
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('ko-KR');
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(() => !!getAdminToken());
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<TabKey>('documents');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');

  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [documents, setDocuments] = useState<AdminDocument[]>([]);
  const [prompts, setPrompts] = useState<PromptConfig[]>([]);
  const [faqs, setFaqs] = useState<AdminFaq[]>([]);
  const [processingLogs, setProcessingLogs] = useState<ProcessingLog[]>([]);
  const [chatLogs, setChatLogs] = useState<ChatLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [selectedDocument, setSelectedDocument] = useState<AdminDocumentDetail | null>(null);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [reviewNote, setReviewNote] = useState('');

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [mdFile, setMdFile] = useState<File | null>(null);
  const [mdTitle, setMdTitle] = useState('');
  const [mdCategory, setMdCategory] = useState('');
  const [faqMdFile, setFaqMdFile] = useState<File | null>(null);
  const [faqMdCategory, setFaqMdCategory] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);

  const [faqForm, setFaqForm] = useState(EMPTY_FAQ);
  const [faqKeywords, setFaqKeywords] = useState('');
  const [faqAliases, setFaqAliases] = useState('');
  const [faqSearchHints, setFaqSearchHints] = useState('');
  const [faqSourceFiles, setFaqSourceFiles] = useState('');
  const [faqSaving, setFaqSaving] = useState(false);

  const [promptForm, setPromptForm] = useState<PromptPayload>(EMPTY_PROMPT);
  const [promptSaving, setPromptSaving] = useState(false);

  const [chatStartDate, setChatStartDate] = useState('');
  const [chatEndDate, setChatEndDate] = useState('');
  const [chatSessionId, setChatSessionId] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatExporting, setChatExporting] = useState(false);

  // DB 브라우저
  const [dbTables, setDbTables] = useState<DbTableMeta[]>([]);
  const [selectedDbTable, setSelectedDbTable] = useState<string | null>(null);
  const [dbTableData, setDbTableData] = useState<DbTableData | null>(null);
  const [dbPage, setDbPage] = useState(1);
  const [dbLoading, setDbLoading] = useState(false);

  // 모델 설정
  const [modelSettings, setModelSettings] = useState<ModelSettings | null>(null);
  const [modelSaving, setModelSaving] = useState(false);
  const [modelLoadError, setModelLoadError] = useState('');

  // 권한 관리
  const [permissionsData, setPermissionsData] = useState<PermissionsData | null>(null);
  const [permLoading, setPermLoading] = useState(false);
  const [newPermEmail, setNewPermEmail] = useState('');
  const [permSaving, setPermSaving] = useState(false);

  // 암호화 설정
  const [encryptionSettings, setEncryptionSettings] = useState<EncryptionSettings | null>(null);
  const [encryptionLoading, setEncryptionLoading] = useState(false);
  const [migrating, setMigrating] = useState<string | null>(null);

  // 데이터 관리
  const [dataTables, setDataTables] = useState<CustomTableSummary[]>([]);
  const [selectedTable, setSelectedTable] = useState<CustomTableDetail | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [showNewTableForm, setShowNewTableForm] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableDesc, setNewTableDesc] = useState('');
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState('text');
  const [editingRow, setEditingRow] = useState<{ id: number | null; data: Record<string, string> } | null>(null);
  const [dataExporting, setDataExporting] = useState(false);
  const [allExporting, setAllExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editingColId, setEditingColId] = useState<number | null>(null);
  const [editingColNameVal, setEditingColNameVal] = useState('');

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const mdInputRef = useRef<HTMLInputElement>(null);
  const faqMdInputRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const resetFaqForm = () => {
    setFaqForm(EMPTY_FAQ);
    setFaqKeywords('');
    setFaqAliases('');
    setFaqSearchHints('');
    setFaqSourceFiles('');
  };

  const resetPromptForm = () => setPromptForm(EMPTY_PROMPT);

  const loadDashboard = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [sessionData, documentData, faqData, promptData, logData] = await Promise.all([
        adminApi.getSessions(),
        adminApi.getDocuments(),
        adminApi.getFaqs(),
        adminApi.getPrompts(),
        adminApi.getLogs(),
      ]);
      setSessions(sessionData);
      setDocuments(documentData.documents);
      setFaqs(faqData.faqs);
      setPrompts(promptData.prompts);
      setProcessingLogs(logData.processing_logs);
      setChatLogs(logData.chat_logs);
      setAuditLogs(logData.audit_logs);
    } catch {
      setLoadError('관리자 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const loadModelSettings = async () => {
    setModelLoadError('');
    try {
      const data = await adminApi.getModelSettings();
      setModelSettings(data);
    } catch {
      setModelLoadError('모델 목록을 불러오지 못했습니다.');
    }
  };

  useEffect(() => {
    if (authenticated) {
      void loadDashboard();
      void loadDataTables();
      void loadDbTables();
    }
  }, [authenticated]);

  useEffect(() => {
    if (activeTab === 'data' && dataTables.length > 0 && !selectedTable) {
      void loadTableDetail(dataTables[0].id);
    }
  }, [activeTab, dataTables]);

  useEffect(() => {
    if (activeTab === 'db' && dbTables.length > 0 && !selectedDbTable) {
      void handleSelectDbTable(dbTables[0].name);
    }
  }, [activeTab, dbTables]);

  useEffect(() => {
    if (activeTab === 'settings') {
      if (!modelSettings) void loadModelSettings();
      if (!encryptionSettings) void loadEncryptionSettings();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'permissions' && authenticated) {
      void loadPermissions();
    }
  }, [activeTab]);

  const loadEncryptionSettings = async () => {
    setEncryptionLoading(true);
    try {
      const data = await adminApi.getEncryptionSettings();
      setEncryptionSettings(data);
    } catch {
      setNotice('암호화 설정을 불러오지 못했습니다.');
    } finally {
      setEncryptionLoading(false);
    }
  };

  const handleToggleEncryption = async (category: string, enabled: boolean) => {
    try {
      const result = await adminApi.toggleEncryption(category, enabled);
      setNotice(result.message);
      await loadEncryptionSettings();
    } catch {
      setNotice('암호화 설정 변경에 실패했습니다.');
    }
  };

  const handleMigrateEncryption = async (category: string, direction: 'encrypt' | 'decrypt') => {
    const action = direction === 'decrypt' ? '복호화' : '암호화';
    const label = encryptionSettings?.categories.find((c) => c.key === category)?.label ?? category;
    if (!window.confirm(`[${label}] 전체 레코드를 ${action}할까요?\n이 작업은 되돌리기 어렵습니다.`)) return;
    setMigrating(`${category}_${direction}`);
    try {
      const result = await adminApi.migrateEncryption(category, direction);
      setNotice(result.message);
      await loadEncryptionSettings();
    } catch {
      setNotice('일괄 마이그레이션에 실패했습니다.');
    } finally {
      setMigrating(null);
    }
  };

  const loadPermissions = async () => {
    setPermLoading(true);
    try {
      const result = await adminApi.getPermissions();
      setPermissionsData(result);
    } catch {
      setNotice('권한 목록을 불러오지 못했습니다.');
    } finally {
      setPermLoading(false);
    }
  };

  const openDocument = async (documentId: number) => {
    setDocumentLoading(true);
    try {
      const detail = await adminApi.getDocumentDetail(documentId);
      setSelectedDocument(detail);
      setReviewNote(detail.document.review_note ?? '');
    } finally {
      setDocumentLoading(false);
    }
  };

  const reloadAndOpenDocument = async (documentId: number) => {
    await loadDashboard();
    await openDocument(documentId);
  };

  const handlePdfUpload = async () => {
    if (!pdfFile) return;
    setUploadBusy(true);
    try {
      const result = await adminApi.uploadPdf(pdfFile);
      setNotice(result.message);
      setPdfFile(null);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
      await reloadAndOpenDocument(result.document.id);
    } catch {
      setNotice('PDF 업로드에 실패했습니다.');
    } finally {
      setUploadBusy(false);
    }
  };

  const handleMdUpload = async () => {
    if (!mdFile) return;
    setUploadBusy(true);
    try {
      const result = await adminApi.uploadMd(mdFile, mdTitle || undefined, mdCategory || undefined);
      setNotice(result.message);
      setMdFile(null);
      setMdTitle('');
      setMdCategory('');
      if (mdInputRef.current) mdInputRef.current.value = '';
      await reloadAndOpenDocument(result.document.id);
    } catch {
      setNotice('MD 업로드에 실패했습니다.');
    } finally {
      setUploadBusy(false);
    }
  };

  const handleFaqMdUpload = async () => {
    if (!faqMdFile) return;
    setUploadBusy(true);
    try {
      const result = await adminApi.uploadFaqMd(faqMdFile, faqMdCategory || undefined);
      setNotice(`${result.message} (${result.faqs.length}건)`);
      setFaqMdFile(null);
      setFaqMdCategory('');
      if (faqMdInputRef.current) faqMdInputRef.current.value = '';
      await reloadAndOpenDocument(result.document.id);
    } catch {
      setNotice('FAQ용 MD 변환에 실패했습니다.');
    } finally {
      setUploadBusy(false);
    }
  };

  const handleDocumentApprove = async () => {
    if (!selectedDocument) return;
    const result = await adminApi.approveDocument(selectedDocument.document.id, reviewNote || undefined);
    setNotice(result.message);
    await reloadAndOpenDocument(selectedDocument.document.id);
  };

  const handleDocumentReject = async () => {
    if (!selectedDocument) return;
    const result = await adminApi.rejectDocument(selectedDocument.document.id, reviewNote || undefined);
    setNotice(result.message);
    await reloadAndOpenDocument(selectedDocument.document.id);
  };

  const handleDocumentDelete = async (documentId: number) => {
    if (!window.confirm('이 문서를 삭제 처리할까요?')) return;
    const note = selectedDocument?.document.id === documentId ? reviewNote : undefined;
    const result = await adminApi.deleteDocument(documentId, note);
    setNotice(result.message);
    if (selectedDocument?.document.id === documentId) setSelectedDocument(null);
    await loadDashboard();
  };

  const handleDocumentRestore = async () => {
    if (!selectedDocument) return;
    const result = await adminApi.restoreDocument(selectedDocument.document.id);
    setNotice(result.message);
    await reloadAndOpenDocument(selectedDocument.document.id);
  };

  const handleSelectFaq = (faq: AdminFaq) => {
    setFaqForm(faq);
    setFaqKeywords(joinCsv(faq.keywords));
    setFaqAliases(joinCsv(faq.aliases));
    setFaqSearchHints(joinCsv(faq.search_hints));
    setFaqSourceFiles(joinCsv(faq.source_files));
  };

  const handleSaveFaq = async () => {
    setFaqSaving(true);
    const payload: AdminFaq = {
      ...faqForm,
      keywords: splitCsv(faqKeywords),
      aliases: splitCsv(faqAliases),
      search_hints: splitCsv(faqSearchHints),
      source_files: splitCsv(faqSourceFiles),
    };
    try {
      const result = faqForm.id ? await adminApi.updateFaq(payload) : await adminApi.createFaq(payload);
      setNotice(result.message);
      resetFaqForm();
      await loadDashboard();
    } catch {
      setNotice('FAQ 저장에 실패했습니다.');
    } finally {
      setFaqSaving(false);
    }
  };

  const handleDeleteFaq = async (faqId: string) => {
    if (!window.confirm('이 FAQ를 삭제할까요?')) return;
    await adminApi.deleteFaq(faqId);
    setNotice('FAQ를 삭제했습니다.');
    resetFaqForm();
    await loadDashboard();
  };

  const handleSelectPrompt = (prompt: PromptConfig) => {
    setPromptForm({ prompt_key: prompt.prompt_key, label: prompt.label, content: prompt.content });
  };

  const handleSavePrompt = async () => {
    setPromptSaving(true);
    try {
      const result =
        promptForm.prompt_key && prompts.some((item) => item.prompt_key === promptForm.prompt_key)
          ? await adminApi.updatePrompt(promptForm)
          : await adminApi.createPrompt(promptForm);
      setNotice(result.message);
      resetPromptForm();
      await loadDashboard();
    } catch {
      setNotice('프롬프트 저장에 실패했습니다.');
    } finally {
      setPromptSaving(false);
    }
  };

  const handleDeletePrompt = async (promptKey: string) => {
    if (!window.confirm('이 프롬프트를 삭제할까요?')) return;
    try {
      const result = await adminApi.deletePrompt(promptKey);
      setNotice(result.message);
      resetPromptForm();
      await loadDashboard();
    } catch {
      setNotice('기본 프롬프트는 삭제할 수 없습니다.');
    }
  };

  const handleFilterChatLogs = async () => {
    setChatLoading(true);
    try {
      const result = await adminApi.getChatLogs({
        start_date: chatStartDate || undefined,
        end_date: chatEndDate || undefined,
        session_id: chatSessionId || undefined,
      });
      setChatLogs(result.chat_logs);
      if (result.chat_logs.length === 0) setNotice('조회 결과가 없습니다.');
      else setNotice(`${result.chat_logs.length}건 조회되었습니다.`);
    } catch {
      setNotice('대화 로그 조회에 실패했습니다.');
    } finally {
      setChatLoading(false);
    }
  };

  const handleExportChatLogs = async () => {
    setChatExporting(true);
    try {
      const blob = await adminApi.exportChatLogs({
        start_date: chatStartDate || undefined,
        end_date: chatEndDate || undefined,
        session_id: chatSessionId || undefined,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `chat_logs_${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
      setNotice('대화 데이터를 엑셀로 내보냈습니다.');
    } catch {
      setNotice('엑셀 다운로드에 실패했습니다.');
    } finally {
      setChatExporting(false);
    }
  };

  // ── 데이터 관리 핸들러 ──────────────────────────────────────
  const loadDataTables = async () => {
    try {
      const result = await adminApi.getDataTables();
      setDataTables(result.tables);
    } catch {
      setNotice('테이블 목록을 불러오지 못했습니다.');
    }
  };

  const loadTableDetail = async (tableId: number) => {
    setDataLoading(true);
    try {
      const detail = await adminApi.getDataTable(tableId);
      setSelectedTable(detail);
      setEditingRow(null);
    } catch {
      setNotice('테이블 데이터를 불러오지 못했습니다.');
    } finally {
      setDataLoading(false);
    }
  };

  const handleExportAll = async () => {
    setAllExporting(true);
    try {
      await adminApi.exportAllDataTables();
      setNotice('전체 데이터를 엑셀로 내보냈습니다.');
    } catch {
      setNotice('전체 내보내기에 실패했습니다.');
    } finally {
      setAllExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTable) return;
    setImporting(true);
    try {
      const result = await adminApi.importTableData(selectedTable.id, file);
      setNotice(result.message);
      await loadTableDetail(selectedTable.id);
      await loadDataTables();
    } catch {
      setNotice('가져오기에 실패했습니다. 파일 형식과 컬럼명을 확인해주세요.');
    } finally {
      setImporting(false);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  };

  const handleRenameColumn = async (colId: number) => {
    if (!selectedTable || !editingColNameVal.trim()) { setEditingColId(null); return; }
    const col = selectedTable.columns.find((c) => c.id === colId);
    if (!col || col.column_name === editingColNameVal.trim()) { setEditingColId(null); return; }
    try {
      await adminApi.renameColumn(selectedTable.id, colId, editingColNameVal.trim());
      await loadTableDetail(selectedTable.id);
    } catch {
      setNotice('컬럼 이름 변경에 실패했습니다.');
    } finally {
      setEditingColId(null);
    }
  };

  const handleReorderColumn = async (colId: number, direction: 'up' | 'down') => {
    if (!selectedTable) return;
    try {
      await adminApi.reorderColumn(selectedTable.id, colId, direction);
      await loadTableDetail(selectedTable.id);
    } catch {
      setNotice('컬럼 순서 변경에 실패했습니다.');
    }
  };

  const handleCreateTable = async () => {
    if (!newTableName.trim()) return;
    try {
      await adminApi.createDataTable(newTableName.trim(), newTableDesc.trim());
      setNewTableName('');
      setNewTableDesc('');
      setShowNewTableForm(false);
      await loadDataTables();
      setNotice('테이블이 생성되었습니다.');
    } catch {
      setNotice('테이블 생성에 실패했습니다.');
    }
  };

  const handleDeleteTable = async (tableId: number) => {
    if (!confirm('테이블과 모든 데이터가 삭제됩니다. 계속하시겠어요?')) return;
    try {
      await adminApi.deleteDataTable(tableId);
      if (selectedTable?.id === tableId) setSelectedTable(null);
      await loadDataTables();
      setNotice('테이블이 삭제되었습니다.');
    } catch {
      setNotice('테이블 삭제에 실패했습니다.');
    }
  };

  const handleAddColumn = async () => {
    if (!selectedTable || !newColName.trim()) return;
    try {
      await adminApi.addColumn(selectedTable.id, newColName.trim(), newColType);
      setNewColName('');
      setNewColType('text');
      await loadTableDetail(selectedTable.id);
    } catch {
      setNotice('컬럼 추가에 실패했습니다.');
    }
  };

  const handleDeleteColumn = async (colId: number) => {
    if (!selectedTable) return;
    if (!confirm('이 컬럼과 해당 데이터가 삭제됩니다.')) return;
    try {
      await adminApi.deleteColumn(selectedTable.id, colId);
      await loadTableDetail(selectedTable.id);
    } catch {
      setNotice('컬럼 삭제에 실패했습니다.');
    }
  };

  const handleSaveRow = async () => {
    if (!selectedTable || !editingRow) return;
    try {
      if (editingRow.id === null) {
        await adminApi.addRow(selectedTable.id, editingRow.data);
      } else {
        await adminApi.updateRow(selectedTable.id, editingRow.id, editingRow.data);
      }
      setEditingRow(null);
      await loadTableDetail(selectedTable.id);
      await loadDataTables();
    } catch {
      setNotice('저장에 실패했습니다.');
    }
  };

  const handleDeleteRow = async (rowId: number) => {
    if (!selectedTable) return;
    try {
      await adminApi.deleteRow(selectedTable.id, rowId);
      await loadTableDetail(selectedTable.id);
      await loadDataTables();
    } catch {
      setNotice('행 삭제에 실패했습니다.');
    }
  };

  const handleExportTable = async () => {
    if (!selectedTable) return;
    setDataExporting(true);
    try {
      await adminApi.exportDataTable(selectedTable.id, selectedTable.name);
      setNotice('엑셀 파일이 다운로드되었습니다.');
    } catch {
      setNotice('엑셀 다운로드에 실패했습니다.');
    } finally {
      setDataExporting(false);
    }
  };

  // ── DB 브라우저 핸들러 ──────────────────────────────────────
  const loadDbTables = async () => {
    try {
      const result = await adminApi.getDbTables();
      setDbTables(result.tables);
    } catch {
      setNotice('DB 테이블 목록을 불러오지 못했습니다.');
    }
  };

  const loadDbTableData = async (tableName: string, page = 1) => {
    setDbLoading(true);
    try {
      const result = await adminApi.browseDbTable(tableName, page);
      setDbTableData(result);
      setDbPage(page);
    } catch {
      setNotice('테이블 데이터를 불러오지 못했습니다.');
    } finally {
      setDbLoading(false);
    }
  };

  const handleSelectDbTable = async (tableName: string) => {
    setSelectedDbTable(tableName);
    setDbPage(1);
    await loadDbTableData(tableName, 1);
  };

  const documentRows = useMemo(
    () => [...documents].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [documents],
  );

  const reviewCount = useMemo(() => documents.filter((doc) => doc.status === 'review' && !doc.is_deleted).length, [documents]);

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#ecfeff,_#f8fafc_55%)]">
        <div className="mx-auto flex min-h-screen max-w-md items-center px-6">
          <div className="w-full rounded-3xl border border-cyan-100 bg-white/95 p-8 shadow-xl shadow-cyan-100/50">
            <h1 className="text-2xl font-semibold text-slate-900">관리자 로그인</h1>
            <p className="mt-2 text-sm text-slate-500">등록된 Google 계정으로 로그인하세요.</p>
            {loginError && (
              <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{loginError}</p>
            )}
            <div className="mt-6 flex justify-center">
              {loginLoading ? (
                <p className="text-sm text-slate-400">로그인 중...</p>
              ) : (
                <GoogleLogin
                  onSuccess={async (credentialResponse) => {
                    if (!credentialResponse.credential) return;
                    setLoginLoading(true);
                    setLoginError('');
                    try {
                      const result = await adminApi.verifyGoogleToken(credentialResponse.credential);
                      saveAdminToken(result.token);
                      setAuthenticated(true);
                    } catch {
                      setLoginError('접근 권한이 없는 계정입니다. 관리자에게 문의하세요.');
                    } finally {
                      setLoginLoading(false);
                    }
                  }}
                  onError={() => setLoginError('Google 로그인에 실패했습니다.')}
                  useOneTap
                />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="rounded-3xl bg-[linear-gradient(135deg,_#0f172a,_#164e63)] p-6 text-white shadow-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.28em] text-cyan-200">Operator Console</p>
              <h1 className="mt-2 text-3xl font-semibold">승인형 운영 흐름으로 문서, FAQ, 프롬프트, 대화 데이터를 관리합니다.</h1>
              <p className="mt-2 max-w-3xl text-sm text-cyan-50/85">검토 대기 문서 {reviewCount}건. 승인 전까지는 운영 검색/RAG에 반영되지 않습니다.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={async () => {
                  setLoading(true);
                  await loadDashboard();
                  if (selectedDocument) await openDocument(selectedDocument.document.id);
                }}
                disabled={loading}
                className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-60"
              >
                {loading ? '새로고침 중...' : '새로고침'}
              </button>
              <button onClick={() => { clearAdminToken(); setAuthenticated(false); }} className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-900">
                로그아웃
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {([
            ['documents', '문서 검토'],
            ['faqs', 'FAQ 관리'],
            ['prompts', '프롬프트'],
            ['chats', '로그/내보내기'],
            ['data', '데이터 관리'],
            ['db', 'DB 브라우저'],
            ['settings', '설정'],
            ['permissions', '권한 관리'],
          ] as [TabKey, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)} className={`rounded-full px-4 py-2 text-sm font-medium ${activeTab === key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`}>
              {label}
            </button>
          ))}
        </div>

        {(notice || loadError) && (
          <div className={`mt-4 rounded-2xl px-4 py-3 text-sm ${loadError ? 'bg-rose-50 text-rose-700' : 'bg-cyan-50 text-cyan-800'}`}>
            {loadError || notice}
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-6">
              <section className="rounded-3xl bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">업로드와 변환</h2>
                <div className="mt-5 grid gap-4 lg:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-900">PDF → MD</h3>
                    <p className="mt-1 text-xs text-slate-500">변환 결과를 만든 뒤 검토 대기 상태로 저장합니다.</p>
                    <input ref={pdfInputRef} type="file" accept=".pdf" className="mt-4 block w-full text-sm" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
                    <button onClick={handlePdfUpload} disabled={!pdfFile || uploadBusy} className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">업로드</button>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-900">일반 MD 등록</h3>
                    <p className="mt-1 text-xs text-slate-500">문서형 데이터는 승인 후에만 검색에 반영됩니다.</p>
                    <input ref={mdInputRef} type="file" accept=".md" className="mt-4 block w-full text-sm" onChange={(e) => setMdFile(e.target.files?.[0] ?? null)} />
                    <input value={mdTitle} onChange={(e) => setMdTitle(e.target.value)} placeholder="문서 제목" className={`${INPUT_CLASS} mt-3`} />
                    <input value={mdCategory} onChange={(e) => setMdCategory(e.target.value)} placeholder="카테고리" className={`${INPUT_CLASS} mt-3`} />
                    <button onClick={handleMdUpload} disabled={!mdFile || uploadBusy} className="mt-4 w-full rounded-xl bg-cyan-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">등록</button>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-900">MD → FAQ JSON</h3>
                    <p className="mt-1 text-xs text-slate-500">변환된 FAQ는 승인 전까지 실제 FAQ DB에 반영되지 않습니다.</p>
                    <input ref={faqMdInputRef} type="file" accept=".md" className="mt-4 block w-full text-sm" onChange={(e) => setFaqMdFile(e.target.files?.[0] ?? null)} />
                    <input value={faqMdCategory} onChange={(e) => setFaqMdCategory(e.target.value)} placeholder="FAQ 카테고리" className={`${INPUT_CLASS} mt-3`} />
                    <button onClick={handleFaqMdUpload} disabled={!faqMdFile || uploadBusy} className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">변환 생성</button>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900">문서 목록</h2>
                  <span className="text-sm text-slate-500">{loading ? '불러오는 중...' : `${documentRows.length}건`}</span>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-slate-500">
                      <tr>
                        <th className="px-3 py-3">파일명</th>
                        <th className="px-3 py-3">타입</th>
                        <th className="px-3 py-3">상태</th>
                        <th className="px-3 py-3">버전</th>
                        <th className="px-3 py-3">생성일</th>
                        <th className="px-3 py-3">작업</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {documentRows.map((doc) => (
                        <tr key={doc.id} className={doc.is_deleted ? 'bg-rose-50/40' : ''}>
                          <td className="px-3 py-3">
                            <div className="font-medium text-slate-900">{doc.logical_name}</div>
                            <div className="text-xs text-slate-500">{doc.original_filename}</div>
                          </td>
                          <td className="px-3 py-3">{doc.parser_type ?? '-'}</td>
                          <td className="px-3 py-3">{doc.status}</td>
                          <td className="px-3 py-3">v{doc.version}</td>
                          <td className="px-3 py-3">{formatDate(doc.created_at)}</td>
                          <td className="px-3 py-3">
                            <div className="flex gap-2">
                              <button onClick={() => void openDocument(doc.id)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white">조회</button>
                              <button onClick={() => void handleDocumentDelete(doc.id)} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700">삭제</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <section className="rounded-3xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">검토 패널</h2>
                {documentLoading && <span className="text-sm text-slate-500">불러오는 중...</span>}
              </div>
              {!selectedDocument ? (
                <p className="mt-6 text-sm text-slate-500">문서를 선택하면 변환 결과와 승인 액션이 표시됩니다.</p>
              ) : (
                <div className="mt-4 space-y-5">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-semibold text-slate-900">{selectedDocument.document.original_filename}</div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                      <span>상태</span><span>{selectedDocument.document.status}</span>
                      <span>타입</span><span>{selectedDocument.document.parser_type ?? '-'}</span>
                      <span>활성</span><span>{selectedDocument.document.is_active ? 'Y' : 'N'}</span>
                      <span>삭제</span><span>{selectedDocument.document.is_deleted ? 'Y' : 'N'}</span>
                      <span>승인 시각</span><span>{formatDate(selectedDocument.document.approved_at)}</span>
                      <span>반려 시각</span><span>{formatDate(selectedDocument.document.rejected_at)}</span>
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-900">검토 메모</label>
                    <textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} className={`${TEXTAREA_CLASS} h-24`} placeholder="승인/반려/삭제 사유를 남겨두세요." />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button onClick={() => void handleDocumentApprove()} disabled={selectedDocument.document.is_deleted} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">승인</button>
                    <button onClick={() => void handleDocumentReject()} disabled={selectedDocument.document.is_deleted} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">반려</button>
                    <button onClick={() => void handleDocumentDelete(selectedDocument.document.id)} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white">삭제</button>
                    <button onClick={() => void handleDocumentRestore()} disabled={!selectedDocument.document.is_deleted} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">복구</button>
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-slate-900">MD 미리보기</h3>
                    <textarea readOnly value={selectedDocument.md_content ?? ''} className="h-56 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-700" />
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-slate-900">JSON 미리보기</h3>
                    <textarea readOnly value={selectedDocument.json_content ?? ''} className="h-56 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-700" />
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'faqs' && (
          <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <section className="rounded-3xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">FAQ 목록</h2>
                <button onClick={resetFaqForm} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white">새 FAQ</button>
              </div>
              <div className="mt-4 max-h-[720px] space-y-3 overflow-y-auto">
                {faqs.map((faq) => (
                  <div key={faq.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wide text-cyan-700">{faq.category}</div>
                        <div className="mt-1 font-medium text-slate-900">{faq.question}</div>
                        <p className="mt-2 line-clamp-3 text-sm text-slate-600">{faq.answer}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleSelectFaq(faq)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white">수정</button>
                        <button onClick={() => void handleDeleteFaq(faq.id)} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700">삭제</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">{faqForm.id ? 'FAQ 수정' : 'FAQ 추가'}</h2>
              <div className="mt-4 space-y-4">
                <input value={faqForm.id} onChange={(e) => setFaqForm((current) => ({ ...current, id: e.target.value }))} placeholder="FAQ ID" className={INPUT_CLASS} />
                <input value={faqForm.category} onChange={(e) => setFaqForm((current) => ({ ...current, category: e.target.value }))} placeholder="카테고리" className={INPUT_CLASS} />
                <input value={faqForm.question} onChange={(e) => setFaqForm((current) => ({ ...current, question: e.target.value }))} placeholder="질문" className={INPUT_CLASS} />
                <textarea value={faqForm.answer} onChange={(e) => setFaqForm((current) => ({ ...current, answer: e.target.value }))} placeholder="답변" className={`${TEXTAREA_CLASS} h-40`} />
                <input value={faqKeywords} onChange={(e) => setFaqKeywords(e.target.value)} placeholder="키워드" className={INPUT_CLASS} />
                <input value={faqAliases} onChange={(e) => setFaqAliases(e.target.value)} placeholder="별칭" className={INPUT_CLASS} />
                <input value={faqSearchHints} onChange={(e) => setFaqSearchHints(e.target.value)} placeholder="검색 힌트" className={INPUT_CLASS} />
                <input value={faqSourceFiles} onChange={(e) => setFaqSourceFiles(e.target.value)} placeholder="source_files" className={INPUT_CLASS} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={faqForm.direct_answer} onChange={(e) => setFaqForm((current) => ({ ...current, direct_answer: e.target.checked }))} />
                    direct_answer
                  </label>
                  <input type="number" min={1} max={10} value={faqForm.top_k} onChange={(e) => setFaqForm((current) => ({ ...current, top_k: Number(e.target.value) || 4 }))} className={INPUT_CLASS} />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => void handleSaveFaq()} disabled={faqSaving || !faqForm.id || !faqForm.question || !faqForm.answer} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{faqSaving ? '저장 중...' : '저장'}</button>
                  <button onClick={resetFaqForm} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">초기화</button>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'prompts' && (
          <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <section className="rounded-3xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">프롬프트 목록</h2>
                <button onClick={resetPromptForm} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white">새 프롬프트</button>
              </div>
              <div className="mt-4 max-h-[720px] space-y-3 overflow-y-auto">
                {prompts.map((prompt) => (
                  <div key={prompt.prompt_key} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wide text-cyan-700">{prompt.prompt_key}</div>
                        <div className="mt-1 font-medium text-slate-900">{prompt.label}</div>
                        <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-slate-600">{prompt.content}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleSelectPrompt(prompt)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white">수정</button>
                        <button onClick={() => void handleDeletePrompt(prompt.prompt_key)} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700">삭제</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">{promptForm.prompt_key && prompts.some((item) => item.prompt_key === promptForm.prompt_key) ? '프롬프트 수정' : '프롬프트 추가'}</h2>
              <div className="mt-4 space-y-4">
                <input value={promptForm.prompt_key} onChange={(e) => setPromptForm((current) => ({ ...current, prompt_key: e.target.value }))} placeholder="prompt_key" className={INPUT_CLASS} />
                <input value={promptForm.label} onChange={(e) => setPromptForm((current) => ({ ...current, label: e.target.value }))} placeholder="라벨" className={INPUT_CLASS} />
                <textarea value={promptForm.content} onChange={(e) => setPromptForm((current) => ({ ...current, content: e.target.value }))} placeholder="프롬프트 본문" className={`${TEXTAREA_CLASS} h-[420px]`} />
                <div className="flex gap-3">
                  <button onClick={() => void handleSavePrompt()} disabled={promptSaving || !promptForm.prompt_key || !promptForm.label || !promptForm.content} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{promptSaving ? '저장 중...' : '저장'}</button>
                  <button onClick={resetPromptForm} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">초기화</button>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'chats' && (
          <div className="mt-6 space-y-6">
            <section className="rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">대화 로그 조회와 엑셀 다운로드</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <input type="date" value={chatStartDate} onChange={(e) => setChatStartDate(e.target.value)} className={INPUT_CLASS} />
                <input type="date" value={chatEndDate} onChange={(e) => setChatEndDate(e.target.value)} className={INPUT_CLASS} />
                <div>
                  <input value={chatSessionId} onChange={(e) => setChatSessionId(e.target.value)} placeholder="세션 ID (선택)" className={INPUT_CLASS} />
                  <p className="mt-1 text-xs text-slate-400">날짜·세션 ID 모두 선택사항입니다</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => void handleFilterChatLogs()} disabled={chatLoading} className="flex-1 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{chatLoading ? '조회 중...' : '조회'}</button>
                  <button onClick={() => void handleExportChatLogs()} disabled={chatExporting} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{chatExporting ? '처리 중...' : '엑셀'}</button>
                </div>
              </div>
              <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto">
                {chatLogs.map((log) => (
                  <div key={log.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{log.session_id}</span>
                      <span>{formatDate(log.created_at)}</span>
                      <span>{log.source}</span>
                      <span>LLM ${log.llm_cost.toFixed(6)}</span>
                    </div>
                    <div className="mt-2 font-medium text-slate-900">{log.question}</div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{log.answer}</p>
                  </div>
                ))}
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-2">
              <section className="rounded-3xl bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">처리 로그</h2>
                <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto">
                  {processingLogs.map((log) => (
                    <div key={log.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="text-sm font-medium text-slate-900">{log.status} / {log.message}</div>
                      <div className="mt-1 text-xs text-slate-500">{formatDate(log.created_at)}</div>
                      {log.detail && <p className="mt-2 text-sm text-rose-600">{log.detail}</p>}
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">감사 로그</h2>
                <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="text-sm font-medium text-slate-900">{log.action}</div>
                      <div className="mt-1 text-xs text-slate-500">{log.target_type} / {log.target_id ?? '-'} / {formatDate(log.created_at)}</div>
                      {log.detail && <p className="mt-2 text-sm text-slate-700">{log.detail}</p>}
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="rounded-3xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">상담 세션</h2>
                <span className="text-sm text-slate-500">{sessions.length}건</span>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-3 py-3">사용자</th>
                      <th className="px-3 py-3">시작</th>
                      <th className="px-3 py-3">최근</th>
                      <th className="px-3 py-3">메시지</th>
                      <th className="px-3 py-3">상세</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sessions.map((session) => (
                      <tr key={session.id}>
                        <td className="px-3 py-3">{session.user_name ?? '익명'}</td>
                        <td className="px-3 py-3">{formatDate(session.created_at)}</td>
                        <td className="px-3 py-3">{formatDate(session.updated_at)}</td>
                        <td className="px-3 py-3">{session.message_count}</td>
                        <td className="px-3 py-3">
                          <button onClick={() => navigate(`/admin/sessions/${session.id}`)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white">보기</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'data' && (
          <div className="mt-6 flex gap-6">
            {/* 왼쪽: 테이블 목록 */}
            <div className="w-64 shrink-0">
              <div className="rounded-3xl bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-1">
                  <h2 className="text-sm font-semibold text-slate-900">테이블 목록</h2>
                  <div className="flex gap-1">
                    <button
                      onClick={() => void handleExportAll()}
                      disabled={allExporting || dataTables.length === 0}
                      title="모든 테이블을 하나의 엑셀 파일로 내보냅니다"
                      className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
                    >
                      {allExporting ? '…' : '전체 내보내기'}
                    </button>
                    <button onClick={() => setShowNewTableForm((v) => !v)} className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-medium text-white">+ 새 테이블</button>
                  </div>
                </div>
                {showNewTableForm && (
                  <div className="mt-3 space-y-2">
                    <input value={newTableName} onChange={(e) => setNewTableName(e.target.value)} placeholder="테이블 이름 *" className={INPUT_CLASS} />
                    <input value={newTableDesc} onChange={(e) => setNewTableDesc(e.target.value)} placeholder="설명 (선택)" className={INPUT_CLASS} />
                    <div className="flex gap-2">
                      <button onClick={() => void handleCreateTable()} disabled={!newTableName.trim()} className="flex-1 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">만들기</button>
                      <button onClick={() => { setShowNewTableForm(false); setNewTableName(''); setNewTableDesc(''); }} className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-600">취소</button>
                    </div>
                  </div>
                )}
                <div className="mt-3 space-y-1">
                  {dataTables.length === 0 && <p className="text-xs text-slate-400">테이블이 없습니다.</p>}
                  {dataTables.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => void loadTableDetail(t.id)}
                      className={`w-full rounded-xl px-3 py-2 text-left text-sm ${selectedTable?.id === t.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-100 text-slate-700'}`}
                    >
                      <div className="font-medium">{t.name}</div>
                      <div className={`text-xs ${selectedTable?.id === t.id ? 'text-slate-300' : 'text-slate-400'}`}>{t.row_count}행</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 오른쪽: 테이블 상세 */}
            <div className="min-w-0 flex-1">
              {!selectedTable ? (
                <div className="flex h-64 items-center justify-center rounded-3xl bg-white shadow-sm">
                  <p className="text-slate-400">왼쪽에서 테이블을 선택하거나 새로 만들어 주세요.</p>
                </div>
              ) : dataLoading ? (
                <div className="flex h-64 items-center justify-center rounded-3xl bg-white shadow-sm">
                  <p className="text-slate-400">불러오는 중...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* 헤더 */}
                  <div className="rounded-3xl bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">{selectedTable.name}</h2>
                        {selectedTable.description && <p className="mt-1 text-sm text-slate-500">{selectedTable.description}</p>}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {/* CSV/Excel 가져오기 */}
                        <input
                          ref={importFileRef}
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          className="hidden"
                          onChange={(e) => void handleImport(e)}
                        />
                        <button
                          onClick={() => importFileRef.current?.click()}
                          disabled={importing || selectedTable.columns.length === 0}
                          title="CSV 또는 Excel 파일의 행을 이 테이블로 가져옵니다"
                          className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                        >
                          {importing ? '가져오는 중...' : 'CSV/Excel 가져오기'}
                        </button>
                        <button onClick={() => void handleExportTable()} disabled={dataExporting} className="rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">{dataExporting ? '처리 중...' : '엑셀 내보내기'}</button>
                        <button onClick={() => void handleDeleteTable(selectedTable.id)} className="rounded-xl bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-100">테이블 삭제</button>
                      </div>
                    </div>

                    {/* 컬럼 관리 */}
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <h3 className="mb-3 text-sm font-medium text-slate-700">컬럼 관리 <span className="font-normal text-slate-400 text-xs ml-1">이름 클릭 시 변경 · ↑↓ 순서 변경</span></h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedTable.columns.map((col, colIdx) => (
                          <span key={col.id} className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                            {/* 순서 버튼 */}
                            <button
                              onClick={() => void handleReorderColumn(col.id, 'up')}
                              disabled={colIdx === 0}
                              className="text-slate-300 hover:text-slate-600 disabled:opacity-20 leading-none"
                              title="위로"
                            >↑</button>
                            <button
                              onClick={() => void handleReorderColumn(col.id, 'down')}
                              disabled={colIdx === selectedTable.columns.length - 1}
                              className="text-slate-300 hover:text-slate-600 disabled:opacity-20 leading-none"
                              title="아래로"
                            >↓</button>
                            {/* 컬럼 이름 (클릭하면 인라인 편집) */}
                            {editingColId === col.id ? (
                              <input
                                autoFocus
                                value={editingColNameVal}
                                onChange={(e) => setEditingColNameVal(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') void handleRenameColumn(col.id);
                                  if (e.key === 'Escape') setEditingColId(null);
                                }}
                                onBlur={() => void handleRenameColumn(col.id)}
                                className="w-24 rounded border border-cyan-400 bg-white px-1 py-0.5 text-xs outline-none"
                              />
                            ) : (
                              <button
                                onClick={() => { setEditingColId(col.id); setEditingColNameVal(col.column_name); }}
                                className="font-medium hover:text-cyan-700"
                                title="클릭하여 이름 변경"
                              >
                                {col.column_name}
                              </button>
                            )}
                            <span className="text-slate-400">({col.column_type})</span>
                            <button onClick={() => void handleDeleteColumn(col.id)} className="ml-0.5 text-slate-300 hover:text-rose-500" title="컬럼 삭제">×</button>
                          </span>
                        ))}
                        {/* 새 컬럼 추가 */}
                        <div className="flex items-center gap-1">
                          <input
                            value={newColName}
                            onChange={(e) => setNewColName(e.target.value)}
                            placeholder="컬럼 이름"
                            className="w-28 rounded-xl border border-dashed border-slate-300 px-3 py-1.5 text-xs outline-none focus:border-slate-400"
                            onKeyDown={(e) => { if (e.key === 'Enter') void handleAddColumn(); }}
                          />
                          <select value={newColType} onChange={(e) => setNewColType(e.target.value)} className="rounded-xl border border-dashed border-slate-300 px-2 py-1.5 text-xs outline-none">
                            <option value="text">텍스트</option>
                            <option value="number">숫자</option>
                            <option value="date">날짜</option>
                          </select>
                          <button onClick={() => void handleAddColumn()} disabled={!newColName.trim()} className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">+ 추가</button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 데이터 테이블 */}
                  <div className="rounded-3xl bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-slate-700">데이터 ({selectedTable.rows.length}행)</h3>
                      <button
                        onClick={() => setEditingRow({ id: null, data: Object.fromEntries(selectedTable.columns.map((c) => [c.column_name, ''])) })}
                        className="rounded-xl bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
                      >+ 행 추가</button>
                    </div>

                    {selectedTable.columns.length === 0 ? (
                      <p className="mt-4 text-sm text-slate-400">먼저 컬럼을 추가해 주세요.</p>
                    ) : (
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                              {selectedTable.columns.map((col) => (
                                <th key={col.id} className="pb-2 pr-4 font-medium">{col.column_name}</th>
                              ))}
                              <th className="pb-2 font-medium">작업</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {/* 새 행 입력 폼 */}
                            {editingRow && editingRow.id === null && (
                              <tr className="bg-slate-50">
                                {selectedTable.columns.map((col) => (
                                  <td key={col.id} className="py-2 pr-4">
                                    <input
                                      type={col.column_type === 'number' ? 'number' : col.column_type === 'date' ? 'date' : 'text'}
                                      value={editingRow.data[col.column_name] ?? ''}
                                      onChange={(e) => setEditingRow((prev) => prev ? { ...prev, data: { ...prev.data, [col.column_name]: e.target.value } } : null)}
                                      className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-slate-400"
                                    />
                                  </td>
                                ))}
                                <td className="py-2">
                                  <div className="flex gap-1">
                                    <button onClick={() => void handleSaveRow()} className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-medium text-white">저장</button>
                                    <button onClick={() => setEditingRow(null)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600">취소</button>
                                  </div>
                                </td>
                              </tr>
                            )}
                            {selectedTable.rows.map((row) => (
                              <tr key={row.id} className="hover:bg-slate-50">
                                {selectedTable.columns.map((col) => (
                                  <td key={col.id} className="py-2 pr-4">
                                    {editingRow?.id === row.id ? (
                                      <input
                                        type={col.column_type === 'number' ? 'number' : col.column_type === 'date' ? 'date' : 'text'}
                                        value={editingRow.data[col.column_name] ?? ''}
                                        onChange={(e) => setEditingRow((prev) => prev ? { ...prev, data: { ...prev.data, [col.column_name]: e.target.value } } : null)}
                                        className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:border-slate-400"
                                      />
                                    ) : (
                                      <span className="text-slate-800">{row.data[col.column_name] ?? ''}</span>
                                    )}
                                  </td>
                                ))}
                                <td className="py-2">
                                  {editingRow?.id === row.id ? (
                                    <div className="flex gap-1">
                                      <button onClick={() => void handleSaveRow()} className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-medium text-white">저장</button>
                                      <button onClick={() => setEditingRow(null)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600">취소</button>
                                    </div>
                                  ) : (
                                    <div className="flex gap-1">
                                      <button onClick={() => setEditingRow({ id: row.id, data: { ...row.data } })} className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:border-slate-400">수정</button>
                                      <button onClick={() => void handleDeleteRow(row.id)} className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-500 hover:bg-rose-50">삭제</button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                            {selectedTable.rows.length === 0 && !editingRow && (
                              <tr><td colSpan={selectedTable.columns.length + 1} className="py-6 text-center text-sm text-slate-400">데이터가 없습니다. 행을 추가해 주세요.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'db' && (
          <div className="mt-6 flex gap-6">
            {/* 왼쪽: 테이블 목록 */}
            <div className="w-56 shrink-0">
              <div className="rounded-3xl bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">테이블</h2>
                  <button onClick={() => void loadDbTables()} className="text-xs text-slate-400 hover:text-slate-700">새로고침</button>
                </div>
                <div className="mt-3 space-y-0.5">
                  {dbTables.map((t) => (
                    <button
                      key={t.name}
                      onClick={() => void handleSelectDbTable(t.name)}
                      className={`w-full rounded-xl px-3 py-2 text-left ${selectedDbTable === t.name ? 'bg-slate-900 text-white' : 'hover:bg-slate-100 text-slate-700'}`}
                    >
                      <div className="truncate text-sm font-medium">{t.display_name || t.name}</div>
                      {t.description && (
                        <div className={`truncate text-xs ${selectedDbTable === t.name ? 'text-slate-300' : 'text-slate-500'}`}>{t.description}</div>
                      )}
                      <div className={`text-xs ${selectedDbTable === t.name ? 'text-slate-400' : 'text-slate-400'}`}>{t.row_count.toLocaleString()}행</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 오른쪽: 데이터 */}
            <div className="min-w-0 flex-1">
              {!selectedDbTable ? (
                <div className="flex h-64 items-center justify-center rounded-3xl bg-white shadow-sm">
                  <p className="text-slate-400">왼쪽에서 테이블을 선택하세요.</p>
                </div>
              ) : dbLoading ? (
                <div className="flex h-64 items-center justify-center rounded-3xl bg-white shadow-sm">
                  <p className="text-slate-400">불러오는 중...</p>
                </div>
              ) : dbTableData ? (
                <div className="rounded-3xl bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      {(() => {
                        const meta = dbTables.find((t) => t.name === selectedDbTable);
                        return (
                          <>
                            <h2 className="font-semibold text-slate-900">{meta?.display_name || selectedDbTable}</h2>
                            {meta?.description && <p className="text-xs text-slate-500">{meta.description}</p>}
                            <p className="text-xs text-slate-400">전체 {dbTableData.total.toLocaleString()}행 · {dbTableData.page}페이지 · <span className="font-mono">{selectedDbTable}</span></p>
                          </>
                        );
                      })()}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => void loadDbTableData(selectedDbTable, dbPage - 1)} disabled={dbPage <= 1} className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-30">← 이전</button>
                      <button onClick={() => void loadDbTableData(selectedDbTable, dbPage + 1)} disabled={dbPage * dbTableData.limit >= dbTableData.total} className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-30">다음 →</button>
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100">
                          {dbTableData.columns.map((col) => (
                            <th key={col} className="pb-2 pr-4 text-left text-xs font-medium text-slate-500 whitespace-nowrap">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {dbTableData.rows.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            {dbTableData.columns.map((col) => {
                              const val = row[col];
                              const str = val === null || val === undefined ? '' : String(val);
                              const truncated = str.length > 60 ? str.slice(0, 60) + '…' : str;
                              return (
                                <td key={col} className="py-2 pr-4 text-xs text-slate-700 whitespace-nowrap" title={str}>{truncated}</td>
                              );
                            })}
                          </tr>
                        ))}
                        {dbTableData.rows.length === 0 && (
                          <tr><td colSpan={dbTableData.columns.length} className="py-6 text-center text-slate-400">데이터가 없습니다.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {activeTab === 'permissions' && (
          <div className="mt-6 space-y-6">
            {/* 최상위 관리자 */}
            <section className="rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">권한 관리</h2>
              <p className="mt-1 text-sm text-slate-500">관리자 페이지에 접근할 수 있는 Google 계정 이메일을 관리합니다.</p>

              {permLoading && <p className="mt-4 text-sm text-slate-400">불러오는 중...</p>}

              {permissionsData && (
                <div className="mt-5 space-y-4">
                  {/* 최상위 관리자 카드 */}
                  <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-center gap-3">
                      <span className="flex-shrink-0 rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-semibold text-white">최상위 관리자</span>
                      <span className="font-mono text-sm font-medium text-slate-800">{permissionsData.superadmin}</span>
                      {permissionsData.superadmin === permissionsData.current_user && (
                        <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-medium text-cyan-700">나</span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-amber-700">환경변수 <code className="font-mono">ADMIN_EMAIL</code>로 설정된 계정입니다. 삭제할 수 없으며 모든 권한을 보유합니다.</p>
                  </div>

                  {/* 관리자 목록 */}
                  <div>
                    <p className="mb-2 text-sm font-medium text-slate-700">관리자 <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{permissionsData.admins.length}명</span></p>
                    {permissionsData.admins.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-400">추가된 관리자가 없습니다.</p>
                    ) : (
                      <ul className="space-y-2">
                        {permissionsData.admins.map((admin) => {
                          const isMe = admin.email === permissionsData.current_user;
                          return (
                            <li key={admin.email} className={`flex items-center justify-between rounded-xl border px-4 py-3 ${isMe ? 'border-cyan-200 bg-cyan-50' : 'border-slate-100'}`}>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-slate-800">{admin.email}</span>
                                  {isMe && <span className="rounded-full bg-cyan-200 px-2 py-0.5 text-xs font-medium text-cyan-800">나</span>}
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">관리자</span>
                                </div>
                                <p className="mt-0.5 text-xs text-slate-400">
                                  {admin.added_by ? `${admin.added_by}이 추가` : '시스템 추가'}
                                  {admin.created_at && ` · ${new Date(admin.created_at).toLocaleDateString('ko-KR')}`}
                                </p>
                              </div>
                              <button
                                onClick={async () => {
                                  if (!window.confirm(`${admin.email}의 권한을 제거할까요?`)) return;
                                  try {
                                    await adminApi.removePermission(admin.email);
                                    setNotice('권한을 제거했습니다.');
                                    await loadPermissions();
                                  } catch {
                                    setNotice('권한 제거에 실패했습니다.');
                                  }
                                }}
                                className="ml-3 flex-shrink-0 text-xs text-rose-500 hover:text-rose-700"
                              >
                                제거
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {/* 이메일 추가 */}
                  <div className="border-t border-slate-100 pt-4">
                    <p className="mb-2 text-sm font-medium text-slate-700">관리자 추가</p>
                    <div className="flex gap-2">
                      <input
                        value={newPermEmail}
                        onChange={(e) => setNewPermEmail(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                        placeholder="추가할 Google 이메일"
                        className={INPUT_CLASS + ' max-w-sm'}
                      />
                      <button
                        disabled={permSaving || !newPermEmail.trim()}
                        onClick={async () => {
                          setPermSaving(true);
                          try {
                            await adminApi.addPermission(newPermEmail.trim());
                            setNewPermEmail('');
                            setNotice('권한을 추가했습니다.');
                            await loadPermissions();
                          } catch {
                            setNotice('권한 추가에 실패했습니다. 이미 등록된 이메일일 수 있습니다.');
                          } finally {
                            setPermSaving(false);
                          }
                        }}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {permSaving ? '추가 중...' : '추가'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="mt-6 space-y-6">
            <section className="rounded-3xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">암호화 설정</h2>
                  <p className="mt-1 text-sm text-slate-500">카테고리별 암호화 ON/OFF와 기존 데이터 일괄 변환을 관리합니다.</p>
                </div>
                <button onClick={() => { setEncryptionSettings(null); void loadEncryptionSettings(); }} className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-600">새로고침</button>
              </div>

              {encryptionLoading && <p className="mt-4 text-sm text-slate-400">불러오는 중...</p>}

              {encryptionSettings && (
                <div className="mt-5 space-y-4">
                  {/* 항상 암호화 카테고리 안내 */}
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-700">채팅 내용 (메시지·세션)</p>
                        <p className="mt-0.5 text-xs text-slate-400">개인정보 보호를 위해 항상 암호화됩니다. 관리자가 변경할 수 없습니다.</p>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">항상 ON</span>
                    </div>
                  </div>

                  {/* 설정 가능한 카테고리 */}
                  {encryptionSettings.categories.map((cat) => (
                    <div key={cat.key} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{cat.label}</p>
                          <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-slate-500">
                            <span>전체 {cat.total}건</span>
                            <span className="text-amber-600">암호화 {cat.encrypted_count}건</span>
                            <span className="text-emerald-600">평문 {cat.plain_count}건</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <label className="flex cursor-pointer items-center gap-2">
                            <div className="relative">
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={cat.encrypt_enabled}
                                onChange={(e) => void handleToggleEncryption(cat.key, e.target.checked)}
                              />
                              <div className={`h-6 w-11 rounded-full transition-colors ${cat.encrypt_enabled ? 'bg-cyan-600' : 'bg-slate-300'}`} />
                              <div className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${cat.encrypt_enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                            </div>
                            <span className="text-sm font-medium text-slate-700">{cat.encrypt_enabled ? '암호화 ON' : '암호화 OFF'}</span>
                          </label>
                        </div>
                      </div>
                      {cat.total > 0 && (
                        <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                          <button
                            disabled={migrating !== null || cat.plain_count === 0}
                            onClick={() => void handleMigrateEncryption(cat.key, 'encrypt')}
                            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                          >
                            {migrating === `${cat.key}_encrypt` ? '처리 중...' : `평문 → 암호화 (${cat.plain_count}건)`}
                          </button>
                          <button
                            disabled={migrating !== null || cat.encrypted_count === 0}
                            onClick={() => void handleMigrateEncryption(cat.key, 'decrypt')}
                            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                          >
                            {migrating === `${cat.key}_decrypt` ? '처리 중...' : `암호화 → 평문 (${cat.encrypted_count}건)`}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-3xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">LLM 모델 설정</h2>
                  <p className="mt-1 text-sm text-slate-500">변경 즉시 모든 답변에 적용됩니다. 목록은 OpenAI API에서 실시간 조회합니다.</p>
                </div>
                <button onClick={() => { setModelSettings(null); void loadModelSettings(); }} className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-600">새로고침</button>
              </div>

              {modelLoadError && (
                <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{modelLoadError}</div>
              )}

              {!modelSettings && !modelLoadError && (
                <p className="mt-4 text-sm text-slate-400">불러오는 중...</p>
              )}

              {modelSettings && (() => {
                const allModels = modelSettings.available_models.includes(modelSettings.current_model)
                  ? modelSettings.available_models
                  : [...modelSettings.available_models, modelSettings.current_model];
                return (
                  <div className="mt-5 space-y-5">
                    <div className="flex items-center gap-2 rounded-2xl bg-cyan-50 px-4 py-3">
                      <span className="text-xs font-medium text-cyan-600">현재 적용 모델</span>
                      <span className="font-mono text-sm font-semibold text-cyan-800">{modelSettings.current_model}</span>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-medium text-slate-500">사용 가능한 모델</p>
                      {allModels.map((m) => {
                        const info = MODEL_INFO[m];
                        const isCurrent = m === modelSettings.current_model;
                        return (
                          <label
                            key={m}
                            className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${isCurrent ? 'border-cyan-300 bg-cyan-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                          >
                            <input type="radio" name="model-select" value={m} defaultChecked={isCurrent} className="mt-0.5 accent-cyan-600" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-sm font-semibold text-slate-800">{m}</span>
                                {info?.badge && (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">{info.badge}</span>
                                )}
                                {isCurrent && (
                                  <span className="rounded-full bg-cyan-200 px-2 py-0.5 text-xs font-medium text-cyan-800">현재</span>
                                )}
                              </div>
                              {info ? (
                                <p className="mt-1 text-xs text-slate-500">{info.desc}</p>
                              ) : (
                                <p className="mt-1 text-xs text-slate-400">모델 정보 없음</p>
                              )}
                              {info && (
                                <div className="mt-1.5 flex gap-3 text-xs text-slate-400">
                                  <span>속도 <span className="font-medium text-slate-600">{info.speed}</span></span>
                                  <span>비용 <span className="font-medium text-slate-600">{info.cost}</span></span>
                                </div>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    <button
                      disabled={modelSaving}
                      onClick={async () => {
                        const checked = document.querySelector<HTMLInputElement>('input[name="model-select"]:checked');
                        if (!checked?.value) return;
                        setModelSaving(true);
                        try {
                          const result = await adminApi.setModel(checked.value);
                          setModelSettings({ ...modelSettings, current_model: result.model_name });
                          setNotice(result.message);
                        } catch {
                          setNotice('모델 변경에 실패했습니다.');
                        } finally {
                          setModelSaving(false);
                        }
                      }}
                      className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {modelSaving ? '저장 중...' : '선택한 모델로 적용'}
                    </button>
                  </div>
                );
              })()}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
