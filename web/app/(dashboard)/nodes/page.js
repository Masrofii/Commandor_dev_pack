'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { api } from '../../../lib/api';
import { isAdmin } from '../../../lib/auth';
import { formatTimeAgo, formatMemoryMb } from '../../../lib/helpers';
import { useTranslation } from '../../../lib/i18n';
import PageHeader from '../../../components/PageHeader';
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
  ExclamationTriangleIcon,
  ListBulletIcon,
  ArrowTopRightOnSquareIcon,
  PlayIcon,
  SignalIcon,
  ShieldCheckIcon,
  CircleStackIcon,
  ClockIcon,
  PencilSquareIcon,
  WrenchScrewdriverIcon,
  MagnifyingGlassIcon,
  ClipboardDocumentIcon,
  TagIcon,
  KeyIcon,
  LockClosedIcon,
  DocumentTextIcon,
  FolderArrowDownIcon,
  BoltIcon,
  StopIcon
} from '@heroicons/react/24/outline';

export default function NodesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [adminUser, setAdminUser] = useState(false);

  useEffect(() => {
    if (!isAdmin()) {
      router.replace('/');
      return;
    }
    setAdminUser(true);
  }, [router]);

  // Fetch nodes
  const { data: nodesData, isLoading: loadingNodes, mutate: mutateNodes } = useSWR(
    adminUser ? 'hosting-nodes' : null,
    api.getHostingNodes,
    { refreshInterval: 15000 }
  );

  const nodes = nodesData?.nodes || [];

  // Filter & Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'online' | 'offline' | 'active' | 'inactive'
  const [groupFilter, setGroupFilter] = useState('all');

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState('single'); // 'single' | 'bulk'
  const [authMethod, setAuthMethod] = useState('password'); // 'password' | 'private_key'
  const [addingNode, setAddingNode] = useState(false);

  // Single Node Form
  const [nodeForm, setNodeForm] = useState({
    connection_string: '',
    host: '',
    port: 22,
    username: 'root',
    password: '',
    private_key: '',
    name: '',
    group_name: 'default',
    labels: '',
    notes: ''
  });

  // Test Connection State
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null); // { success, fingerprint, specs, latencyMs, error }

  // Bulk State
  const [bulkText, setBulkText] = useState('');
  const [validatingBulk, setValidatingBulk] = useState(false);
  const [bulkValidationResult, setBulkValidationResult] = useState(null);
  const [bulkProvisioning, setBulkProvisioning] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  // Ping state
  const [pingingId, setPingingId] = useState(null);

  // Provisioning state
  const [provisioningId, setProvisioningId] = useState(null);

  // Exec / Terminal modal state
  const [selectedNode, setSelectedNode] = useState(null);
  const [showTerminal, setShowTerminal] = useState(false);
  const [execCommand, setExecCommand] = useState('uptime -p');
  const [executing, setExecuting] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState(null);

  // Edit Node Modal state
  const [editingNode, setEditingNode] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', group_name: '', labels: '', notes: '', max_sites: 50 });
  const [savingEdit, setSavingEdit] = useState(false);

  // Selected node sites inspection
  const [inspectNode, setInspectNode] = useState(null);
  const [nodeDetails, setNodeDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // FTP Management Modal state
  const [selectedFtpNode, setSelectedFtpNode] = useState(null);
  const [showFtpModal, setShowFtpModal] = useState(false);
  const [ftpInfo, setFtpInfo] = useState(null);
  const [loadingFtpInfo, setLoadingFtpInfo] = useState(false);
  const [detectingFtp, setDetectingFtp] = useState(false);
  const [provisioningFtp, setProvisioningFtp] = useState(false);
  const [controllingFtp, setControllingFtp] = useState(false);
  const [testingFtp, setTestingFtp] = useState(false);
  const [ftpTestResult, setFtpTestResult] = useState(null);
  const [ftpTestForm, setFtpTestForm] = useState({ username: '', password: '', port: '' });
  const [showAddFtpUser, setShowAddFtpUser] = useState(false);
  const [newFtpUser, setNewFtpUser] = useState({ username: '', password: '', site_id: '', root_path: '/var/www/nodesites', permissions: 'rw' });
  const [savingFtpUser, setSavingFtpUser] = useState(false);
  const [bulkDetectingFtp, setBulkDetectingFtp] = useState(false);
  const [bulkAutoDetectFtp, setBulkAutoDetectFtp] = useState(true);
  const [bulkAutoProvisionFtp, setBulkAutoProvisionFtp] = useState(false);

  // Unique groups list
  const availableGroups = Array.from(new Set(nodes.map(n => n.group_name || 'default').filter(Boolean)));

  // Test Node Connection action
  async function handleTestConnection() {
    let payload = {};
    if (nodeForm.connection_string.trim()) {
      payload = { connection_string: nodeForm.connection_string.trim() };
    } else {
      if (!nodeForm.host.trim()) {
        toast.error('Hostname or IP is required for connection testing');
        return;
      }
      payload = {
        host: nodeForm.host.trim(),
        port: parseInt(nodeForm.port, 10) || 22,
        username: nodeForm.username.trim() || 'root',
        password: authMethod === 'password' ? nodeForm.password : undefined,
        private_key: authMethod === 'private_key' ? nodeForm.private_key : undefined
      };
    }

    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await api.testNodeConnection(payload);
      if (res.success) {
        setTestResult(res);
        toast.success(`SSH handshake verified! (${res.latencyMs || 0}ms latency)`);
      } else {
        setTestResult(res);
        toast.error(res.error || 'SSH connection test failed');
      }
    } catch (err) {
      setTestResult({
        success: false,
        error: err.message || 'Connection test timed out or failed'
      });
      toast.error(err.message || 'Connection failed');
    } finally {
      setTestingConnection(false);
    }
  }

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

  // Toggle active/inactive
  async function handleToggleActive(node) {
    const newStatus = !node.is_active;
    try {
      await api.toggleNodeStatus(node.id, newStatus);
      toast.success(`Node ${node.name} marked as ${newStatus ? 'Active' : 'Disabled'}`);
      mutateNodes();
    } catch (err) {
      toast.error(err.message || 'Failed to update node status');
    }
  }

  // Provision remote node services
  async function handleProvision(node) {
    if (!confirm(`Provision deployment tools and siteserver daemon on ${node.name} (${node.host})?`)) return;
    setProvisioningId(node.id);
    try {
      const res = await api.provisionNodeServices(node.id);
      if (res.success) {
        toast.success(res.message || 'Node provisioned successfully');
      } else {
        toast.error(res.error || 'Provisioning failed');
      }
      mutateNodes();
    } catch (err) {
      toast.error(err.message || 'Provisioning error');
    } finally {
      setProvisioningId(null);
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

  // Open Edit Node modal
  function handleOpenEdit(node) {
    setEditingNode(node);
    setEditForm({
      name: node.name || '',
      group_name: node.group_name || 'default',
      labels: Array.isArray(node.labels) ? node.labels.join(', ') : (node.labels || ''),
      notes: node.notes || '',
      max_sites: node.max_sites || 50
    });
  }

  // Open FTP Management Modal
  async function handleOpenFtpModal(node) {
    setSelectedFtpNode(node);
    setShowFtpModal(true);
    setFtpTestResult(null);
    setFtpTestForm({ username: '', password: '', port: String(node.ftp_port || 21) });
    setNewFtpUser({ username: '', password: '', site_id: '', root_path: '/var/www/nodesites', permissions: 'rw' });
    setLoadingFtpInfo(true);
    try {
      const data = await api.getNodeFtp(node.id);
      setFtpInfo(data);
    } catch (err) {
      toast.error(err.message || 'Failed to load FTP information');
    } finally {
      setLoadingFtpInfo(false);
    }
  }

  // Trigger FTP Auto-Detection on Node
  async function handleDetectFtp() {
    if (!selectedFtpNode) return;
    setDetectingFtp(true);
    try {
      const res = await api.detectNodeFtp(selectedFtpNode.id);
      if (res.detected) {
        toast.success(`FTP detected online on port ${res.port}! (${res.serverType || 'standard'})`);
      } else {
        toast.error(`No FTP server listening on ${selectedFtpNode.host}:${res.port} (status: ${res.status})`);
      }
      const refreshed = await api.getNodeFtp(selectedFtpNode.id);
      setFtpInfo(refreshed);
      setSelectedFtpNode(prev => ({
        ...prev,
        ftp_status: res.status,
        ftp_port: res.port,
        ftp_server_type: res.serverType,
        ftp_banner: res.banner
      }));
      mutateNodes();
    } catch (err) {
      toast.error(err.message || 'FTP detection probe failed');
    } finally {
      setDetectingFtp(false);
    }
  }

  // Provision FTP on Node
  async function handleProvisionFtp() {
    if (!selectedFtpNode) return;
    if (!confirm(`Provision and start FTP server on ${selectedFtpNode.name} (${selectedFtpNode.host})?`)) return;
    setProvisioningFtp(true);
    try {
      const res = await api.provisionNodeFtp(selectedFtpNode.id, {
        port: selectedFtpNode.ftp_port || 21
      });
      if (res.success) {
        toast.success(res.message || 'FTP service provisioned successfully');
      } else {
        toast.error(res.error || 'FTP provisioning failed');
      }
      const refreshed = await api.getNodeFtp(selectedFtpNode.id);
      setFtpInfo(refreshed);
      mutateNodes();
    } catch (err) {
      toast.error(err.message || 'FTP provisioning failed');
    } finally {
      setProvisioningFtp(false);
    }
  }

  // Control FTP Service (start, stop, restart)
  async function handleControlFtp(action) {
    if (!selectedFtpNode) return;
    setControllingFtp(true);
    try {
      const res = await api.controlNodeFtp(selectedFtpNode.id, action);
      toast.success(`FTP daemon ${action}ed successfully`);
      const refreshed = await api.getNodeFtp(selectedFtpNode.id);
      setFtpInfo(refreshed);
      mutateNodes();
    } catch (err) {
      toast.error(err.message || `Failed to ${action} FTP daemon`);
    } finally {
      setControllingFtp(false);
    }
  }

  // Test FTP Login Credentials
  async function handleTestFtpCredentials(e) {
    e.preventDefault();
    if (!selectedFtpNode) return;
    setTestingFtp(true);
    setFtpTestResult(null);
    try {
      const res = await api.testNodeFtp(selectedFtpNode.id, {
        username: ftpTestForm.username.trim(),
        password: ftpTestForm.password,
        port: parseInt(ftpTestForm.port, 10) || selectedFtpNode.ftp_port || 21
      });
      setFtpTestResult(res);
      if (res.success) {
        toast.success('FTP Authentication verified!');
      } else {
        toast.error(res.error || 'FTP Authentication failed');
      }
    } catch (err) {
      setFtpTestResult({ success: false, error: err.message });
      toast.error(err.message || 'Test request failed');
    } finally {
      setTestingFtp(false);
    }
  }

  // Create FTP User Account
  async function handleCreateFtpUser(e) {
    e.preventDefault();
    if (!selectedFtpNode) return;
    if (!newFtpUser.username.trim() || !newFtpUser.password) {
      toast.error('Username and password are required');
      return;
    }
    setSavingFtpUser(true);
    try {
      await api.createNodeFtpUser(selectedFtpNode.id, {
        username: newFtpUser.username.trim(),
        password: newFtpUser.password,
        root_path: newFtpUser.root_path.trim() || '/var/www/nodesites',
        permissions: newFtpUser.permissions
      });
      toast.success(`FTP user "${newFtpUser.username.trim()}" created!`);
      setShowAddFtpUser(false);
      setNewFtpUser({ username: '', password: '', site_id: '', root_path: '/var/www/nodesites', permissions: 'rw' });
      const refreshed = await api.getNodeFtp(selectedFtpNode.id);
      setFtpInfo(refreshed);
    } catch (err) {
      toast.error(err.message || 'Failed to create FTP user');
    } finally {
      setSavingFtpUser(false);
    }
  }

  // Delete FTP User Account
  async function handleDeleteFtpUser(userId, username) {
    if (!selectedFtpNode) return;
    if (!confirm(`Delete FTP user "${username}" from node "${selectedFtpNode.name}"?`)) return;
    try {
      await api.deleteNodeFtpUser(selectedFtpNode.id, userId);
      toast.success(`FTP user "${username}" removed`);
      const refreshed = await api.getNodeFtp(selectedFtpNode.id);
      setFtpInfo(refreshed);
    } catch (err) {
      toast.error(err.message || 'Failed to delete FTP user');
    }
  }

  // Bulk Auto-Detect FTP across all nodes
  async function handleBulkDetectFtp() {
    if (nodes.length === 0) return;
    setBulkDetectingFtp(true);
    try {
      const res = await api.bulkDetectFtp(nodes.map(n => n.id));
      const onlineCount = (res.results || []).filter(r => r.status === 'online').length;
      toast.success(`FTP Scan complete! ${onlineCount} of ${res.results.length} nodes have FTP online.`);
      mutateNodes();
    } catch (err) {
      toast.error(err.message || 'Bulk FTP scan failed');
    } finally {
      setBulkDetectingFtp(false);
    }
  }

  // Save Edit Node
  async function handleSaveEdit(e) {
    e.preventDefault();
    if (!editingNode) return;
    setSavingEdit(true);
    try {
      const labelsArray = editForm.labels
        ? editForm.labels.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      await api.updateHostingNode(editingNode.id, {
        name: editForm.name.trim() || editingNode.name,
        group_name: editForm.group_name.trim() || 'default',
        labels: labelsArray,
        notes: editForm.notes.trim() || undefined,
        max_sites: parseInt(editForm.max_sites, 10) || 50
      });
      toast.success('Node configuration updated');
      setEditingNode(null);
      mutateNodes();
    } catch (err) {
      toast.error(err.message || 'Failed to update node');
    } finally {
      setSavingEdit(false);
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
      let labelsArr = [];
      if (nodeForm.labels.trim()) {
        labelsArr = nodeForm.labels.split(',').map(s => s.trim()).filter(Boolean);
      }

      if (nodeForm.connection_string.trim()) {
        await api.addHostingNode({
          connection_string: nodeForm.connection_string.trim(),
          name: nodeForm.name.trim() || undefined,
          group_name: nodeForm.group_name.trim() || 'default',
          labels: labelsArr,
          notes: nodeForm.notes.trim() || undefined
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
          password: authMethod === 'password' && nodeForm.password ? nodeForm.password : undefined,
          private_key: authMethod === 'private_key' && nodeForm.private_key ? nodeForm.private_key : undefined,
          name: nodeForm.name.trim() || undefined,
          group_name: nodeForm.group_name.trim() || 'default',
          labels: labelsArr,
          notes: nodeForm.notes.trim() || undefined
        });
      }

      toast.success('Server node enrolled securely!');
      setShowAddModal(false);
      setTestResult(null);
      setNodeForm({
        connection_string: '',
        host: '',
        port: 22,
        username: 'root',
        password: '',
        private_key: '',
        name: '',
        group_name: 'default',
        labels: '',
        notes: ''
      });
      mutateNodes();
    } catch (err) {
      toast.error(err.message || 'Failed to connect node');
    } finally {
      setAddingNode(false);
    }
  }

  // Dry run validate bulk strings
  async function handleValidateBulk() {
    if (!bulkText.trim()) {
      toast.error('Please enter at least one connection string');
      return;
    }
    setValidatingBulk(true);
    setBulkValidationResult(null);
    try {
      const res = await api.validateBulkNodes({ connection_strings: bulkText });
      setBulkValidationResult(res);
      if (res.validCount > 0) {
        toast.success(`Validated ${res.validCount} valid node string(s)`);
      } else {
        toast.error('No valid connection strings found');
      }
    } catch (err) {
      toast.error(err.message || 'Validation failed');
    } finally {
      setValidatingBulk(false);
    }
  }

  // Bulk add nodes after validation
  async function handleBulkProvision(e) {
    if (e) e.preventDefault();
    if (!bulkText.trim()) {
      toast.error('Please enter at least one SSH connection string');
      return;
    }
    setBulkProvisioning(true);
    setBulkResult(null);
    try {
      const res = await api.addHostingNodesBulk({
        connection_strings: bulkText,
        detect_ftp: bulkAutoDetectFtp,
        auto_provision_ftp: bulkAutoProvisionFtp
      });
      setBulkResult(res);
      toast.success(`Enrolled ${res.successful} of ${res.total} nodes`);
      mutateNodes();
    } catch (err) {
      toast.error(err.message || 'Bulk enrollment failed');
    } finally {
      setBulkProvisioning(false);
    }
  }

  // Delete node with safety verification
  async function handleDeleteNode(node) {
    if (node.current_sites && node.current_sites > 0) {
      if (!confirm(`Warning: Node "${node.name}" currently has ${node.current_sites} active site(s) deployed. Deleting it may disrupt hosted routes. Are you sure you want to proceed?`)) {
        return;
      }
    } else {
      if (!confirm(`Are you sure you want to remove server node "${node.name}" (${node.host})?`)) return;
    }
    try {
      await api.deleteHostingNode(node.id);
      toast.success(`Node "${node.name}" removed from inventory`);
      mutateNodes();
      if (inspectNode?.id === node.id) setInspectNode(null);
    } catch (err) {
      toast.error(err.message || 'Failed to delete node');
    }
  }

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  };

  // Filtered nodes
  const filteredNodes = nodes.filter(n => {
    const matchesSearch = !searchQuery.trim() ||
      (n.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (n.host || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (n.username || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (n.group_name || '').toLowerCase().includes(searchQuery.toLowerCase());

    const isStaleNode = n.is_stale || (n.status === 'online' && (!n.last_ping_at || (Date.now() - new Date(n.last_ping_at.includes('T') ? n.last_ping_at : n.last_ping_at.replace(' ', 'T') + 'Z').getTime() > 15 * 60 * 1000)));
    const matchesStatus =
      statusFilter === 'all' ? true :
      statusFilter === 'online' ? (n.status === 'online' && !isStaleNode) :
      statusFilter === 'stale' ? (n.status === 'online' && isStaleNode) :
      statusFilter === 'offline' ? n.status !== 'online' :
      statusFilter === 'active' ? n.is_active !== 0 :
      statusFilter === 'inactive' ? n.is_active === 0 : true;

    const matchesGroup = groupFilter === 'all' ? true : (n.group_name || 'default') === groupFilter;

    return matchesSearch && matchesStatus && matchesGroup;
  });

  // Safe helper to extract CPU count
  const parseNodeCpus = (node) => {
    const c = parseInt(node.system_info?.cpus, 10);
    return Number.isFinite(c) && c > 0 ? c : 1;
  };

  // Safe helper to extract RAM in MB (handling 'N/A', strings, undefined, null)
  const parseNodeRamMb = (node) => {
    const sys = node.system_info;
    const raw = sys?.ramTotalMb !== undefined && sys?.ramTotalMb !== 'N/A'
      ? sys?.ramTotalMb
      : (sys?.ramMb !== 'N/A' ? sys?.ramMb : 0);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  // Aggregate cluster metrics
  const totalNodes = nodes.length;
  const onlineNodes = nodes.filter(n => n.status === 'online').length;
  const totalSites = nodes.reduce((acc, n) => acc + (n.current_sites || 0), 0);

  const totalCpus = nodes.reduce((acc, n) => acc + parseNodeCpus(n), 0);
  const onlineCpus = nodes.filter(n => n.status === 'online').reduce((acc, n) => acc + parseNodeCpus(n), 0);

  const totalRamMb = nodes.reduce((acc, n) => acc + parseNodeRamMb(n), 0);
  const onlineRamMb = nodes.filter(n => n.status === 'online').reduce((acc, n) => acc + parseNodeRamMb(n), 0);

  const formatClusterGb = (mb) => {
    const gb = mb / 1024;
    return gb >= 100 ? Math.round(gb).toLocaleString() : gb.toFixed(1);
  };

  const totalRamGbStr = formatClusterGb(totalRamMb);
  const onlineRamGbStr = formatClusterGb(onlineRamMb);

  return (
    <div className="page-container space-y-6 animate-fade-in">
      <PageHeader
        eyebrow={
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            {t('nodes.eyebrow', 'Operations')}
          </>
        }
        title={t('nodes.title', 'Nodes & Servers')}
        description={t('nodes.subtitle', 'Enterprise Linux cluster management with verified SSH host keys, AES-256 encrypted credentials, and live telemetry.')}
        actions={
          <>
            <button
              onClick={() => mutateNodes()}
              className="btn-secondary py-2 px-3 text-xs shadow-xs"
              title={t('common.refresh', 'Refresh Nodes')}
            >
              <ArrowPathIcon className={`w-4 h-4 ${loadingNodes ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{t('common.refresh', 'Refresh')}</span>
            </button>
            <button
              onClick={() => { setAddMode('bulk'); setBulkResult(null); setBulkValidationResult(null); setShowAddModal(true); }}
              className="btn-secondary py-2 px-3.5 text-xs shadow-xs font-semibold"
            >
              <ListBulletIcon className="w-4 h-4 text-brand-500" />
              <span>{t('nodes.bulk_import', 'Bulk Import')}</span>
            </button>
            <button
              onClick={handleBulkDetectFtp}
              disabled={bulkDetectingFtp || nodes.length === 0}
              className="btn-secondary py-2 px-3.5 text-xs shadow-xs font-semibold flex items-center gap-1.5"
              title="Auto-detect FTP status across all nodes"
            >
              <FolderArrowDownIcon className={`w-4 h-4 text-emerald-500 ${bulkDetectingFtp ? 'animate-bounce' : ''}`} />
              <span>{bulkDetectingFtp ? 'Scanning FTP...' : 'Scan Nodes FTP'}</span>
            </button>
            <button
              onClick={() => { setAddMode('single'); setTestResult(null); setShowAddModal(true); }}
              className="btn-primary py-2 px-3.5 text-xs shadow-xs font-semibold"
            >
              <PlusIcon className="w-4 h-4" />
              <span>{t('nodes.provision_btn', 'Add Node')}</span>
            </button>
          </>
        }
      />

      {/* Cluster Overview Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="card p-3.5 border-slate-200/80 dark:border-cyber-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>{t('nodes.total_nodes', 'Total Nodes')}</span>
            <ServerStackIcon className="w-4 h-4 text-brand-500" />
          </div>
          <div className="text-lg font-bold text-slate-900 dark:text-white">
            {onlineNodes} <span className="text-xs font-normal text-slate-400 dark:text-slate-500">/ {totalNodes}</span>
          </div>
          <div className="text-[11px] text-slate-500">{onlineNodes} {t('common.online', 'online in cluster')}</div>
        </div>

        <div className="card p-3.5 border-slate-200/80 dark:border-cyber-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>{t('nodes.availability', 'Availability')}</span>
            <SignalIcon className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
            {totalNodes > 0 ? Math.round((onlineNodes / totalNodes) * 100) : 100}%
          </div>
          <div className="text-[11px] text-slate-500">{onlineNodes} of {totalNodes} nodes online</div>
        </div>

        <div className="card p-3.5 border-slate-200/80 dark:border-cyber-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>{t('nodes.vcpu_cores', 'vCPU Cores')}</span>
            <CpuChipIcon className="w-4 h-4 text-brand-500" />
          </div>
          <div className="text-lg font-bold text-slate-900 dark:text-white">
            {onlineCpus} <span className="text-xs font-normal text-slate-400 dark:text-slate-500">/ {totalCpus} Cores</span>
          </div>
          <div className="text-[11px] text-slate-500">
            {totalCpus > 0 ? Math.round((onlineCpus / totalCpus) * 100) : 0}% available compute
          </div>
        </div>

        <div className="card p-3.5 border-slate-200/80 dark:border-cyber-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>{t('nodes.total_ram', 'Total RAM')}</span>
            <CircleStackIcon className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-lg font-bold text-slate-900 dark:text-white">
            {onlineRamGbStr} <span className="text-xs font-normal text-slate-400 dark:text-slate-500">/ {totalRamGbStr} GB</span>
          </div>
          <div className="text-[11px] text-slate-500">
            {totalRamMb > 0 ? Math.round((onlineRamMb / totalRamMb) * 100) : 0}% active memory pool
          </div>
        </div>

        <div className="card p-3.5 border-slate-200/80 dark:border-cyber-800 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>{t('nodes.hosted_sites', 'Hosted Sites')}</span>
            <GlobeAltIcon className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-lg font-bold text-slate-900 dark:text-white">{totalSites}</div>
          <div className="text-[11px] text-slate-500">{t('nodes.active_deployments', 'Active deployments')}</div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="card p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs border-slate-200 dark:border-cyber-800">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder={t('nodes.search_placeholder', 'Search nodes by name, IP address, user, or group...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-9 text-xs w-full"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input text-xs"
          >
            <option value="all">{t('nodes.status_all', 'All Statuses')}</option>
            <option value="online">{t('nodes.status_online', 'Online Only')}</option>
            <option value="stale">{t('nodes.status_stale', 'Stale Telemetry')}</option>
            <option value="offline">{t('nodes.status_offline', 'Offline Only')}</option>
            <option value="active">{t('nodes.status_active', 'Active Only')}</option>
            <option value="inactive">{t('nodes.status_inactive', 'Disabled Only')}</option>
          </select>

          {/* Group Filter */}
          {availableGroups.length > 1 && (
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="input text-xs"
            >
              <option value="all">{t('nodes.groups_all', 'All Groups')}</option>
              {availableGroups.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Nodes Grid */}
      {loadingNodes ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse space-y-4">
              <div className="h-4 bg-slate-200 dark:bg-cyber-800 rounded w-1/3" />
              <div className="h-8 bg-slate-200 dark:bg-cyber-800 rounded" />
              <div className="h-4 bg-slate-200 dark:bg-cyber-800 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : filteredNodes.length === 0 ? (
        <div className="card p-12 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-brand-50 dark:bg-cyber-850 flex items-center justify-center text-2xl border border-brand-100 dark:border-cyber-800">
            🖥️
          </div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">
            {searchQuery || statusFilter !== 'all' ? t('common.no_results', 'No matching nodes found') : t('nodes.empty_none', 'No server nodes connected')}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery || statusFilter !== 'all'
              ? t('common.try_adjusting_search', 'Try adjusting your search query or status filter.')
              : t('nodes.empty_desc_none', 'Add your first Linux server node via SSH to start hosting static sites, proxying microservices, and balancing cluster traffic.')}
          </p>
          {!searchQuery && statusFilter === 'all' && (
            <button
              onClick={() => { setAddMode('single'); setTestResult(null); setShowAddModal(true); }}
              className="btn-primary py-1.5 px-4 text-xs font-semibold"
            >
              {t('nodes.connect_first', 'Connect First Node')}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNodes.map((node) => {
            const isOnline = node.status === 'online';
            const isActive = node.is_active !== 0;
            const isStale = node.is_stale || (isOnline && (!node.last_ping_at || (Date.now() - new Date(node.last_ping_at.includes('T') ? node.last_ping_at : node.last_ping_at.replace(' ', 'T') + 'Z').getTime() > 15 * 60 * 1000)));
            const sys = node.system_info || {};
            const isSftpStorage = Boolean(sys.sftpOnly || node.sftp_only);
            const isFtpOnly = Boolean(sys.ftpOnly || node.ftp_only || node.auth_method === 'ftp');
            const ramTotal = parseNodeRamMb(node);
            const ramUsed = Number(sys.ramUsedMb) || 0;
            const ramPercent = ramTotal > 0 ? Math.min(100, Math.round((ramUsed / ramTotal) * 100)) : 0;
            const isPinging = pingingId === node.id;
            const isProvisioning = provisioningId === node.id;

            return (
              <div
                key={node.id}
                className={`card p-5 space-y-4 hover:border-brand-300 dark:hover:border-cyber-700 transition-all shadow-xs ${
                  !isActive ? 'opacity-70 border-dashed' : ''
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2.5 w-2.5">
                        {isOnline && isActive && !isStale && (
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        )}
                        <span
                          className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                            !isActive
                              ? 'bg-slate-400'
                              : !isOnline
                              ? 'bg-rose-500'
                              : isStale
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                        />
                      </span>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                        {node.name}
                      </h3>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          !isActive
                            ? 'bg-slate-100 text-slate-600 dark:bg-cyber-800 dark:text-slate-400'
                            : !isOnline
                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                            : isStale
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                        }`}
                      >
                        {!isActive ? 'Disabled' : !isOnline ? node.status : isStale ? 'Stale' : 'Online'}
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

                    {/* Group & Labels */}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {node.group_name && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-brand-50 dark:bg-brand-950/50 text-brand-700 dark:text-sky-400 border border-brand-100 dark:border-brand-900/60 font-semibold">
                          📁 {node.group_name}
                        </span>
                      )}
                      {Array.isArray(node.labels) && node.labels.map((lbl, idx) => (
                        <span key={idx} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-cyber-850 text-slate-600 dark:text-slate-300 font-mono">
                          #{lbl}
                        </span>
                      ))}

                      {/* Protocol Badge */}
                      {isSftpStorage ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 font-mono font-bold flex items-center gap-1">
                          🔒 SFTP Node
                        </span>
                      ) : isFtpOnly ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-mono font-bold flex items-center gap-1">
                          📁 FTP Node
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800 font-mono font-medium">
                          🖥️ SSH Node
                        </span>
                      )}

                      {/* FTP & SFTP Status Badges */}
                      {!isSftpStorage && (
                        node.ftp_status === 'online' ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-mono font-bold flex items-center gap-1">
                            <BoltIcon className="w-3 h-3 text-emerald-500" />
                            FTP: {node.ftp_port || 21}
                          </span>
                        ) : node.ftp_status === 'stopped' ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-mono font-medium flex items-center gap-1">
                            <StopIcon className="w-3 h-3 text-amber-500" />
                            FTP: Stopped
                          </span>
                        ) : (isFtpOnly || node.ftp_enabled) ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-cyber-850 text-slate-500 dark:text-slate-400 font-mono">
                            FTP: Offline
                          </span>
                        ) : null
                      )}
                      {!isFtpOnly && node.sftp_enabled !== false && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 font-mono">
                          SFTP: {node.port || 22}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Top Action Buttons */}
                  <div className="flex items-center gap-1">
                    {!isSftpStorage && !isFtpOnly && (
                      <button
                        onClick={() => handleProvision(node)}
                        disabled={isProvisioning}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-slate-100 dark:hover:bg-cyber-800 transition-colors"
                        title="Provision Node Daemon"
                      >
                        <WrenchScrewdriverIcon className={`w-4 h-4 ${isProvisioning ? 'animate-spin text-brand-500' : ''}`} />
                      </button>
                    )}
                    <button
                      onClick={() => handleToggleActive(node)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        isActive
                          ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950'
                          : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-cyber-800'
                      }`}
                      title={isActive ? 'Disable Node' : 'Enable Node'}
                    >
                      <SignalIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleOpenEdit(node)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-slate-100 dark:hover:bg-cyber-800 transition-colors"
                      title="Edit Node metadata"
                    >
                      <PencilSquareIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handlePing(node.id)}
                      disabled={isPinging}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-slate-100 dark:hover:bg-cyber-800 transition-colors"
                      title="Ping & Test Connection"
                    >
                      <ArrowPathIcon className={`w-4 h-4 ${isPinging ? 'animate-spin text-brand-500' : ''}`} />
                    </button>
                    <button
                      onClick={() => handleDeleteNode(node)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-cyber-800 transition-colors"
                      title="Delete Node"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Host Key Fingerprint Badge */}
                {node.host_key_fingerprint && (
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-cyber-900 border border-slate-200/60 dark:border-cyber-800 text-[11px] font-mono">
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 truncate">
                      <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="truncate" title={node.host_key_fingerprint}>
                        {node.host_key_fingerprint.substring(0, 24)}...
                      </span>
                    </div>
                    <button
                      onClick={() => copyToClipboard(node.host_key_fingerprint, 'Host key fingerprint')}
                      className="p-0.5 text-slate-400 hover:text-brand-500 shrink-0 ml-1"
                      title="Copy fingerprint"
                    >
                      <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Resource Gauges */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {/* CPU Box */}
                  <div className="p-2.5 bg-slate-50 dark:bg-cyber-850 rounded-xl border border-slate-200/70 dark:border-cyber-800">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold uppercase mb-1">
                      <span>CPU</span>
                      <CpuChipIcon className="w-3.5 h-3.5 text-brand-500" />
                    </div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      {isSftpStorage ? 'SFTP Only' : isFtpOnly ? 'FTP Only' : `${sys.cpus || 1} vCPU`}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate mt-0.5">
                      {isSftpStorage ? 'Storage Subsystem' : isFtpOnly ? 'File Storage' : `Load: ${sys.loadAvg || '0.00'}`}
                    </div>
                  </div>

                  {/* RAM Box */}
                  <div className="p-2.5 bg-slate-50 dark:bg-cyber-850 rounded-xl border border-slate-200/70 dark:border-cyber-800">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold uppercase mb-1">
                      <span>RAM</span>
                      <CircleStackIcon className="w-3.5 h-3.5 text-sky-500" />
                    </div>
                    <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between gap-1">
                      <span>{isSftpStorage ? 'Storage Node' : isFtpOnly ? 'FTP Daemon' : ramTotal > 0 ? formatMemoryMb(ramTotal) : 'N/A'}</span>
                      {sys.containerLimitMb && sys.containerLimitMb < ramTotal && (
                        <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-brand-50 dark:bg-brand-950/80 text-brand-700 dark:text-sky-400 border border-brand-200/50 dark:border-brand-800/50" title={`Container limit: ${formatMemoryMb(sys.containerLimitMb)}`}>
                          cgroup: {formatMemoryMb(sys.containerLimitMb)}
                        </span>
                      )}
                    </div>
                    {isSftpStorage ? (
                      <div className="text-[10px] text-purple-600 dark:text-purple-400 font-medium truncate mt-0.5">
                        SFTP Storage
                      </div>
                    ) : isFtpOnly ? (
                      <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium truncate mt-0.5">
                        Standard FTP
                      </div>
                    ) : ramUsed > 0 ? (
                      <div>
                        <div className="w-full bg-slate-200 dark:bg-cyber-700 h-1.5 rounded-full mt-1.5 overflow-hidden">
                          <div
                            className="bg-sky-500 h-full rounded-full transition-all"
                            style={{ width: `${ramPercent}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-slate-500 flex justify-between mt-1">
                          <span>{formatMemoryMb(ramUsed)} used</span>
                          <span>{formatMemoryMb(sys.ramAvailableMb || sys.ramFreeMb)} free</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-500 truncate mt-0.5">
                        {ramTotal > 0
                          ? (sys.ramAvailableMb || sys.ramFreeMb ? `Free: ${formatMemoryMb(sys.ramAvailableMb || sys.ramFreeMb)}` : 'Ready')
                          : 'Shared / Restricted'}
                      </div>
                    )}
                  </div>

                  {/* Capacity / Disk Box */}
                  <div
                    onClick={() => handleInspectSites(node)}
                    className="p-2.5 bg-slate-50 dark:bg-cyber-850 rounded-xl border border-slate-200/70 dark:border-cyber-800 hover:border-brand-400 dark:hover:border-cyber-600 cursor-pointer transition-all group/sites"
                    title="Click to view hosted sites"
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold uppercase mb-1">
                      <span className="group-hover/sites:text-brand-600 transition-colors">Sites</span>
                      <GlobeAltIcon className="w-3.5 h-3.5 text-emerald-500" />
                    </div>
                    <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between">
                      <span>{node.current_sites || 0} / {node.max_sites || 50}</span>
                      <span className="text-[10px] text-brand-600 dark:text-brand-400 opacity-0 group-hover/sites:opacity-100 transition-opacity font-normal">View →</span>
                    </div>
                    <div className="text-[10px] text-slate-500 truncate mt-0.5">
                      Disk: {sys.freeDisk || sys.diskFree || 'N/A'}
                    </div>
                  </div>
                </div>

                {/* Grounded Card Footer Bar */}
                <div className="-mx-5 -mb-5 mt-3 px-4 py-2.5 bg-cf-50/80 dark:bg-cyber-900 border-t border-cf-200 dark:border-cyber-800 rounded-b-xl flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 min-w-0">
                    <ClockIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">Pinged {node.last_ping_at ? formatTimeAgo(node.last_ping_at) : 'never'}</span>
                    {sys.latencyMs !== undefined && (
                      <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">
                        ({sys.latencyMs}ms)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isSftpStorage && !isFtpOnly && (
                      <button
                        onClick={() => handleOpenTerminal(node)}
                        className="btn-secondary py-1 px-2.5 text-xs font-semibold flex items-center gap-1.5 shadow-xs hover:border-brand-500 hover:text-brand-600 transition-all"
                        title="Open SSH Web Terminal"
                      >
                        <CommandLineIcon className="w-3.5 h-3.5 text-brand-500" />
                        <span>SSH Terminal</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenFtpModal(node)}
                      className="btn-secondary py-1 px-2.5 text-xs font-semibold flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 hover:border-emerald-500 hover:text-emerald-600 transition-all shadow-xs"
                      title="Manage Files, FTP & SFTP Users"
                    >
                      <FolderArrowDownIcon className="w-3.5 h-3.5" />
                      <span>{isSftpStorage ? 'SFTP Files' : isFtpOnly ? 'FTP Files' : 'Files & FTP'}</span>
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
          <div className="card max-w-2xl w-full p-5 sm:p-6 space-y-4 shadow-2xl border-brand-200 dark:border-cyber-800 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-cyber-800 pb-3">
              <div className="flex items-center gap-2">
                <CommandLineIcon className="w-5 h-5 text-brand-500" />
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
                    className="px-2.5 py-1 bg-slate-100 dark:bg-cyber-850 hover:bg-brand-50 dark:hover:bg-cyber-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-mono border border-slate-200/80 dark:border-cyber-700 transition-colors"
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
                <span className="absolute left-3 top-2.5 font-mono text-xs text-brand-500 font-bold">$</span>
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
                <div className="flex items-center gap-2 text-brand-400 animate-pulse">
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

      {/* Edit Node Modal */}
      {editingNode && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl border-brand-200 dark:border-cyber-800 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-cyber-800 pb-3">
              <div className="flex items-center gap-2">
                <PencilSquareIcon className="w-5 h-5 text-brand-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Edit Node — {editingNode.name}
                </h3>
              </div>
              <button
                onClick={() => setEditingNode(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="input text-xs w-full"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Group Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. production, edge"
                    value={editForm.group_name}
                    onChange={(e) => setEditForm({ ...editForm, group_name: e.target.value })}
                    className="input text-xs w-full"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Max Hosted Sites
                  </label>
                  <input
                    type="number"
                    value={editForm.max_sites}
                    onChange={(e) => setEditForm({ ...editForm, max_sites: e.target.value })}
                    className="input text-xs w-full"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Labels (Comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. us-east, high-ram, ingress"
                  value={editForm.labels}
                  onChange={(e) => setEditForm({ ...editForm, labels: e.target.value })}
                  className="input text-xs w-full"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional infrastructure notes, provider info, or maintenance log"
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="input text-xs w-full"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingNode(null)}
                  className="btn-secondary py-1.5 px-3.5 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="btn-primary py-1.5 px-4 text-xs font-semibold"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Hosted Sites Modal */}
      {inspectNode && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card max-w-2xl w-full p-5 sm:p-6 space-y-4 shadow-2xl border-brand-200 dark:border-cyber-800 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-cyber-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <GlobeAltIcon className="w-5 h-5 text-brand-500" />
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
                <ArrowPathIcon className="w-6 h-6 animate-spin text-brand-500 mx-auto" />
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
                        className="font-mono font-bold text-brand-600 dark:text-sky-400 hover:underline flex items-center gap-1"
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
          <div className="card max-w-xl w-full p-5 sm:p-6 space-y-4 shadow-2xl border-brand-200 dark:border-cyber-800 animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-cyber-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <ServerStackIcon className="w-5 h-5 text-brand-500" />
                  {addMode === 'single' ? 'Enroll Linux Server Node' : 'Bulk Import SSH Nodes'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {addMode === 'single'
                    ? 'Connect an enterprise Linux node with SSH host key verification.'
                    : 'Paste multiple SSH connection strings with dry-run validation.'}
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
                onClick={() => { setAddMode('single'); setTestResult(null); }}
                className={`flex-1 py-1.5 rounded-lg transition-all ${
                  addMode === 'single'
                    ? 'bg-white dark:bg-cyber-800 text-brand-600 dark:text-sky-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Single Node Enrollment
              </button>
              <button
                type="button"
                onClick={() => { setAddMode('bulk'); setBulkResult(null); setBulkValidationResult(null); }}
                className={`flex-1 py-1.5 rounded-lg transition-all ${
                  addMode === 'bulk'
                    ? 'bg-white dark:bg-cyber-800 text-brand-600 dark:text-sky-400 shadow-xs'
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
                    onChange={(e) => {
                      setNodeForm({ ...nodeForm, connection_string: e.target.value });
                      setTestResult(null);
                    }}
                    className="input font-mono text-xs w-full"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Format: <code>host:port:user:pass#Label</code> or <code>user:pass@host:port</code>
                  </p>
                </div>

                {!nodeForm.connection_string && (
                  <div className="space-y-3 pt-1 border-t border-slate-100 dark:border-cyber-800">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Hostname or Public IP
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 192.168.1.100 or node1.mydomain.com"
                          value={nodeForm.host}
                          onChange={(e) => {
                            setNodeForm({ ...nodeForm, host: e.target.value });
                            setTestResult(null);
                          }}
                          className="input font-mono text-xs w-full"
                          required={!nodeForm.connection_string}
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
                          required={!nodeForm.connection_string}
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Authentication Method
                        </label>
                        <div className="flex rounded-lg bg-slate-100 dark:bg-cyber-850 p-0.5 text-xs">
                          <button
                            type="button"
                            onClick={() => setAuthMethod('password')}
                            className={`flex-1 py-1 rounded text-[11px] font-semibold transition-all ${
                              authMethod === 'password'
                                ? 'bg-white dark:bg-cyber-800 text-brand-600 dark:text-sky-400 shadow-xs'
                                : 'text-slate-500'
                            }`}
                          >
                            Password
                          </button>
                          <button
                            type="button"
                            onClick={() => setAuthMethod('private_key')}
                            className={`flex-1 py-1 rounded text-[11px] font-semibold transition-all ${
                              authMethod === 'private_key'
                                ? 'bg-white dark:bg-cyber-800 text-brand-600 dark:text-sky-400 shadow-xs'
                                : 'text-slate-500'
                            }`}
                          >
                            Private Key
                          </button>
                        </div>
                      </div>
                    </div>

                    {authMethod === 'password' ? (
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          SSH Password
                        </label>
                        <input
                          type="password"
                          placeholder="Node root / sudo password (encrypted with AES-256-GCM)"
                          value={nodeForm.password}
                          onChange={(e) => {
                            setNodeForm({ ...nodeForm, password: e.target.value });
                            setTestResult(null);
                          }}
                          className="input font-mono text-xs w-full"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          OpenSSH Private Key (RSA or Ed25519)
                        </label>
                        <textarea
                          rows={3}
                          placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                          value={nodeForm.private_key}
                          onChange={(e) => {
                            setNodeForm({ ...nodeForm, private_key: e.target.value });
                            setTestResult(null);
                          }}
                          className="input font-mono text-[11px] w-full"
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Node Label / Name
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. US-East-Production-1"
                          value={nodeForm.name}
                          onChange={(e) => setNodeForm({ ...nodeForm, name: e.target.value })}
                          className="input text-xs w-full"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Group
                        </label>
                        <input
                          type="text"
                          placeholder="default, edge, staging"
                          value={nodeForm.group_name}
                          onChange={(e) => setNodeForm({ ...nodeForm, group_name: e.target.value })}
                          className="input text-xs w-full"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Labels (Comma-separated)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. nvme, 10gbps, docker"
                          value={nodeForm.labels}
                          onChange={(e) => setNodeForm({ ...nodeForm, labels: e.target.value })}
                          className="input text-xs w-full"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Notes (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="Provider, datacenter location"
                          value={nodeForm.notes}
                          onChange={(e) => setNodeForm({ ...nodeForm, notes: e.target.value })}
                          className="input text-xs w-full"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Connection Test Action & Preview */}
                <div className="p-3 bg-slate-50 dark:bg-cyber-850 rounded-xl border border-slate-200 dark:border-cyber-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">
                        Verify SSH Host Key &amp; Specs
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Performs non-destructive SSH handshake without modifying remote server
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={testingConnection || (!nodeForm.connection_string && !nodeForm.host)}
                      className="btn-secondary py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5"
                    >
                      <ArrowPathIcon className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin text-brand-500' : ''}`} />
                      <span>{testingConnection ? 'Testing...' : 'Test Connection'}</span>
                    </button>
                  </div>

                  {/* Test Result Display */}
                  {testResult && (
                    <div className="pt-2 border-t border-slate-200 dark:border-cyber-700">
                      {testResult.success ? (
                        <div className="space-y-2 text-[11px]">
                          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                            <CheckCircleIcon className="w-4 h-4" />
                            <span>Connection succeeded ({testResult.latencyMs || 0}ms latency)</span>
                          </div>
                          {testResult.host_key_fingerprint && (
                            <div className="p-2 rounded bg-white dark:bg-cyber-950 font-mono text-[10px] break-all border border-emerald-100 dark:border-emerald-950/60 text-slate-700 dark:text-slate-300">
                              <span className="text-slate-400 block font-sans text-[10px]">Verified Host Key Fingerprint:</span>
                              {testResult.host_key_fingerprint}
                            </div>
                          )}
                          {testResult.specs && (
                            <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px]">
                              <div className="p-1.5 rounded bg-white dark:bg-cyber-950 border border-slate-200/60 dark:border-cyber-800">
                                <span className="text-slate-400 block">OS:</span>
                                <span className="font-bold text-slate-800 dark:text-slate-200 truncate block">{testResult.specs.os || 'Linux'}</span>
                              </div>
                              <div className="p-1.5 rounded bg-white dark:bg-cyber-950 border border-slate-200/60 dark:border-cyber-800">
                                <span className="text-slate-400 block">CPUs:</span>
                                <span className="font-bold text-slate-800 dark:text-slate-200">{testResult.specs.cpus || 1} vCPU</span>
                              </div>
                              <div className="p-1.5 rounded bg-white dark:bg-cyber-950 border border-slate-200/60 dark:border-cyber-800">
                                <span className="text-slate-400 block">RAM:</span>
                                <span className="font-bold text-slate-800 dark:text-slate-200">
                                  {testResult.specs.sftpOnly ? 'Storage' : formatMemoryMb(testResult.specs.ramTotalMb || (testResult.specs.ramMb !== 'N/A' ? testResult.specs.ramMb : 0))}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300 space-y-1">
                          <div className="flex items-center gap-1.5 font-bold">
                            <ExclamationTriangleIcon className="w-4 h-4 text-rose-500 shrink-0" />
                            <span>Connection Test Failed</span>
                          </div>
                          <p className="font-mono text-[11px]">{testResult.error || 'Connection failed'}</p>
                          <p className="text-[10px] text-rose-600 dark:text-rose-400">
                            Troubleshooting: Verify port 22 is open in your cloud firewall, check that password/key is correct, and verify sshd permits root or sudo login.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

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
                    {addingNode ? 'Enrolling Node...' : 'Enroll & Save Node'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Paste Multiple SSH Strings (One per line)
                  </label>
                  <textarea
                    rows={6}
                    placeholder={`192.168.1.10:22:root:SecretPassword#Node-Alpha\nnode2.mycloud.com:2222:ubuntu:Pass123#Node-Beta\nroot:pass@203.0.113.10:22#Node-Gamma`}
                    value={bulkText}
                    onChange={(e) => {
                      setBulkText(e.target.value);
                      setBulkValidationResult(null);
                      setBulkResult(null);
                    }}
                    className="input font-mono text-xs w-full"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Accepts <code>host:port:user:pass#label</code>, <code>user:pass@host:port</code>, or <code>ftp://user:pass@host:21</code> formats.
                  </p>
                </div>

                {/* FTP Bulk Auto-Detect & Provision Toggles */}
                <div className="flex flex-col sm:flex-row gap-3 p-3 bg-slate-50 dark:bg-cyber-900 rounded-lg border border-slate-200 dark:border-cyber-800">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={bulkAutoDetectFtp}
                      onChange={(e) => setBulkAutoDetectFtp(e.target.checked)}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span>🔍 Auto-detect FTP service on nodes</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={bulkAutoProvisionFtp}
                      onChange={(e) => setBulkAutoProvisionFtp(e.target.checked)}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span>⚡ Auto-provision FTP server if missing</span>
                  </label>
                </div>

                {/* Dry Run Validation Result */}
                {bulkValidationResult && (
                  <div className="p-3 bg-slate-50 dark:bg-cyber-850 rounded-xl border border-slate-200 dark:border-cyber-800 space-y-2">
                    <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200 text-xs">
                      <span>Dry-Run Validation Summary</span>
                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        <span className="text-emerald-500 font-bold">{bulkValidationResult.validCount} Valid</span>
                        {bulkValidationResult.duplicateCount > 0 && (
                          <span className="text-amber-500">{bulkValidationResult.duplicateCount} Duplicates</span>
                        )}
                        {bulkValidationResult.invalidCount > 0 && (
                          <span className="text-rose-500">{bulkValidationResult.invalidCount} Invalid</span>
                        )}
                      </div>
                    </div>

                    <div className="max-h-36 overflow-y-auto space-y-1 font-mono text-[11px]">
                      {bulkValidationResult.nodes.map((n, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center justify-between p-1.5 rounded ${
                            n.valid
                              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}
                        >
                          <span>{n.name || `${n.username}@${n.host}:${n.port}`}</span>
                          <span>{n.valid ? 'Ready for import' : (n.error || 'Syntax error')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Execution Result */}
                {bulkResult && (
                  <div className="p-3 bg-slate-50 dark:bg-cyber-850 rounded-xl border border-slate-200 dark:border-cyber-800 space-y-2">
                    <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200">
                      <span>Enrollment Outcome</span>
                      <span className="text-emerald-500 font-mono">
                        {bulkResult.successful} / {bulkResult.total} Enrolled
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
                          <div className="flex items-center gap-2">
                            <span>{r.name || r.host || `Node #${idx + 1}`}</span>
                            {r.ftp && (
                              <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                                r.ftp.detected ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : 'bg-slate-200 text-slate-700 dark:bg-cyber-800 dark:text-slate-300'
                              }`}>
                                {r.ftp.detected ? `FTP :${r.ftp.port} Online` : 'FTP Not Running'}
                              </span>
                            )}
                          </div>
                          <span>{r.status === 'success' ? 'Enrolled' : (r.error || 'Failed')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center pt-2">
                  <button
                    type="button"
                    onClick={handleValidateBulk}
                    disabled={validatingBulk || !bulkText.trim()}
                    className="btn-secondary py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <ShieldCheckIcon className={`w-3.5 h-3.5 ${validatingBulk ? 'animate-spin' : ''}`} />
                    <span>{validatingBulk ? 'Validating...' : 'Dry-Run Validate'}</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="btn-secondary py-1.5 px-3.5 text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkProvision}
                      disabled={bulkProvisioning || !bulkText.trim()}
                      className="btn-primary py-1.5 px-4 text-xs font-semibold"
                    >
                      {bulkProvisioning ? 'Enrolling Nodes...' : 'Enroll Valid Nodes'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* FTP Management Modal */}
      {showFtpModal && selectedFtpNode && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="card max-w-3xl w-full p-5 sm:p-6 space-y-5 shadow-2xl border-emerald-200 dark:border-cyber-800 animate-scale-in my-8 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-cyber-800 pb-3">
              <div className="flex items-center gap-2">
                <FolderArrowDownIcon className="w-6 h-6 text-emerald-500" />
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                    FTP & SFTP Management — {selectedFtpNode.name}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    {selectedFtpNode.host} • SSH Port: {selectedFtpNode.port}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setShowFtpModal(false); setSelectedFtpNode(null); }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* FTP Status Overview Card */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-50 dark:bg-cyber-900 rounded-xl border border-slate-200 dark:border-cyber-800">
                <div className="text-[11px] text-slate-400 uppercase font-semibold">FTP Status</div>
                <div className="flex items-center gap-1.5 mt-1 font-bold">
                  {selectedFtpNode.ftp_status === 'online' ? (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-emerald-500 text-sm">Online</span>
                    </>
                  ) : selectedFtpNode.ftp_status === 'stopped' ? (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <span className="text-amber-500 text-sm">Stopped</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                      <span className="text-slate-400 text-sm">Not Installed</span>
                    </>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 mt-1 truncate">
                  Type: {selectedFtpNode.ftp_server_type || 'None'}
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-cyber-900 rounded-xl border border-slate-200 dark:border-cyber-800">
                <div className="text-[11px] text-slate-400 uppercase font-semibold">FTP Port</div>
                <div className="text-sm font-mono font-bold text-slate-800 dark:text-slate-200 mt-1">
                  {selectedFtpNode.ftp_port || 21}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Passive: {selectedFtpNode.ftp_pasv_min || 30000}-{selectedFtpNode.ftp_pasv_max || 30100}
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-cyber-900 rounded-xl border border-slate-200 dark:border-cyber-800">
                <div className="text-[11px] text-slate-400 uppercase font-semibold">SFTP (SSH)</div>
                <div className="text-sm font-mono font-bold text-sky-600 dark:text-sky-400 mt-1">
                  Port {selectedFtpNode.port || 22}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {selectedFtpNode.sftp_enabled !== false ? 'Enabled via SSH' : 'Disabled'}
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-cyber-900 rounded-xl border border-slate-200 dark:border-cyber-800">
                <div className="text-[11px] text-slate-400 uppercase font-semibold">FTP Accounts</div>
                <div className="text-sm font-mono font-bold text-slate-800 dark:text-slate-200 mt-1">
                  {(ftpInfo?.users || []).length} Active
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Root: /var/www/nodesites
                </div>
              </div>
            </div>

            {/* Service Action Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 dark:bg-cyber-900 rounded-xl border border-slate-200 dark:border-cyber-800">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDetectFtp}
                  disabled={detectingFtp}
                  className="btn-secondary py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5"
                  title="Detect FTP service & port on remote node"
                >
                  <ArrowPathIcon className={`w-3.5 h-3.5 text-brand-500 ${detectingFtp ? 'animate-spin' : ''}`} />
                  <span>{detectingFtp ? 'Probing...' : 'Auto-Detect FTP'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleProvisionFtp}
                  disabled={provisioningFtp}
                  className="btn-secondary py-1.5 px-3 text-xs font-semibold flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"
                  title="Install vsftpd / Python daemon on node"
                >
                  <WrenchScrewdriverIcon className={`w-3.5 h-3.5 ${provisioningFtp ? 'animate-spin' : ''}`} />
                  <span>{provisioningFtp ? 'Provisioning...' : 'Install / Provision FTP'}</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleControlFtp('start')}
                  disabled={controllingFtp}
                  className="btn-secondary py-1.5 px-2.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                >
                  <PlayIcon className="w-3.5 h-3.5" />
                  <span>Start</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleControlFtp('stop')}
                  disabled={controllingFtp}
                  className="btn-secondary py-1.5 px-2.5 text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1"
                >
                  <StopIcon className="w-3.5 h-3.5" />
                  <span>Stop</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleControlFtp('restart')}
                  disabled={controllingFtp}
                  className="btn-secondary py-1.5 px-2.5 text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
                >
                  <ArrowPathIcon className="w-3.5 h-3.5" />
                  <span>Restart</span>
                </button>
              </div>
            </div>

            {/* Quick Connect & Client Guide */}
            <div className="p-3.5 bg-slate-50 dark:bg-cyber-900 rounded-xl border border-slate-200 dark:border-cyber-800 space-y-2 text-xs">
              <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200">
                <span className="flex items-center gap-1.5">
                  <KeyIcon className="w-4 h-4 text-emerald-500" />
                  Quick Connect (FileZilla, Cyberduck, WinSCP)
                </span>
                <button
                  onClick={() => copyToClipboard(`ftp://${selectedFtpNode.host}:${selectedFtpNode.ftp_port || 21}/`, 'FTP Connection URL')}
                  className="btn-secondary py-1 px-2 text-[11px] font-mono flex items-center gap-1"
                >
                  <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                  <span>Copy FTP URL</span>
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                <div className="p-2 bg-white dark:bg-cyber-850 rounded border border-slate-200 dark:border-cyber-800">
                  <span className="text-slate-400 block text-[10px]">HOST / SERVER</span>
                  <span className="font-bold truncate select-all">{selectedFtpNode.host}</span>
                </div>
                <div className="p-2 bg-white dark:bg-cyber-850 rounded border border-slate-200 dark:border-cyber-800">
                  <span className="text-slate-400 block text-[10px]">PORT</span>
                  <span className="font-bold select-all">{selectedFtpNode.ftp_port || 21} (FTP) / {selectedFtpNode.port || 22} (SFTP)</span>
                </div>
                <div className="p-2 bg-white dark:bg-cyber-850 rounded border border-slate-200 dark:border-cyber-800">
                  <span className="text-slate-400 block text-[10px]">PROTOCOL</span>
                  <span className="font-bold select-all">{selectedFtpNode.ftp_status === 'online' ? 'FTP (or SFTP)' : 'SFTP'}</span>
                </div>
                <div className="p-2 bg-white dark:bg-cyber-850 rounded border border-slate-200 dark:border-cyber-800">
                  <span className="text-slate-400 block text-[10px]">ROOT DIRECTORY</span>
                  <span className="font-bold select-all">/var/www/nodesites</span>
                </div>
              </div>
            </div>

            {/* Test FTP Login Tool */}
            <div className="p-3.5 bg-slate-50 dark:bg-cyber-900 rounded-xl border border-slate-200 dark:border-cyber-800 space-y-2 text-xs">
              <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <ShieldCheckIcon className="w-4 h-4 text-brand-500" />
                <span>Test FTP Authentication</span>
              </div>
              <form onSubmit={handleTestFtpCredentials} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <input
                  type="text"
                  placeholder="Username"
                  value={ftpTestForm.username}
                  onChange={(e) => setFtpTestForm({ ...ftpTestForm, username: e.target.value })}
                  className="input text-xs"
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={ftpTestForm.password}
                  onChange={(e) => setFtpTestForm({ ...ftpTestForm, password: e.target.value })}
                  className="input text-xs"
                />
                <input
                  type="number"
                  placeholder={`Port (${selectedFtpNode.ftp_port || 21})`}
                  value={ftpTestForm.port}
                  onChange={(e) => setFtpTestForm({ ...ftpTestForm, port: e.target.value })}
                  className="input text-xs"
                />
                <button
                  type="submit"
                  disabled={testingFtp}
                  className="btn-primary py-1.5 px-3 text-xs font-semibold"
                >
                  {testingFtp ? 'Testing...' : 'Test Login'}
                </button>
              </form>
              {ftpTestResult && (
                <div className={`p-2 rounded font-mono text-[11px] ${
                  ftpTestResult.success ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                }`}>
                  {ftpTestResult.success ? `✅ ${ftpTestResult.message || 'FTP login successful'} (${ftpTestResult.banner || ''})` : `❌ ${ftpTestResult.error || 'Login failed'}`}
                </div>
              )}
            </div>

            {/* FTP Accounts List */}
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <DocumentTextIcon className="w-4 h-4 text-emerald-500" />
                  FTP Accounts ({(ftpInfo?.users || []).length})
                </h4>
                <button
                  type="button"
                  onClick={() => setShowAddFtpUser(!showAddFtpUser)}
                  className="btn-secondary py-1 px-2.5 text-xs font-semibold flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  <span>{showAddFtpUser ? 'Hide Form' : 'Create FTP User'}</span>
                </button>
              </div>

              {/* Add FTP User Form */}
              {showAddFtpUser && (
                <form onSubmit={handleCreateFtpUser} className="p-3.5 bg-slate-50 dark:bg-cyber-900 rounded-xl border border-emerald-200 dark:border-emerald-800 space-y-3">
                  <div className="font-bold text-slate-800 dark:text-slate-200">New FTP User Account</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Username
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="ftp_user"
                        value={newFtpUser.username}
                        onChange={(e) => setNewFtpUser({ ...newFtpUser, username: e.target.value })}
                        className="input text-xs w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Password
                      </label>
                      <input
                        type="password"
                        required
                        placeholder="••••••••••••"
                        value={newFtpUser.password}
                        onChange={(e) => setNewFtpUser({ ...newFtpUser, password: e.target.value })}
                        className="input text-xs w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Chroot Root Path
                      </label>
                      <input
                        type="text"
                        placeholder="/var/www/nodesites"
                        value={newFtpUser.root_path}
                        onChange={(e) => setNewFtpUser({ ...newFtpUser, root_path: e.target.value })}
                        className="input font-mono text-xs w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Permissions
                      </label>
                      <select
                        value={newFtpUser.permissions}
                        onChange={(e) => setNewFtpUser({ ...newFtpUser, permissions: e.target.value })}
                        className="input text-xs w-full"
                      >
                        <option value="rw">Read & Write (Full)</option>
                        <option value="r">Read-Only (Download Only)</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddFtpUser(false)}
                      className="btn-secondary py-1 px-3 text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingFtpUser}
                      className="btn-primary py-1 px-3 text-xs font-semibold"
                    >
                      {savingFtpUser ? 'Creating...' : 'Create Account'}
                    </button>
                  </div>
                </form>
              )}

              {/* Users Table */}
              <div className="border border-slate-200 dark:border-cyber-800 rounded-xl overflow-hidden">
                <table className="w-full text-left font-mono text-[11px]">
                  <thead className="bg-slate-50 dark:bg-cyber-900 border-b border-slate-200 dark:border-cyber-800 text-slate-500">
                    <tr>
                      <th className="p-2.5">User</th>
                      <th className="p-2.5">Directory Jail</th>
                      <th className="p-2.5">Access</th>
                      <th className="p-2.5">Created</th>
                      <th className="p-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-cyber-800/60">
                    {loadingFtpInfo ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-slate-400">Loading accounts...</td>
                      </tr>
                    ) : (ftpInfo?.users || []).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-slate-400">
                          No dedicated FTP user accounts created on this node yet.
                        </td>
                      </tr>
                    ) : (
                      (ftpInfo?.users || []).map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-cyber-850/50">
                          <td className="p-2.5 font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <KeyIcon className="w-3.5 h-3.5 text-emerald-500" />
                            <span>{u.username}</span>
                          </td>
                          <td className="p-2.5 text-slate-600 dark:text-slate-300 truncate max-w-xs" title={u.root_path}>
                            {u.root_path}
                          </td>
                          <td className="p-2.5">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                              u.permissions === 'rw' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-cyber-800 dark:text-slate-400'
                            }`}>
                              {u.permissions === 'rw' ? 'Read/Write' : 'Read-Only'}
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-400">
                            {formatTimeAgo(u.created_at)}
                          </td>
                          <td className="p-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteFtpUser(u.id, u.username)}
                              className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                              title="Delete FTP User"
                            >
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-cyber-800">
              <button
                type="button"
                onClick={() => { setShowFtpModal(false); setSelectedFtpNode(null); }}
                className="btn-secondary py-1.5 px-4 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
