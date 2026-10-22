'use client';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { api } from '../../../lib/api';
import { isAdmin } from '../../../lib/auth';
import { formatTimeAgo } from '../../../lib/helpers';
import {
  ServerStackIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
  ArrowPathIcon,
  CommandLineIcon,
  CpuChipIcon,
  GlobeAltIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ListBulletIcon,
  ArrowTopRightOnSquareIcon,
  PlayIcon,
  SignalIcon,
  ShieldCheckIcon,
  CircleStackIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

export default function NodesPage() {
  const [adminUser, setAdminUser] = useState(false);

  useEffect(() => {
    setAdminUser(isAdmin());
  }, []);

  // Fetch nodes
  const { data: nodesData, isLoading: loadingNodes, mutate: mutateNodes } = useSWR(
    'hosting-nodes',
    api.getHostingNodes,
    { refreshInterval: 15000 }
  );

  const nodes = nodesData?.nodes || [];

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState('single'); // 'single' | 'bulk'
  const [addingNode, setAddingNode] = useState(false);
  const [nodeForm, setNodeForm] = useState({
    connection_string: '',
    host: '',
    port: 22,
    username: 'root',
    password: '',
    private_key: '',
    name: ''
  });
  const [bulkText, setBulkText] = useState('');
  const [bulkProvisioning, setBulkProvisioning] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  // Ping state
  const [pingingId, setPingingId] = useState(null);

  // Exec / Terminal modal state
  const [selectedNode, setSelectedNode] = useState(null);
  const [showTerminal, setShowTerminal] = useState(false);
  const [execCommand, setExecCommand] = useState('uptime -p');
  const [executing, setExecuting] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState(null);

  // Selected node sites inspection
  const [inspectNode, setInspectNode] = useState(null);
  const [nodeDetails, setNodeDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Ping a single node
  async function handlePing(id) {
    setPingingId(id);
    try {
      const res = await api.pingHostingNode(id);
      if (res.success) {
        toast.success(`Node is online (${res.latencyMs || 0}ms latency)`);
      } else {
        toast.error(`Node ping failed: ${res.error || 'Connection error'}`);
      }
      mutateNodes();
    } catch (err) {
      toast.error(err.message || 'Ping request failed');
    } finally {
      setPingingId(null);
    }
  }

  // Open Terminal
  function handleOpenTerminal(node) {
    setSelectedNode(node);
    setShowTerminal(true);
    setExecCommand('uptime -p');
    setTerminalOutput(null);
  }

  // Run command in Terminal
  async function handleRunCommand(cmd) {
    const toRun = cmd || execCommand;
    if (!toRun || !toRun.trim()) return;
    setExecuting(true);
    try {
      const res = await api.execNodeCommand(selectedNode.id, toRun.trim());
      setTerminalOutput(res);
      if (res.code === 0) {
        toast.success('Command executed successfully');
      } else {
        toast.error(`Exit code: ${res.code}`);
      }
    } catch (err) {
      toast.error(err.message || 'Execution error');
      setTerminalOutput({
        code: 1,
        stdout: '',
        stderr: err.message,
        durationMs: 0
      });
    } finally {
      setExecuting(false);
    }
  }

  // Inspect hosted sites on node
  async function handleInspectSites(node) {
    setInspectNode(node);
    setLoadingDetails(true);
    try {
      const details = await api.getNodeWithSites(node.id);
      setNodeDetails(details);
    } catch (err) {
      toast.error(err.message || 'Could not fetch node sites');
    } finally {
      setLoadingDetails(false);
    }
  }

  // Add single node
  async function handleAddSingleNode(e) {
    e.preventDefault();
    setAddingNode(true);
    try {
      if (nodeForm.connection_string.trim()) {
        await api.addHostingNode({
          connection_string: nodeForm.connection_string.trim(),
          name: nodeForm.name.trim() || undefined
        });
      } else {
        if (!nodeForm.host.trim() || !nodeForm.username.trim()) {
          toast.error('Host and username are required');
          setAddingNode(false);
          return;
        }
        await api.addHostingNode({
          host: nodeForm.host.trim(),
          port: parseInt(nodeForm.port, 10) || 22,
          username: nodeForm.username.trim(),
          password: nodeForm.password || undefined,
          private_key: nodeForm.private_key || undefined,
          name: nodeForm.name.trim() || undefined
        });
      }

      toast.success('Node connected and provisioned successfully!');
      setShowAddModal(false);
      setNodeForm({ connection_string: '', host: '', port: 22, username: 'root', password: '', private_key: '', name: '' });
      mutateNodes();
    } catch (err) {
      toast.error(err.message || 'Failed to connect node');
    } finally {
      setAddingNode(false);
    }
  }

  // Bulk add nodes
  async function handleBulkProvision(e) {
    e.preventDefault();
    if (!bulkText.trim()) {
      toast.error('Please enter at least one SSH connection string');
      return;
    }
    setBulkProvisioning(true);
    setBulkResult(null);
    try {
      const res = await api.addHostingNodesBulk({ connection_strings: bulkText });
      setBulkResult(res);
      toast.success(`Provisioned ${res.successful} of ${res.total} nodes`);
      mutateNodes();
    } catch (err) {
      toast.error(err.message || 'Bulk provisioning failed');
    } finally {
      setBulkProvisioning(false);
    }
  }

  // Delete node
  async function handleDeleteNode(id, name) {
    if (!confirm(`Are you sure you want to delete server node "${name}"?`)) return;
    try {
      await api.deleteHostingNode(id);
      toast.success(`Node "${name}" deleted`);
      mutateNodes();
      if (inspectNode?.id === id) setInspectNode(null);
    } catch (err) {
      toast.error(err.message || 'Failed to delete node');
    }
  }

  // Aggregate cluster metrics
  const totalNodes = nodes.length;
  const onlineNodes = nodes.filter(n => n.status === 'online').length;
  const totalSites = nodes.reduce((acc, n) => acc + (n.current_sites || 0), 0);
  const totalCpus = nodes.reduce((acc, n) => acc + (n.system_info?.cpus || 1), 0);
  const totalRamGb = (nodes.reduce((acc, n) => acc + (n.system_info?.ramTotalMb || n.system_info?.ramMb || 512), 0) / 1024).toFixed(1);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Server Nodes & Infrastructure
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage your Linux VPS nodes, run remote diagnostics, and monitor real-time CPU, RAM, and storage utilization.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => mutateNodes()}
            className="btn-secondary py-2 px-3 text-xs shadow-sm"
            title="Refresh Nodes"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loadingNodes ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={() => { setAddMode('bulk'); setBulkResult(null); setShowAddModal(true); }}
            className="btn-secondary py-2 px-3.5 text-xs shadow-sm font-semibold"
          >
            <ListBulletIcon className="w-4 h-4 text-indigo-500" />
            <span>Bulk SSH Import</span>
          </button>
          <button
            onClick={() => { setAddMode('single'); setBulkResult(null); setShowAddModal(true); }}
            className="btn-primary py-2 px-4 text-xs shadow-sm font-semibold"
          >
            <PlusIcon className="w-4 h-4" />
            <span>Add Server Node</span>
          </button>
        </div>
      </div>

      {/* Cluster Stats Overview Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <ServerStackIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Cluster Nodes</div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">
              {totalNodes} <span className="text-xs font-normal text-slate-500">({onlineNodes} online)</span>
            </div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-900 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <GlobeAltIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Routed Sites</div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">{totalSites}</div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-100 dark:border-cyan-900 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
            <CpuChipIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Compute Capacity</div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">{totalCpus} vCPU</div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 border border-purple-100 dark:border-purple-900 flex items-center justify-center text-purple-600 dark:text-purple-400">
            <CircleStackIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total RAM</div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">{totalRamGb} GB</div>
          </div>
        </div>
      </div>

      {/* Nodes Grid */}
      {loadingNodes && nodes.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse space-y-4">
              <div className="h-6 bg-slate-200 dark:bg-cyber-800 rounded w-1/3" />
              <div className="h-4 bg-slate-200 dark:bg-cyber-800 rounded w-1/2" />
              <div className="grid grid-cols-3 gap-2">
                <div className="h-12 bg-slate-200 dark:bg-cyber-800 rounded" />
                <div className="h-12 bg-slate-200 dark:bg-cyber-800 rounded" />
                <div className="h-12 bg-slate-200 dark:bg-cyber-800 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : nodes.length === 0 ? (
        <div className="card p-10 text-center space-y-4 max-w-lg mx-auto">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 dark:bg-cyber-850 flex items-center justify-center text-3xl border border-indigo-100 dark:border-cyber-800">
            🖥️
          </div>
          <h3 className="font-bold text-base text-slate-900 dark:text-white">No Server Nodes Registered</h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Connect any Ubuntu or Debian Linux VPS over SSH. Commandor Dev Pack will automatically discover CPU, RAM, disk specs and configure edge proxy containers.
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              onClick={() => { setAddMode('single'); setShowAddModal(true); }}
              className="btn-primary py-2 px-4 text-xs font-semibold shadow-sm"
            >
              <PlusIcon className="w-4 h-4" />
              <span>Connect First Node</span>
            </button>
            <button
              onClick={() => { setAddMode('bulk'); setShowAddModal(true); }}
              className="btn-secondary py-2 px-3.5 text-xs font-semibold"
            >
              <span>Bulk Paste SSH</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {nodes.map((node) => {
            const isOnline = node.status === 'online';
            const sys = node.system_info || {};
            const ramTotal = sys.ramTotalMb || sys.ramMb || 512;
            const ramUsed = sys.ramUsedMb || 0;
            const ramPercent = Math.min(100, Math.round((ramUsed / ramTotal) * 100));
            const isPinging = pingingId === node.id;

            return (
              <div
                key={node.id}
                className="card p-5 space-y-4 hover:border-indigo-300 dark:hover:border-cyber-700 transition-all shadow-sm"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2.5 w-2.5">
                        {isOnline && (
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        )}
                        <span
                          className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                            isOnline ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                        />
                      </span>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                        {node.name}
                      </h3>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          isOnline
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                        }`}
                      >
                        {node.status}
                      </span>
                    </div>

                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2 truncate">
                      <span>{node.username}@{node.host}:{node.port}</span>
                      {sys.os && (
                        <>
                          <span>•</span>
                          <span className="text-[11px] text-slate-400">{sys.os}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handlePing(node.id)}
                      disabled={isPinging}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-cyber-800 transition-colors"
                      title="Ping & Test Connection"
                    >
                      <ArrowPathIcon className={`w-4 h-4 ${isPinging ? 'animate-spin text-indigo-500' : ''}`} />
                    </button>
                    <button
                      onClick={() => handleDeleteNode(node.id, node.name)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-cyber-800 transition-colors"
                      title="Delete Node"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Resource Gauges */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {/* CPU Box */}
                  <div className="p-2.5 bg-slate-50 dark:bg-cyber-850 rounded-xl border border-slate-200/70 dark:border-cyber-800">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold uppercase mb-1">
                      <span>CPU</span>
                      <CpuChipIcon className="w-3.5 h-3.5 text-indigo-500" />
                    </div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      {sys.cpus || 1} vCPU
                    </div>
                    <div className="text-[10px] text-slate-500 truncate mt-0.5">
                      Load: {sys.loadAvg || '0.00'}
                    </div>
                  </div>

                  {/* RAM Box */}
                  <div className="p-2.5 bg-slate-50 dark:bg-cyber-850 rounded-xl border border-slate-200/70 dark:border-cyber-800">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold uppercase mb-1">
                      <span>RAM</span>
                      <CircleStackIcon className="w-3.5 h-3.5 text-cyan-500" />
                    </div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      {ramTotal} MB
                    </div>
                    {ramUsed > 0 ? (
                      <div className="w-full bg-slate-200 dark:bg-cyber-700 h-1.5 rounded-full mt-1.5 overflow-hidden">
                        <div
                          className="bg-cyan-500 h-full rounded-full transition-all"
                          style={{ width: `${ramPercent}%` }}
                        />
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-500 truncate mt-0.5">
                        Free: {sys.ramFreeMb ? `${sys.ramFreeMb}MB` : 'Ready'}
                      </div>
                    )}
                  </div>

                  {/* Capacity / Disk Box */}
                  <div className="p-2.5 bg-slate-50 dark:bg-cyber-850 rounded-xl border border-slate-200/70 dark:border-cyber-800">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold uppercase mb-1">
                      <span>Sites</span>
                      <GlobeAltIcon className="w-3.5 h-3.5 text-emerald-500" />
                    </div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      {node.current_sites || 0} / {node.max_sites || 50}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate mt-0.5">
                      Disk: {sys.freeDisk || sys.diskFree || 'N/A'}
                    </div>
                  </div>
                </div>

                {/* Status Footer and Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-cyber-800 text-xs">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <ClockIcon className="w-3.5 h-3.5" />
                    <span>Pinged {node.last_ping_at ? formatTimeAgo(node.last_ping_at) : 'never'}</span>
                    {sys.latencyMs !== undefined && (
                      <span className="font-mono text-emerald-500 font-medium">({sys.latencyMs}ms)</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleInspectSites(node)}
                      className="btn-secondary py-1 px-2.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800"
                    >
                      <span>Sites ({node.current_sites || 0})</span>
                    </button>
                    <button
                      onClick={() => handleOpenTerminal(node)}
                      className="btn-secondary py-1 px-2.5 text-xs font-semibold flex items-center gap-1.5"
                    >
                      <CommandLineIcon className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Terminal</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Terminal / Exec Modal */}
      {showTerminal && selectedNode && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card max-w-2xl w-full p-5 sm:p-6 space-y-4 shadow-2xl border-indigo-200 dark:border-cyber-800 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-cyber-800 pb-3">
              <div className="flex items-center gap-2">
                <CommandLineIcon className="w-5 h-5 text-indigo-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Remote Diagnostics Terminal — {selectedNode.name}
                </h3>
              </div>
              <button
                onClick={() => setShowTerminal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Command Presets */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-400 uppercase">Quick Command Presets</div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'Uptime', cmd: 'uptime -p' },
                  { label: 'Memory', cmd: 'free -h' },
                  { label: 'Disk', cmd: 'df -h /' },
                  { label: 'Docker Ps', cmd: 'docker ps -a' },
                  { label: 'Ports', cmd: 'ss -tuln || netstat -tuln' },
                  { label: 'Top Procs', cmd: 'ps aux --sort=-%cpu | head -n 6' },
                  { label: 'Siteserver Log', cmd: 'tail -n 25 /var/log/siteserver.log 2>/dev/null || echo "No log"' }
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => {
                      setExecCommand(preset.cmd);
                      handleRunCommand(preset.cmd);
                    }}
                    className="px-2.5 py-1 bg-slate-100 dark:bg-cyber-850 hover:bg-indigo-50 dark:hover:bg-cyber-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-mono border border-slate-200/80 dark:border-cyber-700 transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Command Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRunCommand();
              }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <span className="absolute left-3 top-2.5 font-mono text-xs text-indigo-500 font-bold">$</span>
                <input
                  type="text"
                  value={execCommand}
                  onChange={(e) => setExecCommand(e.target.value)}
                  placeholder="e.g. uptime, docker ps, free -m, tail -n 20 /var/log/syslog"
                  className="input pl-8 font-mono text-xs w-full"
                />
              </div>
              <button
                type="submit"
                disabled={executing || !execCommand.trim()}
                className="btn-primary py-2 px-4 text-xs font-semibold flex items-center gap-1.5"
              >
                {executing ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <PlayIcon className="w-4 h-4" />
                )}
                <span>Run</span>
              </button>
            </form>

            {/* Monospace Output Screen */}
            <div className="bg-slate-950 text-slate-100 p-4 rounded-xl font-mono text-xs min-h-[160px] max-h-[320px] overflow-y-auto border border-slate-800 shadow-inner">
              {executing ? (
                <div className="flex items-center gap-2 text-indigo-400 animate-pulse">
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  <span>Executing remote command over SSH on {selectedNode.host}...</span>
                </div>
              ) : terminalOutput ? (
                <div className="space-y-2">
                  <div className="text-[11px] text-slate-500 flex items-center justify-between border-b border-slate-800 pb-1">
                    <span>Exit code: {terminalOutput.code}</span>
                    <span>Elapsed: {terminalOutput.durationMs}ms</span>
                  </div>
                  {terminalOutput.stdout && (
                    <pre className="whitespace-pre-wrap text-emerald-400 font-mono">
                      {terminalOutput.stdout}
                    </pre>
                  )}
                  {terminalOutput.stderr && (
                    <pre className="whitespace-pre-wrap text-rose-400 font-mono">
                      {terminalOutput.stderr}
                    </pre>
                  )}
                  {!terminalOutput.stdout && !terminalOutput.stderr && (
                    <div className="text-slate-500 italic">(No output returned)</div>
                  )}
                </div>
              ) : (
                <div className="text-slate-600 italic">
                  Select a preset above or type a command to execute on {selectedNode.name}.
                </div>
              )}
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={() => setShowTerminal(false)}
                className="btn-secondary py-1.5 px-4 text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inspect Hosted Sites Modal */}
      {inspectNode && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card max-w-2xl w-full p-5 sm:p-6 space-y-4 shadow-2xl border-indigo-200 dark:border-cyber-800 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-cyber-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <GlobeAltIcon className="w-5 h-5 text-indigo-500" />
                  Hosted Sites on {inspectNode.name}
                </h3>
                <p className="text-xs text-slate-500">{inspectNode.host}:{inspectNode.port}</p>
              </div>
              <button
                onClick={() => setInspectNode(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {loadingDetails ? (
              <div className="p-8 text-center">
                <ArrowPathIcon className="w-6 h-6 animate-spin text-indigo-500 mx-auto" />
                <p className="text-xs text-slate-500 mt-2">Loading hosted sites...</p>
              </div>
            ) : (nodeDetails?.sites || []).length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No sites or applications currently assigned to this node.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-cyber-800 max-h-80 overflow-y-auto">
                {(nodeDetails?.sites || []).map((s) => (
                  <div key={s.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <a
                        href={`http://${s.full_domain}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono font-bold text-indigo-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
                      >
                        {s.full_domain}
                        <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                      </a>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {s.files_count || 0} files • {(s.storage_used_bytes / 1024).toFixed(1)} KB • {s.visits_count || 0} visits
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        s.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectNode(null)}
                className="btn-secondary py-1.5 px-4 text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Bulk Node Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl border-indigo-200 dark:border-cyber-800 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-cyber-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {addMode === 'single' ? 'Register Linux Server Node' : 'Bulk Import SSH Nodes'}
                </h3>
                <p className="text-xs text-slate-500">
                  {addMode === 'single'
                    ? 'Connect a Linux VPS container to serve hosted websites.'
                    : 'Paste multiple SSH connection strings to provision all servers at once.'}
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Tabs */}
            <div className="flex rounded-xl bg-slate-100 dark:bg-cyber-850 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => { setAddMode('single'); setBulkResult(null); }}
                className={`flex-1 py-1.5 rounded-lg transition-all ${
                  addMode === 'single'
                    ? 'bg-white dark:bg-cyber-800 text-indigo-600 dark:text-cyan-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Single Node
              </button>
              <button
                type="button"
                onClick={() => { setAddMode('bulk'); setBulkResult(null); }}
                className={`flex-1 py-1.5 rounded-lg transition-all ${
                  addMode === 'bulk'
                    ? 'bg-white dark:bg-cyber-800 text-indigo-600 dark:text-cyan-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Bulk SSH Strings
              </button>
            </div>

            {addMode === 'single' ? (
              <form onSubmit={handleAddSingleNode} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Quick Connection String
                  </label>
                  <input
                    type="text"
                    placeholder="host:port:user:pass#NodeName or root:pass@host:port"
                    value={nodeForm.connection_string}
                    onChange={(e) => setNodeForm({ ...nodeForm, connection_string: e.target.value })}
                    className="input font-mono text-xs w-full"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Paste standard connection string, or leave empty to enter individual fields below.
                  </p>
                </div>

                {!nodeForm.connection_string && (
                  <div className="space-y-3 pt-1 border-t border-slate-100 dark:border-cyber-800">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Host / IP Address
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 192.168.1.100 or vps.domain.com"
                          value={nodeForm.host}
                          onChange={(e) => setNodeForm({ ...nodeForm, host: e.target.value })}
                          className="input font-mono text-xs w-full"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          SSH Port
                        </label>
                        <input
                          type="number"
                          value={nodeForm.port}
                          onChange={(e) => setNodeForm({ ...nodeForm, port: e.target.value })}
                          className="input font-mono text-xs w-full"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          SSH Username
                        </label>
                        <input
                          type="text"
                          value={nodeForm.username}
                          onChange={(e) => setNodeForm({ ...nodeForm, username: e.target.value })}
                          className="input font-mono text-xs w-full"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          SSH Password
                        </label>
                        <input
                          type="password"
                          placeholder="Password (or use Key)"
                          value={nodeForm.password}
                          onChange={(e) => setNodeForm({ ...nodeForm, password: e.target.value })}
                          className="input font-mono text-xs w-full"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Node Label (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. US-East-Production-1"
                        value={nodeForm.name}
                        onChange={(e) => setNodeForm({ ...nodeForm, name: e.target.value })}
                        className="input text-xs w-full"
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="btn-secondary py-1.5 px-3.5 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addingNode}
                    className="btn-primary py-1.5 px-4 text-xs font-semibold"
                  >
                    {addingNode ? 'Testing & Provisioning...' : 'Connect Node'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleBulkProvision} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Paste Multiple SSH Strings (One per line)
                  </label>
                  <textarea
                    rows={6}
                    placeholder={`192.168.1.10:22:root:SecretPassword#Node-Alpha\nnode2.mycloud.com:2222:ubuntu:Pass123#Node-Beta\nroot:pass@74.248.38.38:22#Node-Gamma`}
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    className="input font-mono text-xs w-full"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Accepts <code>host:port:user:pass#label</code> or <code>user:pass@host:port</code> formats.
                  </p>
                </div>

                {bulkResult && (
                  <div className="p-3 bg-slate-50 dark:bg-cyber-850 rounded-xl border border-slate-200 dark:border-cyber-800 space-y-2">
                    <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200">
                      <span>Provisioning Report</span>
                      <span className="text-emerald-500">
                        {bulkResult.successful} / {bulkResult.total} Success
                      </span>
                    </div>
                    <div className="max-h-36 overflow-y-auto space-y-1 font-mono text-[11px]">
                      {bulkResult.results.map((r, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center justify-between p-1.5 rounded ${
                            r.status === 'success'
                              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}
                        >
                          <span>{r.name || r.host || `Node #${idx + 1}`}</span>
                          <span>{r.status === 'success' ? 'Connected' : (r.error || 'Failed')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="btn-secondary py-1.5 px-3.5 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={bulkProvisioning}
                    className="btn-primary py-1.5 px-4 text-xs font-semibold"
                  >
                    {bulkProvisioning ? 'Provisioning Nodes...' : 'Start Bulk Import'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
