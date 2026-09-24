import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BookOpen, Check, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useShop } from '../../context/ShopContext';
import type { CategoryItem, Product, Seller } from '../../types';
import {
  blankTemplateCsv,
  catalogTemplateCsv,
  checkProductTemplate,
  MAX_TEMPLATE_ROWS,
  PRODUCT_TEMPLATE_COLUMNS,
  PRODUCT_TEMPLATE_GUIDE,
  type TemplateCheck,
} from '../../lib/productTemplate';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const SHOWN_ROWS = 200;

const saveFile = (text: string, filename: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

interface Props {
  products: Product[];
  sellers: Seller[];
  categories: CategoryItem[];
}

/**
 * Adding and updating products in bulk, only through the product template
 * (src/lib/productTemplate.ts). A file is checked in full as soon as it is
 * chosen, and Import stays off until every row passes.
 */
export const BulkProductImport: React.FC<Props> = ({ products, sellers, categories }) => {
  const { bulkImportProducts, showToast } = useShop();
  const [fileName, setFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [check, setCheck] = useState<TemplateCheck | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const ctx = useMemo(() => ({ products, sellers, categories }), [products, sellers, categories]);

  // Judge the file against the catalogue as it is now, and again whenever it
  // changes underneath (another admin, a realtime update).
  useEffect(() => {
    if (csvText && !running) setCheck(checkProductTemplate(csvText, ctx));
  }, [csvText, ctx]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadFile = async (file?: File) => {
    if (!file) return;
    setResult(null);
    if (!/\.csv$/i.test(file.name)) {
      showToast('Upload the template as a .csv file (in Excel: File > Save As > CSV UTF-8).', 'warning');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showToast('The file is larger than 5 MB. Split it into smaller files.', 'warning');
      return;
    }
    setFileName(file.name);
    setCsvText(await file.text());
  };

  const clear = () => {
    setFileName('');
    setCsvText('');
    setCheck(null);
  };

  const runImport = async () => {
    if (!check?.ready) return;
    setRunning(true);
    setProgress({ done: 0, total: check.counts.create + check.counts.update });
    try {
      const r = await bulkImportProducts(check, (done, total) => setProgress({ done, total }));
      setResult(r);
      clear();
      showToast(
        `Import finished: ${r.created} added, ${r.updated} updated${r.errors.length ? '. One row was refused; see below.' : '.'}`,
        r.errors.length ? 'warning' : 'success'
      );
    } catch (e: any) {
      showToast(e?.message || 'The import failed.', 'error');
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const toWrite = check ? check.counts.create + check.counts.update : 0;
  const rows = check?.rows ?? [];
  const problemsFirst = [...rows].sort((a, b) => Number(b.errors.length > 0) - Number(a.errors.length > 0));

  return (
    <div className="space-y-4" id="bulk-product-import">
      <section className="bg-white border border-slate-200 rounded-3xl p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-indigo-600" aria-hidden />
          <h3 className="font-black mr-auto">1. Download the template</h3>
          <button
            type="button"
            id="bulk-template-blank"
            onClick={() => saveFile(blankTemplateCsv(), 'yalla_products_template.csv')}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-black flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" aria-hidden /> Template for new products
          </button>
          <button
            type="button"
            id="bulk-template-catalog"
            onClick={() => saveFile(catalogTemplateCsv(ctx), `yalla_products_${today}.csv`)}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-black flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" aria-hidden /> Current catalog, to update ({products.length})
          </button>
          <button
            type="button"
            id="bulk-template-guide-toggle"
            aria-expanded={showGuide}
            onClick={() => setShowGuide(v => !v)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-black flex items-center gap-1.5"
          >
            <BookOpen className="w-4 h-4" aria-hidden /> {showGuide ? 'Hide' : 'Show'} column guide
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Fill the file in Excel or Google Sheets and save it as CSV (UTF-8). Keep the header row exactly as it is: a file with a
          missing, renamed or extra column is refused. Rows with an empty product_id add new products; rows with a product_id
          update that product with every value in the row. Up to {MAX_TEMPLATE_ROWS} rows per file.
        </p>

        {showGuide && (
          <div id="bulk-template-guide" className="space-y-3">
            <div className="overflow-x-auto border border-slate-100 rounded-2xl">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left">
                  <tr>{['Column', 'Required', 'What it takes', 'Example'].map(h => <th key={h} scope="col" className="p-2.5 font-black">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {PRODUCT_TEMPLATE_COLUMNS.map(column => {
                    const g = PRODUCT_TEMPLATE_GUIDE[column];
                    return (
                      <tr key={column} className="border-t border-slate-100 align-top">
                        <td className="p-2.5 font-mono font-bold">{column}</td>
                        <td className="p-2.5">{g.required === 'always' ? 'Yes' : g.required === 'to publish' ? 'To publish' : 'No'}</td>
                        <td className="p-2.5 text-slate-600">{g.rule}</td>
                        <td className="p-2.5 font-mono text-slate-500" dir="auto">{g.example || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <div className="border border-slate-100 rounded-2xl p-3">
                <p className="font-black mb-1.5">seller_code values</p>
                <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                  {sellers.filter(s => s.sellerCode).map(s => (
                    <li key={s.id}><span className="font-mono font-bold">{s.sellerCode}</span> · {s.nameEn}{s.isActive ? '' : ' (switched off: drafts only)'}</li>
                  ))}
                </ul>
              </div>
              <div className="border border-slate-100 rounded-2xl p-3">
                <p className="font-black mb-1.5">category values</p>
                <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                  {categories.map(c => <li key={c.id}>{c.nameEn}</li>)}
                </ul>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-3xl p-5 space-y-3">
        <h3 className="font-black">2. Upload the filled template</h3>
        <div
          role="button"
          tabIndex={0}
          id="bulk-template-drop"
          aria-label="Drop the filled template here, or press Enter to choose it"
          onClick={() => fileInput.current?.click()}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.current?.click(); } }}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); loadFile(e.dataTransfer.files?.[0]); }}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition ${dragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}
        >
          <Upload className="w-7 h-7 mx-auto text-indigo-500" aria-hidden />
          <p className="mt-2 text-sm font-black">{fileName || 'Drag & drop the template (.csv)'}</p>
          <p className="text-xs text-slate-500">or click to browse</p>
          <input
            ref={fileInput}
            id="bulk-template-file"
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={e => { loadFile(e.target.files?.[0]); e.currentTarget.value = ''; }}
          />
        </div>
      </section>

      {check && check.fileErrors.length > 0 && (
        <div role="alert" id="bulk-template-file-errors" className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-700">
          <p className="font-black flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" aria-hidden /> This file cannot be imported</p>
          <ul className="list-disc ml-5 mt-1 space-y-0.5">{check.fileErrors.map(e => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      {check && check.fileErrors.length === 0 && (
        <section className="bg-white border border-slate-200 rounded-3xl overflow-hidden" aria-labelledby="bulk-template-check-title">
          <div className="flex flex-wrap items-center gap-2 p-4 border-b border-slate-100">
            <h3 id="bulk-template-check-title" className="font-black mr-2">3. Check and import</h3>
            <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-black">{check.counts.create} new</span>
            <span className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 text-xs font-black">{check.counts.update} to update</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-black">{check.counts.unchanged} unchanged</span>
            {check.counts.invalid > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-xs font-black">{check.counts.invalid} with problems</span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={clear} disabled={running} className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-black disabled:opacity-50">
                Remove file
              </button>
              <button
                type="button"
                id="bulk-template-import"
                onClick={runImport}
                disabled={!check.ready || running}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {running && progress
                  ? `Importing ${progress.done} of ${progress.total}…`
                  : check.counts.invalid > 0
                    ? `Fix ${check.counts.invalid} row${check.counts.invalid > 1 ? 's' : ''} first`
                    : toWrite > 0 ? `Import ${toWrite} product${toWrite > 1 ? 's' : ''}` : 'Nothing to change'}
              </button>
            </div>
          </div>
          {check.counts.invalid > 0 && (
            <p id="bulk-template-blocked" className="px-4 pt-3 text-xs font-bold text-rose-700">
              Nothing is imported while any row has a problem. Fix the rows marked below in your file and upload it again.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left">
                <tr>{['Row', 'Action', 'Product', 'Details'].map(h => <th key={h} scope="col" className="p-3 font-black">{h}</th>)}</tr>
              </thead>
              <tbody>
                {problemsFirst.slice(0, SHOWN_ROWS).map(r => (
                  <tr key={r.row} data-row={r.row} className={`border-t border-slate-100 align-top ${r.errors.length ? 'bg-rose-50' : ''}`}>
                    <td className="p-3 font-mono">{r.row}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full font-black ${
                        r.errors.length ? 'bg-rose-100 text-rose-700'
                          : r.action === 'create' ? 'bg-indigo-50 text-indigo-700'
                          : r.action === 'update' ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {r.errors.length ? 'Problem' : r.action === 'create' ? 'New' : r.action === 'update' ? 'Update' : 'Unchanged'}
                      </span>
                    </td>
                    <td className="p-3" dir="auto">{r.name || '—'}</td>
                    <td className="p-3">
                      {r.errors.length > 0 ? (
                        <ul className="text-rose-700 font-bold space-y-0.5">{r.errors.map(e => <li key={e}>{e}</li>)}</ul>
                      ) : r.action === 'update' ? (
                        <span className="text-slate-600">Changes {r.changes.join(', ')}</span>
                      ) : r.action === 'create' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-black"><Check className="w-3.5 h-3.5" aria-hidden /> Ready</span>
                      ) : (
                        <span className="text-slate-500">Same as the catalog</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > SHOWN_ROWS && (
              <p className="p-3 text-xs text-slate-500">Showing {SHOWN_ROWS} of {rows.length} rows, problems first.</p>
            )}
          </div>
        </section>
      )}

      {result && (
        <div
          role={result.errors.length ? 'alert' : 'status'}
          id="bulk-template-result"
          className={`rounded-2xl p-4 text-sm border ${result.errors.length ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}
        >
          <p className="font-black">{result.created} added, {result.updated} updated.</p>
          {result.errors.length > 0 && <ul className="list-disc ml-5 mt-1">{result.errors.map(e => <li key={e}>{e}</li>)}</ul>}
        </div>
      )}
    </div>
  );
};
