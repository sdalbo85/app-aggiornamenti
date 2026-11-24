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

  const buildDefaultDeliveredMaterials = (updateObj, kitQuantity, customMatMap = null, clientObj = null) => {
    if (!updateObj || !Array.isArray(updateObj.contentItems) || updateObj.contentItems.length === 0) {
      return [];
    }
    const compId = updateObj.companyId;
    const compCfg = clientObj?.companyConfigs?.[compId];
    const clientSupports = compCfg?.customMaterials || compCfg?.fixedSupports || null;

    const applicableItems = updateObj.contentItems.filter((item) => {
      const linked = item.linkedEquipment ? item.linkedEquipment.trim() : '';
      if (!linked) return true;
      if (!clientSupports || typeof clientSupports !== 'object') return false;
      const matchKey = Object.keys(clientSupports).find(
        (k) => k.trim().toLowerCase() === linked.toLowerCase()
      );
      if (!matchKey) return false;
      const qty = Number(clientSupports[matchKey]);
      return !isNaN(qty) && qty > 0;
    });

    return applicableItems.map((item) => {
      const unitQty = Number(item.qty) || 1;
      const customVal = customMatMap && customMatMap[item.name] !== undefined
        ? Number(customMatMap[item.name])
        : null;
      return {
        id: item.id,
        name: item.name,
        unitQty,
        linkedEquipment: item.linkedEquipment || '',
        deliveredQty: customVal !== null ? customVal : unitQty * Math.max(1, Number(kitQuantity) || 1)
      };
    });
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
    const clientObj = clients.find((c) => c.id === clientId);

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
      const mats = buildDefaultDeliveredMaterials(updateObj, qty, null, clientObj);
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
        : buildDefaultDeliveredMaterials(updateObj, safeQty, null, clientObj);

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
                          className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-white text-indigo-700 border border-indigo-200 flex items-center gap-1"
                        >
                          <span>{item.qty}x {item.name}</span>
                          {item.linkedEquipment && (
                            <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-1 py-0.2 rounded font-bold">
                              🔗 {item.linkedEquipment}
                            </span>
                          )}
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
                const compCfg = client.companyConfigs?.[activeCompanyId] || {};
                const defaultTargetQty = compCfg.quantity
                  ? Math.max(1, Number(compCfg.quantity) || 1)
                  : 1;
                const customMaterialsConfig = compCfg.customMaterials || null;

                return (
                  <ClientDeliveryRow
                    key={client.id}
                    client={client}
                    currentUpdate={currentUpdate}
                    delivery={delivery}
                    defaultTargetQty={defaultTargetQty}
                    customMaterialsConfig={customMaterialsConfig}
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
  customMaterialsConfig,
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

  // Filtra i materiali dell'aggiornamento:
  // Le righe vincolate a un supporto fisso (es. "Vetri") vengono nascoste/escluse
  // se il cliente ha quantità 0 o non possiede quel supporto per l'azienda selezionata.
  const applicableContentItems = useMemo(() => {
    if (!currentUpdate || !Array.isArray(currentUpdate.contentItems)) return [];
    const compId = currentUpdate.companyId;
    const compCfg = client?.companyConfigs?.[compId];
    const clientSupports = compCfg?.customMaterials || compCfg?.fixedSupports;

    return currentUpdate.contentItems.filter((item) => {
      const linked = item.linkedEquipment ? item.linkedEquipment.trim() : '';
      if (!linked) return true; // Non vincolato: visibile per tutti

      if (!clientSupports || typeof clientSupports !== 'object') {
        return false; // Il cliente non ha supporti per questa azienda
      }

      const matchKey = Object.keys(clientSupports).find(
        (k) => k.trim().toLowerCase() === linked.toLowerCase()
      );
      if (!matchKey) {
        return false; // Non possiede questo supporto
      }

      const qty = Number(clientSupports[matchKey]);
      return !isNaN(qty) && qty > 0; // Escluso se ha quantità 0
    });
  }, [currentUpdate, client]);

  const hasContentItems = applicableContentItems.length > 0;

  useEffect(() => {
    if (showDetails) return;
    const baseQty = delivery ? delivery.quantity || defaultTargetQty : defaultTargetQty;
    setQuantity(baseQty);
    setNotes(delivery ? delivery.notes || '' : '');
    setAlert(delivery ? !!delivery.alert : false);
    setCustomDateLocal(delivery ? toDateTimeLocal(delivery.deliveredAt) : toDateTimeLocal());

    if (applicableContentItems.length > 0) {
      setMaterialsState(
        applicableContentItems.map((item) => {
          const existingMat = delivery?.deliveredMaterials?.find(
            (m) => m.id === item.id || m.name === item.name
          );
          const unitQty = Number(item.qty) || 1;
          const expectedForClient =
            customMaterialsConfig && customMaterialsConfig[item.name] !== undefined
              ? Number(customMaterialsConfig[item.name])
              : unitQty * baseQty;
          return {
            id: item.id,
            name: item.name,
            unitQty,
            linkedEquipment: item.linkedEquipment || '',
            expectedQty: expectedForClient,
            deliveredQty: existingMat ? Number(existingMat.deliveredQty) : expectedForClient
          };
        })
      );
    } else {
      setMaterialsState([]);
    }
  }, [delivery, defaultTargetQty, customMaterialsConfig, applicableContentItems, showDetails]);

  const handleKitQuantityChange = (newKitQty) => {
    const safeKit = Math.max(1, newKitQty);
    setQuantity(safeKit);
    if (hasContentItems && !customMaterialsConfig) {
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
    (m) => m.deliveredQty !== (m.expectedQty !== undefined ? m.expectedQty : m.unitQty * defaultTargetQty)
  );
  const hasNotes = notes.trim().length > 0;
  const isQtyDifferentFromExpected =
    (!customMaterialsConfig && quantity !== defaultTargetQty) || hasMaterialDiff;
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

          {hasContentItems ? (
            <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between font-bold text-slate-700 text-xs">
                <span>Singoli Materiali Consegnati</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  (filtrati per dotazione cliente)
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {materialsState.map((mat) => (
                  <div key={mat.id} className="py-2 flex items-center justify-between gap-2">
                    <div className="flex items-center flex-wrap gap-1 min-w-0">
                      <span className="font-bold text-slate-800">{mat.name}</span>
                      <span className="text-[10px] text-slate-400">
                        ({mat.unitQty} per kit)
                      </span>
                      {mat.linkedEquipment && (
                        <span className="text-[10px] bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.2 rounded font-semibold ml-1">
                          🔗 {mat.linkedEquipment}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
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
          ) : (
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-slate-400 text-xs text-center italic">
              Nessun materiale specifico da consegnare per la dotazione showroom di questo cliente.
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
          updates={updates}
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

function ClientsManagerTab({ agents, companies, updates, clients, setClients, setDeliveries }) {
  const DEFAULT_EQUIPMENT = ['Catalogo', 'Mazzetta Laccati', 'Vetri'];

  const getCompanySupports = (comp) => {
    if (!comp) return DEFAULT_EQUIPMENT;
    if (Array.isArray(comp.standardEquipment) && comp.standardEquipment.length > 0) {
      return comp.standardEquipment;
    }
    return DEFAULT_EQUIPMENT;
  };

  // Stato form Nuovo Cliente
  const [name, setName] = useState('');
  const [province, setProvince] = useState('');
  const [agentId, setAgentId] = useState('');
  const [companyConfigs, setCompanyConfigs] = useState({});

  // Stato modale Modifica Cliente
  const [editingClientId, setEditingClientId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editProvince, setEditProvince] = useState('');
  const [editAgentId, setEditAgentId] = useState('');
  const [editCompanyConfigs, setEditCompanyConfigs] = useState({});

  // Filtri tabella clienti
  const [searchFilter, setSearchFilter] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');

  const fieldAgents = agents.filter((a) => a.role === 'agent');

  // Elenco ordinato delle province presenti nei clienti
  const availableProvinces = useMemo(() => {
    const set = new Set();
    clients.forEach((c) => {
      if (c.province && c.province.trim()) {
        set.add(c.province.trim().toUpperCase());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'it'));
  }, [clients]);

  const finalizeConfigsForSave = (configsMap) => {
    const activeCompanyIds = Object.keys(configsMap).filter((id) => configsMap[id]?.enabled);
    const finalizedConfigs = {};
    activeCompanyIds.forEach((cId) => {
      const cfg = configsMap[cId] || { enabled: true, quantity: 1 };
      const compObj = companies.find((c) => c.id === cId);
      const supports = getCompanySupports(compObj);
      const custom = {};
      const sourceMap = cfg.customMaterials || cfg.fixedSupports || {};

      supports.forEach((s) => {
        if (sourceMap[s] !== undefined) {
          custom[s] = Math.max(0, parseInt(sourceMap[s], 10) || 0);
        } else {
          custom[s] = cfg.quantity !== undefined ? Math.max(0, Number(cfg.quantity) || 0) : 1;
        }
      });

      const maxQty = Math.max(1, ...Object.values(custom).map((q) => Number(q) || 0));
      finalizedConfigs[cId] = {
        enabled: true,
        quantity: maxQty,
        customMaterials: custom,
        fixedSupports: custom
      };
    });
    return { activeCompanyIds, finalizedConfigs };
  };

  const handleSaveClient = (e) => {
    e.preventDefault();
    if (!name.trim() || !province.trim() || !agentId) return;
    const { activeCompanyIds, finalizedConfigs } = finalizeConfigsForSave(companyConfigs);

    setClients((prev) => [
      ...prev,
      {
        id: 'cl_' + Date.now(),
        name: name.trim(),
        province: province.trim().toUpperCase(),
        agentId,
        companyIds: activeCompanyIds,
        companyConfigs: finalizedConfigs
      }
    ]);

    setName('');
    setProvince('');
    setAgentId('');
    setCompanyConfigs({});
  };

  const handleSaveEditedClient = (e) => {
    e.preventDefault();
    if (!editingClientId || !editName.trim() || !editProvince.trim() || !editAgentId) return;
    const { activeCompanyIds, finalizedConfigs } = finalizeConfigsForSave(editCompanyConfigs);

    setClients((prev) =>
      prev.map((c) =>
        c.id === editingClientId
          ? {
              ...c,
              name: editName.trim(),
              province: editProvince.trim().toUpperCase(),
              agentId: editAgentId,
              companyIds: activeCompanyIds,
              companyConfigs: finalizedConfigs
            }
          : c
      )
    );
    setEditingClientId(null);
  };

  const handleEditClient = (cl) => {
    setEditingClientId(cl.id);
    setEditName(cl.name);
    setEditProvince(cl.province || '');
    setEditAgentId(cl.agentId || '');
    const restored = {};
    (cl.companyIds || []).forEach((id) => {
      const existingCfg = cl.companyConfigs?.[id];
      const compObj = companies.find((co) => co.id === id);
      const supports = getCompanySupports(compObj);
      const existingCustom = existingCfg?.customMaterials || existingCfg?.fixedSupports;
      const custom = {};

      supports.forEach((s) => {
        if (existingCustom && existingCustom[s] !== undefined) {
          custom[s] = Math.max(0, parseInt(existingCustom[s], 10) || 0);
        } else {
          custom[s] = existingCfg?.quantity ? Math.max(0, Number(existingCfg.quantity)) : 1;
        }
      });

      const maxQty = Math.max(1, ...Object.values(custom).map((q) => Number(q) || 0));
      restored[id] = {
        enabled: true,
        quantity: maxQty,
        customMaterials: custom,
        fixedSupports: custom
      };
    });
    setEditCompanyConfigs(restored);
  };

  const handleSupportQtyChange = (setter, compId, supportName, val) => {
    setter((prevConfigs) => {
      const curr = prevConfigs[compId] || { enabled: true, quantity: 1 };
      const compObj = companies.find((c) => c.id === compId);
      const allSupports = getCompanySupports(compObj);
      const prevCustom = curr.customMaterials || curr.fixedSupports || {};
      const parsed = Math.max(0, parseInt(val, 10) || 0);

      const updatedCustom = { ...prevCustom, [supportName]: parsed };
      allSupports.forEach((s) => {
        if (updatedCustom[s] === undefined) {
          updatedCustom[s] = curr.quantity !== undefined ? Math.max(0, Number(curr.quantity) || 0) : 1;
        }
      });

      const maxQty = Math.max(1, ...Object.values(updatedCustom).map((q) => Number(q) || 0));
      return {
        ...prevConfigs,
        [compId]: {
          ...curr,
          enabled: true,
          quantity: maxQty,
          customMaterials: updatedCustom,
          fixedSupports: updatedCustom
        }
      };
    });
  };

  const handleSetAllSupportsQty = (setter, compId, targetQty) => {
    const compObj = companies.find((c) => c.id === compId);
    const allSupports = getCompanySupports(compObj);
    const updatedCustom = {};
    allSupports.forEach((s) => {
      updatedCustom[s] = targetQty;
    });
    setter((prevConfigs) => ({
      ...prevConfigs,
      [compId]: {
        enabled: true,
        quantity: Math.max(1, targetQty),
        customMaterials: updatedCustom,
        fixedSupports: updatedCustom
      }
    }));
  };

  const renderCompanyConfigsGrid = (configsMap, setter) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {companies.map((comp) => {
        const cfg = configsMap[comp.id] || { enabled: false, quantity: 1, customMaterials: null };
        const companySupports = getCompanySupports(comp);

        return (
          <div
            key={comp.id}
            className={`p-3.5 rounded-xl border text-xs space-y-3 transition-all ${
              cfg.enabled ? 'bg-indigo-50/40 border-indigo-200' : 'bg-slate-50/40 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center space-x-2 font-bold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfg.enabled}
                  onChange={() => {
                    const nextEnabled = !cfg.enabled;
                    if (nextEnabled) {
                      const initialCustom = {};
                      companySupports.forEach((s) => {
                        initialCustom[s] = 1;
                      });
                      setter((prevConfigs) => ({
                        ...prevConfigs,
                        [comp.id]: {
                          enabled: true,
                          quantity: 1,
                          customMaterials: cfg.customMaterials || initialCustom,
                          fixedSupports: cfg.fixedSupports || initialCustom
                        }
                      }));
                    } else {
                      setter((prevConfigs) => ({
                        ...prevConfigs,
                        [comp.id]: { ...cfg, enabled: false }
                      }));
                    }
                  }}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm">{comp.name}</span>
                {comp.code && (
                  <span className="text-[10px] bg-slate-200/80 text-slate-600 px-1.5 py-0.5 rounded font-semibold uppercase">
                    {comp.code}
                  </span>
                )}
              </label>

              {cfg.enabled && (
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleSetAllSupportsQty(setter, comp.id, 1)}
                    className="text-[10px] text-indigo-600 hover:underline font-semibold"
                    title="Imposta tutti i supporti a 1"
                  >
                    Tutti a 1
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => handleSetAllSupportsQty(setter, comp.id, 0)}
                    className="text-[10px] text-slate-400 hover:text-rose-500 underline font-semibold"
                    title="Azzera quantità supporti"
                  >
                    Azzera
                  </button>
                </div>
              )}
            </div>

            {cfg.enabled && (
              <div className="space-y-2 pt-1 border-t border-indigo-100">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-700">
                    Supporti fissi in showroom del cliente:
                  </span>
                  <span className="text-[10px] text-slate-400">
                    (0 = non presente)
                  </span>
                </div>

                {/* Mostra ESCLUSIVAMENTE i supporti fissi configurati sull'azienda */}
                <div className="space-y-1.5">
                  {companySupports.map((supportName) => {
                    const currentVal =
                      cfg.customMaterials && cfg.customMaterials[supportName] !== undefined
                        ? cfg.customMaterials[supportName]
                        : cfg.fixedSupports && cfg.fixedSupports[supportName] !== undefined
                        ? cfg.fixedSupports[supportName]
                        : cfg.quantity !== undefined
                        ? cfg.quantity
                        : 1;

                    return (
                      <div
                        key={supportName}
                        className={`p-2 rounded-lg border flex items-center justify-between gap-2 shadow-2xs transition-colors ${
                          currentVal > 0
                            ? 'bg-white border-slate-200 text-slate-800'
                            : 'bg-slate-100/70 border-slate-200 text-slate-400'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <span
                            className={`font-semibold text-xs truncate ${
                              currentVal > 0 ? 'text-slate-800' : 'text-slate-400 line-through'
                            }`}
                            title={supportName}
                          >
                            {supportName}
                          </span>
                        </div>

                        <div className="flex items-center space-x-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              handleSupportQtyChange(
                                setter,
                                comp.id,
                                supportName,
                                Math.max(0, Number(currentVal || 0) - 1)
                              )
                            }
                            className="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded text-xs"
                            title="Diminuisci quantità"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={currentVal}
                            onChange={(e) =>
                              handleSupportQtyChange(setter, comp.id, supportName, e.target.value)
                            }
                            className="w-12 p-1 border border-slate-300 rounded text-center font-bold text-xs bg-white"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleSupportQtyChange(
                                setter,
                                comp.id,
                                supportName,
                                Number(currentVal || 0) + 1
                              )
                            }
                            className="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded text-xs"
                            title="Aumenta quantità"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const filteredClients = clients
    .filter((c) => {
      const matchName =
        !searchFilter.trim() ||
        (c.name || '').toLowerCase().includes(searchFilter.trim().toLowerCase());
      const matchProvince =
        !provinceFilter ||
        (c.province || '').trim().toUpperCase() === provinceFilter;
      const matchAgent =
        !agentFilter || c.agentId === agentFilter;
      const matchCompany =
        !companyFilter ||
        (Array.isArray(c.companyIds) && c.companyIds.includes(companyFilter));

      return matchName && matchProvince && matchAgent && matchCompany;
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'it', { sensitivity: 'base' }));

  const hasActiveFilters = Boolean(
    searchFilter.trim() || provinceFilter || agentFilter || companyFilter
  );

  const resetFilters = () => {
    setSearchFilter('');
    setProvinceFilter('');
    setAgentFilter('');
    setCompanyFilter('');
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSaveClient} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm">Nuovo Cliente</h3>
        </div>

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

        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-500 uppercase">
            Aziende Trattate & Supporti Fissi in Dotazione al Cliente:
          </div>
          {renderCompanyConfigsGrid(companyConfigs, setCompanyConfigs)}
        </div>

        <button type="submit" className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors">
          + Salva Cliente
        </button>
      </form>

      {editingClientId && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setEditingClientId(null)}
        >
          <form
            onSubmit={handleSaveEditedClient}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
              <h3 className="font-bold text-sm text-slate-900">
                Modifica Cliente e Dotazione Supporti Fissi
              </h3>
              <button
                type="button"
                onClick={() => setEditingClientId(null)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-lg font-bold transition-colors"
                title="Chiudi"
                aria-label="Chiudi"
              >
                ×
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Ragione Sociale"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="p-2.5 text-xs border border-slate-200 rounded-xl"
                />
                <input
                  type="text"
                  required
                  placeholder="Provincia (es. TV)"
                  value={editProvince}
                  onChange={(e) => setEditProvince(e.target.value)}
                  className="p-2.5 text-xs border border-slate-200 rounded-xl"
                />
                <select
                  required
                  value={editAgentId}
                  onChange={(e) => setEditAgentId(e.target.value)}
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

              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-500 uppercase">
                  Aziende Trattate & Supporti Fissi in Dotazione al Cliente:
                </div>
                {renderCompanyConfigsGrid(editCompanyConfigs, setEditCompanyConfigs)}
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingClientId(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded-xl transition-colors"
              >
                Annulla
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors"
              >
                Salva Modifiche Cliente
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm">
              Clienti ({filteredClients.length}{hasActiveFilters ? ` su ${clients.length}` : ''})
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs text-rose-600 font-bold hover:underline"
              >
                Azzera filtri
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <input
              type="text"
              placeholder="Cerca per cliente..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
            />
            <select
              value={provinceFilter}
              onChange={(e) => setProvinceFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
            >
              <option value="">Tutte le province</option>
              {availableProvinces.map((prov) => (
                <option key={prov} value={prov}>
                  Provincia: {prov}
                </option>
              ))}
            </select>
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
            >
              <option value="">Tutti gli agenti</option>
              {fieldAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  Agente: {a.name}
                </option>
              ))}
            </select>
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
            >
              <option value="">Tutte le aziende</option>
              {companies.map((comp) => (
                <option key={comp.id} value={comp.id}>
                  Azienda: {comp.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
            <tr>
              <th className="p-3">Cliente</th>
              <th className="p-3">Prov</th>
              <th className="p-3">Agente</th>
              <th className="p-3">Aziende & Dotazione Supporti Fissi</th>
              <th className="p-3 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredClients.length === 0 ? (
              <tr>
                <td colSpan="5" className="p-6 text-center text-slate-400">
                  Nessun cliente corrisponde ai filtri selezionati.
                </td>
              </tr>
            ) : (
              filteredClients.map((c) => {
                const ag = agents.find((a) => a.id === c.agentId);
                return (
                  <tr key={c.id}>
                    <td className="p-3 font-bold">{c.name}</td>
                    <td className="p-3">{c.province}</td>
                    <td className="p-3 text-indigo-600 font-medium">{ag ? ag.name : '-'}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(c.companyIds || []).map((id) => {
                          const comp = companies.find((co) => co.id === id);
                          if (!comp) return null;
                          const cfg = c.companyConfigs?.[id] || {};
                          const custom = cfg.customMaterials || cfg.fixedSupports;

                          let compactLabel = `${comp.name}: ${cfg.quantity || 1} kit`;
                          let tooltipText = compactLabel;
                          let isZero = false;

                          if (custom && typeof custom === 'object') {
                            const activeEntries = Object.entries(custom).filter(([, q]) => Number(q) > 0);
                            if (activeEntries.length > 0) {
                              compactLabel = `${comp.name}: ${activeEntries.length} ${
                                activeEntries.length === 1 ? 'supporto' : 'supporti'
                              }`;
                              tooltipText = `${comp.name}: ${activeEntries
                                .map(([sName, q]) => `${q}x ${sName}`)
                                .join(', ')}`;
                            } else {
                              compactLabel = `${comp.name}: 0 supporti`;
                              tooltipText = `${comp.name}: Nessun supporto attivo`;
                              isZero = true;
                            }
                          }

                          return (
                            <span
                              key={id}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap ${
                                isZero
                                  ? 'bg-slate-100 text-slate-500 border-slate-200'
                                  : 'bg-indigo-50 text-indigo-700 border-indigo-100'
                              }`}
                              title={tooltipText}
                            >
                              {compactLabel}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="p-3 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => handleEditClient(c)}
                        className="p-1.5 text-slate-500 hover:text-indigo-600 rounded-lg"
                        title="Modifica cliente e supporti fissi"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setClients((prev) => prev.filter((cl) => cl.id !== c.id));
                          setDeliveries((prev) => prev.filter((d) => d.clientId !== c.id));
                        }}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                        title="Elimina cliente"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function CompaniesUpdatesTab({ companies, setCompanies, updates, setUpdates, setDeliveries }) {
  const DEFAULT_EQUIPMENT = ['Catalogo', 'Mazzetta Laccati', 'Vetri'];

  const [companyName, setCompanyName] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [editingCompanyId, setEditingCompanyId] = useState(null);
  const [companyEquipment, setCompanyEquipment] = useState(DEFAULT_EQUIPMENT);
  const [newEquipInput, setNewEquipInput] = useState('');

  const [editingUpdateId, setEditingUpdateId] = useState(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [updateTitle, setUpdateTitle] = useState('');
  const [updateYear, setUpdateYear] = useState(String(new Date().getFullYear()));
  const [contentItems, setContentItems] = useState([
    { id: 'item_init_1', name: 'Catalogo', qty: 1, linkedEquipment: '' }
  ]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemLinkedEquipment, setNewItemLinkedEquipment] = useState('');

  // Trova l'azienda correntemente selezionata per l'aggiornamento
  const activeCompanyId = selectedCompanyId || (companies[0] && companies[0].id) || '';
  const activeCompany = companies.find((c) => c.id === activeCompanyId);
  const activeCompanySupports =
    activeCompany && Array.isArray(activeCompany.standardEquipment) && activeCompany.standardEquipment.length > 0
      ? activeCompany.standardEquipment
      : DEFAULT_EQUIPMENT;

  const handleAddEquipmentToForm = (nameToAdd) => {
    const val = (nameToAdd || newEquipInput).trim();
    if (!val) return;
    if (!companyEquipment.some((item) => item.toLowerCase() === val.toLowerCase())) {
      setCompanyEquipment((prev) => [...prev, val]);
    }
    setNewEquipInput('');
  };

  const handleRemoveEquipmentFromForm = (itemToRemove) => {
    setCompanyEquipment((prev) => prev.filter((it) => it !== itemToRemove));
  };

  const handleSaveCompany = (e) => {
    e.preventDefault();
    if (!companyName.trim()) return;
    const cleanEquipment = companyEquipment.map((s) => s.trim()).filter(Boolean);

    if (editingCompanyId) {
      setCompanies((prev) =>
        prev.map((c) =>
          c.id === editingCompanyId
            ? {
                ...c,
                name: companyName.trim(),
                code: companyCode.trim() || companyName.substring(0, 3).toUpperCase(),
                standardEquipment: cleanEquipment
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
          code: companyCode.trim() || companyName.substring(0, 3).toUpperCase(),
          standardEquipment: cleanEquipment
        }
      ]);
    }
    setCompanyName('');
    setCompanyCode('');
    setCompanyEquipment(DEFAULT_EQUIPMENT);
    setNewEquipInput('');
  };

  const handleAddContentItem = () => {
    if (!newItemName.trim()) return;
    setContentItems((prev) => [
      ...prev,
      {
        id: 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
        name: newItemName.trim(),
        qty: Math.max(1, parseInt(newItemQty, 10) || 1),
        linkedEquipment: newItemLinkedEquipment || ''
      }
    ]);
    setNewItemName('');
    setNewItemQty(1);
    setNewItemLinkedEquipment('');
  };

  const resetUpdateForm = () => {
    setEditingUpdateId(null);
    setUpdateTitle('');
    setUpdateYear(String(new Date().getFullYear()));
    setContentItems([{ id: 'item_' + Date.now(), name: 'Catalogo', qty: 1, linkedEquipment: '' }]);
    setNewItemName('');
    setNewItemQty(1);
    setNewItemLinkedEquipment('');
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
    setContentItems(
      Array.isArray(upd.contentItems)
        ? upd.contentItems.map((it) => ({
            ...it,
            linkedEquipment: it.linkedEquipment || ''
          }))
        : []
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Colonna Sinistra: Gestione Aziende e Dotazione Standard */}
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
                setCompanyEquipment(DEFAULT_EQUIPMENT);
                setNewEquipInput('');
              }}
              className="text-xs text-slate-400 hover:text-slate-600 underline"
            >
              Annulla
            </button>
          )}
        </div>

        <form onSubmit={handleSaveCompany} className="space-y-3">
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

          {/* Configurazione Dotazione Standard / Supporti Fissi */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">
                Dotazione Standard / Supporti Fissi:
              </label>
              <span className="text-[10px] text-slate-400">Supporti showroom cliente</span>
            </div>

            {/* Elenco supporti configurati per l'azienda */}
            <div className="flex flex-wrap gap-1.5">
              {companyEquipment.map((eq) => (
                <span
                  key={eq}
                  className="bg-white border border-slate-200 text-slate-800 text-[11px] font-semibold px-2 py-1 rounded-lg flex items-center gap-1 shadow-xs"
                >
                  <span>{eq}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveEquipmentFromForm(eq)}
                    className="text-rose-500 hover:text-rose-700 ml-0.5 font-bold"
                    title="Rimuovi supporto"
                  >
                    ×
                  </button>
                </span>
              ))}
              {companyEquipment.length === 0 && (
                <span className="text-xs text-slate-400 italic">
                  Nessun supporto configurato.
                </span>
              )}
            </div>

            {/* Input per aggiunta supporto */}
            <div className="flex gap-1.5">
              <input
                type="text"
                placeholder="Nuovo supporto fisso (es. Vetri, Mazzetta...)"
                value={newEquipInput}
                onChange={(e) => setNewEquipInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddEquipmentToForm();
                  }
                }}
                className="flex-1 p-2 text-xs bg-white border border-slate-200 rounded-xl"
              />
              <button
                type="button"
                onClick={() => handleAddEquipmentToForm()}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl"
              >
                + Aggiungi
              </button>
            </div>

            {/* Suggerimenti veloci */}
            <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-slate-200/60">
              <span className="text-[10px] text-slate-400 font-semibold mr-1">Predefiniti:</span>
              {['Catalogo', 'Mazzetta Laccati', 'Vetri', 'Campionario Tessuti'].map((sug) => {
                const alreadyAdded = companyEquipment.some(
                  (item) => item.toLowerCase() === sug.toLowerCase()
                );
                if (alreadyAdded) return null;
                return (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => handleAddEquipmentToForm(sug)}
                    className="text-[10px] bg-slate-200/80 hover:bg-indigo-100 hover:text-indigo-700 text-slate-600 px-1.5 py-0.5 rounded transition-colors"
                  >
                    + {sug}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors"
          >
            {editingCompanyId ? 'Salva Modifica Azienda' : '+ Aggiungi Azienda'}
          </button>
        </form>

        {/* Lista Aziende con Supporti Fissi associati */}
        <div className="divide-y divide-slate-100 pt-1">
          {companies.map((comp) => {
            const currentEquip =
              Array.isArray(comp.standardEquipment) && comp.standardEquipment.length > 0
                ? comp.standardEquipment
                : DEFAULT_EQUIPMENT;

            return (
              <div key={comp.id} className="py-3 space-y-2">
                <div className="flex justify-between items-center text-sm font-bold">
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-900">{comp.name}</span>
                    {comp.code && (
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase font-semibold">
                        {comp.code}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCompanyId(comp.id);
                        setCompanyName(comp.name);
                        setCompanyCode(comp.code || '');
                        setCompanyEquipment(
                          Array.isArray(comp.standardEquipment) && comp.standardEquipment.length > 0
                            ? [...comp.standardEquipment]
                            : DEFAULT_EQUIPMENT
                        );
                        setNewEquipInput('');
                      }}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg"
                      title="Modifica azienda e dotazione standard"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (editingCompanyId === comp.id) {
                          setEditingCompanyId(null);
                          setCompanyName('');
                          setCompanyCode('');
                          setCompanyEquipment(DEFAULT_EQUIPMENT);
                        }
                        setCompanies((prev) => prev.filter((c) => c.id !== comp.id));
                        setUpdates((prev) => prev.filter((u) => u.companyId !== comp.id));
                      }}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                      title="Elimina azienda"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Dotazione Standard dell'Azienda */}
                <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-600">Dotazione Standard / Supporti Fissi:</span>
                    <span className="text-[10px] text-slate-400">
                      {currentEquip.length} {currentEquip.length === 1 ? 'supporto' : 'supporti'}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {currentEquip.map((eq) => (
                      <span
                        key={eq}
                        className="text-[10px] bg-white text-slate-700 font-semibold px-2 py-0.5 rounded-md border border-slate-200 flex items-center gap-1 shadow-2xs"
                      >
                        <span>{eq}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const updatedList = currentEquip.filter((item) => item !== eq);
                            setCompanies((prev) =>
                              prev.map((c) =>
                                c.id === comp.id ? { ...c, standardEquipment: updatedList } : c
                              )
                            );
                          }}
                          className="text-slate-400 hover:text-rose-600 font-bold"
                          title={`Rimuovi ${eq}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {currentEquip.length === 0 && (
                      <span className="text-[11px] text-slate-400 italic">
                        Nessun supporto fisso configurato.
                      </span>
                    )}
                  </div>

                  {/* Micro-input per aggiunta rapida supporto fisso all'azienda */}
                  <div className="flex gap-1 pt-1">
                    <input
                      type="text"
                      placeholder="+ Aggiungi supporto rapido..."
                      id={`quick-add-${comp.id}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = e.currentTarget.value.trim();
                          if (val && !currentEquip.some((x) => x.toLowerCase() === val.toLowerCase())) {
                            const updatedList = [...currentEquip, val];
                            setCompanies((prev) =>
                              prev.map((c) =>
                                c.id === comp.id ? { ...c, standardEquipment: updatedList } : c
                              )
                            );
                            e.currentTarget.value = '';
                          }
                        }
                      }}
                      className="flex-1 px-2 py-1 text-[11px] bg-white border border-slate-200 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById(`quick-add-${comp.id}`);
                        if (input) {
                          const val = input.value.trim();
                          if (val && !currentEquip.some((x) => x.toLowerCase() === val.toLowerCase())) {
                            const updatedList = [...currentEquip, val];
                            setCompanies((prev) =>
                              prev.map((c) =>
                                c.id === comp.id ? { ...c, standardEquipment: updatedList } : c
                              )
                            );
                            input.value = '';
                          }
                        }
                      }}
                      className="px-2.5 py-1 text-[11px] bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Colonna Destra: Pubblicazione Aggiornamento e Distinta Materiali */}
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

          {/* Distinta Materiali per Kit con Vincolo Dotazione Cliente su ogni riga */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">Distinta Materiali per 1 Kit:</span>
              <span className="text-[11px] text-slate-500">
                {contentItems.length} {contentItems.length === 1 ? 'materiale' : 'materiali'}
              </span>
            </div>

            {/* Righe dei materiali presenti */}
            {contentItems.length === 0 ? (
              <div className="p-3 bg-white rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-400">
                Nessun materiale specificato. Aggiungi il primo materiale qui sotto.
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {contentItems.map((it) => (
                  <div
                    key={it.id}
                    className="bg-white border border-slate-200 rounded-xl p-2.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 shadow-2xs"
                  >
                    {/* Quantità e Nome del materiale */}
                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                      <span className="bg-slate-100 text-slate-800 font-bold text-xs px-2 py-1 rounded-lg border border-slate-200 flex-shrink-0">
                        {it.qty}x
                      </span>
                      <span className="text-xs font-bold text-slate-800 truncate" title={it.name}>
                        {it.name}
                      </span>
                    </div>

                    {/* Menu opzionale Vincola a dotazione cliente */}
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <div className="flex items-center space-x-1.5">
                        <label
                          htmlFor={`vincolo-select-${it.id}`}
                          className="text-[11px] font-medium text-slate-500 hidden md:inline"
                        >
                          Vincolo cliente:
                        </label>
                        <select
                          id={`vincolo-select-${it.id}`}
                          value={it.linkedEquipment || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setContentItems((prev) =>
                              prev.map((item) =>
                                item.id === it.id ? { ...item, linkedEquipment: val } : item
                              )
                            );
                          }}
                          className={`text-xs py-1 px-2.5 rounded-lg border focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-colors ${
                            it.linkedEquipment
                              ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold'
                              : 'bg-slate-50 border-slate-200 text-slate-600 font-medium'
                          }`}
                          title="Vincola questo materiale al possesso del supporto fisso da parte del cliente"
                        >
                          <option value="">-- Nessun vincolo cliente (Per tutti) --</option>
                          {activeCompanySupports.map((sup) => (
                            <option key={sup} value={sup}>
                              Vincola a: {sup}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={() => setContentItems((prev) => prev.filter((x) => x.id !== it.id))}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Rimuovi materiale dalla distinta"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Inserimento nuovo materiale con menu Vincola a dotazione cliente */}
            <div className="pt-2 border-t border-slate-200/70 space-y-1.5">
              <div className="text-[11px] font-bold text-slate-600">Aggiungi materiale alla distinta:</div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                <input
                  type="text"
                  placeholder="Materiale (es. Listino, Vetro specchio...)"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddContentItem();
                    }
                  }}
                  className="sm:col-span-5 p-2 text-xs bg-white border border-slate-200 rounded-xl"
                />
                <input
                  type="number"
                  min="1"
                  value={newItemQty}
                  onChange={(e) => setNewItemQty(e.target.value)}
                  className="sm:col-span-2 p-2 text-xs bg-white border border-slate-200 rounded-xl text-center font-bold"
                  title="Quantità per kit"
                />
                <select
                  value={newItemLinkedEquipment}
                  onChange={(e) => setNewItemLinkedEquipment(e.target.value)}
                  className="sm:col-span-4 p-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-700"
                  title="Opzionale: vincola a supporto fisso / dotazione cliente"
                >
                  <option value="">-- Nessun vincolo cliente --</option>
                  {activeCompanySupports.map((sup) => (
                    <option key={sup} value={sup}>
                      Vincola a: {sup}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddContentItem}
                  className="sm:col-span-1 py-2 px-3 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl flex items-center justify-center transition-colors"
                  title="Aggiungi materiale"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors"
          >
            {editingUpdateId ? 'Salva Modifiche Aggiornamento' : '+ Pubblica Aggiornamento'}
          </button>
        </form>

        {/* Elenco Aggiornamenti Pubblicati */}
        <div className="divide-y divide-slate-100 pt-2">
          {updates.map((upd) => {
            const comp = companies.find((c) => c.id === upd.companyId);
            return (
              <div
                key={upd.id}
                className={`py-3 flex items-start justify-between gap-2 ${
                  editingUpdateId === upd.id ? 'bg-indigo-50/60 p-2 rounded-xl' : ''
                }`}
              >
                <div className="space-y-1.5 flex-1 min-w-0">
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
                          className="text-[11px] bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg font-semibold border border-indigo-100 flex items-center gap-1.5"
                        >
                          <span>{it.qty}x {it.name}</span>
                          {it.linkedEquipment && (
                            <span
                              className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] px-1.5 py-0.2 rounded font-bold"
                              title={`Vincolato a dotazione cliente: ${it.linkedEquipment}`}
                            >
                              🔗 {it.linkedEquipment}
                            </span>
                          )}
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
