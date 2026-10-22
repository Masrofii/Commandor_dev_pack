'use client';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { api } from '../../../lib/api';
import { isAdmin, getUser } from '../../../lib/auth';
import {
  ShieldCheckIcon,
  UsersIcon,
  EnvelopeIcon,
  GlobeAltIcon,
  ServerStackIcon,
  ShieldExclamationIcon,
  MegaphoneIcon,
  CircleStackIcon,
  ArrowPathIcon,
  TrashIcon,
  NoSymbolIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
  CpuChipIcon,
  ArrowTopRightOnSquareIcon,
  KeyIcon,
  AdjustmentsHorizontalIcon,
  WrenchScrewdriverIcon,
  ListBulletIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';

export default function AdminPage() {
  const [authorized, setAuthorized] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [tab, setTab] = useState('overview'); // 'overview' | 'users' | 'emails' | 'subdomains' | 'hosting' | 'security' | 'broadcast' | 'logs'

  useEffect(() => {
    const ok = isAdmin();
    setAuthorized(ok);
    setCurrentUser(getUser());
  }, []);

  // Search states
  const [userSearch, setUserSearch] = useState('');
  const [emailSearch, setEmailSearch] = useState('');
  const [subSearch, setSubSearch] = useState('');
  const [siteSearch, setSiteSearch] = useState('');

  // Modals
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({ role: 'user', alias_limit: 999999, storage_limit: 107374182400 });
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const [showAddNode, setShowAddNode] = useState(false);
  const [nodeModalTab, setNodeModalTab] = useState('single'); // 'single' | 'bulk'
  const [addingNode, setAddingNode] = useState(false);
  const [nodeForm, setNodeForm] = useState({ connection_string: '', name: '' });
  const [bulkNodesText, setBulkNodesText] = useState('');
  const [bulkProvisioning, setBulkProvisioning] = useState(false);
  const [bulkResults, setBulkResults] = useState(null);
  const [cleaningDb, setCleaningDb] = useState(false);

  // SWR Data Fetching (Enabled only if authorized)
  const { data: statsData, mutate: mutateStats, isLoading: loadingStats } = useSWR(
    authorized ? 'admin-stats' : null,
    api.getAdminStats,
    { refreshInterval: 10000 }
  );

  const { data: usersData, mutate: mutateUsers, isLoading: loadingUsers } = useSWR(
    authorized ? ['admin-users', userSearch] : null,
    () => api.getAdminUsers({ search: userSearch, limit: 100 })
  );

  const { data: emailsData, mutate: mutateEmails, isLoading: loadingEmails } = useSWR(
    authorized && tab === 'emails' ? ['admin-emails', emailSearch] : null,
    () => api.getAdminEmails({ search: emailSearch, limit: 50 }),
    { refreshInterval: 5000 }
  );

  const { data: subdomainsData, mutate: mutateSubdomains, isLoading: loadingSubdomains } = useSWR(
    authorized && (tab === 'subdomains' || tab === 'overview') ? ['admin-subdomains', subSearch] : null,
    () => api.getAdminSubdomains({ search: subSearch, limit: 100 })
  );

  const { data: sitesData, mutate: mutateSites, isLoading: loadingSites } = useSWR(
    authorized && (tab === 'hosting' || tab === 'overview') ? ['admin-sites', siteSearch] : null,
    () => api.getAdminSites({ search: siteSearch, limit: 100 })
  );

  const { data: nodesData, mutate: mutateNodes } = useSWR(
    authorized && (tab === 'hosting' || tab === 'overview') ? 'admin-nodes' : null,
    api.getAdminNodes
  );

  const { data: securityLogsData, mutate: mutateSecLogs } = useSWR(
    authorized && (tab === 'security' || tab === 'overview') ? 'admin-security-logs' : null,
    () => api.getAdminSecurityLogs({ limit: 50 })
  );

  const { data: auditLogsData } = useSWR(
    authorized && tab === 'logs' ? 'admin-audit-logs' : null,
    () => api.getAuditLogs({ limit: 50 })
  );

  if (!authorized) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="p-4 bg-red-100 dark:bg-red-950/40 rounded-full text-red-600 mb-4">
          <NoSymbolIcon className="h-10 w-10" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Admin Access Restricted</h2>
        <p className="mt-2 text-sm text-gray-500 max-w-md">
          This area is strictly restricted to the Platform Owner and Administrators. Your current role is not authorized.
        </p>
      </div>
    );
  }

  // Action handlers
  async function handleToggleBan(u) {
    const nextBan = u.is_banned ? 0 : 1;
    try {
      await api.updateUser(u.tg_id, { is_banned: nextBan });
      toast.success(nextBan ? `User @${u.username || u.tg_id} suspended` : `User @${u.username || u.tg_id} reinstated`);
      mutateUsers();
    } catch (err) {
      toast.error(err.message || 'Action failed');
    }
  }

  async function handleSaveUser(e) {
    e.preventDefault();
    if (!editingUser) return;
    try {
      await api.updateUser(editingUser.tg_id, {
        role: userForm.role,
        alias_limit: parseInt(userForm.alias_limit, 10),
        storage_limit: parseInt(userForm.storage_limit, 10)
      });
      toast.success('User updated successfully');
      setEditingUser(null);
      mutateUsers();
    } catch (err) {
      toast.error(err.message || 'Update failed');
    }
  }

  async function handleDeleteEmail(id) {
    if (!confirm(`Delete email #${id} from database?`)) return;
    try {
      await api.deleteAdminEmail(id);
      toast.success('Email deleted');
      mutateEmails();
      mutateStats();
    } catch (err) {
      toast.error(err.message || 'Delete failed');
    }
  }

  async function handleDeleteSubdomain(id, name) {
    if (!confirm(`Delete subdomain "${name}"?`)) return;
    try {
      await api.deleteAdminSubdomain(id);
      toast.success('Subdomain deleted');
      mutateSubdomains();
    } catch (err) {
      toast.error(err.message || 'Delete failed');
    }
  }

  async function handleDeleteSite(id, name) {
    if (!confirm(`Delete hosted site "${name}" and unbind its routing?`)) return;
    try {
      await api.deleteAdminSite(id);
      toast.success('Site deleted');
      mutateSites();
    } catch (err) {
      toast.error(err.message || 'Delete failed');
    }
  }

  async function handleAddNode(e) {
    e.preventDefault();
    if (!nodeForm.connection_string.trim()) {
      toast.error('Connection string is required');
      return;
    }
    setAddingNode(true);
    try {
      const res = await api.addAdminNode(nodeForm);
      toast.success(`Node "${res.name}" connected and online!`);
      setShowAddNode(false);
      setNodeForm({ connection_string: '', name: '' });
      mutateNodes();
      mutateStats();
    } catch (err) {
      toast.error(err.message || 'Node connection failed');
    } finally {
      setAddingNode(false);
    }
  }

  async function handleBulkAddNodes(e) {
    e.preventDefault();
    if (!bulkNodesText.trim()) {
      toast.error('Please enter at least one SSH connection string');
      return;
    }
    setBulkProvisioning(true);
    setBulkResults(null);
    try {
      const res = await api.addAdminNodesBulk({ connection_strings: bulkNodesText });
      setBulkResults(res);
      mutateNodes();
      mutateStats();
      if (res.successful > 0) {
        toast.success(`Successfully provisioned ${res.successful} server node(s)!`);
      } else {
        toast.error('Failed to connect to any server nodes.');
      }
    } catch (err) {
      toast.error(err.message || 'Bulk node provisioning failed');
    } finally {
      setBulkProvisioning(false);
    }
  }

  async function handleDeleteNode(id, name) {
    if (!confirm(`Remove server node "${name}" from pool?`)) return;
    try {
      await api.deleteAdminNode(id);
      toast.success('Node removed');
      mutateNodes();
      mutateStats();
    } catch (err) {
      toast.error(err.message || 'Delete failed');
    }
  }

  async function handleBroadcast(e) {
    e.preventDefault();
    if (!broadcastMsg.trim()) {
      toast.error('Message content is required');
      return;
    }
    if (!confirm('Broadcast this announcement to all active Telegram bot users?')) return;
    setBroadcasting(true);
    try {
      const res = await api.sendAdminBroadcast({ message: broadcastMsg });
      toast.success(`Announcement broadcast to ${res.sent} active users!`);
      setBroadcastMsg('');
    } catch (err) {
      toast.error(err.message || 'Broadcast failed');
    } finally {
      setBroadcasting(false);
    }
  }

  async function handleVacuumDb() {
    setCleaningDb(true);
    try {
      const res = await api.vacuumDatabase();
      toast.success(res.message || 'Database maintenance completed!');
      mutateStats();
    } catch (err) {
      toast.error(err.message || 'Maintenance failed');
    } finally {
      setCleaningDb(false);
    }
  }

  const overview = statsData?.overview || {};
  const proc = statsData?.process || {};
  const dbInfo = statsData?.database || {};
  const usersList = usersData?.users || [];
  const emailsList = emailsData?.emails || [];
  const subdomainsList = subdomainsData?.subdomains || [];
  const sitesList = sitesData?.sites || [];
  const nodesList = nodesData?.nodes || [];
  const secLogs = securityLogsData?.logs || [];
  const auditLogs = auditLogsData?.logs || [];

  return (
    <div className="space-y-6">
      {/* Admin Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 bg-gradient-to-r from-rose-900/90 via-indigo-900/90 to-purple-900/90 rounded-2xl text-white shadow-xl border border-rose-500/20">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-500 text-white shadow-sm">
              👑 Platform Owner Full Access
            </span>
            <span className="text-xs text-rose-200">
              ID: {currentUser?.tg_id || '8319534224'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1 flex items-center gap-2">
            Control Center &amp; Master Admin Panel
          </h1>
          <p className="text-xs sm:text-sm text-rose-100/80 mt-1 max-w-2xl">
            Live infrastructure management: users, system-wide emails, subdomains routing, server nodes, anti-abuse scanner, and global broadcasts.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleVacuumDb}
            disabled={cleaningDb}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-lg text-xs font-medium border border-white/20 transition-all disabled:opacity-50"
            title="WAL Flush & PRAGMA Optimize"
          >
            <WrenchScrewdriverIcon className={`h-4 w-4 ${cleaningDb ? 'animate-spin' : ''}`} />
            {cleaningDb ? 'Optimizing...' : 'Optimize DB'}
          </button>
          <button
            onClick={() => {
              mutateStats();
              mutateUsers();
              mutateEmails();
              mutateSubdomains();
              mutateSites();
              mutateNodes();
              toast.success('All admin caches refreshed');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-lg text-xs font-medium border border-white/20 transition-all"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Refresh All
          </button>
        </div>
      </div>

      {/* Admin Tab Navigation */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 space-x-2 sm:space-x-4 text-xs sm:text-sm font-medium overflow-x-auto pb-1">
        {[
          { id: 'overview', label: 'System Health', icon: CircleStackIcon, count: null },
          { id: 'users', label: 'Users Directory', icon: UsersIcon, count: overview.users },
          { id: 'emails', label: 'Live Email Feed', icon: EnvelopeIcon, count: overview.emails },
          { id: 'subdomains', label: 'Subdomains', icon: GlobeAltIcon, count: overview.subdomains },
          { id: 'hosting', label: 'Cloud Sites & Nodes', icon: ServerStackIcon, count: overview.sites },
          { id: 'security', label: 'Security Threats', icon: ShieldExclamationIcon, count: overview.threatsBlocked },
          { id: 'broadcast', label: 'Broadcast', icon: MegaphoneIcon, count: null },
          { id: 'logs', label: 'Audit Logs', icon: KeyIcon, count: null }
        ].map(item => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`pb-3 px-2 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-all ${
                active
                  ? 'border-rose-600 text-rose-600 dark:text-rose-400 font-bold'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
              {item.count !== null && item.count !== undefined && (
                <span className={`px-1.5 py-0.2 text-[10px] font-bold rounded-full ${
                  active ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                }`}>
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ────────────────────────────────────────────────────────────────────
          TAB 1: SYSTEM HEALTH & OVERVIEW
      ────────────────────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="flex items-center justify-between text-gray-500">
                <span className="text-xs font-semibold uppercase">Total Users</span>
                <UsersIcon className="h-4 w-4 text-indigo-500" />
              </div>
              <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                {overview.users || 0}
              </div>
              <div className="text-[11px] text-green-600 mt-1 font-medium">Registered in Bot &amp; Web</div>
            </div>

            <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="flex items-center justify-between text-gray-500">
                <span className="text-xs font-semibold uppercase">Total Emails</span>
                <EnvelopeIcon className="h-4 w-4 text-sky-500" />
              </div>
              <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                {overview.emails || 0}
              </div>
              <div className="text-[11px] text-gray-400 mt-1">Unread: {overview.unread || 0}</div>
            </div>

            <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="flex items-center justify-between text-gray-500">
                <span className="text-xs font-semibold uppercase">Active Subdomains</span>
                <GlobeAltIcon className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                {overview.subdomains || 0}
              </div>
              <div className="text-[11px] text-emerald-600 mt-1 font-medium">*.commandor.my.id</div>
            </div>

            <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="flex items-center justify-between text-gray-500">
                <span className="text-xs font-semibold uppercase">Threats Blocked</span>
                <ShieldExclamationIcon className="h-4 w-4 text-rose-500" />
              </div>
              <div className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-400">
                {overview.threatsBlocked || 0}
              </div>
              <div className="text-[11px] text-rose-500 mt-1 font-medium">Zero-Tolerance Enforced</div>
            </div>
          </div>

          {/* Infrastructure Health Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="p-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <CpuChipIcon className="h-5 w-5 text-indigo-500" />
                <h3 className="font-bold text-sm text-gray-900 dark:text-white">Runtime Process &amp; RAM</h3>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-gray-500">Node.js Engine:</span>
                  <span className="font-mono font-semibold">{proc.nodeVersion || 'v22'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-gray-500">Process PID:</span>
                  <span className="font-mono">{proc.pid || 'N/A'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-gray-500">Heap Used:</span>
                  <span className="font-mono font-bold text-indigo-600">{((proc.memoryHeapUsed || 0) / 1024 / 1024).toFixed(1)} MB</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">Resident Set (RSS):</span>
                  <span className="font-mono">{((proc.memoryRss || 0) / 1024 / 1024).toFixed(1)} MB</span>
                </div>
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <CircleStackIcon className="h-5 w-5 text-emerald-500" />
                <h3 className="font-bold text-sm text-gray-900 dark:text-white">Database Status</h3>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-gray-500">Storage Engine:</span>
                  <span className="font-mono font-semibold text-emerald-600">SQLite WAL</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-gray-500">Total Mailboxes:</span>
                  <span className="font-mono">{dbInfo.aliases || 0}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-gray-500">Today's Inflow:</span>
                  <span className="font-mono font-bold">{dbInfo.emailsToday || 0} emails</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">Spam Rejected:</span>
                  <span className="font-mono text-rose-500 font-bold">{dbInfo.spamToday || 0}</span>
                </div>
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <ServerStackIcon className="h-5 w-5 text-purple-500" />
                <h3 className="font-bold text-sm text-gray-900 dark:text-white">Edge Cluster Pool</h3>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-gray-500">Online Server Nodes:</span>
                  <span className="font-mono font-bold text-purple-600">{overview.nodes || 0} active</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-gray-500">Hosted Simple Sites:</span>
                  <span className="font-mono">{overview.sites || 0} deployed</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-gray-500">Subdomain Gateway:</span>
                  <span className="font-mono text-green-600 font-semibold">Active &amp; Live</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">Anti-Miner Engine:</span>
                  <span className="font-mono text-green-600 font-semibold">Zero-Tolerance Active</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────
          TAB 2: USERS DIRECTORY & ACCESS CONTROL
      ────────────────────────────────────────────────────────────────────── */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search username, name, or TG ID..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div className="text-xs text-gray-500">
              Showing <b>{usersList.length}</b> users
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-gray-500 uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3">Telegram ID</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Aliases Limit</th>
                    <th className="px-4 py-3">Storage Limit</th>
                    <th className="px-4 py-3">Joined Date</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60 font-mono">
                  {usersList.map(u => (
                    <tr key={u.tg_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3 font-bold">{u.tg_id}</td>
                      <td className="px-4 py-3 font-sans">
                        <div className="font-semibold text-gray-900 dark:text-white">
                          {u.first_name || 'N/A'}
                        </div>
                        <div className="text-[11px] text-indigo-500 font-mono">
                          {u.username ? `@${u.username}` : 'No username'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          u.role === 'admin'
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.is_banned
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                            : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                        }`}>
                          {u.is_banned ? 'BANNED' : 'ACTIVE'}
                        </span>
                      </td>
                      <td className="px-4 py-3">{u.alias_limit > 90000 ? 'Unlimited' : u.alias_limit}</td>
                      <td className="px-4 py-3">{(u.storage_limit / 1024 / 1024 / 1024).toFixed(0)} GB</td>
                      <td className="px-4 py-3 text-[11px] text-gray-500">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right space-x-1 font-sans">
                        <button
                          onClick={() => {
                            setEditingUser(u);
                            setUserForm({
                              role: u.role,
                              alias_limit: u.alias_limit,
                              storage_limit: u.storage_limit
                            });
                          }}
                          className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded text-xs hover:bg-gray-200"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleBan(u)}
                          className={`px-2.5 py-1 rounded text-xs font-medium text-white ${
                            u.is_banned ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                          }`}
                        >
                          {u.is_banned ? 'Unban' : 'Ban'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────
          TAB 3: SYSTEM-WIDE LIVE EMAIL FEED
      ────────────────────────────────────────────────────────────────────── */}
      {tab === 'emails' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-96">
              <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search subject, sender, or destination alias..."
                value={emailSearch}
                onChange={e => setEmailSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div className="text-xs text-gray-500">
              Feed updates automatically every 5s • <b>{emailsList.length}</b> emails shown
            </div>
          </div>

          {emailsList.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <EnvelopeIcon className="h-10 w-10 text-gray-400 mx-auto" />
              <p className="mt-2 text-sm text-gray-500">No emails matched your filter.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {emailsList.map(e => (
                <div
                  key={e.id}
                  className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 max-w-3xl">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-gray-400">#{e.id}</span>
                      <h4 className="font-bold text-sm text-gray-900 dark:text-white">
                        {e.subject || '(no subject)'}
                      </h4>
                      {e.spam_classification === 'spam' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                          SPAM (Score: {e.spam_score})
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-300 flex flex-wrap gap-x-4 gap-y-1">
                      <span>From: <b>{e.sender_name ? `${e.sender_name} <${e.sender}>` : e.sender}</b></span>
                      <span>To Alias: <code className="text-indigo-500">{e.alias_address}</code></span>
                      {e.user_username && <span>Owner: <b>@{e.user_username}</b></span>}
                    </div>
                    {e.text_body && (
                      <p className="text-xs text-gray-500 line-clamp-2 mt-1 font-mono bg-gray-50 dark:bg-gray-900/60 p-2 rounded">
                        {e.text_body}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 sm:self-center shrink-0">
                    <span className="text-[11px] text-gray-400">
                      {new Date(e.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                      {new Date(e.received_at).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => handleDeleteEmail(e.id)}
                      className="text-gray-400 hover:text-red-500 p-1.5 rounded transition-colors"
                      title="Delete email"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────
          TAB 4: SYSTEM-WIDE SUBDOMAINS
      ────────────────────────────────────────────────────────────────────── */}
      {tab === 'subdomains' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search subdomain or owner..."
                value={subSearch}
                onChange={e => setSubSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div className="text-xs text-gray-500">
              <b>{subdomainsList.length}</b> total registered subdomains
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-gray-500 uppercase font-semibold font-sans">
                  <tr>
                    <th className="px-4 py-3">Subdomain Domain</th>
                    <th className="px-4 py-3">Owner User</th>
                    <th className="px-4 py-3">Routing Mode</th>
                    <th className="px-4 py-3">Target / Destination</th>
                    <th className="px-4 py-3">Catch-All Email</th>
                    <th className="px-4 py-3">Requests</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {subdomainsList.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3 font-bold text-indigo-600 dark:text-indigo-400">
                        <a href={`http://${s.full_domain}`} target="_blank" rel="noreferrer" className="hover:underline">
                          {s.full_domain}
                        </a>
                      </td>
                      <td className="px-4 py-3 font-sans">
                        {s.username ? `@${s.username}` : `TG:${s.tg_id}`}
                      </td>
                      <td className="px-4 py-3 uppercase text-[11px] font-bold">
                        {s.web_mode}
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                        {s.web_target || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={s.email_catchall ? 'text-green-600 font-bold' : 'text-gray-400'}>
                          {s.email_catchall ? '✅ Active' : '❌ Off'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold">{s.total_requests || 0}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDeleteSubdomain(s.id, s.full_domain)}
                          className="text-gray-400 hover:text-red-500 p-1"
                          title="Delete subdomain"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────
          TAB 5: CLOUD HOSTING SITES & SERVER NODES
      ────────────────────────────────────────────────────────────────────── */}
      {tab === 'hosting' && (
        <div className="space-y-6">
          {/* Section A: Server Nodes Cluster */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <ServerStackIcon className="h-5 w-5 text-indigo-500" />
                  Cluster Server Nodes ({nodesList.length})
                </h3>
                <p className="text-xs text-gray-500">
                  Ubuntu VPS containers provisioned to run websites via multi-tenant proxy.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href="/nodes"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-cyan-400 rounded-lg text-xs font-semibold border border-indigo-200 dark:border-indigo-800 shadow-sm"
                >
                  <ServerStackIcon className="h-4 w-4" />
                  Full Nodes Control Plane ↗
                </a>
                <button
                  onClick={() => { setNodeModalTab('bulk'); setBulkResults(null); setShowAddNode(true); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-600 shadow-sm"
                >
                  <ListBulletIcon className="h-4 w-4 text-indigo-500" />
                  Bulk Add SSH
                </button>
                <button
                  onClick={() => { setNodeModalTab('single'); setBulkResults(null); setShowAddNode(true); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm"
                >
                  <PlusIcon className="h-4 w-4" />
                  Add Server Node
                </button>
              </div>
            </div>

            {nodesList.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <ServerStackIcon className="h-10 w-10 text-gray-400 mx-auto" />
                <p className="mt-2 text-sm text-gray-500">No server nodes added yet.</p>
                <div className="mt-4 flex items-center justify-center gap-2">
                  <button
                    onClick={() => { setNodeModalTab('bulk'); setBulkResults(null); setShowAddNode(true); }}
                    className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600"
                  >
                    Bulk Add SSH Nodes
                  </button>
                  <button
                    onClick={() => { setNodeModalTab('single'); setBulkResults(null); setShowAddNode(true); }}
                    className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg shadow-sm"
                  >
                    Connect Single Node
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {nodesList.map(n => (
                  <div key={n.id} className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${n.status === 'online' ? 'bg-green-500' : 'bg-red-500'}`} />
                        <h4 className="font-bold text-sm text-gray-900 dark:text-white">{n.name}</h4>
                      </div>
                      <button
                        onClick={() => handleDeleteNode(n.id, n.name)}
                        className="text-gray-400 hover:text-red-500 p-1"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="font-mono text-xs text-gray-500 mt-1">{n.host}:{n.port}</p>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="p-2 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                        <span className="text-[10px] text-gray-400 uppercase">CPUs</span>
                        <div className="font-bold">{n.system_info?.cpus || 1} vCPU</div>
                      </div>
                      <div className="p-2 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                        <span className="text-[10px] text-gray-400 uppercase">RAM</span>
                        <div className="font-bold">{n.system_info?.ramMb || 512} MB</div>
                      </div>
                      <div className="p-2 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                        <span className="text-[10px] text-gray-400 uppercase">Capacity</span>
                        <div className="font-bold">{n.current_sites} / {n.max_sites}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section B: All Deployed Sites across the platform */}
          <div className="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <GlobeAltIcon className="h-5 w-5 text-emerald-500" />
                  All User Hosted Sites ({sitesList.length})
                </h3>
                <p className="text-xs text-gray-500">Live websites deployed by users across your server nodes.</p>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-gray-500 uppercase font-semibold font-sans">
                    <tr>
                      <th className="px-4 py-3">Site Domain</th>
                      <th className="px-4 py-3">Owner</th>
                      <th className="px-4 py-3">Server Node</th>
                      <th className="px-4 py-3">Files / Size</th>
                      <th className="px-4 py-3">Hits</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                    {sitesList.map(s => (
                      <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-4 py-3 font-bold text-indigo-600 dark:text-indigo-400">
                          <a href={`http://${s.full_domain}`} target="_blank" rel="noreferrer" className="hover:underline flex items-center gap-1">
                            {s.full_domain}
                            <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                          </a>
                        </td>
                        <td className="px-4 py-3 font-sans">
                          {s.username ? `@${s.username}` : `TG:${s.tg_id}`}
                        </td>
                        <td className="px-4 py-3 text-gray-500 font-sans">
                          {s.node_name || 'Node ' + s.node_id}
                        </td>
                        <td className="px-4 py-3">
                          {s.files_count} files ({(s.storage_used_bytes / 1024).toFixed(1)} KB)
                        </td>
                        <td className="px-4 py-3 font-bold">{s.visits_count}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            s.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-red-100 text-red-700'
                          }`}>
                            {s.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDeleteSite(s.id, s.name)}
                            className="text-gray-400 hover:text-red-500 p-1"
                            title="Force Delete Site"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────
          TAB 6: SECURITY & THREAT AUDIT LOGS
      ────────────────────────────────────────────────────────────────────── */}
      {tab === 'security' && (
        <div className="space-y-4">
          <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-900 dark:text-rose-200">
            <h4 className="font-bold flex items-center gap-2 text-sm text-rose-700 dark:text-rose-300">
              <ShieldExclamationIcon className="h-5 w-5" />
              Automated Zero-Day Threat Interceptor
            </h4>
            <p className="mt-1">
              Every site upload is scanned against cryptocurrency miners (XMRig, Stratum, CoinHive), phishing kits (Discord webhooks, Metamask stealers), and webshell backdoors (c99, r57, eval base64).
            </p>
          </div>

          <h3 className="font-bold text-sm text-gray-900 dark:text-white">Security Interceptions ({secLogs.length})</h3>
          {secLogs.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <ShieldCheckIcon className="h-10 w-10 text-green-500 mx-auto" />
              <p className="mt-2 text-sm text-gray-500">No malicious threats detected. Clean cluster.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {secLogs.map(l => (
                <div key={l.id} className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg text-xs font-mono flex items-center justify-between">
                  <div>
                    <span className="font-bold text-red-700 dark:text-red-400">[{l.threat_type.toUpperCase()}]</span>{' '}
                    <span>File: <b>{l.file_name}</b></span> — Pattern: <code>{l.matched_pattern}</code> (TG: {l.tg_id})
                  </div>
                  <span className="text-gray-400 text-[11px]">{l.created_at}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────
          TAB 7: TELEGRAM BROADCAST ANNOUNCEMENT
      ────────────────────────────────────────────────────────────────────── */}
      {tab === 'broadcast' && (
        <div className="max-w-2xl bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm space-y-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <MegaphoneIcon className="h-6 w-6 text-rose-500" />
              Global Telegram Broadcast
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Send an instant push announcement to all registered users of the Telegram Bot. Supports HTML markup (<b>bold</b>, <i>italic</i>, <code>code</code>, &lt;a href="..."&gt;links&lt;/a&gt;).
            </p>
          </div>

          <form onSubmit={handleBroadcast} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Announcement Message (HTML)
              </label>
              <textarea
                rows={8}
                required
                value={broadcastMsg}
                onChange={e => setBroadcastMsg(e.target.value)}
                placeholder="📢 <b>Exciting Update:</b>&#10;&#10;We have launched high-performance Cloud Hosting! Deploy your website instantly with /deploy."
                className="w-full p-3 font-mono text-xs bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={broadcasting}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-lg text-sm shadow-sm transition-all disabled:opacity-50"
              >
                {broadcasting ? 'Sending Broadcast...' : '📢 Send Broadcast to All Users'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────
          TAB 8: AUDIT TRAILS
      ────────────────────────────────────────────────────────────────────── */}
      {tab === 'logs' && (
        <div className="space-y-3">
          <h3 className="font-bold text-sm text-gray-900 dark:text-white">Admin Activity Audit Trail</h3>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-gray-500 uppercase font-sans">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Target Resource</th>
                    <th className="px-4 py-3">Admin TG</th>
                    <th className="px-4 py-3">IP Address</th>
                    <th className="px-4 py-3">Details</th>
                    <th className="px-4 py-3 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {auditLogs.map(l => (
                    <tr key={l.id}>
                      <td className="px-4 py-3 font-bold">{l.id}</td>
                      <td className="px-4 py-3 font-semibold text-rose-600 dark:text-rose-400">{l.action}</td>
                      <td className="px-4 py-3">{l.resource} {l.resource_id ? `#${l.resource_id}` : ''}</td>
                      <td className="px-4 py-3">{l.tg_id}</td>
                      <td className="px-4 py-3 text-gray-400">{l.ip_address || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{l.details || '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-400">{l.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────
          MODAL: EDIT USER MODAL
      ────────────────────────────────────────────────────────────────────── */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-bold text-base text-gray-900 dark:text-white flex items-center gap-2">
                <AdjustmentsHorizontalIcon className="h-5 w-5 text-rose-500" />
                Edit User: {editingUser.first_name || editingUser.tg_id}
              </h3>
              <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Role
                </label>
                <select
                  value={userForm.role}
                  onChange={e => setUserForm({ ...userForm, role: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg outline-none font-semibold"
                >
                  <option value="user">User (Standard Access)</option>
                  <option value="admin">Admin (Master Access)</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Alias Limit
                </label>
                <input
                  type="number"
                  value={userForm.alias_limit}
                  onChange={e => setUserForm({ ...userForm, alias_limit: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg outline-none font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Storage Limit (Bytes)
                </label>
                <input
                  type="number"
                  value={userForm.storage_limit}
                  onChange={e => setUserForm({ ...userForm, storage_limit: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg outline-none font-mono"
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  Current: {(userForm.storage_limit / 1024 / 1024 / 1024).toFixed(1)} GB
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-lg shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────
          MODAL: ADD SERVER NODE
      ────────────────────────────────────────────────────────────────────── */}
      {showAddNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ServerStackIcon className="h-5 w-5 text-indigo-500" />
                Add Cloud Server Node (Ubuntu VPS)
              </h2>
              <button onClick={() => { setShowAddNode(false); setBulkResults(null); }} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Tabs: Single vs Bulk */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 mt-3">
              <button
                type="button"
                onClick={() => { setNodeModalTab('single'); setBulkResults(null); }}
                className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors ${
                  nodeModalTab === 'single'
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                }`}
              >
                Single Node
              </button>
              <button
                type="button"
                onClick={() => { setNodeModalTab('bulk'); setBulkResults(null); }}
                className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  nodeModalTab === 'bulk'
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                }`}
              >
                <ListBulletIcon className="h-3.5 w-3.5" />
                Bulk SSH Import
              </button>
            </div>

            {nodeModalTab === 'single' ? (
              <form onSubmit={handleAddNode} className="space-y-4 mt-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Connection String (host:port:user:pass)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="198.51.100.25:22:root:password"
                    value={nodeForm.connection_string}
                    onChange={e => setNodeForm({ ...nodeForm, connection_string: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white outline-none font-mono"
                  />
                  <p className="mt-1 text-[11px] text-gray-400">
                    Provide your Ubuntu container SSH host, port, username, and password.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Node Friendly Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="edge-node-01"
                    value={nodeForm.name}
                    onChange={e => setNodeForm({ ...nodeForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm outline-none"
                  />
                </div>

                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg text-xs text-indigo-700 dark:text-indigo-300 space-y-1">
                  <p className="font-semibold">⚡ Automated Provisioning:</p>
                  <p>The system will automatically SSH into this container, set up directories, launch the multi-site web runner, and connect it to the hosting cluster.</p>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => setShowAddNode(false)}
                    className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addingNode}
                    className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm disabled:opacity-50"
                  >
                    {addingNode ? 'Connecting & Provisioning...' : 'Connect Server Node'}
                  </button>
                </div>
              </form>
            ) : bulkResults ? (
              <div className="space-y-4 mt-4">
                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-sm text-gray-900 dark:text-white">Bulk Provisioning Complete</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {bulkResults.total} node(s) processed
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300">
                        {bulkResults.successful} Online
                      </span>
                      {bulkResults.failed > 0 && (
                        <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300">
                          {bulkResults.failed} Failed
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {bulkResults.results.map((r, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg text-xs border ${
                        r.status === 'success'
                          ? 'bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                          : 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-1.5 font-mono font-medium text-gray-900 dark:text-white">
                          {r.status === 'success' ? (
                            <CheckCircleIcon className="h-4 w-4 text-green-500 shrink-0" />
                          ) : (
                            <ExclamationCircleIcon className="h-4 w-4 text-red-500 shrink-0" />
                          )}
                          <span>{r.host ? `${r.host}:${r.port}` : r.input}</span>
                        </div>
                        <span
                          className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                            r.status === 'success'
                              ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                              : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                          }`}
                        >
                          {r.status}
                        </span>
                      </div>
                      {r.status === 'success' ? (
                        <div className="mt-1 text-gray-600 dark:text-gray-300 pl-5">
                          Node: <span className="font-semibold">{r.node?.name || r.name}</span> • {r.node?.system_info?.cpus || 1} vCPU • {r.node?.system_info?.ramMb || 512}MB RAM
                        </div>
                      ) : (
                        <div className="mt-1 text-red-600 dark:text-red-400 pl-5 font-sans">
                          {r.error || 'Connection failed'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => { setBulkResults(null); setBulkNodesText(''); }}
                    className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300"
                  >
                    Import More
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddNode(false); setBulkResults(null); }}
                    className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm"
                  >
                    Done &amp; Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleBulkAddNodes} className="space-y-4 mt-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                      SSH Connection Strings (One per line)
                    </label>
                    <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-mono font-medium">
                      {bulkNodesText.split('\n').filter(l => l.trim() && !l.trim().startsWith('#') && l.includes(':')).length} nodes detected
                    </span>
                  </div>
                  <textarea
                    rows={6}
                    required
                    placeholder={`198.51.100.25:22:root:password123 # US-Edge-1\n198.51.100.26:22:root:password456 # US-Edge-2\nubuntu:mypass@198.51.100.27:2222\n10.0.0.15:22:root:secret`}
                    value={bulkNodesText}
                    onChange={e => setBulkNodesText(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-mono text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="mt-1 text-[11px] text-gray-400">
                    Format: <code>host:port:user:pass</code> or <code>user:pass@host:port</code>. Append <code># Custom Name</code> to name each node.
                  </p>
                </div>

                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg text-xs text-indigo-700 dark:text-indigo-300 space-y-1">
                  <p className="font-semibold">⚡ Parallel Provisioning (Pool size 3):</p>
                  <p>All nodes will be contacted simultaneously via SSH, verified, hardware specs collected, and integrated into the cluster.</p>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => setShowAddNode(false)}
                    className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={bulkProvisioning}
                    className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm disabled:opacity-50"
                  >
                    {bulkProvisioning ? 'Provisioning In Bulk...' : 'Connect & Provision Bulk'}
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
