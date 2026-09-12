import React, { useState, useEffect } from 'react';
import { useShop } from '../../context/ShopContext';
import { 
  dbLogger, 
  DataFlowLogEntry, 
  DataFlowStage 
} from '../../utils/dbLogger';
import {
  dbMonitor,
  FirestoreLogRecord,
  FirestoreOpType,
  OperationStatus,
  monitoredSetDoc,
  monitoredGetDoc
} from '../../utils/databaseMonitor';
import { 
  Activity, 
  Search, 
  Trash2, 
  Copy, 
  Check, 
  RefreshCw, 
  Database, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Layers, 
  ChevronDown, 
  ChevronUp,
  Cpu,
  ShieldCheck,
  Zap,
  Download,
  Terminal,
  FileCheck,
  AlertTriangle
} from 'lucide-react';
import { doc } from 'firebase/firestore';
import { db } from '../../firebase';

export const DatabaseActivityLogs: React.FC = () => {
  const { products, orders, showToast } = useShop();

  // Tab: 'operations' (dbMonitor) vs 'pipeline' (dbLogger)
  const [activeTab, setActiveTab] = useState<'operations' | 'pipeline'>('operations');

  // Monitor logs from databaseMonitor.ts
  const [monitorLogs, setMonitorLogs] = useState<FirestoreLogRecord[]>([]);
  // Pipeline logs from dbLogger.ts
  const [pipelineLogs, setPipelineLogs] = useState<DataFlowLogEntry[]>([]);

  // Filter states
  const [selectedOpType, setSelectedOpType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedCollection, setSelectedCollection] = useState<string>('all');
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDiagnosticRunning, setIsDiagnosticRunning] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<{
    success: boolean;
    latencyMs: number;
    timestamp: string;
    message: string;
    docId: string;
  } | null>(null);

  // Subscribe to live database monitor operations
  useEffect(() => {
    const unsubscribeMonitor = dbMonitor.subscribe((_, updatedLogs) => {
      setMonitorLogs([...updatedLogs]);
    });
    setMonitorLogs(dbMonitor.getLogs());

    const unsubscribePipeline = dbLogger.subscribe((_, updatedLogs) => {
      setPipelineLogs([...updatedLogs]);
    });
    setPipelineLogs(dbLogger.getLogs());

    return () => {
      unsubscribeMonitor();
      unsubscribePipeline();
    };
  }, []);

  // Filtered Monitor logs
  const filteredMonitorLogs = monitorLogs.filter((log) => {
    const matchesOp = selectedOpType === 'all' || log.operation === selectedOpType;
    const matchesStatus = selectedStatus === 'all' || log.status === selectedStatus;
    const matchesCollection = selectedCollection === 'all' || log.collection === selectedCollection || log.path.startsWith(selectedCollection);
    const matchesSearch = !searchQuery || 
      log.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.documentId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.caller.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.errorMessage && log.errorMessage.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (log.metadata && JSON.stringify(log.metadata).toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesOp && matchesStatus && matchesCollection && matchesSearch;
  });

  // Filtered Pipeline logs
  const filteredPipelineLogs = pipelineLogs.filter((log) => {
    const matchesStage = selectedStage === 'all' || log.stage === selectedStage;
    const matchesCollection = selectedCollection === 'all' || log.targetPath.startsWith(selectedCollection);
    const matchesSearch = !searchQuery || 
      log.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.targetPath.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.sourceComponent.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.actionName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.errorMessage && log.errorMessage.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesStage && matchesCollection && matchesSearch;
  });

  // Calculate live metrics from dbMonitor
  const diagnosticsSummary = dbMonitor.getDiagnosticsSummary();
  const failedOps = monitorLogs.filter(l => l.status === 'FAILED');

  // Run a real-time Firestore roundtrip diagnostic test using monitoredSetDoc and monitoredGetDoc
  const handleRunDiagnostic = async () => {
    setIsDiagnosticRunning(true);
    setDiagnosticResult(null);

    const testId = `diag-${Date.now()}`;
    const testDocRef = doc(db, 'cms', 'diagnostic_ping');

    try {
      const pingPayload = {
        pingId: testId,
        timestamp: new Date().toISOString(),
        initiatedFrom: 'Admin:DatabaseActivityLogs',
        agent: 'Yalla.lb Diagnostic Healthcheck'
      };

      const start = performance.now();
      await monitoredSetDoc(testDocRef, pingPayload, { merge: true }, 'AdminView:DiagnosticPing');
      await monitoredGetDoc(testDocRef, 'AdminView:DiagnosticVerify');
      const elapsed = Math.round(performance.now() - start);

      setDiagnosticResult({
        success: true,
        latencyMs: elapsed,
        timestamp: new Date().toLocaleTimeString(),
        message: `Firestore roundtrip verification succeeded in ${elapsed}ms. Read & write verified on document cms/diagnostic_ping.`,
        docId: 'cms/diagnostic_ping'
      });
      showToast(`Firestore live diagnostic passed (${elapsed}ms latency)`, 'success');
    } catch (err: any) {
      setDiagnosticResult({
        success: false,
        latencyMs: 0,
        timestamp: new Date().toLocaleTimeString(),
        message: `Diagnostic failure: ${err?.message || 'Database error'}. Check security rules or network.`,
        docId: 'cms/diagnostic_ping'
      });
      showToast(`Firestore diagnostic failed: ${err?.message || 'Check database'}`, 'warning');
    } finally {
      setIsDiagnosticRunning(false);
    }
  };

  const handleClearAllLogs = () => {
    dbMonitor.clearLogs();
    dbLogger.clearLogs();
    setMonitorLogs([]);
    setPipelineLogs([]);
    showToast('Activity logs cleared from memory', 'info');
  };

  const handleCopyLogs = (data: any, id: string) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedId(id);
    showToast('Copied JSON to clipboard', 'info');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportFullDiagnostics = () => {
    const exportData = {
      exportedAt: new Date().toISOString(),
      diagnostics: diagnosticsSummary,
      activeCollectionsSummary: {
        cmsDocuments: 1,
        productsCount: products.length,
        ordersCount: orders.length
      },
      databaseMonitorRecords: monitorLogs,
      pipelineLogs: pipelineLogs
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yalla-db-diagnostics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Diagnostics export downloaded as JSON', 'success');
  };

  const getOpBadge = (op: FirestoreOpType, status: OperationStatus) => {
    if (status === 'FAILED') {
      return { bg: 'bg-rose-500/10 text-rose-600 border-rose-200', label: op, icon: '✕' };
    }
    switch (op) {
      case 'SET_DOC':
        return { bg: 'bg-indigo-500/10 text-indigo-700 border-indigo-200', label: 'SET_DOC', icon: '📝' };
      case 'UPDATE_DOC':
        return { bg: 'bg-blue-500/10 text-blue-700 border-blue-200', label: 'UPDATE_DOC', icon: '🔄' };
      case 'DELETE_DOC':
        return { bg: 'bg-rose-500/10 text-rose-700 border-rose-200', label: 'DELETE_DOC', icon: '🗑️' };
      case 'BATCH_COMMIT':
        return { bg: 'bg-purple-500/10 text-purple-700 border-purple-200', label: 'BATCH_COMMIT', icon: '📦' };
      case 'GET_DOC':
        return { bg: 'bg-amber-500/10 text-amber-700 border-amber-200', label: 'GET_DOC', icon: '🔍' };
      case 'SNAPSHOT_SYNC':
        return { bg: 'bg-emerald-500/10 text-emerald-700 border-emerald-200', label: 'SNAPSHOT_SYNC', icon: '⚡' };
      default:
        return { bg: 'bg-slate-500/10 text-slate-700 border-slate-200', label: op, icon: '⚡' };
    }
  };

  const getStageBadge = (stage: DataFlowStage) => {
    switch (stage) {
      case 'STAGE_1_FORM_INPUT':
        return { bg: 'bg-blue-500/10 text-blue-700 border-blue-200', label: '1. Form Input', icon: '📝' };
      case 'STAGE_2_SANITIZATION':
        return { bg: 'bg-purple-500/10 text-purple-700 border-purple-200', label: '2. Sanitization', icon: '🧹' };
      case 'STAGE_3_FIRESTORE_WRITE':
        return { bg: 'bg-amber-500/10 text-amber-700 border-amber-200', label: '3. Write Sent', icon: '🚀' };
      case 'STAGE_4_FIRESTORE_ACK':
        return { bg: 'bg-emerald-500/10 text-emerald-700 border-emerald-200', label: '4. Firestore ACK', icon: '✅' };
      case 'STAGE_4_FIRESTORE_ERROR':
        return { bg: 'bg-rose-500/10 text-rose-700 border-rose-200', label: '4. Write Error', icon: '❌' };
      case 'STAGE_5_SNAPSHOT_SYNC':
        return { bg: 'bg-cyan-500/10 text-cyan-700 border-cyan-200', label: '5. Realtime Sync', icon: '⚡' };
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header & Quick Action Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Firestore Database Monitor & Sync Inspector</h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Active Monitoring
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Tracks every read, write, payload diff, and snapshot sync with timestamps and document IDs.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleRunDiagnostic}
            disabled={isDiagnosticRunning}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-all shadow-xs flex items-center gap-2"
          >
            {isDiagnosticRunning ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Testing Ping...</span>
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5" />
                <span>Run Firestore Health Ping</span>
              </>
            )}
          </button>

          <button
            onClick={handleExportFullDiagnostics}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5"
            title="Download full diagnostics as JSON"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export JSON</span>
          </button>

          <button
            onClick={handleClearAllLogs}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5"
            title="Clear all logs"
          >
            <Trash2 className="w-3.5 h-3.5 text-slate-500" />
            <span>Clear Logs</span>
          </button>
        </div>
      </div>


      {/* Sync Health & Latency Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
            <span>Total Operations</span>
            <Database className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1 font-mono">
            {diagnosticsSummary.totalOperations}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {diagnosticsSummary.totalWrites} writes / {diagnosticsSummary.totalReads} reads
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
            <span>Write Success Rate</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-emerald-600 mt-1 font-mono">
            {diagnosticsSummary.writeSuccessRate}%
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {diagnosticsSummary.successfulWrites} committed
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
            <span>Average Latency</span>
            <Clock className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div className="text-xl font-bold text-blue-600 mt-1 font-mono">
            {diagnosticsSummary.avgLatencyMs} <span className="text-xs font-normal">ms</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Firestore network roundtrip
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
            <span>Catalog Items</span>
            <Layers className="w-3.5 h-3.5 text-purple-500" />
          </div>
          <div className="text-xl font-bold text-purple-600 mt-1 font-mono">
            {products.length}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            in `products` collection
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
            <span>Active Orders</span>
            <FileCheck className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="text-xl font-bold text-amber-600 mt-1 font-mono">
            {orders.length}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            in `orders` collection
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
            <span>Sync Errors</span>
            <AlertTriangle className={`w-3.5 h-3.5 ${failedOps.length > 0 ? 'text-rose-500' : 'text-slate-400'}`} />
          </div>
          <div className={`text-xl font-bold mt-1 font-mono ${failedOps.length > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            {failedOps.length}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {failedOps.length === 0 ? 'All operations normal' : 'Requires attention'}
          </div>
        </div>
      </div>

      {/* Sync Failure Diagnostic Alert Box if failures exist */}
      {failedOps.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl space-y-3">
          <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>Sync Failure Detected ({failedOps.length} failed operations)</span>
          </div>
          <div className="space-y-2">
            {failedOps.slice(0, 3).map((f) => (
              <div key={f.id} className="bg-white p-3 rounded-xl border border-rose-200 text-xs flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded text-[11px]">
                      {f.path}
                    </span>
                    <span className="text-slate-500 font-semibold">{f.caller}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{f.timestamp}</span>
                  </div>
                  <div className="text-rose-600 font-mono text-[11px]">
                    {f.errorCode ? `[${f.errorCode}] ` : ''}{f.errorMessage || 'Unknown Firestore error'}
                  </div>
                </div>
                <button
                  onClick={() => handleCopyLogs(f, f.id)}
                  className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg font-semibold text-[11px] flex items-center gap-1 self-start md:self-auto"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copy Error JSON</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Diagnostic Result Banner */}
      {diagnosticResult && (
        <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
          diagnosticResult.success 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
            : 'bg-rose-50 border-rose-200 text-rose-900'
        }`}>
          {diagnosticResult.success ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          )}
          <div className="space-y-1 text-xs flex-1">
            <div className="font-bold flex items-center gap-2">
              <span>{diagnosticResult.success ? 'Firestore Read/Write Health Check Passed' : 'Firestore Health Check Failed'}</span>
              <span className="font-mono text-[11px] opacity-75">[{diagnosticResult.timestamp}]</span>
            </div>
            <p>{diagnosticResult.message}</p>
          </div>
        </div>
      )}

      {/* Navigation View Switcher */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('operations')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'operations'
                ? 'bg-[#4f46e5] text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Firestore Operations Monitor ({filteredMonitorLogs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('pipeline')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'pipeline'
                ? 'bg-[#4f46e5] text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>5-Stage Pipeline Audit ({filteredPipelineLogs.length})</span>
          </button>
        </div>

        <div className="text-xs text-slate-400 hidden sm:block">
          Window DevTools: <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono text-[11px]">window.__GET_DB_LOGS()</code>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={activeTab === 'operations' ? "Search path (e.g. cms/main), doc ID, caller, payload..." : "Search action, summary, document path..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 text-xs text-slate-900 placeholder-slate-400 rounded-xl border border-slate-200 focus:outline-none focus:border-[#4f46e5] focus:bg-white transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {activeTab === 'operations' ? (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 font-semibold">Op Type:</span>
                <select
                  value={selectedOpType}
                  onChange={(e) => setSelectedOpType(e.target.value)}
                  className="bg-slate-50 text-xs text-slate-900 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#4f46e5]"
                >
                  <option value="all">All Operations</option>
                  <option value="SET_DOC">SET_DOC</option>
                  <option value="UPDATE_DOC">UPDATE_DOC</option>
                  <option value="DELETE_DOC">DELETE_DOC</option>
                  <option value="BATCH_COMMIT">BATCH_COMMIT</option>
                  <option value="GET_DOC">GET_DOC</option>
                  <option value="SNAPSHOT_SYNC">SNAPSHOT_SYNC</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 font-semibold">Status:</span>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="bg-slate-50 text-xs text-slate-900 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#4f46e5]"
                >
                  <option value="all">All Statuses</option>
                  <option value="SUCCESS">SUCCESS</option>
                  <option value="FAILED">FAILED</option>
                  <option value="PENDING">PENDING</option>
                </select>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 font-semibold">Stage:</span>
              <select
                value={selectedStage}
                onChange={(e) => setSelectedStage(e.target.value)}
                className="bg-slate-50 text-xs text-slate-900 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#4f46e5]"
              >
                <option value="all">All Stages</option>
                <option value="STAGE_1_FORM_INPUT">Stage 1: Form Input</option>
                <option value="STAGE_2_SANITIZATION">Stage 2: Sanitization</option>
                <option value="STAGE_3_FIRESTORE_WRITE">Stage 3: Write Dispatched</option>
                <option value="STAGE_4_FIRESTORE_ACK">Stage 4: Firestore ACK</option>
                <option value="STAGE_4_FIRESTORE_ERROR">Stage 4: Errors</option>
                <option value="STAGE_5_SNAPSHOT_SYNC">Stage 5: Snapshot Sync</option>
              </select>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-semibold">Collection:</span>
            <select
              value={selectedCollection}
              onChange={(e) => setSelectedCollection(e.target.value)}
              className="bg-slate-50 text-xs text-slate-900 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#4f46e5]"
            >
              <option value="all">All Collections</option>
              <option value="cms">cms/main (Site CMS)</option>
              <option value="products">products/* (Catalog)</option>
              <option value="orders">orders/* (Orders)</option>
              <option value="users">users/* (Profiles)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Log Feed Display */}
      {activeTab === 'operations' ? (
        /* DATABASE MONITOR OPERATIONS VIEW */
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Firestore Low-Level Log Stream ({filteredMonitorLogs.length} events)
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Shows exact timestamp, doc ID, caller, latency ms, and diffs
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
            {filteredMonitorLogs.length === 0 ? (
              <div className="text-center py-16 text-slate-400 space-y-2">
                <Database className="w-8 h-8 mx-auto text-slate-300" />
                <div className="text-xs font-bold">No Firestore operations logged yet</div>
                <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                  Perform edits in AdminView or click "Run Firestore Health Ping" to track read/write operations.
                </p>
              </div>
            ) : (
              filteredMonitorLogs.map((log) => {
                const badge = getOpBadge(log.operation, log.status);
                const isExpanded = expandedLogId === log.id;
                const isCopied = copiedId === log.id;

                return (
                  <div 
                    key={log.id} 
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    className={`p-4 transition-colors cursor-pointer hover:bg-slate-50/80 ${
                      log.status === 'FAILED' ? 'bg-rose-50/40' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        
                        {/* Badges, Path & Document ID */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border flex items-center gap-1 ${badge.bg}`}>
                            <span>{badge.icon}</span>
                            <span>{badge.label}</span>
                          </span>

                          <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50/60 px-2 py-0.5 rounded-md border border-indigo-100">
                            {log.path}
                          </span>

                          <span className="text-[11px] text-slate-500 font-medium">
                            caller: <strong className="text-slate-700 font-bold">{log.caller}</strong>
                          </span>

                          {log.latencyMs !== undefined && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              {log.latencyMs}ms
                            </span>
                          )}

                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            log.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' :
                            log.status === 'FAILED' ? 'bg-rose-100 text-rose-800' :
                            'bg-amber-100 text-amber-800 animate-pulse'
                          }`}>
                            {log.status}
                          </span>
                        </div>

                        {/* Metadata / Error message */}
                        {log.errorMessage ? (
                          <div className="text-[11px] font-mono text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-200">
                            {log.errorCode ? `[${log.errorCode}] ` : ''}{log.errorMessage}
                          </div>
                        ) : log.metadata ? (
                          <div className="text-[11px] text-slate-500 font-mono">
                            {JSON.stringify(log.metadata)}
                          </div>
                        ) : null}
                      </div>

                      {/* Timestamp & Expand Controls */}
                      <div className="flex items-center gap-2 text-right flex-shrink-0">
                        <span className="text-[11px] font-mono text-slate-400">
                          {log.timestamp}
                        </span>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyLogs(log, log.id);
                          }}
                          className="p-1 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-200/50 transition-colors"
                          title="Copy operation JSON"
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>

                        <div className="text-slate-400">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Inspector */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 text-xs" onClick={(e) => e.stopPropagation()}>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-xl">
                          <div><strong>Collection:</strong> {log.collection}</div>
                          <div><strong>Document ID:</strong> {log.documentId}</div>
                          <div><strong>ISO Timestamp:</strong> {log.isoTimestamp}</div>
                          <div><strong>Epoch ms:</strong> {log.epochMs}</div>
                        </div>

                        {log.diff && (
                          <div className="space-y-1">
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Field Diff:</div>
                            <pre className="bg-slate-900 text-amber-300 p-3 rounded-xl overflow-x-auto text-[11px] font-mono max-h-48">
                              {JSON.stringify(log.diff, null, 2)}
                            </pre>
                          </div>
                        )}

                        {log.payload !== undefined && (
                          <div className="space-y-1">
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Payload Data:</div>
                            <pre className="bg-slate-900 text-emerald-300 p-3 rounded-xl overflow-x-auto text-[11px] font-mono max-h-56">
                              {JSON.stringify(log.payload, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* 5-STAGE PIPELINE AUDIT VIEW */
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                5-Stage Pipeline Audit Stream ({filteredPipelineLogs.length} entries)
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Tracks Form Input → Sanitization → Dispatch → ACK → Snapshot
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
            {filteredPipelineLogs.length === 0 ? (
              <div className="text-center py-16 text-slate-400 space-y-2">
                <Database className="w-8 h-8 mx-auto text-slate-300" />
                <div className="text-xs font-bold">No pipeline logs match your filters</div>
              </div>
            ) : (
              filteredPipelineLogs.map((log) => {
                const badge = getStageBadge(log.stage);
                const isExpanded = expandedLogId === log.id;
                const isCopied = copiedId === log.id;

                return (
                  <div 
                    key={log.id} 
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    className={`p-4 transition-colors cursor-pointer hover:bg-slate-50/80 ${
                      log.stage === 'STAGE_4_FIRESTORE_ERROR' ? 'bg-rose-50/30' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border flex items-center gap-1 ${badge.bg}`}>
                            <span>{badge.icon}</span>
                            <span>{badge.label}</span>
                          </span>

                          <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50/60 px-2 py-0.5 rounded-md border border-indigo-100 truncate">
                            {log.targetPath}
                          </span>

                          <span className="text-[11px] text-slate-400 font-medium">
                            via <strong className="text-slate-600 font-bold">{log.sourceComponent}</strong> ({log.actionName})
                          </span>

                          {log.latencyMs !== undefined && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              {log.latencyMs}ms
                            </span>
                          )}
                        </div>

                        <p className="text-xs font-medium text-slate-800 leading-relaxed">
                          {log.summary}
                        </p>

                        {log.errorMessage && (
                          <div className="text-[11px] font-mono text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-200">
                            Error Code: {log.errorCode} — {log.errorMessage}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-right flex-shrink-0">
                        <span className="text-[11px] font-mono text-slate-400">
                          {log.timestamp}
                        </span>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyLogs(log, log.id);
                          }}
                          className="p-1 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-200/50 transition-colors"
                          title="Copy log entry JSON"
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>

                        <div className="text-slate-400">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 text-xs" onClick={(e) => e.stopPropagation()}>
                        {log.diff && (
                          <div className="space-y-1">
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Field Changes (Diff):</div>
                            <pre className="bg-slate-900 text-amber-300 p-3 rounded-xl overflow-x-auto text-[11px] font-mono max-h-48">
                              {JSON.stringify(log.diff, null, 2)}
                            </pre>
                          </div>
                        )}

                        {log.payload !== undefined && (
                          <div className="space-y-1">
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Document Payload:</div>
                            <pre className="bg-slate-900 text-emerald-300 p-3 rounded-xl overflow-x-auto text-[11px] font-mono max-h-56">
                              {JSON.stringify(log.payload, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 5-Stage Architecture Flow Footer */}
      <div className="bg-slate-900 text-white p-5 rounded-3xl shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              5-Stage Data Flow Pipeline Architecture
            </span>
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Automatic undefined scrubbing & real-time snapshot confirmation</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 pt-2 text-xs">
          <div className="bg-white/5 border border-white/10 p-3 rounded-2xl space-y-1">
            <div className="font-bold text-blue-300 flex items-center gap-1.5">
              <span>1. Form Input</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              Admin edits text, toggles section, or changes price. Input diff calculated.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 p-3 rounded-2xl space-y-1">
            <div className="font-bold text-purple-300 flex items-center gap-1.5">
              <span>2. Sanitization</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              Strips any `undefined` values to guarantee Firestore serialization compliance.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 p-3 rounded-2xl space-y-1">
            <div className="font-bold text-amber-300 flex items-center gap-1.5">
              <span>3. Write Dispatch</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              Dispatches `setDoc` or `writeBatch` to the exact Firestore document path.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 p-3 rounded-2xl space-y-1">
            <div className="font-bold text-emerald-300 flex items-center gap-1.5">
              <span>4. Firestore ACK</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              Firestore commits write, calculates latency (ms), and confirms persistence.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 p-3 rounded-2xl space-y-1">
            <div className="font-bold text-cyan-300 flex items-center gap-1.5">
              <span>5. Realtime Sync</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              `onSnapshot` listener receives the new state and renders instantly across all devices.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
};
