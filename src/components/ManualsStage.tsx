import { useState, type FormEvent } from 'react';
import { BookOpen, CheckCircle2, Download, ExternalLink, Search } from 'lucide-react';
import type { DiscoveredManual } from '../types';

interface ManualsStageProps {
  detectedPart: string | null;
  manuals: DiscoveredManual[];
  loading: boolean;
  onSearchManuals: (partQuery: string) => void;
  onPreviewManual: (doc: DiscoveredManual) => void;
  onDownloadManual: (doc: DiscoveredManual, format?: 'pdf' | 'md') => void;
}

const QUICK_PARTS = [
  'DUALSENSE',
  'DUALSHOCK4',
  'XBOX-CTRL',
  'XBOX-360',
  'SWITCH-OLED',
  'NINTENDO-RETRO',
  'GALAXY-USBC',
  'IPHONE-USBC',
  'GAN-PD-100W',
  'DA9063',
  'DA9062',
  'DA9121',
];

export function ManualsStage({
  detectedPart,
  manuals,
  loading,
  onSearchManuals,
  onPreviewManual,
  onDownloadManual,
}: ManualsStageProps) {
  const [query, setQuery] = useState(detectedPart ?? '');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSearchManuals(query);
  };

  return (
    <section className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {detectedPart
              ? `Auto-filtered for detected ${detectedPart}`
              : 'Consumer Device, Gamepad & Dialog PMIC Library'}
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
            Service Manuals, Datasheets &amp; Pinouts
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
            Manuals are discovered and downloaded automatically when hardware connects. Search any phone, gamepad (PS3/PS4/PS5, Xbox, Switch, Retro, 8BitDo), USB-C dock, or Dialog PMIC part below to generate and download a multi-page PDF.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <label htmlFor="manual-search-input" className="sr-only">
              Search device, gamepad, or PMIC part number
            </label>
            <Search
              className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="manual-search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search device, gamepad, or IC (e.g. PS4, DualSense, Xbox 360, SNES, iPhone, DA9063)..."
              className="w-full min-h-[44px] pl-10 pr-4 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-2 focus:outline-blue-600"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="min-h-[44px] px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {loading ? 'Searching...' : 'Find Manuals'}
          </button>
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                onSearchManuals('');
              }}
              className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Show All
            </button>
          )}
        </form>

        {/* Quick part filter tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {QUICK_PARTS.map((part) => (
            <button
              key={part}
              type="button"
              onClick={() => {
                setQuery(part);
                onSearchManuals(part);
              }}
              className={`min-h-[36px] px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors ${
                query.toUpperCase() === part
                  ? 'bg-slate-900 dark:bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {part}
            </button>
          ))}
        </div>
      </div>

      {/* Results list */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Discovering manuals, service guides, and register maps...
          </div>
        ) : manuals.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">No manuals matched that query.</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Try a device or part name like DualSense, PS4, Xbox 360, Switch, iPhone, Galaxy, or DA9063.
            </p>
          </div>
        ) : (
          manuals.map((doc) => (
            <article key={doc.id} className="p-5 sm:p-6 space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{doc.partNumber}</span>
                    <span aria-hidden="true">·</span>
                    <span>{doc.docType}</span>
                    <span aria-hidden="true">·</span>
                    <span>{doc.revision}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{doc.pages} pages</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{(doc.fileSizeKb / 1024).toFixed(1)} MB</span>
                    {doc.autoDownloaded && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          Auto-Downloaded {doc.downloadedAt ?? ''}
                        </span>
                      </>
                    )}
                  </div>

                  <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">{doc.title}</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">{doc.summary}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onPreviewManual(doc)}
                    className="min-h-[44px] px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors inline-flex items-center gap-1.5"
                  >
                    <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Read Inline</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDownloadManual(doc, 'pdf')}
                    className="min-h-[44px] px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Download PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDownloadManual(doc, 'md')}
                    className="min-h-[44px] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    Markdown
                  </button>

                  <a
                    href={doc.officialUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="min-h-[44px] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors inline-flex items-center gap-1"
                  >
                    <span>Source</span>
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                </div>
              </div>

              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-slate-600 dark:text-slate-400 pt-1">
                {doc.highlights.map((h) => (
                  <li key={h} className="truncate">
                    • {h}
                  </li>
                ))}
              </ul>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
