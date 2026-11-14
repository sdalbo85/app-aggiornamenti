import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Building2, Users, FileText, Trash2, Edit3,
  AlertTriangle, Check, BarChart2, Calendar, Search,
  Shield, WifiOff, Package, LogOut, Lock, Mail,
  UserCheck, Layers, ClipboardList, CheckCircle2, Clock,
  RotateCcw, Box, ChevronDown, ChevronUp, Download,
  Folder, FolderOpen, RefreshCw, Cloud
} from 'lucide-react';

const SUPABASE_URL = 'https://kzwnfaxucuhxaowisqpb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_jFNMkXlQeH-50rJEWoKfEw_ebv3JcxN';

async function supabaseFetchAllStore() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/app_store?select=key,data,updated_at`, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) throw new Error(`Errore lettura Supabase (${res.status})`);
  return await res.json();
}

async function supabaseUpsertKey(key, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/app_store?on_conflict=key`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify([{ key, data, updated_at: new Date().toISOString() }])
  });
  if (!res.ok) throw new Error(`Errore salvataggio Supabase (${res.status})`);
}

function exportToExcelCSV(filename, headers, rows) {
  const escapeCell = (val) => {
    if (val === null || val === undefined) return '""';
    return `"${String(val).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
  };
  const csvContent =
    '\uFEFF' +
    [headers.map(escapeCell).join(';'), ...rows.map((r) => r.map(escapeCell).join(';'))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function toDateTimeLocal(isoStr) {
  const d = isoStr ? new Date(isoStr) : new Date();
  if (isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function formatDisplayDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  return d.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function matchItemNames(rawA, rawB) {
  const clean = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const a = clean(rawA);
  const b = clean(rawB);
  if (!a || !b) return false;
  if (a === b) return true;
  const stem = (s) => s.replace(/(i|e|o|a)$/, '');
  const sa = stem(a);
  const sb = stem(b);
  if (sa.length >= 4 && sa === sb) return true;
  if (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a))) return true;
  return false;
}

export default function App() {
  const [cloudStatus, setCloudStatus] = useState('connecting');
  const [cloudErrorMsg, setCloudErrorMsg] = useState('');
  const [isInitialCloudLoaded, setIsInitialCloudLoaded] = useState(false);
  const pendingWritesRef = useRef(0);
  const lastWriteTsRef = useRef(0);

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('app_current_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [agents, setAgents] = useState([
    {
      id: 'ag_sede',
      name: 'Coordinatrice Ufficio',
      email: 'sede@agenziadalbo.it',
      password: 'admin',
      role: 'office'
    }
  ]);
  const [companies, setCompanies] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [clients, setClients] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [warehouseItems, setWarehouseItems] = useState([]);

  const [activeCompanyId, setActiveCompanyId] = useState('');
  const [activeUpdateId, setActiveUpdateId] = useState('');
  const [activeAgentYear, setActiveAgentYear] = useState('all');

  const saveKeyToCloud = (key, data) => {
    pendingWritesRef.current += 1;
    lastWriteTsRef.current = Date.now();
    setCloudStatus('saving');
    supabaseUpsertKey(key, data)
      .then(() => {
        pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
        if (pendingWritesRef.current === 0) setCloudStatus('synced');
      })
      .catch(() => {
        pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
        setCloudStatus('error');
      });
  };

  const loadFromCloud = async (isFirstLoad = false) => {
    if (!isFirstLoad && (pendingWritesRef.current > 0 || Date.now() - lastWriteTsRef.current < 4000)) {
      return;
    }
    try {
      if (isFirstLoad) setCloudStatus('connecting');
      const rows = await supabaseFetchAllStore();
      if (!isFirstLoad && (pendingWritesRef.current > 0 || Date.now() - lastWriteTsRef.current < 4000)) {
        return;
      }
      const map = {};
      rows.forEach((r) => {
        map[r.key] = r.data;
      });

      if (Array.isArray(map.agents) && map.agents.length > 0) {
        setAgents(map.agents);
      } else if (isFirstLoad) {
        await supabaseUpsertKey('agents', [
          {
            id: 'ag_sede',
            name: 'Coordinatrice Ufficio',
            email: 'sede@agenziadalbo.it',
            password: 'admin',
            role: 'office'
          }
        ]);
      }

      if (Array.isArray(map.companies)) setCompanies(map.companies);
      if (Array.isArray(map.updates)) setUpdates(map.updates);
      if (Array.isArray(map.clients)) setClients(map.clients);
      if (Array.isArray(map.deliveries)) setDeliveries(map.deliveries);
      if (Array.isArray(map.warehouse)) setWarehouseItems(map.warehouse);

      setCloudStatus('synced');
      setCloudErrorMsg('');
      if (isFirstLoad) setIsInitialCloudLoaded(true);
    } catch {
      setCloudStatus('error');
      setCloudErrorMsg('Connessione al database in attesa: verifica la tabella app_store su Supabase.');
      if (isFirstLoad) setIsInitialCloudLoaded(true);
    }
  };

  useEffect(() => {
    loadFromCloud(true);
    const interval = setInterval(() => loadFromCloud(false), 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('app_current_user', JSON.stringify(currentUser));
    } catch {}
  }, [currentUser]);

  const updateAgentsCloud = (updater) => {
    setAgents((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveKeyToCloud('agents', next);
      return next;
    });
  };

  const updateCompaniesCloud = (updater) => {
    setCompanies((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveKeyToCloud('companies', next);
      return next;
    });
  };

  const updateUpdatesCloud = (updater) => {
    setUpdates((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveKeyToCloud('updates', next);
      return next;
    });
  };

  const updateClientsCloud = (updater) => {
    setClients((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveKeyToCloud('clients', next);
      return next;
    });
  };

  const updateDeliveriesCloud = (updater) => {
    setDeliveries((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveKeyToCloud('deliveries', next);
      return next;
    });
  };

  const updateWarehouseCloud = (updater) => {
    setWarehouseItems((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveKeyToCloud('warehouse', next);
      return next;
    });
  };

  useEffect(() => {
    if (companies.length > 0 && (!activeCompanyId || !companies.find((c) => c.id === activeCompanyId))) {
      setActiveCompanyId(companies[0].id);
    } else if (companies.length === 0) {
      setActiveCompanyId('');
    }
  }, [companies, activeCompanyId]);

  useEffect(() => {
    if (activeCompanyId) {
      const companyUpdates = updates.filter((u) => {
        const updYear = String(u.year || new Date().getFullYear());
        return u.companyId === activeCompanyId && (activeAgentYear === 'all' || updYear === activeAgentYear);
      });
      if (companyUpdates.length > 0) {
        if (!companyUpdates.find((u) => u.id === activeUpdateId)) {
          setActiveUpdateId(companyUpdates[0].id);
        }
      } else {
        setActiveUpdateId('');
      }
    } else {
      setActiveUpdateId('');
    }
  }, [activeCompanyId, updates, activeUpdateId, activeAgentYear]);

  const handleLogin = (email, password) => {
    const userMatch = agents.find(
      (a) => a.email.toLowerCase() === email.trim().toLowerCase() && a.password === password
    );
    if (userMatch) {
      setCurrentUser(userMatch);
      return { success: true };
    }
    return { success: false, error: 'Email o password non corretti. Riprova.' };
  };

  const buildDefaultDeliveredMaterials = (updateObj, kitQuantity) => {
    if (!updateObj || !Array.isArray(updateObj.contentItems) || updateObj.contentItems.length === 0) {
      return [];
    }
    return updateObj.contentItems.map((item) => ({
      id: item.id,
      name: item.name,
      unitQty: Number(item.qty) || 1,
      deliveredQty: (Number(item.qty) || 1) * Math.max(1, Number(kitQuantity) || 1)
    }));
  };

  const applyDeliveryToWarehouse = (companyId, updateObj, materialsList, kitQty, direction = -1) => {
    const safeKitQty = Math.max(1, Number(kitQty) || 1);
    const itemsToAdjust = [];

    if (Array.isArray(materialsList) && materialsList.length > 0) {
      materialsList.forEach((m) => {
        itemsToAdjust.push({ name: m.name, qty: Number(m.deliveredQty) || 0 });
      });
    } else if (updateObj && Array.isArray(updateObj.contentItems)) {
      updateObj.contentItems.forEach((it) => {
        itemsToAdjust.push({ name: it.name, qty: (Number(it.qty) || 1) * safeKitQty });
      });
    }

    if (updateObj && updateObj.title) {
      const alreadyIncluded = itemsToAdjust.some((it) => matchItemNames(it.name, updateObj.title));
      if (!alreadyIncluded) {
        itemsToAdjust.push({ name: updateObj.title, qty: safeKitQty });
      }
    }

    if (itemsToAdjust.length === 0) return;

    updateWarehouseCloud((prev) =>
      prev.map((wItem) => {
        if (!wItem.name || !wItem.name.trim()) return wItem;
        if (wItem.companyId && companyId && wItem.companyId !== companyId) return wItem;

        let deltaTotal = 0;
        itemsToAdjust.forEach((adj) => {
          if (matchItemNames(adj.name, wItem.name)) {
            deltaTotal += (Number(adj.qty) || 0) * direction;
          }
        });

        if (deltaTotal === 0) return wItem;
        return {
          ...wItem,
          quantity: Math.max(0, (Number(wItem.quantity) || 0) + deltaTotal),
          updatedAt: new Date().toISOString()
        };
      })
    );
  };

  const handleToggleDelivery = (clientId, updateId, defaultTargetQty = 1) => {
    if (!currentUser) return;
    const existingIndex = deliveries.findIndex(
      (d) => d.clientId === clientId && d.updateId === updateId
    );
    const updateObj = updates.find((u) => u.id === updateId);

    if (existingIndex >= 0) {
      const existingRec = deliveries[existingIndex];
      const compId = existingRec.companyId || (updateObj ? updateObj.companyId : activeCompanyId);
      applyDeliveryToWarehouse(compId, updateObj, existingRec.deliveredMaterials, existingRec.quantity, +1);
      const updated = [...deliveries];
      updated.splice(existingIndex, 1);
      updateDeliveriesCloud(updated);
    } else {
      const qty = Math.max(1, Number(defaultTargetQty) || 1);
      const compId = updateObj ? updateObj.companyId : activeCompanyId;
      const mats = buildDefaultDeliveredMaterials(updateObj, qty);
      const newRecord = {
        id: 'del_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        clientId,
        updateId,
        companyId: compId,
        agentId: currentUser.id,
        delivered: true,
        deliveredAt: new Date().toISOString(),
        quantity: qty,
        deliveredMaterials: mats,
        notes: '',
        alert: false,
        alertResolved: false
      };
      applyDeliveryToWarehouse(compId, updateObj, mats, qty, -1);
      updateDeliveriesCloud((prev) => [...prev, newRecord]);
    }
  };

  const handleUpdateDeliveryDetails = (
    clientId,
    updateId,
    quantity,
    deliveredMaterials,
    notes,
    alert,
    customDateIso
  ) => {
    if (!currentUser) return;
    const existingIndex = deliveries.findIndex(
      (d) => d.clientId === clientId && d.updateId === updateId
    );
    const updateObj = updates.find((u) => u.id === updateId);
    const dateIso = customDateIso || new Date().toISOString();
    const safeQty = Math.max(1, Number(quantity) || 1);

    const clientObj = clients.find((c) => c.id === clientId);
    const compId = updateObj ? updateObj.companyId : activeCompanyId;
    const expectedQty = clientObj?.companyConfigs?.[compId]?.quantity
      ? Math.max(1, Number(clientObj.companyConfigs[compId].quantity))
      : 1;

    const finalMaterials =
      deliveredMaterials && deliveredMaterials.length > 0
        ? deliveredMaterials
        : buildDefaultDeliveredMaterials(updateObj, safeQty);

    const hasMaterialQtyDiff = finalMaterials.some(
      (m) => Number(m.deliveredQty) !== (Number(m.unitQty) || 1) * expectedQty
    );
    const isQtyModified = safeQty !== expectedQty || hasMaterialQtyDiff;
    const effectiveAlert = !!alert || isQtyModified;

    const customMatSummary = hasMaterialQtyDiff
      ? finalMaterials.map((m) => `${m.deliveredQty}x ${m.name}`).join(', ')
      : '';
    const autoNote =
      isQtyModified && !notes?.trim()
        ? customMatSummary
          ? `Variazione quantità consegnata (${safeQty} kit: ${customMatSummary})`
          : `Variazione quantità kit: consegnati ${safeQty} invece di ${expectedQty}`
        : notes || '';

    if (existingIndex >= 0) {
      const updated = [...deliveries];
      const prevRec = updated[existingIndex];
      applyDeliveryToWarehouse(compId, updateObj, prevRec.deliveredMaterials, prevRec.quantity, +1);
      applyDeliveryToWarehouse(compId, updateObj, finalMaterials, safeQty, -1);

      updated[existingIndex] = {
        ...prevRec,
        delivered: true,
        quantity: safeQty,
        expectedQuantityAtDelivery: expectedQty,
        qtyVariationAlert: isQtyModified,
        deliveredMaterials: finalMaterials,
        notes: autoNote,
        alert: effectiveAlert,
        alertResolved: effectiveAlert ? false : prevRec.alertResolved,
        deliveredAt: dateIso
      };
      updateDeliveriesCloud(updated);
    } else {
      const newRecord = {
        id: 'del_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        clientId,
        updateId,
        companyId: compId,
        agentId: currentUser.id,
        delivered: true,
        deliveredAt: dateIso,
        quantity: safeQty,
        expectedQuantityAtDelivery: expectedQty,
        qtyVariationAlert: isQtyModified,
        deliveredMaterials: finalMaterials,
        notes: autoNote,
        alert: effectiveAlert,
        alertResolved: false
      };
      applyDeliveryToWarehouse(compId, updateObj, finalMaterials, safeQty, -1);
      updateDeliveriesCloud((prev) => [...prev, newRecord]);
    }
  };

  if (!isInitialCloudLoaded) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-4 space-y-3">
        <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
        <p className="text-sm font-semibold">Connessione al Database Cloud Agenzia Dal Bo...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        cloudStatus={cloudStatus}
        cloudErrorMsg={cloudErrorMsg}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans flex flex-col">
      <header className="bg-slate-900 text-white shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 flex justify-between items-center gap-2">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="bg-indigo-600 p-2 rounded-xl shadow-sm flex-shrink-0">
              <Building2 className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-base sm:text-lg leading-tight truncate">
                Agenti & Aggiornamenti
              </h1>
              <p className="text-xs text-slate-400 truncate">
                {currentUser.role === 'office'
                  ? 'Coordinamento Sede'
                  : `Agente: ${currentUser.name}`}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
            <button
              type="button"
              onClick={() => loadFromCloud(false)}
              title="Aggiorna subito dal Cloud"
              className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1 rounded-full text-xs font-medium ${
                cloudStatus === 'error'
                  ? 'bg-rose-900/70 text-rose-200 border border-rose-700'
                  : cloudStatus === 'saving'
                  ? 'bg-amber-900/70 text-amber-200 border border-amber-700'
                  : 'bg-emerald-900/60 text-emerald-300 border border-emerald-700'
              }`}
            >
              {cloudStatus === 'error' ? (
                <WifiOff className="w-3.5 h-3.5" />
              ) : cloudStatus === 'saving' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Cloud className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">
                {cloudStatus === 'error'
                  ? 'Errore Cloud'
                  : cloudStatus === 'saving'
                  ? 'Salvataggio...'
                  : 'Cloud Sincronizzato'}
              </span>
            </button>

            <div className="flex items-center space-x-2 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700">
              <div className="text-xs text-right hidden sm:block">
                <div className="font-bold text-white">{currentUser.name}</div>
                <div className="text-[10px] text-indigo-400">
                  {currentUser.role === 'office' ? 'Sede / Admin' : 'Agente'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCurrentUser(null)}
                className="p-1.5 bg-rose-600/80 hover:bg-rose-600 text-white rounded-lg text-xs font-semibold flex items-center space-x-1"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Esci</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 py-4 sm:p-6">
        {currentUser.role === 'agent' ? (
          <AgentView
            currentUser={currentUser}
            companies={companies}
            activeCompanyId={activeCompanyId}
            setActiveCompanyId={setActiveCompanyId}
            updates={updates}
            activeUpdateId={activeUpdateId}
            setActiveUpdateId={setActiveUpdateId}
            activeYear={activeAgentYear}
            setActiveYear={setActiveAgentYear}
            clients={clients}
            deliveries={deliveries}
            onToggleDelivery={handleToggleDelivery}
            onUpdateDeliveryDetails={handleUpdateDeliveryDetails}
          />
        ) : (
          <OfficeView
            agents={agents}
            setAgents={updateAgentsCloud}
            companies={companies}
            setCompanies={updateCompaniesCloud}
            updates={updates}
            setUpdates={updateUpdatesCloud}
            clients={clients}
            setClients={updateClientsCloud}
            deliveries={deliveries}
            setDeliveries={updateDeliveriesCloud}
            warehouseItems={warehouseItems}
            setWarehouseItems={updateWarehouseCloud}
            onRestoreWarehouseFromDelivery={(del) => {
              const updObj = updates.find((u) => u.id === del.updateId);
              const cId = del.companyId || (updObj ? updObj.companyId : '');
              applyDeliveryToWarehouse(cId, updObj, del.deliveredMaterials, del.quantity, +1);
            }}
          />
        )}
      </main>
    </div>
  );
}

function LoginScreen({ onLogin, cloudStatus, cloudErrorMsg }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    const res = onLogin(email, password);
    if (!res.success) setError(res.error);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl space-y-6 p-6 md:p-8">
        <div className="text-center space-y-2">
          <div className="bg-indigo-600 w-12 h-12 rounded-xl flex items-center justify-center mx-auto shadow-md">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Agenzia Dal Bo</h2>
          <p className="text-xs text-slate-500">
            Gestione Aggiornamenti & Coordinamento Rete Vendita
          </p>
        </div>

        {cloudErrorMsg && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3 rounded-xl flex items-start">
            <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />
            <span>{cloudErrorMsg}</span>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-xl flex items-center">
            <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
              Email Utente
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="email"
                required
                placeholder="nome@agenziadalbo.it"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-md"
          >
            Accedi
          </button>
        </form>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-center space-x-1.5 text-[11px] text-slate-400">
          <Cloud
            className={`w-3.5 h-3.5 ${
              cloudStatus === 'synced' ? 'text-emerald-500' : 'text-amber-500'
            }`}
          />
          <span>
            {cloudStatus === 'synced' ? 'Database Cloud Connesso' : 'Verifica connessione...'}
          </span>
        </div>
      </div>
    </div>
  );
}

function AgentView({
  currentUser,
  companies,
  activeCompanyId,
  setActiveCompanyId,
  updates,
  activeUpdateId,
  setActiveUpdateId,
  activeYear,
  setActiveYear,
  clients,
  deliveries,
  onToggleDelivery,
  onUpdateDeliveryDetails
}) {
  const [searchTerm, setSearchTerm] = useState('');

  const availableYears = useMemo(() => {
    const yearsSet = new Set();
    updates.forEach((u) => yearsSet.add(String(u.year || new Date().getFullYear())));
    return Array.from(yearsSet).sort((a, b) => Number(b) - Number(a));
  }, [updates]);

const agentClients = useMemo(() => {
    return clients
      .filter((c) => {
        const isAssigned = c.agentId === currentUser.id || c.agentId === currentUser.name;
        const handlesCompany = Array.isArray(c.companyIds) && c.companyIds.includes(activeCompanyId);
        const matchesSearch =
          !searchTerm.trim() ||
          c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (c.province && c.province.toLowerCase().includes(searchTerm.toLowerCase()));
        return isAssigned && handlesCompany && matchesSearch;
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'it', { sensitivity: 'base' }));
  }, [clients, currentUser, activeCompanyId, searchTerm]);

  const companyUpdates = useMemo(
    () =>
      updates.filter((u) => {
        const updYear = String(u.year || new Date().getFullYear());
        return u.companyId === activeCompanyId && (activeYear === 'all' || updYear === activeYear);
      }),
    [updates, activeCompanyId, activeYear]
  );

  const currentUpdate = useMemo(
    () => companyUpdates.find((u) => u.id === activeUpdateId) || companyUpdates[0] || null,
    [companyUpdates, activeUpdateId]
  );

  const completedCount = currentUpdate
    ? agentClients.filter((c) =>
        deliveries.some((d) => d.clientId === c.id && d.updateId === currentUpdate.id && d.delivered)
      ).length
    : 0;

  const progressPct =
    agentClients.length > 0 ? Math.round((completedCount / agentClients.length) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="bg-indigo-600 p-2.5 rounded-full text-white shadow-sm flex-shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-slate-900 text-base truncate">{currentUser.name}</h2>
            <p className="text-xs text-slate-400">
              I tuoi clienti assegnati e aggiornamenti da consegnare
            </p>
          </div>
        </div>

        <div className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 flex items-center space-x-2.5">
          <div className="text-right">
            <div className="text-[10px] text-slate-500 font-bold uppercase">Completamento</div>
            <div className="text-xs font-bold text-slate-800">
              {completedCount} / {agentClients.length} Clienti
            </div>
          </div>
          <div className="w-9 h-9 rounded-full border-4 border-indigo-600 flex items-center justify-center text-xs font-bold text-indigo-600">
            {progressPct}%
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          1. Seleziona Azienda Mandante
        </h2>
        {companies.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-sm">
            Nessuna azienda disponibile. Attendi l'inserimento da parte della Sede.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {companies.map((comp) => {
              const isActive = comp.id === activeCompanyId;
              return (
                <button
                  key={comp.id}
                  onClick={() => setActiveCompanyId(comp.id)}
                  className={`p-3.5 rounded-xl border text-left font-semibold text-sm flex items-center justify-between ${
                    isActive
                      ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">{comp.name}</span>
                  {isActive && <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 ml-1" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {activeCompanyId && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-3.5 sm:p-4 space-y-3.5">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            2. Seleziona Aggiornamento / Catalogo
          </h2>

          {availableYears.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setActiveYear('all')}
                className={`p-2.5 rounded-xl border text-left flex items-center justify-between ${
                  activeYear === 'all'
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <span className="font-bold text-xs">Tutti gli Anni</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/10">
                  {updates.filter((u) => u.companyId === activeCompanyId).length}
                </span>
              </button>

              {availableYears.map((yr) => {
                const countInYear = updates.filter(
                  (u) =>
                    u.companyId === activeCompanyId &&
                    String(u.year || new Date().getFullYear()) === yr
                ).length;
                const isSelected = activeYear === yr;
                return (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => setActiveYear(yr)}
                    className={`p-2.5 rounded-xl border text-left flex items-center justify-between ${
                      isSelected
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : 'bg-amber-50/60 border-amber-200 text-amber-950'
                    }`}
                  >
                    <span className="font-bold text-xs">Anno {yr}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/10">
                      {countInYear}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {companyUpdates.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl text-sm">
              Nessun aggiornamento attivo in questa cartella.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {companyUpdates.map((upd) => {
                  const isSelected = currentUpdate && upd.id === currentUpdate.id;
                  return (
                    <button
                      key={upd.id}
                      onClick={() => setActiveUpdateId(upd.id)}
                      className={`px-4 py-2.5 rounded-xl text-sm font-semibold border flex items-center space-x-2 ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      <FileText className="w-4 h-4" />
                      <span>{upd.title}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/10 font-bold">
                        {upd.year || new Date().getFullYear()}
                      </span>
                    </button>
                  );
                })}
              </div>

              {currentUpdate && (
                <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3.5">
                  <div className="text-xs font-bold text-indigo-950">
                    Contenuto Standard (1 Kit = {currentUpdate.title}):
                  </div>
                  {Array.isArray(currentUpdate.contentItems) &&
                  currentUpdate.contentItems.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {currentUpdate.contentItems.map((item) => (
                        <span
                          key={item.id}
                          className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-white text-indigo-700 border border-indigo-200"
                        >
                          {item.qty}x {item.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-indigo-700/80 mt-0.5">Aggiornamento standard</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeCompanyId && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-800">3. Elenco Clienti da Servire</h2>
              <p className="text-xs text-slate-400">
                Spunta il cliente o apri i dettagli per modificare le quantità (invia alert automatico alla Sede)
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Cerca cliente o prov..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
          </div>

          {!currentUpdate ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              Seleziona un aggiornamento attivo per visualizzare i clienti.
            </div>
          ) : agentClients.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              Nessun cliente assegnato per questa azienda.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {agentClients.map((client) => {
                const delivery = deliveries.find(
                  (d) => d.clientId === client.id && d.updateId === currentUpdate.id && d.delivered
                );
                const defaultTargetQty = client.companyConfigs?.[activeCompanyId]?.quantity
                  ? Math.max(1, Number(client.companyConfigs[activeCompanyId].quantity) || 1)
                  : 1;

                return (
                  <ClientDeliveryRow
                    key={client.id}
                    client={client}
                    currentUpdate={currentUpdate}
                    delivery={delivery}
                    defaultTargetQty={defaultTargetQty}
                    onToggle={() => onToggleDelivery(client.id, currentUpdate.id, defaultTargetQty)}
                    onSaveDetails={(qty, deliveredMaterials, notes, alert, dateIso) =>
                      onUpdateDeliveryDetails(
                        client.id,
                        currentUpdate.id,
                        qty,
                        deliveredMaterials,
                        notes,
                        alert,
                        dateIso
                      )
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ClientDeliveryRow({
  client,
  currentUpdate,
  delivery,
  defaultTargetQty,
  onToggle,
  onSaveDetails
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [quantity, setQuantity] = useState(delivery ? delivery.quantity : defaultTargetQty);
  const [materialsState, setMaterialsState] = useState([]);
  const [notes, setNotes] = useState(delivery ? delivery.notes : '');
  const [alert, setAlert] = useState(delivery ? delivery.alert : false);
  const [customDateLocal, setCustomDateLocal] = useState('');
  const [savedBadge, setSavedBadge] = useState(false);

  const hasContentItems =
    currentUpdate && Array.isArray(currentUpdate.contentItems) && currentUpdate.contentItems.length > 0;

  useEffect(() => {
    if (showDetails) return;
    const baseQty = delivery ? delivery.quantity || defaultTargetQty : defaultTargetQty;
    setQuantity(baseQty);
    setNotes(delivery ? delivery.notes || '' : '');
    setAlert(delivery ? !!delivery.alert : false);
    setCustomDateLocal(delivery ? toDateTimeLocal(delivery.deliveredAt) : toDateTimeLocal());

    if (hasContentItems) {
      setMaterialsState(
        currentUpdate.contentItems.map((item) => {
          const existingMat = delivery?.deliveredMaterials?.find(
            (m) => m.id === item.id || m.name === item.name
          );
          const unitQty = Number(item.qty) || 1;
          return {
            id: item.id,
            name: item.name,
            unitQty,
            deliveredQty: existingMat ? Number(existingMat.deliveredQty) : unitQty * baseQty
          };
        })
      );
    } else {
      setMaterialsState([]);
    }
  }, [delivery, defaultTargetQty, currentUpdate, hasContentItems, showDetails]);

  const handleKitQuantityChange = (newKitQty) => {
    const safeKit = Math.max(1, newKitQty);
    setQuantity(safeKit);
    if (hasContentItems) {
      setMaterialsState((prev) =>
        prev.map((m) => ({ ...m, deliveredQty: m.unitQty * safeKit }))
      );
    }
  };

  const handleSingleMaterialChange = (matId, delta) => {
    setMaterialsState((prev) =>
      prev.map((m) =>
        m.id === matId ? { ...m, deliveredQty: Math.max(0, m.deliveredQty + delta) } : m
      )
    );
  };

  const hasMaterialDiff = materialsState.some(
    (m) => m.deliveredQty !== m.unitQty * defaultTargetQty
  );
  const hasNotes = notes.trim().length > 0;
  const isQtyDifferentFromExpected = quantity !== defaultTargetQty || hasMaterialDiff;
  const autoAlertRequired = isQtyDifferentFromExpected || hasNotes;

  const handleSave = () => {
    const isoDate = customDateLocal
      ? new Date(customDateLocal).toISOString()
      : new Date().toISOString();
    onSaveDetails(
      quantity,
      materialsState.map((m) => ({
        id: m.id,
        name: m.name,
        unitQty: m.unitQty,
        deliveredQty: m.deliveredQty
      })),
      notes,
      alert || autoAlertRequired,
      isoDate
    );
    setSavedBadge(true);
    setTimeout(() => {
      setSavedBadge(false);
      setShowDetails(false);
    }, 800);
  };

  const handleCancelDelivery = () => {
    onToggle();
    setShowDetails(false);
  };

  const isDelivered = !!delivery;

  return (
    <div className="py-3.5 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-start space-x-3 min-w-0">
          <div
            title={
              isDelivered
                ? 'Consegna confermata'
                : 'Apri Dettagli / Materiali e clicca Conferma & Salva'
            }
            className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center border flex-shrink-0 ${
              isDelivered
                ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                : 'border-slate-300 bg-slate-100 text-slate-300'
            }`}
          >
            <Check className="w-4 h-4 stroke-[3]" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`font-bold text-sm ${
                  isDelivered ? 'line-through text-slate-500' : 'text-slate-900'
                }`}
              >
                {client.name}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                Spettanti: {defaultTargetQty}
              </span>
              {delivery?.alert && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  Alert Sede
                </span>
              )}
            </div>

            <div className="text-xs text-slate-400 flex flex-wrap items-center gap-3 mt-1">
              <span>
                Prov: <strong className="text-slate-600">{client.province}</strong>
              </span>
              {isDelivered && (
                <span className="text-emerald-600 font-medium">
                  {formatDisplayDate(delivery.deliveredAt)}
                </span>
              )}
            </div>

            {isDelivered && delivery.deliveredMaterials?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {delivery.deliveredMaterials.map((mat, idx) => (
                  <span
                    key={idx}
                    className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200"
                  >
                    {mat.deliveredQty}x {mat.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="self-start sm:self-center text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1.5 rounded-lg flex items-center space-x-1"
        >
          <span>{showDetails ? 'Chiudi' : 'Dettagli / Materiali'}</span>
          {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {showDetails && (
        <div className="bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-200 space-y-4 text-xs sm:ml-9">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Data & Ora Consegna</label>
              <input
                type="datetime-local"
                value={customDateLocal}
                onChange={(e) => setCustomDateLocal(e.target.value)}
                className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1">
                Kit / Aggiornamenti Rilasciati
              </label>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleKitQuantityChange(quantity - 1)}
                  className="w-8 h-8 bg-white border border-slate-200 rounded-lg font-bold"
                >
                  -
                </button>
                <span className="font-bold text-sm px-3">{quantity}</span>
                <button
                  type="button"
                  onClick={() => handleKitQuantityChange(quantity + 1)}
                  className="w-8 h-8 bg-white border border-slate-200 rounded-lg font-bold"
                >
                  +
                </button>
                <span className="text-[11px] text-slate-400">(Spettanti: {defaultTargetQty})</span>
              </div>
            </div>
          </div>

          {hasContentItems && (
            <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
              <div className="font-bold text-slate-700 text-xs">
                Singoli Materiali Consegnati
              </div>
              <div className="divide-y divide-slate-100">
                {materialsState.map((mat) => (
                  <div key={mat.id} className="py-2 flex items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-slate-800">{mat.name}</span>
                      <span className="text-[10px] text-slate-400 ml-1.5">
                        ({mat.unitQty} per kit)
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => handleSingleMaterialChange(mat.id, -1)}
                        className="w-7 h-7 bg-slate-100 rounded-lg font-bold"
                      >
                        -
                      </button>
                      <span className="font-black w-6 text-center">{mat.deliveredQty}</span>
                      <button
                        type="button"
                        onClick={() => handleSingleMaterialChange(mat.id, 1)}
                        className="w-7 h-7 bg-slate-100 rounded-lg font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-slate-600 font-bold mb-1">Note Consegna</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Es. Lasciato materiale extra..."
              className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
            <div>
              <label className="flex items-center space-x-2 cursor-pointer text-amber-700 font-semibold">
                <input
                  type="checkbox"
                  checked={alert || autoAlertRequired}
                  disabled={autoAlertRequired}
                  onChange={(e) => setAlert(e.target.checked)}
                  className="rounded border-amber-300 text-amber-600"
                />
                <span>Segnala Alert a Sede</span>
              </label>
              {autoAlertRequired && (
                <p className="text-[11px] text-indigo-700 font-semibold mt-0.5">
                  Alert automatico attivo (verrà notificato alla Sede al salvataggio).
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isDelivered && (
                <button
                  type="button"
                  onClick={handleCancelDelivery}
                  className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-bold rounded-xl text-xs"
                >
                  Annulla Consegna
                </button>
              )}
              {savedBadge && <span className="text-emerald-600 font-bold text-xs">Salvato!</span>}
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs"
              >
                Conferma & Salva
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OfficeView({
  agents,
  setAgents,
  companies,
  setCompanies,
  updates,
  setUpdates,
  clients,
  setClients,
  deliveries,
  setDeliveries,
  warehouseItems,
  setWarehouseItems,
  onRestoreWarehouseFromDelivery
}) {
  const [activeTab, setActiveTab] = useState('dashboard');

  const activeAlertsCount = useMemo(
    () => deliveries.filter((d) => d.delivered && d.alert && !d.alertResolved).length,
    [deliveries]
  );
  const lowStockWarehouseCount = useMemo(
    () => warehouseItems.filter((w) => Number(w.quantity) < 5).length,
    [warehouseItems]
  );

  return (
    <div className="space-y-6">
      <div className="bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-2 sm:flex sm:flex-wrap gap-1">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: BarChart2 },
          { id: 'totals', label: 'Fabbisogno & Totali', icon: Box },
          { id: 'history', label: 'Registro Consegne', icon: ClipboardList },
          {
            id: 'warehouse',
            label: 'Magazzino',
            icon: Package,
            badge: lowStockWarehouseCount,
            badgeColor: 'bg-rose-600'
          },
          { id: 'alerts', label: 'Alert Materiali', icon: AlertTriangle, badge: activeAlertsCount },
          { id: 'clients', label: 'Gestione Clienti', icon: Users },
          { id: 'companies', label: 'Aziende & Cataloghi', icon: Building2 },
          { id: 'agents', label: 'Anagrafica Agenti', icon: Shield }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center justify-center sm:justify-start space-x-1.5 px-2.5 sm:px-3.5 py-2 rounded-xl text-xs font-semibold ${
                isActive ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{tab.label}</span>
              {tab.badge > 0 && (
                <span
                  className={`${
                    tab.badgeColor || 'bg-amber-500'
                  } text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === 'dashboard' && (
        <DashboardTab
          agents={agents}
          updates={updates}
          clients={clients}
          deliveries={deliveries}
          warehouseItems={warehouseItems}
          onNavigate={setActiveTab}
        />
      )}
      {activeTab === 'totals' && (
        <RequirementsTotalsTab
          companies={companies}
          updates={updates}
          clients={clients}
          deliveries={deliveries}
        />
      )}
      {activeTab === 'history' && (
        <DeliveryRegistryTab
          agents={agents}
          companies={companies}
          updates={updates}
          clients={clients}
          deliveries={deliveries}
          setDeliveries={setDeliveries}
          onRestoreWarehouseFromDelivery={onRestoreWarehouseFromDelivery}
        />
      )}
      {activeTab === 'warehouse' && (
        <WarehouseManagerTab
          companies={companies}
          updates={updates}
          warehouseItems={warehouseItems}
          setWarehouseItems={setWarehouseItems}
        />
      )}
      {activeTab === 'alerts' && (
        <AlertsTab
          agents={agents}
          companies={companies}
          updates={updates}
          clients={clients}
          setClients={setClients}
          deliveries={deliveries}
          setDeliveries={setDeliveries}
        />
      )}
      {activeTab === 'clients' && (
        <ClientsManagerTab
          agents={agents}
          companies={companies}
          clients={clients}
          setClients={setClients}
          setDeliveries={setDeliveries}
        />
      )}
      {activeTab === 'companies' && (
        <CompaniesUpdatesTab
          companies={companies}
          setCompanies={setCompanies}
          updates={updates}
          setUpdates={setUpdates}
          setDeliveries={setDeliveries}
        />
      )}
      {activeTab === 'agents' && (
        <AgentsManagerTab
          agents={agents}
          setAgents={setAgents}
          clients={clients}
          setClients={setClients}
        />
      )}
    </div>
  );
}

function DashboardTab({ agents, updates, clients, deliveries, warehouseItems = [], onNavigate }) {
  const deliveredRecords = deliveries.filter((d) => d.delivered);
  const activeAlerts = deliveredRecords.filter((d) => d.alert && !d.alertResolved);
  const lowStockCount = warehouseItems.filter((w) => Number(w.quantity) < 5).length;
  const fieldAgents = agents.filter((a) => a.role === 'agent');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase">Consegne Registrate</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{deliveredRecords.length}</div>
        </div>
        <div
          onClick={() => onNavigate('alerts')}
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:border-amber-300"
        >
          <div className="text-xs font-bold text-amber-500 uppercase">Alert Materiale Aperti</div>
          <div className="text-2xl font-black text-amber-600 mt-1">{activeAlerts.length}</div>
        </div>
        <div
          onClick={() => onNavigate('warehouse')}
          className={`bg-white p-4 rounded-2xl border shadow-sm cursor-pointer ${
            lowStockCount > 0 ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200'
          }`}
        >
          <div className="text-xs font-bold text-rose-600 uppercase">Scorte sotto 5 pz</div>
          <div className="text-2xl font-black text-rose-600 mt-1">{lowStockCount}</div>
        </div>
        <div
          onClick={() => onNavigate('totals')}
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm cursor-pointer"
        >
          <div className="text-xs font-bold text-emerald-600 uppercase">Cataloghi Pubblicati</div>
          <div className="text-2xl font-black text-emerald-600 mt-1">{updates.length}</div>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-800 text-sm">Avanzamento Consegne per Agente</h3>
        {fieldAgents.length === 0 ? (
          <p className="text-xs text-slate-400">Nessun agente registrato.</p>
        ) : (
          <div className="space-y-4">
            {fieldAgents.map((ag) => {
              const agClients = clients.filter((c) => c.agentId === ag.id || c.agentId === ag.name);
              let totalExpected = 0;
              agClients.forEach((cl) => {
                (cl.companyIds || []).forEach((compId) => {
                  totalExpected += updates.filter((u) => u.companyId === compId).length;
                });
              });
              const agCompleted = deliveredRecords.filter((d) => d.agentId === ag.id).length;
              const pct =
                totalExpected > 0 ? Math.min(100, Math.round((agCompleted / totalExpected) * 100)) : 0;
              return (
                <div key={ag.id} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>{ag.name}</span>
                    <span className="text-indigo-600">
                      {agCompleted} / {totalExpected} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5">
                    <div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function RequirementsTotalsTab({ companies, updates, clients, deliveries }) {
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState('');
  const [selectedYearFolder, setSelectedYearFolder] = useState('all');

  const availableYears = useMemo(() => {
    const s = new Set();
    updates.forEach((u) => s.add(String(u.year || new Date().getFullYear())));
    return Array.from(s).sort((a, b) => Number(b) - Number(a));
  }, [updates]);

  const visibleCompanies = useMemo(
    () => (selectedCompanyFilter ? companies.filter((c) => c.id === selectedCompanyFilter) : companies),
    [companies, selectedCompanyFilter]
  );

  const handleExport = () => {
    const headers = ['Anno', 'Azienda', 'Catalogo', 'Clienti', 'Necessari', 'Consegnati', 'Mancanti'];
    const rows = [];
    visibleCompanies.forEach((comp) => {
      const compClients = clients.filter((c) => c.companyIds?.includes(comp.id));
      const expectedKits = compClients.reduce(
        (sum, cl) => sum + Math.max(1, Number(cl.companyConfigs?.[comp.id]?.quantity) || 1),
        0
      );
      updates
        .filter(
          (u) =>
            u.companyId === comp.id &&
            (selectedYearFolder === 'all' || String(u.year || new Date().getFullYear()) === selectedYearFolder)
        )
        .forEach((upd) => {
          const delivKits = deliveries
            .filter((d) => d.updateId === upd.id && d.delivered)
            .reduce((sum, d) => sum + (Number(d.quantity) || 1), 0);
          rows.push([
            upd.year || new Date().getFullYear(),
            comp.name,
            upd.title,
            compClients.length,
            expectedKits,
            delivKits,
            Math.max(0, expectedKits - delivKits)
          ]);
        });
    });
    exportToExcelCSV('Fabbisogno_Aggiornamenti', headers, rows);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-bold text-slate-900 text-base">Fabbisogno Totale per Azienda</h3>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedYearFolder}
            onChange={(e) => setSelectedYearFolder(e.target.value)}
            className="text-xs p-2 border border-slate-200 rounded-xl bg-slate-50 font-semibold"
          >
            <option value="all">Tutti gli Anni</option>
            {availableYears.map((yr) => (
              <option key={yr} value={yr}>
                Anno {yr}
              </option>
            ))}
          </select>
          <select
            value={selectedCompanyFilter}
            onChange={(e) => setSelectedCompanyFilter(e.target.value)}
            className="text-xs p-2 border border-slate-200 rounded-xl bg-slate-50 font-semibold"
          >
            <option value="">Tutte le Aziende</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleExport}
            className="px-3.5 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Esporta Excel</span>
          </button>
        </div>
      </div>

      {visibleCompanies.map((company) => {
        const companyClients = clients.filter((c) => c.companyIds?.includes(company.id));
        const totalExpected = companyClients.reduce(
          (sum, cl) => sum + Math.max(1, Number(cl.companyConfigs?.[company.id]?.quantity) || 1),
          0
        );
        const companyUpdates = updates.filter(
          (u) =>
            u.companyId === company.id &&
            (selectedYearFolder === 'all' || String(u.year || new Date().getFullYear()) === selectedYearFolder)
        );
        return (
          <div key={company.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
              <div>
                <div className="font-bold text-base">{company.name}</div>
                <div className="text-xs text-slate-400">{companyClients.length} clienti</div>
              </div>
              <div className="text-sm font-black bg-indigo-600/30 px-3 py-1.5 rounded-xl">
                {totalExpected} Kit Totali
              </div>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {companyUpdates.map((upd) => {
                const delivKits = deliveries
                  .filter((d) => d.updateId === upd.id && d.delivered)
                  .reduce((sum, d) => sum + (Number(d.quantity) || 1), 0);
                return (
                  <div key={upd.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-2">
                    <div className="font-bold text-sm">
                      {upd.title} ({upd.year || new Date().getFullYear()})
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center bg-white p-2 rounded-lg border border-slate-200 text-xs">
                      <div>
                        <div className="text-slate-400 font-bold">Necessari</div>
                        <div className="font-black">{totalExpected}</div>
                      </div>
                      <div>
                        <div className="text-emerald-600 font-bold">Consegnati</div>
                        <div className="font-black text-emerald-600">{delivKits}</div>
                      </div>
                      <div>
                        <div className="text-amber-600 font-bold">Mancanti</div>
                        <div className="font-black text-amber-600">
                          {Math.max(0, totalExpected - delivKits)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DeliveryRegistryTab({
  agents,
  companies,
  updates,
  clients,
  deliveries,
  setDeliveries,
  onRestoreWarehouseFromDelivery
}) {
  const [selectedYearFolder, setSelectedYearFolder] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');

  const availableYears = useMemo(() => {
    const s = new Set();
    updates.forEach((u) => s.add(String(u.year || new Date().getFullYear())));
    return Array.from(s).sort((a, b) => Number(b) - Number(a));
  }, [updates]);

  const unifiedRows = useMemo(() => {
    const rows = [];
    updates.forEach((upd) => {
      const updYear = String(upd.year || new Date().getFullYear());
      const comp = companies.find((c) => c.id === upd.companyId);
      clients
        .filter((cl) => cl.companyIds?.includes(upd.companyId))
        .forEach((cl) => {
          const ag = agents.find((a) => a.id === cl.agentId || a.name === cl.agentId);
          const deliv = deliveries.find(
            (d) => d.clientId === cl.id && d.updateId === upd.id && d.delivered
          );
          const expectedQty = cl.companyConfigs?.[upd.companyId]?.quantity
            ? Math.max(1, Number(cl.companyConfigs[upd.companyId].quantity))
            : 1;
          rows.push({
            rowKey: `${upd.id}_${cl.id}`,
            year: updYear,
            status: deliv ? 'delivered' : 'missing',
            delivery: deliv || null,
            client: cl,
            agent: ag || null,
            company: comp || null,
            update: upd,
            expectedQty,
            deliveredQty: deliv ? Number(deliv.quantity) || 1 : 0,
            deliveredMaterials: deliv?.deliveredMaterials || [],
            deliveredAt: deliv?.deliveredAt || null,
            notes: deliv?.notes || '',
            alert: deliv ? !!deliv.alert : false
          });
        });
    });

    return rows.filter((r) => {
      if (selectedYearFolder !== 'all' && r.year !== selectedYearFolder) return false;
      if (statusFilter === 'delivered' && r.status !== 'delivered') return false;
      if (statusFilter === 'missing' && r.status !== 'missing') return false;
      if (companyFilter && r.company?.id !== companyFilter) return false;
      if (agentFilter && r.agent?.id !== agentFilter) return false;
      if (searchInput.trim()) {
        const q = searchInput.trim().toLowerCase();
        const hay = `${r.client?.name} ${r.client?.province} ${r.agent?.name} ${r.company?.name} ${r.update?.title} ${r.notes}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [updates, companies, clients, agents, deliveries, selectedYearFolder, statusFilter, companyFilter, agentFilter, searchInput]);

  const handleDeleteDelivery = (deliveryId) => {
    const target = deliveries.find((d) => d.id === deliveryId);
    if (target && onRestoreWarehouseFromDelivery) onRestoreWarehouseFromDelivery(target);
    setDeliveries((prev) => prev.filter((d) => d.id !== deliveryId));
  };

  const handleExport = () => {
    const headers = ['Anno', 'Stato', 'Cliente', 'Prov', 'Azienda', 'Catalogo', 'Agente', 'Data', 'Spettanti', 'Consegnati', 'Note'];
    const rows = unifiedRows.map((r) => [
      r.year,
      r.status === 'delivered' ? 'Consegnato' : 'Mancante',
      r.client?.name || '',
      r.client?.province || '',
      r.company?.name || '',
      r.update?.title || '',
      r.agent?.name || '',
      r.status === 'delivered' ? formatDisplayDate(r.deliveredAt) : 'In attesa',
      r.expectedQty,
      r.status === 'delivered' ? r.deliveredQty : 0,
      r.notes
    ]);
    exportToExcelCSV('Registro_Consegne', headers, rows);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Cerca cliente, agente, azienda..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
          />
          <select
            value={selectedYearFolder}
            onChange={(e) => setSelectedYearFolder(e.target.value)}
            className="py-2 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl"
          >
            <option value="all">Tutti gli Anni</option>
            {availableYears.map((yr) => (
              <option key={yr} value={yr}>
                Anno {yr}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-2 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl"
          >
            <option value="all">Tutti ({unifiedRows.length})</option>
            <option value="delivered">Solo Consegnati</option>
            <option value="missing">Solo Mancanti</option>
          </select>
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="py-2 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl"
          >
            <option value="">Tutte le Aziende</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="py-2 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl"
          >
            <option value="">Tutti gli Agenti</option>
            {agents
              .filter((a) => a.role === 'agent')
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
          <button
            type="button"
            onClick={handleExport}
            className="px-3.5 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl flex items-center space-x-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Esporta Excel</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
            <tr>
              <th className="p-3">Stato</th>
              <th className="p-3">Cliente</th>
              <th className="p-3">Azienda / Catalogo</th>
              <th className="p-3">Agente</th>
              <th className="p-3">Data</th>
              <th className="p-3">Materiali</th>
              <th className="p-3">Note / Alert</th>
              <th className="p-3 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {unifiedRows.map((row) => (
              <tr key={row.rowKey} className={row.status === 'delivered' ? '' : 'bg-amber-50/30'}>
                <td className="p-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      row.status === 'delivered'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {row.status === 'delivered' ? 'Consegnato' : 'Mancante'}
                  </span>
                </td>
                <td className="p-3 font-bold">
                  {row.client?.name} ({row.client?.province})
                </td>
                <td className="p-3">
                  {row.company?.name} - <strong>{row.update?.title}</strong>
                </td>
                <td className="p-3">{row.agent?.name || '-'}</td>
                <td className="p-3">
                  {row.status === 'delivered' ? formatDisplayDate(row.deliveredAt) : 'In attesa'}
                </td>
                <td className="p-3">
                  {row.status === 'delivered' ? (
                    <div>
                      <strong>{row.deliveredQty} kit</strong>
                      {row.deliveredMaterials.map((m, i) => (
                        <span key={i} className="ml-1 px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px]">
                          {m.deliveredQty}x {m.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span>Spettanti: {row.expectedQty}</span>
                  )}
                </td>
                <td className="p-3">
                  {row.alert && (
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded mr-1">
                      Alert
                    </span>
                  )}
                  {row.notes || '-'}
                </td>
                <td className="p-3 text-right">
                  {row.status === 'delivered' && (
                    <button
                      onClick={() => handleDeleteDelivery(row.delivery.id)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WarehouseManagerTab({ companies, updates, warehouseItems, setWarehouseItems }) {
  const [companyId, setCompanyId] = useState('');
  const [materialName, setMaterialName] = useState('');
  const [quantity, setQuantity] = useState(10);
  const [notes, setNotes] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  const suggestedMaterialNames = useMemo(() => {
    const set = new Set();
    updates.forEach((u) => {
      if (u.title) set.add(u.title);
      (u.contentItems || []).forEach((it) => {
        if (it.name) set.add(it.name);
      });
    });
    return Array.from(set);
  }, [updates]);

  const handleAddStockItem = (e) => {
    e.preventDefault();
    if (!materialName.trim()) return;
    const cleanName = materialName.trim();
    const qtyToAdd = Math.max(0, parseInt(quantity, 10) || 0);

    const existingIndex = warehouseItems.findIndex(
      (w) =>
        (w.name || '').trim().toLowerCase() === cleanName.toLowerCase() &&
        (w.companyId || '') === (companyId || '')
    );

    if (existingIndex >= 0) {
      const updated = [...warehouseItems];
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: (Number(updated[existingIndex].quantity) || 0) + qtyToAdd,
        notes: notes.trim() || updated[existingIndex].notes,
        updatedAt: new Date().toISOString()
      };
      setWarehouseItems(updated);
    } else {
      setWarehouseItems((prev) => [
        {
          id: 'wh_' + Date.now(),
          companyId: companyId || '',
          name: cleanName,
          quantity: qtyToAdd,
          notes: notes.trim(),
          updatedAt: new Date().toISOString()
        },
        ...prev
      ]);
    }
    setMaterialName('');
    setQuantity(10);
    setNotes('');
  };

  const handleAdjustQuantity = (id, delta) => {
    setWarehouseItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              quantity: Math.max(0, (Number(item.quantity) || 0) + delta),
              updatedAt: new Date().toISOString()
            }
          : item
      )
    );
  };

  const lowStockItems = useMemo(
    () => warehouseItems.filter((w) => Number(w.quantity) < 5),
    [warehouseItems]
  );

  const filteredItems = useMemo(() => {
    return warehouseItems.filter((item) => {
      if (onlyLowStock && Number(item.quantity) >= 5) return false;
      if (searchFilter.trim()) {
        const q = searchFilter.trim().toLowerCase();
        if (!(item.name || '').toLowerCase().includes(q) && !(item.notes || '').toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [warehouseItems, onlyLowStock, searchFilter]);

  return (
    <div className="space-y-6">
      {lowStockItems.length > 0 && (
        <div className="bg-rose-50 border border-rose-300 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div className="text-xs text-rose-800">
            <strong>Attenzione ({lowStockItems.length} articoli sotto 5 pz):</strong>{' '}
            {lowStockItems.map((i) => `${i.name} (${i.quantity} pz)`).join(', ')}
          </div>
          <button
            type="button"
            onClick={() => setOnlyLowStock(!onlyLowStock)}
            className="px-3 py-1.5 bg-rose-600 text-white text-xs font-bold rounded-xl"
          >
            {onlyLowStock ? 'Mostra Tutto' : 'Solo Scorte Basse'}
          </button>
        </div>
      )}

      <form onSubmit={handleAddStockItem} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-900 text-base">Carico Materiali a Magazzino</h3>
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="sm:col-span-3 p-2.5 text-xs border border-slate-200 rounded-xl bg-white"
          >
            <option value="">-- Generico / Tutte --</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            required
            list="warehouse-suggestions"
            placeholder="Nome materiale (es. Catalogo, Listino)"
            value={materialName}
            onChange={(e) => setMaterialName(e.target.value)}
            className="sm:col-span-4 p-2.5 text-xs border border-slate-200 rounded-xl"
          />
          <datalist id="warehouse-suggestions">
            {suggestedMaterialNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <input
            type="number"
            required
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="sm:col-span-2 p-2.5 text-xs border border-slate-200 rounded-xl font-bold text-center"
          />
          <input
            type="text"
            placeholder="Note / Scaffale"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="sm:col-span-3 p-2.5 text-xs border border-slate-200 rounded-xl"
          />
        </div>
        <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl">
          + Carica a Magazzino
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center gap-2">
          <span className="font-bold text-sm">Giacenze ({filteredItems.length})</span>
          <input
            type="text"
            placeholder="Cerca..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl"
          />
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
            <tr>
              <th className="p-3">Materiale</th>
              <th className="p-3">Azienda</th>
              <th className="p-3 text-center">Giacenza</th>
              <th className="p-3">Stato</th>
              <th className="p-3 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredItems.map((item) => {
              const comp = companies.find((c) => c.id === item.companyId);
              const qty = Number(item.quantity) || 0;
              const isLow = qty < 5;
              return (
                <tr key={item.id} className={isLow ? 'bg-rose-50/80' : ''}>
                  <td className={`p-3 font-bold ${isLow ? 'text-rose-600' : ''}`}>{item.name}</td>
                  <td className="p-3">{comp ? comp.name : 'Generico'}</td>
                  <td className="p-3 text-center">
                    <div className="inline-flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => handleAdjustQuantity(item.id, -1)}
                        className="w-7 h-7 bg-white border border-slate-200 rounded font-bold"
                      >
                        -
                      </button>
                      <span className="font-black w-8">{qty}</span>
                      <button
                        type="button"
                        onClick={() => handleAdjustQuantity(item.id, +1)}
                        className="w-7 h-7 bg-white border border-slate-200 rounded font-bold"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className="p-3">
                    {isLow ? (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700">
                        Scorta bassa (sotto 5 pz)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700">
                        Disponibile
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() => setWarehouseItems((prev) => prev.filter((w) => w.id !== item.id))}
                      className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AlertsTab({ agents, companies, updates, clients, setClients, deliveries, setDeliveries }) {
  const alertDeliveries = deliveries.filter((d) => d.delivered && d.alert);

  const handleResolveAlert = (id) => {
    setDeliveries((prev) => prev.map((d) => (d.id === id ? { ...d, alertResolved: true } : d)));
  };

  const handleApplyQtyToClientMaster = (del) => {
    const update = updates.find((u) => u.id === del.updateId);
    const compId = update ? update.companyId : del.companyId;
    const newQty = Math.max(1, Number(del.quantity) || 1);

    if (compId && del.clientId) {
      setClients((prev) =>
        prev.map((c) => {
          if (c.id !== del.clientId) return c;
          const existingIds = Array.isArray(c.companyIds) ? c.companyIds : [];
          return {
            ...c,
            companyIds: existingIds.includes(compId) ? existingIds : [...existingIds, compId],
            companyConfigs: {
              ...(c.companyConfigs || {}),
              [compId]: { enabled: true, quantity: newQty }
            }
          };
        })
      );
    }
    setDeliveries((prev) =>
      prev.map((d) => (d.id === del.id ? { ...d, alertResolved: true, masterUpdated: true } : d))
    );
  };

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <h3 className="font-bold text-slate-900 text-base">
        Alert Materiali & Variazioni Quantità ({alertDeliveries.length})
      </h3>
      {alertDeliveries.length === 0 ? (
        <p className="text-center py-8 text-slate-400 text-sm">Nessun alert aperto.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {alertDeliveries.map((del) => {
            const client = clients.find((c) => c.id === del.clientId);
            const agent = agents.find((a) => a.id === del.agentId);
            const update = updates.find((u) => u.id === del.updateId);
            const company = companies.find((c) => c.id === (update ? update.companyId : del.companyId));
            const deliveredQty = Number(del.quantity) || 1;
            const currentMasterQty =
              company && client?.companyConfigs?.[company.id]?.quantity
                ? Number(client.companyConfigs[company.id].quantity)
                : 1;

            return (
              <div key={del.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="font-bold text-sm">
                    {client?.name} ({client?.province}){' '}
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded ml-1 ${
                        del.alertResolved ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {del.alertResolved ? 'Gestito' : 'Da Gestire'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    Agente: <strong>{agent?.name}</strong> | {company?.name} - {update?.title} | Consegnati:{' '}
                    <strong>{deliveredQty} kit</strong>
                  </div>
                  {del.notes && (
                    <div className="text-xs bg-amber-50 text-amber-900 p-2 rounded-lg border border-amber-200">
                      {del.notes}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {currentMasterQty !== deliveredQty && (
                    <button
                      type="button"
                      onClick={() => handleApplyQtyToClientMaster(del)}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold"
                    >
                      Aggiorna Anagrafica a {deliveredQty}
                    </button>
                  )}
                  {!del.alertResolved && (
                    <button
                      type="button"
                      onClick={() => handleResolveAlert(del.id)}
                      className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold"
                    >
                      Marca Evaso
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setDeliveries((prev) =>
                        prev.map((d) => (d.id === del.id ? { ...d, alert: false } : d))
                      )
                    }
                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ClientsManagerTab({ agents, companies, clients, setClients, setDeliveries }) {
  const [editingClientId, setEditingClientId] = useState(null);
  const [name, setName] = useState('');
  const [province, setProvince] = useState('');
  const [agentId, setAgentId] = useState('');
  const [companyConfigs, setCompanyConfigs] = useState({});
  const [searchFilter, setSearchFilter] = useState('');

  const fieldAgents = agents.filter((a) => a.role === 'agent');

  const handleSaveClient = (e) => {
    e.preventDefault();
    if (!name.trim() || !province.trim() || !agentId) return;
    const activeCompanyIds = Object.keys(companyConfigs).filter((id) => companyConfigs[id]?.enabled);

    if (editingClientId) {
      setClients((prev) =>
        prev.map((c) =>
          c.id === editingClientId
            ? {
                ...c,
                name: name.trim(),
                province: province.trim().toUpperCase(),
                agentId,
                companyIds: activeCompanyIds,
                companyConfigs
              }
            : c
        )
      );
      setEditingClientId(null);
    } else {
      setClients((prev) => [
        ...prev,
        {
          id: 'cl_' + Date.now(),
          name: name.trim(),
          province: province.trim().toUpperCase(),
          agentId,
          companyIds: activeCompanyIds,
          companyConfigs
        }
      ]);
    }
    setName('');
    setProvince('');
    setAgentId('');
    setCompanyConfigs({});
  };

  const handleEditClient = (cl) => {
    setEditingClientId(cl.id);
    setName(cl.name);
    setProvince(cl.province || '');
    setAgentId(cl.agentId || '');
    const restored = {};
    (cl.companyIds || []).forEach((id) => {
      restored[id] = { enabled: true, quantity: cl.companyConfigs?.[id]?.quantity || 1 };
    });
    setCompanyConfigs(restored);
  };

  const filteredClients = clients
    .filter(
      (c) =>
        !searchFilter.trim() ||
        c.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        (c.province && c.province.toLowerCase().includes(searchFilter.toLowerCase()))
    )
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'it', { sensitivity: 'base' }));

  return (
    <div className="space-y-6">
      <form onSubmit={handleSaveClient} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="font-bold text-sm">{editingClientId ? 'Modifica Cliente' : 'Nuovo Cliente'}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            required
            placeholder="Ragione Sociale"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="p-2.5 text-xs border border-slate-200 rounded-xl"
          />
          <input
            type="text"
            required
            placeholder="Provincia (es. TV)"
            value={province}
            onChange={(e) => setProvince(e.target.value)}
            className="p-2.5 text-xs border border-slate-200 rounded-xl"
          />
          <select
            required
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="p-2.5 text-xs border border-slate-200 rounded-xl bg-white"
          >
            <option value="">-- Assegna ad Agente --</option>
            {fieldAgents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {companies.map((comp) => {
            const cfg = companyConfigs[comp.id] || { enabled: false, quantity: 1 };
            return (
              <div key={comp.id} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 text-xs">
                <label className="flex items-center space-x-2 font-bold">
                  <input
                    type="checkbox"
                    checked={cfg.enabled}
                    onChange={() =>
                      setCompanyConfigs({
                        ...companyConfigs,
                        [comp.id]: { ...cfg, enabled: !cfg.enabled }
                      })
                    }
                  />
                  <span>{comp.name}</span>
                </label>
                {cfg.enabled && (
                  <input
                    type="number"
                    min="1"
                    value={cfg.quantity}
                    onChange={(e) =>
                      setCompanyConfigs({
                        ...companyConfigs,
                        [comp.id]: { ...cfg, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) }
                      })
                    }
                    className="w-12 p-1 border rounded text-center font-bold"
                  />
                )}
              </div>
            );
          })}
        </div>

        <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl">
          {editingClientId ? 'Salva Modifiche' : '+ Salva Cliente'}
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <span className="font-bold text-sm">Clienti ({filteredClients.length})</span>
          <input
            type="text"
            placeholder="Cerca..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
          />
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
            <tr>
              <th className="p-3">Cliente</th>
              <th className="p-3">Prov</th>
              <th className="p-3">Agente</th>
              <th className="p-3">Aziende & Spettanze</th>
              <th className="p-3 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredClients.map((c) => {
              const ag = agents.find((a) => a.id === c.agentId);
              return (
                <tr key={c.id}>
                  <td className="p-3 font-bold">{c.name}</td>
                  <td className="p-3">{c.province}</td>
                  <td className="p-3 text-indigo-600 font-medium">{ag ? ag.name : '-'}</td>
                  <td className="p-3">
                    {(c.companyIds || []).map((id) => {
                      const comp = companies.find((co) => co.id === id);
                      return comp ? (
                        <span key={id} className="mr-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-bold">
                          {comp.name}: {c.companyConfigs?.[id]?.quantity || 1} pz
                        </span>
                      ) : null;
                    })}
                  </td>
                  <td className="p-3 text-right space-x-1">
                    <button onClick={() => handleEditClient(c)} className="p-1.5 text-slate-500 hover:text-indigo-600">
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setClients((prev) => prev.filter((cl) => cl.id !== c.id));
                        setDeliveries((prev) => prev.filter((d) => d.clientId !== c.id));
                      }}
                      className="p-1.5 text-rose-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompaniesUpdatesTab({ companies, setCompanies, updates, setUpdates, setDeliveries }) {
  const [companyName, setCompanyName] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [editingCompanyId, setEditingCompanyId] = useState(null);

  const [editingUpdateId, setEditingUpdateId] = useState(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [updateTitle, setUpdateTitle] = useState('');
  const [updateYear, setUpdateYear] = useState(String(new Date().getFullYear()));
  const [contentItems, setContentItems] = useState([{ id: 'item_init_1', name: 'Catalogo', qty: 1 }]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);

  const handleSaveCompany = (e) => {
    e.preventDefault();
    if (!companyName.trim()) return;
    if (editingCompanyId) {
      setCompanies((prev) =>
        prev.map((c) =>
          c.id === editingCompanyId
            ? {
                ...c,
                name: companyName.trim(),
                code: companyCode.trim() || companyName.substring(0, 3).toUpperCase()
              }
            : c
        )
      );
      setEditingCompanyId(null);
    } else {
      setCompanies((prev) => [
        ...prev,
        {
          id: 'comp_' + Date.now(),
          name: companyName.trim(),
          code: companyCode.trim() || companyName.substring(0, 3).toUpperCase()
        }
      ]);
    }
    setCompanyName('');
    setCompanyCode('');
  };

  const handleAddContentItem = () => {
    if (!newItemName.trim()) return;
    setContentItems((prev) => [
      ...prev,
      {
        id: 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
        name: newItemName.trim(),
        qty: Math.max(1, parseInt(newItemQty, 10) || 1)
      }
    ]);
    setNewItemName('');
    setNewItemQty(1);
  };

  const resetUpdateForm = () => {
    setEditingUpdateId(null);
    setUpdateTitle('');
    setUpdateYear(String(new Date().getFullYear()));
    setContentItems([{ id: 'item_' + Date.now(), name: 'Catalogo', qty: 1 }]);
    setNewItemName('');
    setNewItemQty(1);
  };

  const handleSaveUpdate = (e) => {
    e.preventDefault();
    const compId = selectedCompanyId || (companies[0] && companies[0].id);
    if (!updateTitle.trim() || !compId) return;

    if (editingUpdateId) {
      setUpdates((prev) =>
        prev.map((u) =>
          u.id === editingUpdateId
            ? {
                ...u,
                companyId: compId,
                title: updateTitle.trim(),
                year: String(updateYear || new Date().getFullYear()),
                contentItems: [...contentItems]
              }
            : u
        )
      );
    } else {
      setUpdates((prev) => [
        ...prev,
        {
          id: 'upd_' + Date.now(),
          companyId: compId,
          title: updateTitle.trim(),
          year: String(updateYear || new Date().getFullYear()),
          contentItems: [...contentItems],
          createdAt: new Date().toISOString()
        }
      ]);
    }
    resetUpdateForm();
  };

  const handleEditUpdate = (upd) => {
    setEditingUpdateId(upd.id);
    setSelectedCompanyId(upd.companyId);
    setUpdateTitle(upd.title);
    setUpdateYear(String(upd.year || new Date().getFullYear()));
    setContentItems(Array.isArray(upd.contentItems) ? [...upd.contentItems] : []);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm">
            {editingCompanyId ? 'Modifica Azienda Mandante' : '1. Aziende Mandanti'}
          </h3>
          {editingCompanyId && (
            <button
              type="button"
              onClick={() => {
                setEditingCompanyId(null);
                setCompanyName('');
                setCompanyCode('');
              }}
              className="text-xs text-slate-400 underline"
            >
              Annulla
            </button>
          )}
        </div>
        <form onSubmit={handleSaveCompany} className="space-y-2.5">
          <input
            type="text"
            required
            placeholder="Nome Azienda"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full p-2.5 text-xs border border-slate-200 rounded-xl"
          />
          <input
            type="text"
            placeholder="Sigla (es. LCF)"
            value={companyCode}
            onChange={(e) => setCompanyCode(e.target.value)}
            className="w-full p-2.5 text-xs border border-slate-200 rounded-xl"
          />
          <button type="submit" className="w-full py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl">
            {editingCompanyId ? 'Salva Modifica Azienda' : '+ Aggiungi Azienda'}
          </button>
        </form>
        <div className="divide-y divide-slate-100">
          {companies.map((comp) => (
            <div key={comp.id} className="py-2.5 flex justify-between items-center text-sm font-bold">
              <span>{comp.name}</span>
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => {
                    setEditingCompanyId(comp.id);
                    setCompanyName(comp.name);
                    setCompanyCode(comp.code || '');
                  }}
                  className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg"
                  title="Modifica azienda"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCompanies((prev) => prev.filter((c) => c.id !== comp.id));
                    setUpdates((prev) => prev.filter((u) => u.companyId !== comp.id));
                  }}
                  className="p-1.5 text-rose-500 rounded-lg"
                  title="Elimina azienda"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm">
            {editingUpdateId
              ? 'Modifica Aggiornamento & Distinta Materiali'
              : '2. Pubblica Aggiornamento / Catalogo'}
          </h3>
          {editingUpdateId && (
            <button
              type="button"
              onClick={resetUpdateForm}
              className="text-xs text-slate-500 hover:text-slate-800 underline"
            >
              Annulla Modifica
            </button>
          )}
        </div>

        <form onSubmit={handleSaveUpdate} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <select
              required
              value={selectedCompanyId || (companies[0] && companies[0].id) || ''}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="sm:col-span-5 p-2.5 text-xs border border-slate-200 rounded-xl bg-white"
            >
              <option value="">-- Azienda --</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              required
              placeholder="Titolo Aggiornamento"
              value={updateTitle}
              onChange={(e) => setUpdateTitle(e.target.value)}
              className="sm:col-span-5 p-2.5 text-xs border border-slate-200 rounded-xl"
            />
            <input
              type="number"
              required
              value={updateYear}
              onChange={(e) => setUpdateYear(e.target.value)}
              className="sm:col-span-2 p-2.5 text-xs border border-slate-200 rounded-xl text-center font-bold"
            />
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
            <div className="text-xs font-bold">Distinta Materiali per 1 Kit:</div>
            <div className="flex flex-wrap gap-2">
              {contentItems.map((it) => (
                <span key={it.id} className="bg-white border px-2.5 py-1 rounded-lg text-xs font-bold">
                  {it.qty}x {it.name}{' '}
                  <button
                    type="button"
                    onClick={() => setContentItems((prev) => prev.filter((x) => x.id !== it.id))}
                    className="text-rose-500 ml-1"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Materiale (es. Listino)"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddContentItem();
                  }
                }}
                className="flex-1 p-2 text-xs bg-white border rounded-xl"
              />
              <input
                type="number"
                min="1"
                value={newItemQty}
                onChange={(e) => setNewItemQty(e.target.value)}
                className="w-16 p-2 text-xs bg-white border rounded-xl text-center font-bold"
              />
              <button
                type="button"
                onClick={handleAddContentItem}
                className="px-3 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl"
              >
                + Voce
              </button>
            </div>
          </div>

          <button type="submit" className="w-full py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl">
            {editingUpdateId ? 'Salva Modifiche Aggiornamento' : '+ Pubblica Aggiornamento'}
          </button>
        </form>

        <div className="divide-y divide-slate-100">
          {updates.map((upd) => {
            const comp = companies.find((c) => c.id === upd.companyId);
            return (
              <div
                key={upd.id}
                className={`py-3 flex items-start justify-between gap-2 ${
                  editingUpdateId === upd.id ? 'bg-indigo-50/60 px-2 rounded-xl' : ''
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <strong className="text-sm text-slate-900">{upd.title}</strong>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                      {comp?.name || 'N.D.'}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                      {upd.year}
                    </span>
                  </div>

                  {Array.isArray(upd.contentItems) && upd.contentItems.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {upd.contentItems.map((it) => (
                        <span
                          key={it.id}
                          className="text-[11px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-semibold border border-indigo-100"
                        >
                          {it.qty}x {it.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400 italic">
                      Nessun materiale specificato nella distinta
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleEditUpdate(upd)}
                    className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                    title="Modifica aggiornamento e materiali"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (editingUpdateId === upd.id) resetUpdateForm();
                      setUpdates((prev) => prev.filter((u) => u.id !== upd.id));
                      setDeliveries((prev) => prev.filter((d) => d.updateId !== upd.id));
                    }}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                    title="Elimina aggiornamento"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AgentsManagerTab({ agents, setAgents, clients, setClients }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [editingUserId, setEditingUserId] = useState(null);

  const handleSaveUser = (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) return;
    if (editingUserId) {
      setAgents((prev) =>
        prev.map((a) =>
          a.id === editingUserId
            ? { ...a, name: name.trim(), email: email.trim(), password: password.trim() }
            : a
        )
      );
      setEditingUserId(null);
    } else {
      setAgents((prev) => [
        ...prev,
        {
          id: 'ag_' + Date.now(),
          name: name.trim(),
          email: email.trim(),
          password: password.trim(),
          role: 'agent'
        }
      ]);
    }
    setName('');
    setEmail('');
    setPassword('');
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSaveUser} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <h3 className="font-bold text-sm">
          {editingUserId ? 'Modifica Credenziali' : 'Crea Account Agente'}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            required
            placeholder="Nome e Cognome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="p-2.5 text-xs border border-slate-200 rounded-xl"
          />
          <input
            type="email"
            required
            placeholder="Email Login"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="p-2.5 text-xs border border-slate-200 rounded-xl"
          />
          <input
            type="text"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="p-2.5 text-xs border border-slate-200 rounded-xl"
          />
        </div>
        <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl">
          {editingUserId ? 'Salva Credenziali' : '+ Crea Agente'}
        </button>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {agents.map((a) => (
          <div key={a.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">
                {a.role === 'office' ? 'Sede / Admin' : 'Agente'}
              </span>
              <div className="space-x-1">
                <button
                  onClick={() => {
                    setEditingUserId(a.id);
                    setName(a.name);
                    setEmail(a.email);
                    setPassword(a.password);
                  }}
                  className="p-1 text-slate-400 hover:text-indigo-600"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                {a.role !== 'office' && (
                  <button
                    onClick={() => {
                      setAgents((prev) => prev.filter((x) => x.id !== a.id));
                      setClients((prev) =>
                        prev.map((c) => (c.agentId === a.id ? { ...c, agentId: '' } : c))
                      );
                    }}
                    className="p-1 text-rose-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="font-bold text-sm">{a.name}</div>
            <div className="text-xs text-slate-500">{a.email}</div>
            <div className="text-[11px] font-mono text-slate-400">Pass: {a.password}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
