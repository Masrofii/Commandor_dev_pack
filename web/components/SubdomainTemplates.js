'use client';
import { useState } from 'react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import {
  Square3Stack3DIcon,
  RocketLaunchIcon,
  EyeIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  CommandLineIcon,
  DocumentTextIcon,
  GlobeAltIcon,
  SignalIcon,
  XMarkIcon,
  PlusIcon
} from '@heroicons/react/24/outline';

const CATEGORY_ICONS = {
  application: <CommandLineIcon className="w-5 h-5 text-indigo-500" />,
  api: <GlobeAltIcon className="w-5 h-5 text-emerald-500" />,
  documentation: <DocumentTextIcon className="w-5 h-5 text-cyan-500" />,
  static_site: <Square3Stack3DIcon className="w-5 h-5 text-amber-500" />,
  status_page: <SignalIcon className="w-5 h-5 text-purple-500" />
};

export default function SubdomainTemplates({ onSelectTemplateForLaunch }) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [previewModal, setPreviewModal] = useState(null);
  const [previewSubdomain, setPreviewSubdomain] = useState('demo-service');
  const [previewBaseDomain, setPreviewBaseDomain] = useState('commandor.my.id');
  const [previewData, setPreviewData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const { data: tplData, isLoading } = useSWR(
    ['service-templates', selectedCategory],
    () => api.getTemplates(selectedCategory === 'all' ? null : selectedCategory)
  );

  const templates = tplData?.templates || [];

  async function handleOpenPreview(template) {
    setPreviewModal(template);
    setPreviewSubdomain(template.template_key.replace(/[^a-z0-9]/g, '-'));
    setPreviewData(null);
    await runPreviewCheck(template, template.template_key.replace(/[^a-z0-9]/g, '-'), previewBaseDomain);
  }

  async function runPreviewCheck(template, sub, base) {
    if (!sub || !template) return;
    setLoadingPreview(true);
    try {
      const res = await api.previewTemplate({
        template_key: template.template_key,
        subdomain: sub,
        base_domain: base,
        target_port: template.default_port,
        enable_https: true
      });
      setPreviewData(res);
    } catch (err) {
      toast.error(err.message || 'Failed to preview template');
    } finally {
      setLoadingPreview(false);
    }
  }

  return (
    <div className="card p-5 sm:p-6 space-y-5 border-slate-200 dark:border-cyber-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-cyber-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-cyan-950/80 text-indigo-600 dark:text-cyan-400">
              <Square3Stack3DIcon className="w-5 h-5" />
            </span>
            <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
              Reusable Subdomain &amp; Service Templates
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Pre-configured, injection-safe routing blueprints for Applications, APIs, Documentation portals, Static sites, and Status pages.
          </p>
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap rounded-lg bg-slate-100 dark:bg-cyber-850 p-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-400">
          {[
            { id: 'all', label: 'All Templates' },
            { id: 'application', label: 'Applications' },
            { id: 'api', label: 'REST APIs' },
            { id: 'documentation', label: 'Docs' },
            { id: 'static_site', label: 'Static' },
            { id: 'status_page', label: 'Status' }
          ].map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                selectedCategory === c.id
                  ? 'bg-white dark:bg-cyber-750 text-indigo-600 dark:text-cyan-400 font-bold shadow-xs'
                  : 'hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Templates Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse space-y-3">
              <div className="h-5 bg-slate-200 dark:bg-cyber-800 rounded w-1/2" />
              <div className="h-12 bg-slate-200 dark:bg-cyber-800 rounded" />
            </div>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-400">
          No templates found in this category.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(t => (
            <div
              key={t.id}
              className="card p-5 flex flex-col justify-between space-y-4 hover:border-indigo-300 dark:hover:border-cyber-700 transition-colors"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {CATEGORY_ICONS[t.category] || <CommandLineIcon className="w-5 h-5 text-indigo-500" />}
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">{t.name}</h4>
                  </div>
                  <span className="badge-cyan text-[10px] uppercase font-mono font-bold">
                    {t.category.replace('_', ' ')}
                  </span>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                  {t.description}
                </p>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-cyber-850 border border-slate-200/60 dark:border-cyber-800 space-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Default Port:</span>
                    <strong className="text-indigo-600 dark:text-cyan-400">:{t.default_port}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Runtime:</span>
                    <span className="capitalize">{t.runtime}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Health Endpoint:</span>
                    <span className="truncate max-w-[140px]">{t.health_check_endpoint}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-cyber-800">
                <button
                  onClick={() => handleOpenPreview(t)}
                  className="btn-secondary py-1 px-3 text-xs flex-1 flex items-center justify-center gap-1"
                >
                  <EyeIcon className="w-3.5 h-3.5" />
                  <span>Preview Route</span>
                </button>

                {onSelectTemplateForLaunch && (
                  <button
                    onClick={() => onSelectTemplateForLaunch(t)}
                    className="btn-primary py-1 px-3 text-xs flex-1 flex items-center justify-center gap-1 font-semibold"
                  >
                    <RocketLaunchIcon className="w-3.5 h-3.5" />
                    <span>Launch</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {previewModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card max-w-2xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-cyber-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheckIcon className="w-5 h-5 text-indigo-600 dark:text-cyan-400" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Template Preview: {previewModal.name}
                </h3>
              </div>
              <button onClick={() => setPreviewModal(null)} className="text-slate-400 hover:text-slate-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto text-xs pr-1">
              {/* Hostname form */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Subdomain Prefix</label>
                  <input
                    type="text"
                    value={previewSubdomain}
                    onChange={(e) => {
                      setPreviewSubdomain(e.target.value);
                      runPreviewCheck(previewModal, e.target.value, previewBaseDomain);
                    }}
                    className="input-cyber w-full font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Root Domain</label>
                  <input
                    type="text"
                    value={previewBaseDomain}
                    onChange={(e) => {
                      setPreviewBaseDomain(e.target.value);
                      runPreviewCheck(previewModal, previewSubdomain, e.target.value);
                    }}
                    className="input-cyber w-full font-mono"
                  />
                </div>
              </div>

              {/* Safety & Conflict Verification Banner */}
              {previewData && (
                <div className="space-y-2">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-cyber-850 border border-slate-200 dark:border-cyber-800 flex items-start gap-2.5">
                    {previewData.hasConflict ? (
                      <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircleIcon className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">
                        {previewData.hasConflict ? 'Route Conflict Detected' : 'Pre-Flight Conflict Verification Passed'}
                      </div>
                      <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                        {previewData.hasConflict
                          ? previewData.conflicts.join(' ')
                          : 'No collisions with active proxy routes or DNS records.'}
                      </p>
                      <p className="text-emerald-600 dark:text-emerald-400 text-[11px] mt-1 font-semibold">
                        ✓ {previewData.preservedRecordsNotice}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold mb-1">Generated Nginx Virtual Host Configuration</label>
                    <pre className="p-4 bg-slate-950 text-slate-200 rounded-xl font-mono text-[11px] overflow-x-auto border border-slate-800 leading-relaxed">
                      {previewData.renderedConfig}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-cyber-800">
              <span className="text-[11px] text-slate-400">
                Syntax check: {previewData?.syntaxValid ? '✓ Valid' : 'Checking...'}
              </span>

              <div className="flex gap-2">
                <button onClick={() => setPreviewModal(null)} className="btn-secondary py-1.5 px-4 text-xs">
                  Close
                </button>
                {onSelectTemplateForLaunch && (
                  <button
                    onClick={() => {
                      onSelectTemplateForLaunch(previewModal);
                      setPreviewModal(null);
                    }}
                    className="btn-primary py-1.5 px-4 text-xs font-semibold"
                  >
                    Use in Launchpad
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
