import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2, Users, FileText, Plus, Trash2, Edit3,
  AlertTriangle, Check, BarChart2, Calendar, Search,
  Shield, Wifi, WifiOff, Package, LogOut, Lock, Mail,
  UserCheck, Layers, ClipboardList, CheckCircle2, Clock,
  Filter, RotateCcw, Box, ChevronDown, ChevronUp, Info, Download,
  Folder, FolderOpen, RefreshCw, Cloud
} from 'lucide-react';

// ----------------------------------------------------------------------------
// CONFIGURAZIONE DATABASE CLOUD SUPABASE (AGENZIA DAL BO)
// ----------------------------------------------------------------------------
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
  if (!res.ok) {
    throw new Error(`Errore lettura Supabase (${res.status})`);
  }
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
    body: JSON.stringify([
      {
        key,
        data,
        updated_at: new Date().toISOString()
      }
    ])
  });
  if (!res.ok) {
    throw new Error(`Errore salvataggio Supabase (${res.status})`);
  }
}

// Helper per esportare file CSV compatibile con Microsoft Excel in italiano (separatore ';' e BOM UTF-8)
function exportToExcelCSV(filename, headers, rows) {
  const escapeCell = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""').replace(/\r?\n/g, ' ');
    return `"${str}"`;
  };

  const csvContent =
    '\uFEFF' +
    [
      headers.map(escapeCell).join(';'),
      ...rows.map((row) => row.map(escapeCell).join(';'))
    ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const dateTag = new Date().toISOString().slice(0, 10);
  link.setAttribute('download', `${filename}_${dateTag}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Helper per formattare data/ora per input datetime-local
function toDateTimeLocal(isoOrLocaleStr) {
  if (!isoOrLocaleStr) {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 16);
  }
  const parsed = new Date(isoOrLocaleStr);
  if (!isNaN(parsed.getTime())) {
    const offset = parsed.getTimezoneOffset() * 60000;
    return new Date(parsed.getTime() - offset).toISOString().slice(0, 16);
  }
  return '';
}

function formatDisplayDate(isoOrStr) {
  if (!isoOrStr) return '';
  const d = new Date(isoOrStr);
  if (!isNaN(d.getTime())) {
    return d.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  return isoOrStr;
}

export default function App() {
  const [isOnline, setIsOnline] = useState(true);
  const [cloudStatus, setCloudStatus] = useState('connecting'); // 'connecting' | 'synced' | 'saving' | 'error'
  const [cloudErrorMsg, setCloudErrorMsg] = useState('');
  const [isInitialCloudLoaded, setIsInitialCloudLoaded] = useState(false);

  // Utente autenticato corrente (sessione locale sul dispositivo)
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('app_current_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Anagrafica Utenti (Sede + Agenti)
  const [agents, setAgents] = useState([
    {
      id: 'ag_sede',
      name: 'Coordinatrice Ufficio',
      email: 'sede@agenziadalbo.it',
      password: 'admin',
      role: 'office'
    }
  ]);

  // Aziende Mandanti
  const [companies, setCompanies] = useState([]);

  // Aggiornamenti / Cataloghi con Distinta Contenuto
  const [updates, setUpdates] = useState([]);

  // Clienti con configurazione Qtà Spettante per Azienda
  const [clients, setClients] = useState([]);

  // Registro Consegne effettuate
  const [deliveries, setDeliveries] = useState([]);

  // Scorte Magazzino Sede
  const [warehouseItems, setWarehouseItems] = useState([]);

  // Selezioni attive nella Vista Agente
  const [activeCompanyId, setActiveCompanyId] = useState('');
  const [activeUpdateId, setActiveUpdateId] = useState('');
  const [activeAgentYear, setActiveAgentYear] = useState('all');

  // Caricamento iniziale dal Cloud Supabase + sincronizzazione periodica ogni 8 secondi
  const loadFromCloud = async (isFirstLoad = false) => {
    try {
      if (isFirstLoad) setCloudStatus('connecting');
      const rows = await supabaseFetchAllStore();
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

      setIsOnline(true);
      setCloudStatus('synced');
      setCloudErrorMsg('');
      if (isFirstLoad) setIsInitialCloudLoaded(true);
    } catch (err) {
      setIsOnline(false);
      setCloudStatus('error');
      setCloudErrorMsg(
        'Connessione al database in attesa: verifica di aver eseguito la query SQL su Supabase.'
      );
      if (isFirstLoad) setIsInitialCloudLoaded(true);
    }
  };

  useEffect(() => {
    loadFromCloud(true);
    const interval = setInterval(() => {
      loadFromCloud(false);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // Salvataggio sessione login locale
  useEffect(() => {
    try {
      localStorage.setItem('app_current_user', JSON.stringify(currentUser));
    } catch {}
  }, [currentUser]);

  // Funzioni wrapper per salvare immediatamente su Supabase ad ogni modifica
  const updateAgentsCloud = (updater) => {
    setAgents((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setCloudStatus('saving');
      supabaseUpsertKey('agents', next)
        .then(() => setCloudStatus('synced'))
        .catch(() => setCloudStatus('error'));
      return next;
    });
  };

  const updateCompaniesCloud = (updater) => {
    setCompanies((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setCloudStatus('saving');
      supabaseUpsertKey('companies', next)
        .then(() => setCloudStatus('synced'))
        .catch(() => setCloudStatus('error'));
      return next;
    });
  };

  const updateUpdatesCloud = (updater) => {
    setUpdates((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setCloudStatus('saving');
      supabaseUpsertKey('updates', next)
        .then(() => setCloudStatus('synced'))
        .catch(() => setCloudStatus('error'));
      return next;
    });
  };

  const updateClientsCloud = (updater) => {
    setClients((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setCloudStatus('saving');
      supabaseUpsertKey('clients', next)
        .then(() => setCloudStatus('synced'))
        .catch(() => setCloudStatus('error'));
      return next;
    });
  };

  const updateDeliveriesCloud = (updater) => {
    setDeliveries((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setCloudStatus('saving');
      supabaseUpsertKey('deliveries', next)
        .then(() => setCloudStatus('synced'))
        .catch(() => setCloudStatus('error'));
      return next;
    });
  };

  const updateWarehouseCloud = (updater) => {
    setWarehouseItems((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setCloudStatus('saving');
      supabaseUpsertKey('warehouse', next)
        .then(() => setCloudStatus('synced'))
        .catch(() => setCloudStatus('error'));
      return next;
    });
  };

  // Allinea azienda attiva
  useEffect(() => {
    if (companies.length > 0 && (!activeCompanyId || !companies.find((c) => c.id === activeCompanyId))) {
      setActiveCompanyId(companies[0].id);
    } else if (companies.length === 0) {
      setActiveCompanyId('');
    }
  }, [companies, activeCompanyId]);

  // Allinea aggiornamento attivo quando cambia azienda o filtro anno
  useEffect(() => {
    if (activeCompanyId) {
      const companyUpdates = updates.filter((u) => {
        const updYear = String(u.year || new Date().getFullYear());
        const matchYear = activeAgentYear === 'all' || updYear === activeAgentYear;
        return u.companyId === activeCompanyId && matchYear;
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

  // Login & Logout
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

  const handleLogout = () => {
    setCurrentUser(null);
  };

  // Crea la distinta materiali di default moltiplicando i pezzi unitari per la quantità kit
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

  // Aggiorna automaticamente le giacenze di magazzino in base ai materiali consegnati (delta: -1 scarico, +1 ripristino)
  const applyDeliveryToWarehouse = (companyId, updateObj, materialsList, kitQty, direction = -1) => {
    const normalizeLabel = (str) =>
      (str || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/(i|e|o|a)$/, '');

    const isMatchingName = (rawA, rawB) => {
      const a = (rawA || '').trim().toLowerCase();
      const b = (rawB || '').trim().toLowerCase();
      if (!a || !b) return false;
      if (a === b) return true;
      const stemA = normalizeLabel(a);
      const stemB = normalizeLabel(b);
      return stemA.length >= 4 && stemA === stemB;
    };

    const safeKitQty = Math.max(1, Number(kitQty) || 1);
    const itemsToAdjust = [];

    if (Array.isArray(materialsList) && materialsList.length > 0) {
      materialsList.forEach((m) => {
        itemsToAdjust.push({
          name: m.name,
          qty: Number(m.deliveredQty) || 0
        });
      });
    }

    if (updateObj && updateObj.title) {
      const alreadyIncluded = itemsToAdjust.some((it) => isMatchingName(it.name, updateObj.title));
      if (!alreadyIncluded) {
        itemsToAdjust.push({
          name: updateObj.title,
          qty: safeKitQty
        });
      }
    }

    if (itemsToAdjust.length === 0) return;

    updateWarehouseCloud((prev) =>
      prev.map((wItem) => {
        if (!wItem.name || !wItem.name.trim()) return wItem;

        if (wItem.companyId && companyId && wItem.companyId !== companyId) {
          return wItem;
        }

        let deltaTotal = 0;
        itemsToAdjust.forEach((adj) => {
          if (isMatchingName(adj.name, wItem.name)) {
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

  // Toggle spunta consegna rapida
  const handleToggleDelivery = (clientId, updateId, defaultTargetQty = 1) => {
    if (!currentUser) return;
    const existingIndex = deliveries.findIndex(
      (d) => d.clientId === clientId && d.updateId === updateId
    );
    const updateObj = updates.find((u) => u.id === updateId);

    if (existingIndex >= 0) {
      const existingRec = deliveries[existingIndex];
      const compId = existingRec.companyId || (updateObj ? updateObj.companyId : activeCompanyId);
      applyDeliveryToWarehouse(
        compId,
        updateObj,
        existingRec.deliveredMaterials,
        existingRec.quantity,
        +1
      );
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

  // Salvataggio dettagli consegna (quantità kit, singoli materiali, data/ora, note, alert)
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
    const isQtyModified = safeQty !== expectedQty;
    const effectiveAlert = !!alert || isQtyModified;

    const finalMaterials =
      deliveredMaterials && deliveredMaterials.length > 0
        ? deliveredMaterials
        : buildDefaultDeliveredMaterials(updateObj, safeQty);

    if (existingIndex >= 0) {
      const updated = [...deliveries];
      const prevRec = updated[existingIndex];
      applyDeliveryToWarehouse(
        compId,
        updateObj,
        prevRec.deliveredMaterials,
        prevRec.quantity,
        +1
      );
      applyDeliveryToWarehouse(compId, updateObj, finalMaterials, safeQty, -1);

      const qtyChangedFromPrev = prevRec.quantity !== safeQty;
      updated[existingIndex] = {
        ...prevRec,
        delivered: true,
        quantity: safeQty,
        expectedQuantityAtDelivery: expectedQty,
        qtyVariationAlert: isQtyModified,
        deliveredMaterials: finalMaterials,
        notes: notes || '',
        alert: effectiveAlert,
        alertResolved: effectiveAlert ? (qtyChangedFromPrev ? false : prevRec.alertResolved) : false,
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
        notes: notes || '',
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
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-100 text-slate-800 font-sans flex flex-col">
      {/* Header Principale */}
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
            {/* Stato Sincronizzazione Cloud Supabase */}
            <button
              type="button"
              onClick={() => loadFromCloud(false)}
              title="Clicca per aggiornare subito i dati dal Cloud"
              className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1 rounded-full text-xs font-medium transition-colors ${
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

            {/* Profilo e Logout */}
            <div className="flex items-center space-x-2 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700">
              <div className="text-xs text-right hidden sm:block">
                <div className="font-bold text-white">{currentUser.name}</div>
                <div className="text-[10px] text-indigo-400">
                  {currentUser.role === 'office' ? 'Sede / Admin' : 'Agente'}
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="p-1.5 bg-rose-600/80 hover:bg-rose-600 text-white rounded-lg text-xs font-semibold flex items-center space-x-1"
                title="Disconnetti"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Esci</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Contenuto Principale */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 py-4 sm:p-6 overflow-x-hidden">
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

// ----------------------------------------------------------------------------
// SCHERMATA DI LOGIN (SICURA PER PRODUZIONE)
// ----------------------------------------------------------------------------
function LoginScreen({ onLogin, cloudStatus, cloudErrorMsg }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    const res = onLogin(email, password);
    if (!res.success) {
      setError(res.error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden space-y-6 p-6 md:p-8">
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
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-colors shadow-md"
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
            {cloudStatus === 'synced'
              ? 'Database Cloud Connesso'
              : 'Verifica connessione database...'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// VISTA AGENTE (PROFILATA + CONSEGNA DETTAGLIATA MATERIALI)
// ----------------------------------------------------------------------------
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
    updates.forEach((u) => {
      yearsSet.add(String(u.year || new Date().getFullYear()));
    });
    return Array.from(yearsSet).sort((a, b) => Number(b) - Number(a));
  }, [updates]);

  const agentClients = useMemo(() => {
    return clients.filter((c) => {
      const isAssigned = c.agentId === currentUser.id || c.agentId === currentUser.name;
      const handlesCompany = Array.isArray(c.companyIds) && c.companyIds.includes(activeCompanyId);
      const matchesSearch =
        !searchTerm.trim() ||
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.province && c.province.toLowerCase().includes(searchTerm.toLowerCase()));
      return isAssigned && handlesCompany && matchesSearch;
    });
  }, [clients, currentUser, activeCompanyId, searchTerm]);

  const companyUpdates = useMemo(
    () =>
      updates.filter((u) => {
        const updYear = String(u.year || new Date().getFullYear());
        const matchYear = activeYear === 'all' || updYear === activeYear;
        return u.companyId === activeCompanyId && matchYear;
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
    <div className="space-y-5 max-w-full overflow-x-hidden">
      {/* Banner Agente Loggato */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="bg-indigo-600 p-2.5 rounded-full text-white shadow-sm flex-shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-slate-900 text-base truncate">{currentUser.name}</h2>
            <p className="text-xs text-slate-400 break-words">
              I tuoi clienti assegnati e aggiornamenti da consegnare
            </p>
          </div>
        </div>

        <div className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 flex items-center space-x-2.5 ml-auto sm:ml-0">
          <div className="text-right">
            <div className="text-[10px] text-slate-500 font-bold uppercase">Completamento</div>
            <div className="text-xs font-bold text-slate-800">
              {completedCount} / {agentClients.length} Clienti
            </div>
          </div>
          <div className="w-9 h-9 rounded-full border-4 border-indigo-600 flex items-center justify-center text-xs font-bold text-indigo-600 flex-shrink-0">
            {progressPct}%
          </div>
        </div>
      </div>

      {/* 1. SELEZIONA AZIENDA MANDANTE */}
      <div className="space-y-2">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          1. Seleziona Azienda Mandante
        </h2>
        {companies.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-sm">
            Nessuna azienda disponibile. Attendi l'inserimento delle mandanti da parte della Sede.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {companies.map((comp) => {
              const isActive = comp.id === activeCompanyId;
              return (
                <button
                  key={comp.id}
                  onClick={() => setActiveCompanyId(comp.id)}
                  className={`p-3.5 rounded-xl border text-left transition-all font-semibold text-sm flex items-center justify-between ${
                    isActive
                      ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
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

      {/* 2. SELEZIONA AGGIORNAMENTO E VISUALIZZA CONTENUTO STANDARD */}
      {activeCompanyId && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-3.5 sm:p-4 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider break-words">
              2. Seleziona Aggiornamento / Catalogo
            </h2>
            <span className="text-[11px] text-slate-400 break-words">
              Filtra per anno e scegli il catalogo
            </span>
          </div>

          {availableYears.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setActiveYear('all')}
                className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-1 min-w-0 ${
                  activeYear === 'all'
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center space-x-1.5 min-w-0">
                  <FolderOpen
                    className={`w-4 h-4 flex-shrink-0 ${
                      activeYear === 'all' ? 'text-white' : 'text-indigo-600'
                    }`}
                  />
                  <span className="font-bold text-xs truncate">Tutti gli Anni</span>
                </div>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                    activeYear === 'all'
                      ? 'bg-indigo-500 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
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
                    className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-1 min-w-0 ${
                      isSelected
                        ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                        : 'bg-amber-50/60 border-amber-200 text-amber-950 hover:bg-amber-100/70'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5 min-w-0">
                      {isSelected ? (
                        <FolderOpen className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      ) : (
                        <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      )}
                      <span className="font-bold text-xs truncate">Anno {yr}</span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                        isSelected
                          ? 'bg-slate-800 text-amber-300'
                          : 'bg-amber-200/80 text-amber-900'
                      }`}
                    >
                      {countInYear}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {companyUpdates.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl text-sm">
              Nessun aggiornamento attivo in questa cartella/anno per l'azienda selezionata.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {companyUpdates.map((upd) => {
                  const isSelected = currentUpdate && upd.id === currentUpdate.id;
                  const updYear = upd.year || new Date().getFullYear();
                  return (
                    <button
                      key={upd.id}
                      onClick={() => setActiveUpdateId(upd.id)}
                      className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all flex items-center space-x-2 ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <FileText className="w-4 h-4" />
                      <span>{upd.title}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                          isSelected
                            ? 'bg-indigo-500 text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {updYear}
                      </span>
                      {isSelected && <Check className="w-4 h-4 ml-1" />}
                    </button>
                  );
                })}
              </div>

              {currentUpdate && (
                <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-start space-x-2.5">
                    <Layers className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-indigo-950">
                        Contenuto Standard (1 Kit = {currentUpdate.title}):
                      </div>
                      {Array.isArray(currentUpdate.contentItems) &&
                      currentUpdate.contentItems.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {currentUpdate.contentItems.map((item) => (
                            <span
                              key={item.id}
                              className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-white text-indigo-700 border border-indigo-200 shadow-2xs"
                            >
                              {item.qty}x {item.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-indigo-700/80 mt-0.5">
                          Aggiornamento standard (nessun sotto-elemento specificato dalla Sede)
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 3. ELENCO CLIENTI DA SERVIRE */}
      {activeCompanyId && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-800">3. Elenco Clienti da Servire</h2>
              <p className="text-xs text-slate-400">
                Spunta il cliente o apri i dettagli per personalizzare i singoli materiali lasciati
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Cerca cliente o prov..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {!currentUpdate ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              Seleziona un aggiornamento attivo per visualizzare la lista clienti.
            </div>
          ) : agentClients.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm space-y-1">
              <p className="font-semibold text-slate-600">
                Nessun cliente assegnato per questa azienda.
              </p>
              <p className="text-xs">
                Verifica in Sede che il cliente sia associato al tuo profilo e a questa mandante.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {agentClients.map((client) => {
                const delivery = deliveries.find(
                  (d) => d.clientId === client.id && d.updateId === currentUpdate.id && d.delivered
                );
                const companyConfig = client.companyConfigs
                  ? client.companyConfigs[activeCompanyId]
                  : null;
                const defaultTargetQty = companyConfig ? Math.max(1, Number(companyConfig.quantity) || 1) : 1;

                return (
                  <ClientDeliveryRow
                    key={client.id}
                    client={client}
                    currentUpdate={currentUpdate}
                    delivery={delivery}
                    defaultTargetQty={defaultTargetQty}
                    onToggle={() =>
                      onToggleDelivery(client.id, currentUpdate.id, defaultTargetQty)
                    }
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

// Singola Riga Cliente nella Vista Agente con Personalizzazione Materiali Granulare
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
    const baseQty = delivery ? delivery.quantity || defaultTargetQty : defaultTargetQty;
    setQuantity(baseQty);
    setNotes(delivery ? delivery.notes || '' : '');
    setAlert(delivery ? !!delivery.alert : false);
    setCustomDateLocal(delivery ? toDateTimeLocal(delivery.deliveredAt) : toDateTimeLocal());

    if (hasContentItems) {
      const mapped = currentUpdate.contentItems.map((item) => {
        const existingMat = delivery?.deliveredMaterials?.find(
          (m) => m.id === item.id || m.name === item.name
        );
        const unitQty = Number(item.qty) || 1;
        return {
          id: item.id,
          name: item.name,
          unitQty,
          expectedTotal: unitQty * baseQty,
          deliveredQty: existingMat ? Number(existingMat.deliveredQty) : unitQty * baseQty
        };
      });
      setMaterialsState(mapped);
    } else {
      setMaterialsState([]);
    }
  }, [delivery, defaultTargetQty, currentUpdate, hasContentItems]);

  const handleKitQuantityChange = (newKitQty) => {
    const safeKit = Math.max(1, newKitQty);
    setQuantity(safeKit);
    if (hasContentItems) {
      setMaterialsState((prev) =>
        prev.map((m) => ({
          ...m,
          expectedTotal: m.unitQty * safeKit,
          deliveredQty: m.unitQty * safeKit
        }))
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

  const handleSave = () => {
    const isoDate = customDateLocal
      ? new Date(customDateLocal).toISOString()
      : new Date().toISOString();

    const cleanedMaterials = materialsState.map((m) => ({
      id: m.id,
      name: m.name,
      unitQty: m.unitQty,
      deliveredQty: m.deliveredQty
    }));

    onSaveDetails(quantity, cleanedMaterials, notes, alert, isoDate);
    setSavedBadge(true);
    setTimeout(() => setSavedBadge(false), 2000);
  };

  const isDelivered = !!delivery;
  const isQtyDifferentFromExpected = quantity !== defaultTargetQty;

  return (
    <div className="py-3.5 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-start space-x-3 min-w-0">
          <button
            type="button"
            onClick={onToggle}
            className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center transition-all border flex-shrink-0 ${
              isDelivered
                ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                : 'border-slate-300 bg-white hover:border-indigo-400'
            }`}
          >
            {isDelivered && <Check className="w-4 h-4 stroke-[3]" />}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`font-bold text-sm break-words ${
                  isDelivered ? 'line-through text-slate-500' : 'text-slate-900'
                }`}
              >
                {client.name}
              </span>

              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                <Package className="w-3 h-3 mr-1 flex-shrink-0" />
                Spettanti: {defaultTargetQty}
              </span>

              {delivery?.alert && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  <AlertTriangle className="w-3 h-3 mr-1 flex-shrink-0" />
                  Alert
                </span>
              )}
            </div>

            <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              <span>
                Prov: <strong className="text-slate-600">{client.province}</strong>
              </span>
              {isDelivered && (
                <span className="text-emerald-600 font-medium flex items-center">
                  <Calendar className="w-3 h-3 mr-1 flex-shrink-0" />
                  {formatDisplayDate(delivery.deliveredAt)}
                </span>
              )}
            </div>

            {isDelivered && delivery.deliveredMaterials && delivery.deliveredMaterials.length > 0 && (
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
          className="self-start sm:self-center ml-9 sm:ml-0 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50/70 sm:bg-transparent px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 flex items-center space-x-1 flex-shrink-0"
        >
          <span>{showDetails ? 'Chiudi' : 'Dettagli / Materiali'}</span>
          {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {showDetails && (
        <div className="bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-200 space-y-4 text-xs sm:ml-9">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 font-bold mb-1">
                Data & Ora Consegna
              </label>
              <input
                type="datetime-local"
                value={customDateLocal}
                onChange={(e) => setCustomDateLocal(e.target.value)}
                className="w-full max-w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
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
                  className="w-8 h-8 bg-white border border-slate-200 rounded-lg font-bold text-slate-700 hover:bg-slate-100"
                >
                  -
                </button>
                <span className="font-bold text-sm text-slate-900 px-3">{quantity}</span>
                <button
                  type="button"
                  onClick={() => handleKitQuantityChange(quantity + 1)}
                  className="w-8 h-8 bg-white border border-slate-200 rounded-lg font-bold text-slate-700 hover:bg-slate-100"
                >
                  +
                </button>
                <span className="text-[11px] text-slate-400 ml-1">
                  (Spettanti: {defaultTargetQty})
                </span>
              </div>
            </div>
          </div>

          {hasContentItems && (
            <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700 text-xs flex items-center">
                  <Layers className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                  Dettaglio Singoli Materiali Consegnati al Cliente
                </span>
                <span className="text-[10px] text-slate-400">
                  Modificabile singolarmente (es. più campionari)
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {materialsState.map((mat) => {
                  const isCustomDiff = mat.deliveredQty !== mat.unitQty * defaultTargetQty;
                  return (
                    <div
                      key={mat.id}
                      className="py-2 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-slate-800 break-words">{mat.name}</span>
                        <span className="text-[10px] text-slate-400 block sm:inline sm:ml-1.5">
                          ({mat.unitQty} per kit)
                        </span>
                        {isCustomDiff && (
                          <span className="inline-block mt-0.5 sm:mt-0 sm:ml-2 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                            Modificato
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleSingleMaterialChange(mat.id, -1)}
                          className="w-7 h-7 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-700"
                        >
                          -
                        </button>
                        <span className="font-black text-slate-900 w-6 text-center">
                          {mat.deliveredQty}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleSingleMaterialChange(mat.id, 1)}
                          className="w-7 h-7 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-700"
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

          <div>
            <label className="block text-slate-600 font-bold mb-1">
              Note Consegna / Richieste Specifiche
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Es. Lasciato 1 catalogo ma 2 campionari per nuovo venditore..."
              className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
            <div className="space-y-1">
              <label className="flex items-center space-x-2 cursor-pointer text-amber-700 font-semibold">
                <input
                  type="checkbox"
                  checked={alert || isQtyDifferentFromExpected}
                  disabled={isQtyDifferentFromExpected}
                  onChange={(e) => setAlert(e.target.checked)}
                  className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                />
                <span className="flex items-center">
                  <AlertTriangle className="w-3.5 h-3.5 mr-1 flex-shrink-0" />
                  Segnala Alert a Sede (Materiale Mancante / Extra)
                </span>
              </label>
              {isQtyDifferentFromExpected && (
                <p className="text-[11px] text-indigo-700 font-semibold pl-5">
                  ℹ️ Alert automatico attivo: hai modificato la quantità da {defaultTargetQty} a {quantity} kit (la Sede potrà aggiornare l'anagrafica).
                </p>
              )}
            </div>

            <div className="flex items-center space-x-2 self-end sm:self-auto">
              {savedBadge && (
                <span className="text-emerald-600 font-bold text-xs">✓ Salvato!</span>
              )}
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-colors shadow-sm"
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

// ----------------------------------------------------------------------------
// VISTA SEDE / COORDINATRICE
// ----------------------------------------------------------------------------
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
    <div className="space-y-6 max-w-full overflow-x-hidden">
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
              className={`flex items-center justify-center sm:justify-start space-x-1.5 px-2.5 sm:px-3.5 py-2 rounded-xl text-xs font-semibold transition-all min-w-0 ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{tab.label}</span>
              {tab.badge > 0 && (
                <span
                  className={`${
                    tab.badgeColor || 'bg-amber-500'
                  } text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1 flex-shrink-0`}
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
          companies={companies}
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
          deliveries={deliveries}
          setDeliveries={setDeliveries}
        />
      )}

      {activeTab === 'companies' && (
        <CompaniesUpdatesTab
          companies={companies}
          setCompanies={setCompanies}
          updates={updates}
          setUpdates={setUpdates}
          deliveries={deliveries}
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

// ----------------------------------------------------------------------------
// 1. DASHBOARD RIEPILOGATIVA
// ----------------------------------------------------------------------------
function DashboardTab({
  agents,
  companies,
  updates,
  clients,
  deliveries,
  warehouseItems = [],
  onNavigate
}) {
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
          <div className="text-xs text-slate-400 mt-1">Visite completate</div>
        </div>

        <div
          onClick={() => onNavigate('alerts')}
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:border-amber-300 transition-colors"
        >
          <div className="text-xs font-bold text-amber-500 uppercase">Alert Materiale Aperti</div>
          <div className="text-2xl font-black text-amber-600 mt-1">{activeAlerts.length}</div>
          <div className="text-xs text-slate-400 mt-1">Clicca per gestire</div>
        </div>

        <div
          onClick={() => onNavigate('warehouse')}
          className={`bg-white p-4 rounded-2xl border shadow-sm cursor-pointer transition-colors ${
            lowStockCount > 0
              ? 'border-rose-300 bg-rose-50/30 hover:border-rose-400'
              : 'border-slate-200 hover:border-indigo-300'
          }`}
        >
          <div
            className={`text-xs font-bold uppercase ${
              lowStockCount > 0 ? 'text-rose-600' : 'text-indigo-500'
            }`}
          >
            Scorte Magazzino < 5 pz
          </div>
          <div
            className={`text-2xl font-black mt-1 ${
              lowStockCount > 0 ? 'text-rose-600' : 'text-slate-800'
            }`}
          >
            {lowStockCount}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Su {warehouseItems.length} articoli a magazzino
          </div>
        </div>

        <div
          onClick={() => onNavigate('totals')}
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:border-emerald-300 transition-colors"
        >
          <div className="text-xs font-bold text-emerald-600 uppercase">Cataloghi Pubblicati</div>
          <div className="text-2xl font-black text-emerald-600 mt-1">{updates.length}</div>
          <div className="text-xs text-slate-400 mt-1">Vedi fabbisogno totale →</div>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-800 text-sm flex items-center">
          <BarChart2 className="w-4 h-4 mr-2 text-indigo-600" />
          Avanzamento Consegne per Agente
        </h3>

        {fieldAgents.length === 0 ? (
          <p className="text-xs text-slate-400">
            Nessun agente registrato. Vai nella scheda "Anagrafica Agenti" per crearli.
          </p>
        ) : (
          <div className="space-y-4">
            {fieldAgents.map((ag) => {
              const agClients = clients.filter(
                (c) => c.agentId === ag.id || c.agentId === ag.name
              );
              let totalExpectedTasks = 0;
              agClients.forEach((cl) => {
                (cl.companyIds || []).forEach((compId) => {
                  const compUpds = updates.filter((u) => u.companyId === compId);
                  totalExpectedTasks += compUpds.length;
                });
              });

              const agCompleted = deliveredRecords.filter((d) => d.agentId === ag.id).length;
              const pct =
                totalExpectedTasks > 0
                  ? Math.min(100, Math.round((agCompleted / totalExpectedTasks) * 100))
                  : 0;

              return (
                <div key={ag.id} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-800">
                      {ag.name} <span className="text-slate-400 font-normal">({ag.email})</span>
                    </span>
                    <span className="text-indigo-600">
                      {agCompleted} / {totalExpectedTasks} consegne ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5">
                    <div
                      className="bg-indigo-600 h-2.5 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
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

// ----------------------------------------------------------------------------
// 2. FABBISOGNO & TOTALI PER AZIENDA E TITOLO AGGIORNAMENTO
// ----------------------------------------------------------------------------
function RequirementsTotalsTab({ companies, updates, clients, deliveries }) {
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState('');
  const [selectedYearFolder, setSelectedYearFolder] = useState('all');

  const availableYears = useMemo(() => {
    const yearsSet = new Set();
    updates.forEach((u) => {
      yearsSet.add(String(u.year || new Date().getFullYear()));
    });
    return Array.from(yearsSet).sort((a, b) => Number(b) - Number(a));
  }, [updates]);

  const visibleCompanies = useMemo(() => {
    if (!selectedCompanyFilter) return companies;
    return companies.filter((c) => c.id === selectedCompanyFilter);
  }, [companies, selectedCompanyFilter]);

  const handleExportRequirementsExcel = () => {
    const headers = [
      'Anno',
      'Azienda Mandante',
      'Codice Azienda',
      'Titolo Aggiornamento',
      'Clienti Coinvolti',
      'Kit Totali da Richiedere',
      'Kit Consegnati',
      'Kit Mancanti',
      'Distinta Materiali (Necessari / Consegnati / Mancanti)'
    ];

    const rows = [];
    visibleCompanies.forEach((company) => {
      const companyUpdates = updates.filter((u) => {
        const updYear = String(u.year || new Date().getFullYear());
        const matchYear = selectedYearFolder === 'all' || updYear === selectedYearFolder;
        return u.companyId === company.id && matchYear;
      });
      const companyClients = clients.filter(
        (c) => Array.isArray(c.companyIds) && c.companyIds.includes(company.id)
      );
      const totalCompanyExpectedKits = companyClients.reduce((sum, cl) => {
        const q = cl.companyConfigs?.[company.id]?.quantity;
        return sum + Math.max(1, Number(q) || 1);
      }, 0);

      if (companyUpdates.length === 0) {
        if (selectedYearFolder === 'all') {
          rows.push([
            '-',
            company.name,
            company.code || '',
            'Nessun aggiornamento pubblicato',
            companyClients.length,
            totalCompanyExpectedKits,
            0,
            totalCompanyExpectedKits,
            '-'
          ]);
        }
      } else {
        companyUpdates.forEach((upd) => {
          const updYear = String(upd.year || new Date().getFullYear());
          const updDeliveries = deliveries.filter((d) => d.updateId === upd.id && d.delivered);
          const deliveredKits = updDeliveries.reduce((sum, d) => sum + (Number(d.quantity) || 1), 0);
          const remainingKits = Math.max(0, totalCompanyExpectedKits - deliveredKits);

          const matSummary = (upd.contentItems || [])
            .map((item) => {
              const unitQty = Number(item.qty) || 1;
              const totalNeeded = totalCompanyExpectedKits * unitQty;
              const totalDelivered = updDeliveries.reduce((sum, d) => {
                const found = d.deliveredMaterials?.find((m) => m.id === item.id || m.name === item.name);
                return sum + (found ? Number(found.deliveredQty) || 0 : (Number(d.quantity) || 1) * unitQty);
              }, 0);
              const rem = Math.max(0, totalNeeded - totalDelivered);
              return `${item.name}: ${totalNeeded} ord. / ${totalDelivered} cons. / ${rem} manc.`;
            })
            .join(' | ');

          rows.push([
            updYear,
            company.name,
            company.code || '',
            upd.title,
            companyClients.length,
            totalCompanyExpectedKits,
            deliveredKits,
            remainingKits,
            matSummary || `${totalCompanyExpectedKits} unità standard`
          ]);
        });
      }
    });

    const folderTag = selectedYearFolder === 'all' ? 'Tutti_Anni' : `Anno_${selectedYearFolder}`;
    exportToExcelCSV(`Fabbisogno_Aggiornamenti_${folderTag}`, headers, rows);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center">
              <Box className="w-5 h-5 mr-2 text-indigo-600" />
              Fabbisogno Totale Aggiornamenti & Materiali per Azienda
            </h3>
            <p className="text-xs text-slate-500">
              Calcolo automatico dei kit e dei singoli materiali da ordinare in base alle Qtà Spettanti dei clienti
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedCompanyFilter}
              onChange={(e) => setSelectedCompanyFilter(e.target.value)}
              className="text-xs p-2 border border-slate-200 rounded-xl bg-slate-50 font-semibold"
            >
              <option value="">Tutte le Aziende Mandanti</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleExportRequirementsExcel}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Esporta Excel</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <span className="text-[11px] font-bold text-slate-400 uppercase mr-1">
            Cartelle Annuali:
          </span>
          <button
            type="button"
            onClick={() => setSelectedYearFolder('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 border transition-all ${
              selectedYearFolder === 'all'
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Tutti gli Anni ({updates.length})</span>
          </button>

          {availableYears.map((yr) => {
            const countInYear = updates.filter(
              (u) => String(u.year || new Date().getFullYear()) === yr
            ).length;
            const isSelected = selectedYearFolder === yr;
            return (
              <button
                key={yr}
                type="button"
                onClick={() => setSelectedYearFolder(yr)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 border transition-all ${
                  isSelected
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                    : 'bg-amber-50/60 border-amber-200 text-amber-900 hover:bg-amber-100/70'
                }`}
              >
                {isSelected ? (
                  <FolderOpen className="w-3.5 h-3.5" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-amber-600" />
                )}
                <span>Anno {yr}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isSelected ? 'bg-indigo-500 text-white' : 'bg-amber-200/80 text-amber-900'
                  }`}
                >
                  {countInYear}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {visibleCompanies.length === 0 ? (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-sm text-slate-400">
          Nessuna azienda mandante configurata. Aggiungile in "Aziende & Cataloghi".
        </div>
      ) : (
        <div className="space-y-6">
          {visibleCompanies.map((company) => {
            const companyUpdates = updates.filter((u) => {
              const updYear = String(u.year || new Date().getFullYear());
              const matchYear = selectedYearFolder === 'all' || updYear === selectedYearFolder;
              return u.companyId === company.id && matchYear;
            });
            const companyClients = clients.filter(
              (c) => Array.isArray(c.companyIds) && c.companyIds.includes(company.id)
            );
            const totalCompanyExpectedKits = companyClients.reduce((sum, cl) => {
              const q = cl.companyConfigs?.[company.id]?.quantity;
              return sum + Math.max(1, Number(q) || 1);
            }, 0);

            return (
              <div
                key={company.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
              >
                <div className="bg-slate-900 text-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-base">{company.name}</span>
                      {company.code && (
                        <span className="text-[10px] bg-slate-700 px-2 py-0.5 rounded font-mono">
                          {company.code}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      {companyClients.length} clienti trattano questa azienda
                    </p>
                  </div>

                  <div className="bg-indigo-600/30 border border-indigo-400/30 px-3.5 py-2 rounded-xl text-right">
                    <div className="text-[10px] uppercase font-bold text-indigo-200">
                      Fabbisogno Base Azienda
                    </div>
                    <div className="text-sm font-black text-white">
                      {totalCompanyExpectedKits} Aggiornamenti Totali
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  {companyUpdates.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">
                      Nessun aggiornamento presente per {company.name} nella cartella selezionata. Serviranno comunque{' '}
                      <strong>{totalCompanyExpectedKits}</strong> copie al prossimo lancio.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {companyUpdates.map((upd) => {
                        const updYear = upd.year || new Date().getFullYear();
                        const updDeliveries = deliveries.filter(
                          (d) => d.updateId === upd.id && d.delivered
                        );
                        const deliveredClientsCount = updDeliveries.length;
                        const deliveredKits = updDeliveries.reduce(
                          (sum, d) => sum + (Number(d.quantity) || 1),
                          0
                        );
                        const remainingKits = Math.max(0, totalCompanyExpectedKits - deliveredKits);

                        return (
                          <div
                            key={upd.id}
                            className="border border-slate-200 rounded-xl p-4 bg-slate-50/70 space-y-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center space-x-1.5">
                                  <span className="text-[10px] font-bold uppercase text-indigo-600">
                                    Aggiornamento
                                  </span>
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">
                                    Anno {updYear}
                                  </span>
                                </div>
                                <h4 className="font-bold text-slate-900 text-sm mt-0.5">{upd.title}</h4>
                              </div>
                              <div className="text-right">
                                <span className="inline-block px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-black text-xs shadow-2xs">
                                  Totale da Richiedere: {totalCompanyExpectedKits}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-center bg-white p-2.5 rounded-xl border border-slate-200">
                              <div>
                                <div className="text-[10px] text-slate-400 font-bold uppercase">
                                  Necessari
                                </div>
                                <div className="text-sm font-black text-slate-800">
                                  {totalCompanyExpectedKits}
                                </div>
                              </div>
                              <div className="border-x border-slate-100">
                                <div className="text-[10px] text-emerald-600 font-bold uppercase">
                                  Consegnati
                                </div>
                                <div className="text-sm font-black text-emerald-600">
                                  {deliveredKits}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] text-amber-600 font-bold uppercase">
                                  Mancanti
                                </div>
                                <div className="text-sm font-black text-amber-600">
                                  {remainingKits}
                                </div>
                              </div>
                            </div>

                            {Array.isArray(upd.contentItems) && upd.contentItems.length > 0 && (
                              <div className="space-y-1.5 pt-1">
                                <div className="text-[11px] font-bold text-slate-600 uppercase">
                                  Dettaglio Singoli Materiali da Ordinare:
                                </div>
                                <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                                  {upd.contentItems.map((item) => {
                                    const unitQty = Number(item.qty) || 1;
                                    const totalItemNeeded = totalCompanyExpectedKits * unitQty;
                                    const totalItemDelivered = updDeliveries.reduce((sum, d) => {
                                      const found = d.deliveredMaterials?.find(
                                        (m) => m.id === item.id || m.name === item.name
                                      );
                                      if (found) return sum + (Number(found.deliveredQty) || 0);
                                      return sum + (Number(d.quantity) || 1) * unitQty;
                                    }, 0);
                                    const totalItemRemaining = Math.max(
                                      0,
                                      totalItemNeeded - totalItemDelivered
                                    );

                                    return (
                                      <div
                                        key={item.id}
                                        className="px-3 py-2 flex items-center justify-between text-xs"
                                      >
                                        <div>
                                          <span className="font-bold text-slate-800">
                                            {item.name}
                                          </span>
                                          <span className="text-[10px] text-slate-400 ml-1.5">
                                            ({unitQty} per aggiornamento)
                                          </span>
                                        </div>
                                        <div className="flex items-center space-x-2 text-right">
                                          <span className="font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                                            {totalItemNeeded} pz totali
                                          </span>
                                          <span className="text-[10px] text-slate-500">
                                            ({totalItemDelivered} cons. / {totalItemRemaining} manc.)
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            <div className="text-[11px] text-slate-500 flex justify-between pt-1">
                              <span>
                                Copertura clienti: <strong>{deliveredClientsCount}</strong> su{' '}
                                <strong>{companyClients.length}</strong>
                              </span>
                              <span>
                                {companyClients.length > 0
                                  ? Math.round(
                                      (deliveredClientsCount / companyClients.length) * 100
                                    )
                                  : 0}
                                % completato
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// 3. REGISTRO CONSEGNE & CLIENTI MANCANTI CON CARTELLE ANNUALI, FILTRI E RICERCA
// ----------------------------------------------------------------------------
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
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('');
  const [updateFilter, setUpdateFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('');
  const [onlyAlertsFilter, setOnlyAlertsFilter] = useState(false);

  const [editingDeliveryId, setEditingDeliveryId] = useState(null);
  const [editDateValue, setEditDateValue] = useState('');

  const yearFolders = useMemo(() => {
    const map = {};
    updates.forEach((u) => {
      const yr = String(u.year || new Date().getFullYear());
      if (!map[yr]) {
        map[yr] = { year: yr, updatesCount: 0, deliveredCount: 0, totalExpectedRows: 0 };
      }
      map[yr].updatesCount += 1;
      const eligibleClients = clients.filter(
        (cl) => Array.isArray(cl.companyIds) && cl.companyIds.includes(u.companyId)
      );
      map[yr].totalExpectedRows += eligibleClients.length;
      const done = eligibleClients.filter((cl) =>
        deliveries.some((d) => d.clientId === cl.id && d.updateId === u.id && d.delivered)
      ).length;
      map[yr].deliveredCount += done;
    });
    return Object.values(map).sort((a, b) => Number(b.year) - Number(a.year));
  }, [updates, clients, deliveries]);

  const handleSearchChange = (val) => {
    setSearchInput(val);
    setAppliedSearch(val);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setAppliedSearch(searchInput);
  };

  const handleResetFilters = () => {
    setSelectedYearFolder('all');
    setSearchInput('');
    setAppliedSearch('');
    setStatusFilter('all');
    setCompanyFilter('');
    setUpdateFilter('');
    setAgentFilter('');
    setProvinceFilter('');
    setOnlyAlertsFilter(false);
  };

  const availableProvinces = useMemo(() => {
    const set = new Set();
    clients.forEach((c) => {
      if (c.province && c.province.trim()) {
        set.add(c.province.trim().toUpperCase());
      }
    });
    return Array.from(set).sort();
  }, [clients]);

  const availableUpdates = useMemo(() => {
    return updates.filter((u) => {
      const updYear = String(u.year || new Date().getFullYear());
      const matchYear = selectedYearFolder === 'all' || updYear === selectedYearFolder;
      const matchCompany = !companyFilter || u.companyId === companyFilter;
      return matchYear && matchCompany;
    });
  }, [updates, companyFilter, selectedYearFolder]);

  const unifiedRows = useMemo(() => {
    const rows = [];

    updates.forEach((upd) => {
      const updYear = String(upd.year || new Date().getFullYear());
      const comp = companies.find((c) => c.id === upd.companyId);
      const eligibleClients = clients.filter(
        (cl) => Array.isArray(cl.companyIds) && cl.companyIds.includes(upd.companyId)
      );

      eligibleClients.forEach((cl) => {
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
          alert: deliv ? !!deliv.alert : false,
          alertResolved: deliv ? !!deliv.alertResolved : false
        });
      });
    });

    return rows.filter((r) => {
      if (selectedYearFolder !== 'all' && r.year !== selectedYearFolder) return false;
      if (statusFilter === 'delivered' && r.status !== 'delivered') return false;
      if (statusFilter === 'missing' && r.status !== 'missing') return false;
      if (companyFilter && r.company?.id !== companyFilter) return false;
      if (updateFilter && r.update?.id !== updateFilter) return false;
      if (agentFilter && r.agent?.id !== agentFilter) return false;
      if (
        provinceFilter &&
        (r.client?.province || '').trim().toUpperCase() !== provinceFilter
      ) {
        return false;
      }
      if (onlyAlertsFilter && !r.alert && !r.notes) return false;

      if (appliedSearch.trim()) {
        const q = appliedSearch.trim().toLowerCase();
        const matchClient = (r.client?.name || '').toLowerCase().includes(q);
        const matchProv = (r.client?.province || '').toLowerCase().includes(q);
        const matchAgent = (r.agent?.name || '').toLowerCase().includes(q);
        const matchCompany = (r.company?.name || '').toLowerCase().includes(q);
        const matchUpdate = (r.update?.title || '').toLowerCase().includes(q);
        const matchYear = (r.year || '').includes(q);
        const matchNotes = (r.notes || '').toLowerCase().includes(q);
        const matchMaterials = r.deliveredMaterials.some((m) =>
          (m.name || '').toLowerCase().includes(q)
        );
        if (
          !matchClient &&
          !matchProv &&
          !matchAgent &&
          !matchCompany &&
          !matchUpdate &&
          !matchYear &&
          !matchNotes &&
          !matchMaterials
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    updates,
    companies,
    clients,
    agents,
    deliveries,
    selectedYearFolder,
    statusFilter,
    companyFilter,
    updateFilter,
    agentFilter,
    provinceFilter,
    onlyAlertsFilter,
    appliedSearch
  ]);

  const totalFilteredCount = unifiedRows.length;
  const deliveredFilteredCount = unifiedRows.filter((r) => r.status === 'delivered').length;
  const missingFilteredCount = unifiedRows.filter((r) => r.status === 'missing').length;

  const handleDeleteDelivery = (deliveryId) => {
    const target = deliveries.find((d) => d.id === deliveryId);
    if (target && onRestoreWarehouseFromDelivery) {
      onRestoreWarehouseFromDelivery(target);
    }
    setDeliveries((prev) => prev.filter((d) => d.id !== deliveryId));
  };

  const handleStartEditDate = (delivery) => {
    setEditingDeliveryId(delivery.id);
    setEditDateValue(toDateTimeLocal(delivery.deliveredAt));
  };

  const handleSaveEditedDate = (deliveryId) => {
    if (editDateValue) {
      const iso = new Date(editDateValue).toISOString();
      setDeliveries((prev) =>
        prev.map((d) => (d.id === deliveryId ? { ...d, deliveredAt: iso } : d))
      );
    }
    setEditingDeliveryId(null);
  };

  const handleExportRegistryExcel = () => {
    const headers = [
      'Anno',
      'Stato',
      'Cliente',
      'Provincia',
      'Azienda Mandante',
      'Aggiornamento / Catalogo',
      'Agente',
      'Data e Ora Consegna',
      'Kit Spettanti',
      'Kit Consegnati',
      'Dettaglio Materiali Consegnati',
      'Alert Sede',
      'Note'
    ];

    const rows = unifiedRows.map((r) => {
      const matsString =
        r.status === 'delivered' && r.deliveredMaterials.length > 0
          ? r.deliveredMaterials.map((m) => `${m.deliveredQty}x ${m.name}`).join(', ')
          : r.status === 'missing'
          ? `Da consegnare (${r.expectedQty} kit)`
          : `${r.deliveredQty} kit`;

      return [
        r.year,
        r.status === 'delivered' ? 'Consegnato' : 'Da Consegnare (Mancante)',
        r.client?.name || 'N.D.',
        r.client?.province || '',
        r.company?.name || '',
        r.update?.title || '',
        r.agent?.name || 'Non assegnato',
        r.status === 'delivered' ? formatDisplayDate(r.deliveredAt) : 'In attesa',
        r.expectedQty,
        r.status === 'delivered' ? r.deliveredQty : 0,
        matsString,
        r.alert ? (r.alertResolved ? 'Alert Evaso' : 'ALERT APERTO') : 'No',
        r.notes || ''
      ];
    });

    const folderTag = selectedYearFolder === 'all' ? 'Tutti_Anni' : `Anno_${selectedYearFolder}`;
    exportToExcelCSV(`Registro_Consegne_${folderTag}`, headers, rows);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center">
            <FolderOpen className="w-4 h-4 mr-1.5 text-amber-500" />
            Cartelle Aggiornamenti per Anno
          </span>
          <span className="text-[11px] text-slate-400">
            Seleziona una cartella annuale per filtrare consegne, mancanti ed esportazione Excel
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
          <button
            type="button"
            onClick={() => {
              setSelectedYearFolder('all');
              setUpdateFilter('');
            }}
            className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
              selectedYearFolder === 'all'
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <FolderOpen
                className={`w-4 h-4 ${
                  selectedYearFolder === 'all' ? 'text-white' : 'text-indigo-600'
                }`}
              />
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  selectedYearFolder === 'all'
                    ? 'bg-indigo-500 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {updates.length} cat.
              </span>
            </div>
            <div className="mt-2">
              <div className="font-bold text-xs">Tutti gli Anni</div>
              <div
                className={`text-[10px] ${
                  selectedYearFolder === 'all' ? 'text-indigo-200' : 'text-slate-400'
                }`}
              >
                Archivio completo
              </div>
            </div>
          </button>

          {yearFolders.map((folder) => {
            const isSelected = selectedYearFolder === folder.year;
            const pct =
              folder.totalExpectedRows > 0
                ? Math.round((folder.deliveredCount / folder.totalExpectedRows) * 100)
                : 0;
            return (
              <button
                key={folder.year}
                type="button"
                onClick={() => {
                  setSelectedYearFolder(folder.year);
                  setUpdateFilter('');
                }}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                    : 'bg-amber-50/50 border-amber-200/80 text-slate-800 hover:bg-amber-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  {isSelected ? (
                    <FolderOpen className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Folder className="w-4 h-4 text-amber-500" />
                  )}
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      isSelected
                        ? 'bg-slate-800 text-amber-300'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {folder.updatesCount} agg.
                  </span>
                </div>
                <div className="mt-2">
                  <div className="font-black text-sm">Anno {folder.year}</div>
                  <div
                    className={`text-[10px] font-medium ${
                      isSelected ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {folder.deliveredCount}/{folder.totalExpectedRows} cons. ({pct}%)
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Cerca per Ragione Sociale cliente, provincia, agente, catalogo o note..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 shadow-sm"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Cerca</span>
          </button>
          <button
            type="button"
            onClick={handleResetFilters}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center justify-center space-x-1"
            title="Azzera filtri"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Azzera</span>
          </button>
          <button
            type="button"
            onClick={handleExportRegistryExcel}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 shadow-sm transition-colors"
            title="Esporta i risultati filtrati in Excel"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Esporta Excel</span>
          </button>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-2 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700"
          >
            <option value="all">Stato: Tutti ({totalFilteredCount})</option>
            <option value="delivered">✓ Solo Consegnati ({deliveredFilteredCount})</option>
            <option value="missing">⏳ Solo Mancanti / Da Consegnare ({missingFilteredCount})</option>
          </select>

          <select
            value={companyFilter}
            onChange={(e) => {
              setCompanyFilter(e.target.value);
              setUpdateFilter('');
            }}
            className="py-2 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700"
          >
            <option value="">Tutte le Aziende</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={updateFilter}
            onChange={(e) => setUpdateFilter(e.target.value)}
            className="py-2 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700"
          >
            <option value="">Tutti gli Aggiornamenti</option>
            {availableUpdates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.title} ({u.year || new Date().getFullYear()})
              </option>
            ))}
          </select>

          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="py-2 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700"
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

          <select
            value={provinceFilter}
            onChange={(e) => setProvinceFilter(e.target.value)}
            className="py-2 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700"
          >
            <option value="">Tutte le Province</option>
            {availableProvinces.map((prov) => (
              <option key={prov} value={prov}>
                Prov. {prov}
              </option>
            ))}
          </select>

          <label className="flex items-center space-x-2 px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyAlertsFilter}
              onChange={(e) => setOnlyAlertsFilter(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600"
            />
            <span className="truncate">Solo Alert / Note</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            {selectedYearFolder !== 'all' && (
              <span className="inline-flex items-center font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
                Cartella Anno {selectedYearFolder}
              </span>
            )}
            <span className="inline-flex items-center font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
              Consegnati: {deliveredFilteredCount}
            </span>
            <span className="inline-flex items-center font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
              <Clock className="w-3.5 h-3.5 mr-1.5" />
              Da Consegnare (Mancanti): {missingFilteredCount}
            </span>
          </div>

          <div className="text-slate-500 font-medium">
            Totale righe visualizzate: <strong>{totalFilteredCount}</strong>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
              <tr>
                <th className="p-3">Stato</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">Azienda / Catalogo (Anno)</th>
                <th className="p-3">Agente</th>
                <th className="p-3">Data Consegna</th>
                <th className="p-3">Materiali Consegnati / Spettanti</th>
                <th className="p-3">Note / Alert</th>
                <th className="p-3 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {unifiedRows.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-slate-400">
                    {updates.length === 0
                      ? 'Nessun aggiornamento ancora pubblicato. Crea un catalogo nella scheda "Aziende & Cataloghi".'
                      : 'Nessun cliente o consegna corrisponde ai filtri selezionati.'}
                  </td>
                </tr>
              ) : (
                unifiedRows.map((row) => {
                  const isDelivered = row.status === 'delivered';
                  return (
                    <tr
                      key={row.rowKey}
                      className={
                        isDelivered ? 'hover:bg-slate-50' : 'bg-amber-50/30 hover:bg-amber-50/60'
                      }
                    >
                      <td className="p-3 whitespace-nowrap">
                        {isDelivered ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Consegnato
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            <Clock className="w-3 h-3 mr-1" />
                            Mancante
                          </span>
                        )}
                      </td>

                      <td className="p-3">
                        <div className="font-bold text-slate-900">{row.client?.name}</div>
                        <div className="text-[11px] text-slate-400">
                          Prov: <strong>{row.client?.province || '-'}</strong>
                        </div>
                      </td>

                      <td className="p-3">
                        <div className="font-semibold text-slate-700">{row.company?.name}</div>
                        <div className="flex items-center space-x-1.5 mt-0.5">
                          <span className="text-[11px] font-bold text-indigo-600">
                            {row.update?.title}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                            {row.year}
                          </span>
                        </div>
                      </td>

                      <td className="p-3 font-medium text-slate-700">
                        {row.agent ? row.agent.name : <span className="text-rose-500">Non assegnato</span>}
                      </td>

                      <td className="p-3 whitespace-nowrap">
                        {isDelivered ? (
                          editingDeliveryId === row.delivery.id ? (
                            <div className="flex items-center space-x-1">
                              <input
                                type="datetime-local"
                                value={editDateValue}
                                onChange={(e) => setEditDateValue(e.target.value)}
                                className="p-1 border border-slate-300 rounded text-[11px]"
                              />
                              <button
                                onClick={() => handleSaveEditedDate(row.delivery.id)}
                                className="p-1 bg-emerald-600 text-white rounded"
                                title="Salva data"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center space-x-1.5 text-slate-600 font-medium">
                              <span>{formatDisplayDate(row.deliveredAt)}</span>
                              <button
                                onClick={() => handleStartEditDate(row.delivery)}
                                className="text-slate-400 hover:text-indigo-600"
                                title="Modifica data/ora"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                            </div>
                          )
                        ) : (
                          <span className="text-slate-400 italic">In attesa</span>
                        )}
                      </td>

                      <td className="p-3">
                        {isDelivered ? (
                          <div className="space-y-1">
                            <span className="font-bold text-slate-800">
                              {row.deliveredQty} kit
                            </span>
                            {row.deliveredMaterials.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {row.deliveredMaterials.map((m, i) => (
                                  <span
                                    key={i}
                                    className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-semibold border border-indigo-100"
                                  >
                                    {m.deliveredQty}x {m.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-amber-700 font-semibold">
                            Da consegnare: {row.expectedQty}{' '}
                            {row.expectedQty === 1 ? 'aggiornamento' : 'aggiornamenti'}
                          </span>
                        )}
                      </td>

                      <td className="p-3 max-w-xs">
                        {row.alert && (
                          <span className="inline-block text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded mr-1">
                            ⚠️ Alert Sede
                          </span>
                        )}
                        <span className="text-slate-600">{row.notes || '-'}</span>
                      </td>

                      <td className="p-3 text-right whitespace-nowrap">
                        {isDelivered && (
                          <button
                            onClick={() => handleDeleteDelivery(row.delivery.id)}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                            title="Annulla consegna e riporta come mancante"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 3B. GESTIONE MAGAZZINO SCORTE & SCARICO AUTOMATICO DA CONSEGNE
// ----------------------------------------------------------------------------
function WarehouseManagerTab({ companies, updates, warehouseItems, setWarehouseItems }) {
  const [companyId, setCompanyId] = useState('');
  const [materialName, setMaterialName] = useState('');
  const [quantity, setQuantity] = useState(10);
  const [notes, setNotes] = useState('');

  const [searchFilter, setSearchFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
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
      const newItem = {
        id: 'wh_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
        companyId: companyId || '',
        name: cleanName,
        quantity: qtyToAdd,
        notes: notes.trim(),
        updatedAt: new Date().toISOString()
      };
      setWarehouseItems((prev) => [newItem, ...prev]);
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

  const handleSetExactQuantity = (id, rawVal) => {
    const parsed = Math.max(0, parseInt(rawVal, 10) || 0);
    setWarehouseItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, quantity: parsed, updatedAt: new Date().toISOString() }
          : item
      )
    );
  };

  const handleDeleteStockItem = (id) => {
    setWarehouseItems((prev) => prev.filter((item) => item.id !== id));
  };

  const lowStockItems = useMemo(
    () => warehouseItems.filter((w) => Number(w.quantity) < 5),
    [warehouseItems]
  );

  const filteredItems = useMemo(() => {
    return warehouseItems.filter((item) => {
      if (companyFilter === '__none__' && item.companyId) return false;
      if (companyFilter && companyFilter !== '__none__' && item.companyId !== companyFilter) {
        return false;
      }
      if (onlyLowStock && Number(item.quantity) >= 5) return false;
      if (searchFilter.trim()) {
        const q = searchFilter.trim().toLowerCase();
        const comp = companies.find((c) => c.id === item.companyId);
        const matchName = (item.name || '').toLowerCase().includes(q);
        const matchNotes = (item.notes || '').toLowerCase().includes(q);
        const matchComp = (comp?.name || '').toLowerCase().includes(q);
        if (!matchName && !matchNotes && !matchComp) return false;
      }
      return true;
    });
  }, [warehouseItems, companyFilter, onlyLowStock, searchFilter, companies]);

  const handleExportWarehouseExcel = () => {
    const headers = [
      'Azienda Mandante',
      'Articolo / Materiale a Magazzino',
      'Giacenza Attuale (pz)',
      'Stato Scorta',
      'Note / Posizione',
      'Ultimo Aggiornamento'
    ];

    const rows = filteredItems.map((item) => {
      const comp = companies.find((c) => c.id === item.companyId);
      const qty = Number(item.quantity) || 0;
      return [
        comp ? comp.name : 'Generico / Varie',
        item.name,
        qty,
        qty < 5 ? 'SCORTA BASSA (< 5 pz) - DA INTEGRARE' : 'Disponibile',
        item.notes || '',
        item.updatedAt ? formatDisplayDate(item.updatedAt) : ''
      ];
    });

    exportToExcelCSV('Giacenze_Magazzino_Sede', headers, rows);
  };

  return (
    <div className="space-y-6">
      {lowStockItems.length > 0 && (
        <div className="bg-rose-50 border border-rose-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-rose-800 text-sm">
                Attenzione: {lowStockItems.length}{' '}
                {lowStockItems.length === 1
                  ? 'materiale sotto le 5 unità'
                  : 'materiali sotto le 5 unità'}{' '}
                a magazzino!
              </h4>
              <p className="text-xs text-rose-700 mt-0.5">
                Richiedi il reintegro per:{' '}
                <strong>
                  {lowStockItems.map((i) => `${i.name} (${i.quantity} pz)`).join(', ')}
                </strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOnlyLowStock(!onlyLowStock)}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl self-start sm:self-center flex-shrink-0"
          >
            {onlyLowStock ? 'Mostra Tutto il Magazzino' : 'Filtra Solo Scorte Basse'}
          </button>
        </div>
      )}

      <form
        onSubmit={handleAddStockItem}
        className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4"
      >
        <div>
          <h3 className="font-bold text-slate-900 text-base flex items-center">
            <Package className="w-5 h-5 mr-2 text-indigo-600" />
            Carico & Inserimento Materiali a Magazzino
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Inserisci qualsiasi scorta fisica presente in ufficio (es. Listino divani, Fotografico letti, Campione giallo). Se il nome coincide con un materiale degli aggiornamenti, si scaricherà in automatico ad ogni consegna degli agenti!
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-3">
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
              Azienda (Opzionale)
            </label>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full p-2.5 text-xs border border-slate-200 rounded-xl bg-white"
            >
              <option value="">-- Generico / Tutte --</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-4">
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
              Nome Materiale / Scorta (Campo Libero)
            </label>
            <input
              type="text"
              required
              list="warehouse-material-suggestions"
              placeholder="Es. Listino divani, Campione rosso, Catalogo..."
              value={materialName}
              onChange={(e) => setMaterialName(e.target.value)}
              className="w-full p-2.5 text-xs border border-slate-200 rounded-xl"
            />
            <datalist id="warehouse-material-suggestions">
              {suggestedMaterialNames.map((sName) => (
                <option key={sName} value={sName} />
              ))}
            </datalist>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
              Quantità (pz)
            </label>
            <input
              type="number"
              required
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full p-2.5 text-xs border border-slate-200 rounded-xl font-bold text-center"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
              Note / Scaffale
            </label>
            <input
              type="text"
              placeholder="Es. Scaffale B, Colore giallo..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2.5 text-xs border border-slate-200 rounded-xl"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400">
            💡 Suggerimento: se inserisci un materiale già presente per la stessa azienda, la quantità verrà sommata alla giacenza esistente.
          </span>
          <button
            type="submit"
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm"
          >
            + Aggiungi / Carica a Magazzino
          </button>
        </div>
      </form>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="font-bold text-sm text-slate-900">
              Giacenze Attuali a Magazzino ({filteredItems.length})
            </h4>
            <p className="text-[11px] text-slate-400">
              Gli articoli con meno di 5 unità vengono evidenziati automaticamente in rosso
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-52">
              <Search className="w-4 h-4 absolute left-3 top-2 text-slate-400" />
              <input
                type="text"
                placeholder="Cerca materiale..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>

            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl"
            >
              <option value="">Tutte le Aziende</option>
              <option value="__none__">Solo Generico / Varie</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <label className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-rose-50/70 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyLowStock}
                onChange={(e) => setOnlyLowStock(e.target.checked)}
                className="rounded border-rose-300 text-rose-600"
              />
              <span>Solo < 5 pz</span>
            </label>

            <button
              type="button"
              onClick={handleExportWarehouseExcel}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Esporta Excel</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
              <tr>
                <th className="p-3">Materiale / Articolo</th>
                <th className="p-3">Azienda</th>
                <th className="p-3 text-center">Giacenza Attuale</th>
                <th className="p-3">Stato Scorta</th>
                <th className="p-3">Note</th>
                <th className="p-3 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-400">
                    Nessun materiale registrato a magazzino. Usa il modulo qui sopra per inserire le tue scorte.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const comp = companies.find((c) => c.id === item.companyId);
                  const qty = Number(item.quantity) || 0;
                  const isLowStock = qty < 5;

                  return (
                    <tr
                      key={item.id}
                      className={
                        isLowStock
                          ? 'bg-rose-50/80 hover:bg-rose-100/70 transition-colors'
                          : 'hover:bg-slate-50'
                      }
                    >
                      <td className="p-3">
                        <div
                          className={`font-bold text-sm ${
                            isLowStock ? 'text-rose-600' : 'text-slate-900'
                          }`}
                        >
                          {item.name}
                        </div>
                        {item.updatedAt && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Aggiornato: {formatDisplayDate(item.updatedAt)}
                          </div>
                        )}
                      </td>

                      <td className="p-3">
                        {comp ? (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                            {comp.name}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Generico</span>
                        )}
                      </td>

                      <td className="p-3">
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            type="button"
                            onClick={() => handleAdjustQuantity(item.id, -1)}
                            className="w-7 h-7 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 font-bold text-slate-700"
                            title="Scarica 1 pezzo"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={qty}
                            onChange={(e) => handleSetExactQuantity(item.id, e.target.value)}
                            className={`w-16 p-1 text-center font-black text-sm rounded-lg border ${
                              isLowStock
                                ? 'bg-white border-rose-300 text-rose-600'
                                : 'bg-white border-slate-200 text-slate-900'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => handleAdjustQuantity(item.id, +1)}
                            className="w-7 h-7 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 font-bold text-slate-700"
                            title="Carica 1 pezzo"
                          >
                            +
                          </button>
                        </div>
                      </td>

                      <td className="p-3 whitespace-nowrap">
                        {isLowStock ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700 border border-rose-300">
                            <AlertTriangle className="w-3.5 h-3.5 mr-1 text-rose-600" />
                            Scorta bassa (< 5 pz)
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            ✓ Disponibile
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-slate-600">{item.notes || '-'}</td>

                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteStockItem(item.id)}
                          className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-lg"
                          title="Rimuovi articolo dal magazzino"
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
    </div>
  );
}

// ----------------------------------------------------------------------------
// 4. ALERT MATERIALI SEDE
// ----------------------------------------------------------------------------
function AlertsTab({ agents, companies, updates, clients, setClients, deliveries, setDeliveries }) {
  const alertDeliveries = deliveries.filter((d) => d.delivered && d.alert);

  const handleResolveAlert = (id) => {
    setDeliveries((prev) =>
      prev.map((d) => (d.id === id ? { ...d, alertResolved: true } : d))
    );
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
          const nextIds = existingIds.includes(compId) ? existingIds : [...existingIds, compId];
          return {
            ...c,
            companyIds: nextIds,
            companyConfigs: {
              ...(c.companyConfigs || {}),
              [compId]: {
                ...(c.companyConfigs?.[compId] || { enabled: true }),
                enabled: true,
                quantity: newQty
              }
            }
          };
        })
      );
    }

    setDeliveries((prev) =>
      prev.map((d) =>
        d.id === del.id ? { ...d, alertResolved: true, masterUpdated: true } : d
      )
    );
  };

  const handleRemoveAlert = (id) => {
    setDeliveries((prev) =>
      prev.map((d) =>
        d.id === id
          ? { ...d, alert: false, alertResolved: false, qtyVariationAlert: false }
          : d
      )
    );
  };

  const handleExportAlertsExcel = () => {
    const headers = [
      'Stato Alert',
      'Tipologia Alert',
      'Data Segnalazione',
      'Cliente',
      'Provincia',
      'Agente',
      'Azienda Mandante',
      'Aggiornamento / Catalogo',
      'Qtà Spettante Originale',
      'Qtà Consegnata',
      'Note / Richiesta Materiale'
    ];

    const rows = alertDeliveries.map((del) => {
      const client = clients.find((c) => c.id === del.clientId);
      const agent = agents.find((a) => a.id === del.agentId);
      const update = updates.find((u) => u.id === del.updateId);
      const company = companies.find(
        (c) => c.id === (update ? update.companyId : del.companyId)
      );
      const origQty =
        del.expectedQuantityAtDelivery ||
        (company && client?.companyConfigs?.[company.id]?.quantity) ||
        1;

      return [
        del.alertResolved ? 'Evaso / Aggiornato' : 'DA GESTIRE',
        del.qtyVariationAlert ? 'Variazione Quantità Kit' : 'Segnalazione Materiale / Note',
        formatDisplayDate(del.deliveredAt),
        client?.name || 'N.D.',
        client?.province || '',
        agent?.name || 'N.D.',
        company?.name || '',
        update?.title || '',
        origQty,
        del.quantity || 1,
        del.notes || ''
      ];
    });

    exportToExcelCSV('Alert_Materiali_e_Variazioni', headers, rows);
  };

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-900 text-base flex items-center">
            <AlertTriangle className="w-5 h-5 mr-2 text-amber-500" />
            Alert Materiali & Variazioni Quantità da Agenti
          </h3>
          <p className="text-xs text-slate-500">
            Gestisci le richieste di materiale extra e aggiorna all'origine le quantità spettanti modificate dagli agenti
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportAlertsExcel}
          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 shadow-sm self-start sm:self-auto"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Esporta Excel</span>
        </button>
      </div>

      {alertDeliveries.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm">
          Nessun alert materiale o variazione quantità segnalata dagli agenti.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {alertDeliveries.map((del) => {
            const client = clients.find((c) => c.id === del.clientId);
            const agent = agents.find((a) => a.id === del.agentId);
            const update = updates.find((u) => u.id === del.updateId);
            const company = companies.find(
              (c) => c.id === (update ? update.companyId : del.companyId)
            );
            const origQty =
              del.expectedQuantityAtDelivery ||
              (company && client?.companyConfigs?.[company.id]?.quantity) ||
              1;
            const currentMasterQty =
              company && client?.companyConfigs?.[company.id]?.quantity
                ? Number(client.companyConfigs[company.id].quantity)
                : origQty;
            const deliveredQty = Number(del.quantity) || 1;
            const hasQtyVariation = del.qtyVariationAlert || deliveredQty !== origQty;

            return (
              <div
                key={del.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-sm text-slate-900">
                      {client ? `${client.name} (${client.province})` : 'Cliente N.D.'}
                    </span>

                    {hasQtyVariation && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                        🔄 Variazione Quantità: da {origQty} a {deliveredQty} kit
                      </span>
                    )}

                    {del.alertResolved ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                        {del.masterUpdated ? '✓ Anagrafica Aggiornata' : '✓ Evaso'}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                        Da Gestire
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-500">
                    Agente: <strong>{agent ? agent.name : 'N.D.'}</strong> | Azienda:{' '}
                    <strong>{company ? company.name : 'N.D.'}</strong> | Catalogo:{' '}
                    <strong>{update ? update.title : 'N.D.'}</strong>
                  </div>

                  {hasQtyVariation && (
                    <div className="text-[11px] text-slate-600">
                      Qtà Spettante attuale in anagrafica: <strong>{currentMasterQty} kit</strong> → Consegnati dall'agente: <strong>{deliveredQty} kit</strong>
                    </div>
                  )}

                  {del.notes && (
                    <div className="text-xs bg-amber-50 text-amber-900 border border-amber-200 p-2 rounded-lg font-medium">
                      "{del.notes}"
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                  {hasQtyVariation && currentMasterQty !== deliveredQty && (
                    <button
                      type="button"
                      onClick={() => handleApplyQtyToClientMaster(del)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center shadow-xs"
                      title="Modifica la Qtà Spettante del cliente in anagrafica"
                    >
                      <Check className="w-3.5 h-3.5 mr-1" />
                      Aggiorna Anagrafica a {deliveredQty}
                    </button>
                  )}

                  {!del.alertResolved && (
                    <button
                      type="button"
                      onClick={() => handleResolveAlert(del.id)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center"
                    >
                      <Check className="w-3.5 h-3.5 mr-1" />
                      Marca Evaso
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleRemoveAlert(del.id)}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                    title="Elimina alert"
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

// ----------------------------------------------------------------------------
// 5. GESTIONE CLIENTI (CREAZIONE E MODIFICA CON QTÀ SPETTANTI PER AZIENDA)
// ----------------------------------------------------------------------------
function ClientsManagerTab({ agents, companies, clients, setClients, deliveries, setDeliveries }) {
  const [editingClientId, setEditingClientId] = useState(null);
  const [name, setName] = useState('');
  const [province, setProvince] = useState('');
  const [agentId, setAgentId] = useState('');
  const [companyConfigs, setCompanyConfigs] = useState({});
  const [searchFilter, setSearchFilter] = useState('');

  const fieldAgents = agents.filter((a) => a.role === 'agent');

  const resetForm = () => {
    setEditingClientId(null);
    setName('');
    setProvince('');
    setAgentId('');
    setCompanyConfigs({});
  };

  const handleSaveClient = (e) => {
    e.preventDefault();
    if (!name.trim() || !province.trim() || !agentId) return;

    const activeCompanyIds = Object.keys(companyConfigs).filter(
      (compId) => companyConfigs[compId]?.enabled
    );

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
    } else {
      const newClient = {
        id: 'cl_' + Date.now(),
        name: name.trim(),
        province: province.trim().toUpperCase(),
        agentId,
        companyIds: activeCompanyIds,
        companyConfigs
      };
      setClients((prev) => [...prev, newClient]);
    }
    resetForm();
  };

  const handleEditClient = (cl) => {
    setEditingClientId(cl.id);
    setName(cl.name);
    setProvince(cl.province || '');
    setAgentId(cl.agentId || '');
    const restoredConfigs = {};
    (cl.companyIds || []).forEach((compId) => {
      restoredConfigs[compId] = {
        enabled: true,
        quantity: cl.companyConfigs?.[compId]?.quantity || 1
      };
    });
    setCompanyConfigs(restoredConfigs);
  };

  const handleDeleteClient = (id) => {
    setClients((prev) => prev.filter((c) => c.id !== id));
    setDeliveries((prev) => prev.filter((d) => d.clientId !== id));
  };

  const toggleCompany = (compId) => {
    const curr = companyConfigs[compId] || { enabled: false, quantity: 1 };
    setCompanyConfigs({
      ...companyConfigs,
      [compId]: { ...curr, enabled: !curr.enabled }
    });
  };

  const changeTargetQty = (compId, qty) => {
    const curr = companyConfigs[compId] || { enabled: true, quantity: 1 };
    setCompanyConfigs({
      ...companyConfigs,
      [compId]: { ...curr, quantity: Math.max(1, parseInt(qty, 10) || 1) }
    });
  };

  const filteredClients = clients.filter(
    (c) =>
      !searchFilter.trim() ||
      c.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      (c.province && c.province.toLowerCase().includes(searchFilter.toLowerCase()))
  );

  const handleExportClientsExcel = () => {
    const headers = [
      'Ragione Sociale Cliente',
      'Provincia',
      'Agente Assegnato',
      'Aziende Trattate e Qtà Spettanti'
    ];

    const rows = filteredClients.map((c) => {
      const ag = agents.find((a) => a.id === c.agentId);
      const companiesText = (c.companyIds || [])
        .map((compId) => {
          const comp = companies.find((co) => co.id === compId);
          const qty = c.companyConfigs?.[compId]?.quantity || 1;
          return comp ? `${comp.name} (${qty} kit)` : null;
        })
        .filter(Boolean)
        .join(' | ');

      return [
        c.name,
        c.province || '',
        ag ? ag.name : 'Non assegnato',
        companiesText || 'Nessuna azienda'
      ];
    });

    exportToExcelCSV('Anagrafica_Clienti_e_Spettanze', headers, rows);
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSaveClient}
        className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm">
            {editingClientId ? 'Modifica Cliente' : 'Aggiungi Nuovo Cliente'}
          </h3>
          {editingClientId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-slate-500 hover:text-slate-800 underline"
            >
              Annulla Modifica
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            required
            placeholder="Ragione Sociale Cliente"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="p-2.5 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="text"
            required
            placeholder="Provincia (es. TV, VE, PD)"
            value={province}
            onChange={(e) => setProvince(e.target.value)}
            className="p-2.5 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
          />
          <select
            required
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="p-2.5 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="">-- Assegna ad Agente --</option>
            {fieldAgents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
            Aziende Trattate & Qtà Spettante di Aggiornamenti per Cliente:
          </label>
          {companies.length === 0 ? (
            <p className="text-xs text-amber-600">
              Inserisci prima le Aziende Mandanti nella scheda "Aziende & Cataloghi".
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {companies.map((comp) => {
                const cfg = companyConfigs[comp.id] || { enabled: false, quantity: 1 };
                return (
                  <div
                    key={comp.id}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all ${
                      cfg.enabled
                        ? 'bg-indigo-50/60 border-indigo-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <label className="flex items-center space-x-2 cursor-pointer font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={cfg.enabled}
                        onChange={() => toggleCompany(comp.id)}
                        className="rounded border-slate-300 text-indigo-600"
                      />
                      <span>{comp.name}</span>
                    </label>

                    {cfg.enabled && (
                      <div className="flex items-center space-x-1.5">
                        <span className="text-[10px] text-slate-500 font-bold">Qtà Spettante:</span>
                        <input
                          type="number"
                          min="1"
                          value={cfg.quantity}
                          onChange={(e) => changeTargetQty(comp.id, e.target.value)}
                          className="w-12 p-1 border border-indigo-200 rounded-lg bg-white font-bold text-center text-xs text-indigo-700"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="submit"
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm"
        >
          {editingClientId ? 'Salva Modifiche Cliente' : '+ Salva Cliente'}
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h4 className="font-bold text-sm text-slate-800">
            Elenco Clienti ({filteredClients.length})
          </h4>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-2 text-slate-400" />
              <input
                type="text"
                placeholder="Cerca cliente o provincia..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
            <button
              type="button"
              onClick={handleExportClientsExcel}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center space-x-1.5 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Esporta Excel</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
              <tr>
                <th className="p-3">Ragione Sociale</th>
                <th className="p-3">Provincia</th>
                <th className="p-3">Agente Assegnato</th>
                <th className="p-3">Aziende & Qtà Spettanti</th>
                <th className="p-3 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-6 text-center text-slate-400">
                    Nessun cliente presente.
                  </td>
                </tr>
              ) : (
                filteredClients.map((c) => {
                  const ag = agents.find((a) => a.id === c.agentId);
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-900">{c.name}</td>
                      <td className="p-3 font-semibold text-slate-600">{c.province}</td>
                      <td className="p-3 font-medium text-indigo-600">
                        {ag ? ag.name : 'Non assegnato'}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1.5">
                          {(c.companyIds || []).map((compId) => {
                            const comp = companies.find((co) => co.id === compId);
                            const qty = c.companyConfigs?.[compId]?.quantity || 1;
                            return comp ? (
                              <span
                                key={compId}
                                className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md text-[10px] font-bold border border-indigo-100"
                              >
                                {comp.name}: {qty} pz
                              </span>
                            ) : null;
                          })}
                        </div>
                      </td>
                      <td className="p-3 text-right whitespace-nowrap space-x-1">
                        <button
                          onClick={() => handleEditClient(c)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                          title="Modifica cliente"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteClient(c.id)}
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
    </div>
  );
}

// ----------------------------------------------------------------------------
// 6. AZIENDE & AGGIORNAMENTI CON CONTENUTO MATERIALI DETTAGLIATO
// ----------------------------------------------------------------------------
function CompaniesUpdatesTab({
  companies,
  setCompanies,
  updates,
  setUpdates,
  deliveries,
  setDeliveries
}) {
  const [companyName, setCompanyName] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [editingCompanyId, setEditingCompanyId] = useState(null);

  const [editingUpdateId, setEditingUpdateId] = useState(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [updateTitle, setUpdateTitle] = useState('');
  const [updateYear, setUpdateYear] = useState(String(new Date().getFullYear()));
  const [updateListYearFilter, setUpdateListYearFilter] = useState('all');
  const [contentItems, setContentItems] = useState([
    { id: 'item_init_1', name: 'Catalogo', qty: 1 }
  ]);
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
      const newComp = {
        id: 'comp_' + Date.now(),
        name: companyName.trim(),
        code: companyCode.trim() || companyName.substring(0, 3).toUpperCase()
      };
      setCompanies((prev) => [...prev, newComp]);
    }
    setCompanyName('');
    setCompanyCode('');
  };

  const handleEditCompany = (comp) => {
    setEditingCompanyId(comp.id);
    setCompanyName(comp.name);
    setCompanyCode(comp.code || '');
  };

  const handleDeleteCompany = (id) => {
    setCompanies((prev) => prev.filter((c) => c.id !== id));
    setUpdates((prev) => prev.filter((u) => u.companyId !== id));
  };

  const handleAddContentItem = () => {
    if (!newItemName.trim()) return;
    const item = {
      id: 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
      name: newItemName.trim(),
      qty: Math.max(1, parseInt(newItemQty, 10) || 1)
    };
    setContentItems((prev) => [...prev, item]);
    setNewItemName('');
    setNewItemQty(1);
  };

  const handleRemoveContentItem = (itemId) => {
    setContentItems((prev) => prev.filter((i) => i.id !== itemId));
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
    const cleanYear = String(updateYear || new Date().getFullYear()).trim();

    if (editingUpdateId) {
      setUpdates((prev) =>
        prev.map((u) =>
          u.id === editingUpdateId
            ? {
                ...u,
                companyId: compId,
                title: updateTitle.trim(),
                year: cleanYear,
                contentItems: [...contentItems]
              }
            : u
        )
      );
    } else {
      const newUpd = {
        id: 'upd_' + Date.now(),
        companyId: compId,
        title: updateTitle.trim(),
        year: cleanYear,
        contentItems: [...contentItems],
        createdAt: new Date().toISOString()
      };
      setUpdates((prev) => [...prev, newUpd]);
    }
    resetUpdateForm();
  };

  const handleEditUpdate = (upd) => {
    setEditingUpdateId(upd.id);
    setSelectedCompanyId(upd.companyId);
    setUpdateTitle(upd.title);
    setUpdateYear(String(upd.year || new Date().getFullYear()));
    setContentItems(
      Array.isArray(upd.contentItems) && upd.contentItems.length > 0 ? [...upd.contentItems] : []
    );
  };

  const handleDeleteUpdate = (id) => {
    setUpdates((prev) => prev.filter((u) => u.id !== id));
    setDeliveries((prev) => prev.filter((d) => d.updateId !== id));
  };

  const updateYearsList = useMemo(() => {
    const s = new Set();
    updates.forEach((u) => s.add(String(u.year || new Date().getFullYear())));
    return Array.from(s).sort((a, b) => Number(b) - Number(a));
  }, [updates]);

  const filteredUpdatesList = useMemo(() => {
    if (updateListYearFilter === 'all') return updates;
    return updates.filter(
      (u) => String(u.year || new Date().getFullYear()) === updateListYearFilter
    );
  }, [updates, updateListYearFilter]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm">
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
              className="text-xs text-slate-400 hover:text-slate-700 underline"
            >
              Annulla
            </button>
          )}
        </div>

        <form onSubmit={handleSaveCompany} className="space-y-2.5">
          <input
            type="text"
            required
            placeholder="Nome Azienda (es. Le Comfort)"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full p-2.5 text-xs border border-slate-200 rounded-xl"
          />
          <input
            type="text"
            placeholder="Sigla Breve (es. LCF)"
            value={companyCode}
            onChange={(e) => setCompanyCode(e.target.value)}
            className="w-full p-2.5 text-xs border border-slate-200 rounded-xl"
          />
          <button
            type="submit"
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm"
          >
            {editingCompanyId ? 'Salva Modifica Azienda' : '+ Aggiungi Azienda'}
          </button>
        </form>

        <div className="divide-y divide-slate-100 pt-2">
          {companies.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">Nessuna azienda inserita.</p>
          ) : (
            companies.map((comp) => (
              <div key={comp.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-bold text-sm text-slate-800">{comp.name}</span>
                  <span className="ml-2 text-xs text-slate-400">({comp.code})</span>
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => handleEditCompany(comp)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg"
                    title="Modifica azienda"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteCompany(comp.id)}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                    title="Elimina azienda"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm">
            {editingUpdateId
              ? 'Modifica Aggiornamento & Distinta Materiali'
              : '2. Pubblica Aggiornamento / Catalogo'}
          </h3>
          {editingUpdateId && (
            <button
              type="button"
              onClick={resetUpdateForm}
              className="text-xs text-slate-400 hover:text-slate-700 underline"
            >
              Annulla
            </button>
          )}
        </div>

        <form onSubmit={handleSaveUpdate} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-5">
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                Azienda Mandante
              </label>
              <select
                required
                value={selectedCompanyId || (companies[0] && companies[0].id) || ''}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                className="w-full p-2.5 text-xs border border-slate-200 rounded-xl bg-white"
              >
                <option value="">-- Seleziona Azienda --</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-5">
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                Titolo Aggiornamento
              </label>
              <input
                type="text"
                required
                placeholder="Es. Daytime 2026"
                value={updateTitle}
                onChange={(e) => setUpdateTitle(e.target.value)}
                className="w-full p-2.5 text-xs border border-slate-200 rounded-xl"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                Anno
              </label>
              <input
                type="number"
                required
                min="2020"
                max="2099"
                value={updateYear}
                onChange={(e) => setUpdateYear(e.target.value)}
                className="w-full p-2.5 text-xs border border-slate-200 rounded-xl font-bold text-center"
              />
            </div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
            <div>
              <span className="block text-xs font-bold text-slate-700">
                Contenuto di 1 Aggiornamento (Distinta Materiali)
              </span>
              <span className="text-[11px] text-slate-400">
                Specifica cosa contiene ogni singolo aggiornamento (es. 1 Catalogo, 1 Listino, 3 Tirelle tessuto)
              </span>
            </div>

            {contentItems.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {contentItems.map((item) => (
                  <div
                    key={item.id}
                    className="inline-flex items-center space-x-2 bg-white border border-indigo-200 text-indigo-900 px-3 py-1.5 rounded-xl text-xs font-bold shadow-2xs"
                  >
                    <span className="text-indigo-600">{item.qty}x</span>
                    <span>{item.name}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveContentItem(item.id)}
                      className="text-slate-400 hover:text-rose-500 ml-1"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Nome materiale (es. Listino, Tirelle tessuto)"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddContentItem();
                  }
                }}
                className="flex-1 p-2 text-xs bg-white border border-slate-200 rounded-xl"
              />
              <div className="flex items-center space-x-2">
                <span className="text-[11px] font-bold text-slate-500">Qtà:</span>
                <input
                  type="number"
                  min="1"
                  value={newItemQty}
                  onChange={(e) => setNewItemQty(e.target.value)}
                  className="w-16 p-2 text-xs bg-white border border-slate-200 rounded-xl text-center font-bold"
                />
                <button
                  type="button"
                  onClick={handleAddContentItem}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl"
                >
                  + Aggiungi Voce
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm"
          >
            {editingUpdateId ? 'Salva Modifiche Aggiornamento' : '+ Pubblica Aggiornamento'}
          </button>
        </form>

        <div className="space-y-3 pt-2 border-t border-slate-100">
          {updateYearsList.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase mr-1">
                Cartelle Anno:
              </span>
              <button
                type="button"
                onClick={() => setUpdateListYearFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                  updateListYearFilter === 'all'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Tutti ({updates.length})
              </button>
              {updateYearsList.map((yr) => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => setUpdateListYearFilter(yr)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center space-x-1 ${
                    updateListYearFilter === yr
                      ? 'bg-indigo-600 text-white'
                      : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <Folder className="w-3 h-3" />
                  <span>{yr}</span>
                </button>
              ))}
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {filteredUpdatesList.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">
                Nessun aggiornamento pubblicato in questa cartella.
              </p>
            ) : (
              filteredUpdatesList.map((upd) => {
                const comp = companies.find((c) => c.id === upd.companyId);
                const updYear = upd.year || new Date().getFullYear();
                return (
                  <div
                    key={upd.id}
                    className="py-3 flex items-start justify-between gap-2"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-sm text-slate-900">{upd.title}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {comp ? comp.name : 'N.D.'}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                          Anno {updYear}
                        </span>
                      </div>
                      {Array.isArray(upd.contentItems) && upd.contentItems.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {upd.contentItems.map((it) => (
                            <span
                              key={it.id}
                              className="text-[11px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-medium border border-indigo-100"
                            >
                              {it.qty}x {it.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleEditUpdate(upd)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg"
                        title="Modifica aggiornamento"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUpdate(upd.id)}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                        title="Elimina aggiornamento"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 7. ANAGRAFICA AGENTI E CREDENZIALI LOGIN (INCLUSA MODIFICA CREDENZIALI SEDE)
// ----------------------------------------------------------------------------
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
            ? {
                ...a,
                name: name.trim(),
                email: email.trim(),
                password: password.trim()
              }
            : a
        )
      );
      setEditingUserId(null);
    } else {
      const newAgent = {
        id: 'ag_' + Date.now(),
        name: name.trim(),
        email: email.trim(),
        password: password.trim(),
        role: 'agent'
      };
      setAgents((prev) => [...prev, newAgent]);
    }
    setName('');
    setEmail('');
    setPassword('');
  };

  const handleStartEdit = (user) => {
    setEditingUserId(user.id);
    setName(user.name);
    setEmail(user.email);
    setPassword(user.password);
  };

  const handleDeleteAgent = (id) => {
    setAgents((prev) => prev.filter((a) => a.id !== id));
    setClients((prev) => prev.map((c) => (c.agentId === id ? { ...c, agentId: '' } : c)));
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSaveUser}
        className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm">
            {editingUserId
              ? 'Modifica Credenziali Utente'
              : 'Crea Account Agente (Accesso Dedicato iPhone)'}
          </h3>
          {editingUserId && (
            <button
              type="button"
              onClick={() => {
                setEditingUserId(null);
                setName('');
                setEmail('');
                setPassword('');
              }}
              className="text-xs text-slate-400 hover:text-slate-700 underline"
            >
              Annulla Modifica
            </button>
          )}
        </div>

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
            placeholder="Email Login (es. marco@agenziadalbo.it)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="p-2.5 text-xs border border-slate-200 rounded-xl"
          />
          <input
            type="text"
            required
            placeholder="Password di accesso"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="p-2.5 text-xs border border-slate-200 rounded-xl"
          />
        </div>
        <button
          type="submit"
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm"
        >
          {editingUserId ? 'Salva Nuove Credenziali' : '+ Crea Agente & Credenziali'}
        </button>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {agents.map((a) => (
          <div
            key={a.id}
            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2"
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                  a.role === 'office'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-indigo-100 text-indigo-700'
                }`}
              >
                {a.role === 'office' ? 'Sede / Admin' : 'Agente'}
              </span>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => handleStartEdit(a)}
                  className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                  title="Modifica email o password"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                {a.role !== 'office' && (
                  <button
                    onClick={() => handleDeleteAgent(a.id)}
                    className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg"
                    title="Elimina agente"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div>
              <div className="font-bold text-sm text-slate-900">{a.name}</div>
              <div className="text-xs text-slate-500">{a.email}</div>
              <div className="text-[11px] font-mono text-slate-400 mt-1">
                Password: {a.password}
              </div>
            </div>

            {a.role === 'agent' && (
              <div className="text-[11px] text-slate-400 pt-1.5 border-t border-slate-100">
                Clienti assegnati:{' '}
                <strong>{clients.filter((c) => c.agentId === a.id).length}</strong>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}