import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/licenseService';
import {
  IconAlert, IconCheck, IconCrown, IconGift, IconInfo, IconRefresh, IconSearch, IconUser, IconUsers, IconX
} from './Icons';

export interface AdminUserRow {
  user_id: string;
  email: string | null;
  name: string;
  phone: string | null;
  phone_confirmed: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  role: string;
  license_id: string | null;
  hwid: string | null;
  status: 'trial' | 'active' | 'expired' | 'no_license';
  trial_start_at: string | null;
  trial_end_at: string | null;
  current_period_end: string | null;
  days_left: number;
}

interface Props {
  toast: (kind: 'error' | 'success' | 'info', text: string) => void;
}

export default function SuperAdminView({ toast }: Props) {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'trial' | 'expired' | 'no_license'>('all');
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);
  
  // Modal de ajuste de días
  const [modalUser, setModalUser] = useState<AdminUserRow | null>(null);
  const [daysToAdd, setDaysToAdd] = useState<number>(7);
  const [targetStatus, setTargetStatus] = useState<'active' | 'trial'>('active');
  const [adjusting, setAdjusting] = useState(false);

  const fetchUsers = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_get_users');
      if (error) throw error;
      setUsers((data as AdminUserRow[]) || []);
    } catch (err: unknown) {
      toast('error', `Error al cargar usuarios: ${(err as Error)?.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAdjustDays = async () => {
    if (!modalUser || !supabase) return;
    setAdjusting(true);
    try {
      const { error } = await supabase.rpc('admin_adjust_user_days', {
        target_user_id: modalUser.user_id,
        days_to_add: Number(daysToAdd),
        new_status: targetStatus
      });
      if (error) throw error;
      toast('success', `Se han añadido ${daysToAdd} días a ${modalUser.email || modalUser.name}`);
      setModalUser(null);
      await fetchUsers();
      if (selectedUser?.user_id === modalUser.user_id) {
        setSelectedUser((prev) => prev ? { ...prev, days_left: prev.days_left + Number(daysToAdd), status: targetStatus } : null);
      }
    } catch (err: unknown) {
      toast('error', `No se pudo ajustar la suscripción: ${(err as Error)?.message || String(err)}`);
    } finally {
      setAdjusting(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const matchesSearch = !q || 
        (u.email?.toLowerCase().includes(q)) || 
        (u.name?.toLowerCase().includes(q)) || 
        (u.phone?.toLowerCase().includes(q)) || 
        (u.hwid?.toLowerCase().includes(q)) ||
        (u.user_id.toLowerCase().includes(q));
      
      const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [users, search, statusFilter]);

  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.status === 'active').length;
    const trial = users.filter((u) => u.status === 'trial').length;
    const expired = users.filter((u) => u.status === 'expired' || u.status === 'no_license').length;
    return { total, active, trial, expired };
  }, [users]);

  const formatDays = (days: number) => {
    if (days <= 0) return '0 días';
    if (days < 1) {
      const hours = Math.round(days * 24);
      return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
    }
    const d = Math.floor(days);
    const h = Math.round((days - d) * 24);
    return h > 0 ? `${d}d ${h}h` : `${d} días`;
  };

  const statusBadge = (status: AdminUserRow['status']) => {
    if (status === 'active') {
      return <span className="chip ok sm"><span className="dot" /> Pro / Activo</span>;
    }
    if (status === 'trial') {
      return <span className="chip sm" style={{ background: 'rgba(63,216,240,0.15)', color: 'var(--accent-2)', borderColor: 'rgba(63,216,240,0.3)' }}><span className="dot" /> Prueba</span>;
    }
    if (status === 'expired') {
      return <span className="chip bad sm"><span className="dot" /> Expirado</span>;
    }
    return <span className="chip sm" style={{ opacity: 0.6 }}><span className="dot" /> Sin licencia</span>;
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      {/* Header Banner */}
      <div className="superadmin-banner card">
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 14 }}>
          <div className="row" style={{ gap: 12 }}>
            <div className="superadmin-badge-icon">
              <IconCrown style={{ width: 24, height: 24, color: '#f59e0b' }} />
            </div>
            <div>
              <div className="row" style={{ gap: 8 }}>
                <h2 style={{ fontSize: 20, margin: 0 }}>Panel SuperAdmin de Licencias</h2>
                <span className="chip sm" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', borderColor: 'rgba(245,158,11,0.3)' }}>
                  Acceso Exclusivo
                </span>
              </div>
              <p className="faint" style={{ margin: '4px 0 0', fontSize: 13 }}>
                Gestión global de usuarios, monitoreo de HWIDs y asignación manual de días de suscripción.
              </p>
            </div>
          </div>
          <button className="btn btn-sm" onClick={fetchUsers} disabled={loading}>
            {loading ? <span className="spinner" /> : <IconRefresh />} Actualizar lista
          </button>
        </div>

        {/* Métricas rápidas */}
        <div className="grid grid-4" style={{ marginTop: 18 }}>
          <div className="super-stat-box">
            <span className="stat-label row"><IconUsers style={{ width: 14 }} /> Total Usuarios</span>
            <span className="stat-value">{stats.total}</span>
          </div>
          <div className="super-stat-box">
            <span className="stat-label row" style={{ color: 'var(--accent)' }}><IconCheck style={{ width: 14 }} /> Suscripciones Activas</span>
            <span className="stat-value" style={{ color: 'var(--accent)' }}>{stats.active}</span>
          </div>
          <div className="super-stat-box">
            <span className="stat-label row" style={{ color: 'var(--accent-2)' }}><IconGift style={{ width: 14 }} /> En Prueba (Trial)</span>
            <span className="stat-value" style={{ color: 'var(--accent-2)' }}>{stats.trial}</span>
          </div>
          <div className="super-stat-box">
            <span className="stat-label row" style={{ color: 'var(--danger)' }}><IconAlert style={{ width: 14 }} /> Expirados / Sin Licencia</span>
            <span className="stat-value" style={{ color: 'var(--danger)' }}>{stats.expired}</span>
          </div>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="card" style={{ padding: '14px 18px' }}>
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="input-wrap" style={{ flex: '1 1 300px', maxWidth: 450 }}>
            <IconSearch className="input-icon" />
            <input
              type="text"
              className="input with-icon"
              placeholder="Buscar por correo, nombre, teléfono o HWID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="input-clear" onClick={() => setSearch('')}>
                <IconX style={{ width: 14 }} />
              </button>
            )}
          </div>

          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span className="faint" style={{ fontSize: 13 }}>Estado:</span>
            {(['all', 'active', 'trial', 'expired', 'no_license'] as const).map((st) => (
              <button
                key={st}
                className={`btn btn-xs ${statusFilter === st ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setStatusFilter(st)}
              >
                {st === 'all' && 'Todos'}
                {st === 'active' && 'Activos'}
                {st === 'trial' && 'Prueba'}
                {st === 'expired' && 'Expirados'}
                {st === 'no_license' && 'Sin licencia'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabla de Usuarios */}
      <div className="card superadmin-table-card">
        <div className="superadmin-table-wrap">
          <table className="superadmin-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Días Restantes</th>
                <th>Dispositivo (HWID)</th>
                <th>Registro</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>
                    <span className="spinner" style={{ width: 28, height: 28 }} />
                    <p className="faint" style={{ marginTop: 10 }}>Cargando usuarios desde Supabase...</p>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>
                    <IconInfo style={{ width: 32, opacity: 0.4 }} />
                    <p className="faint" style={{ marginTop: 8 }}>No se encontraron usuarios coincidentes.</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.user_id} className={selectedUser?.user_id === u.user_id ? 'selected-row' : ''}>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        <div className="user-initials-badge">
                          {u.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <strong>{u.name}</strong>
                          <div className="faint" style={{ fontSize: 12 }}>{u.email || 'Sin correo'}</div>
                          {u.phone && (
                            <div className="faint" style={{ fontSize: 11, color: u.phone_confirmed ? 'var(--accent)' : 'var(--warn)' }}>
                              📱 {u.phone} {u.phone_confirmed ? '(Verificado)' : '(No verif.)'}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      {u.role === 'super' ? (
                        <span className="chip sm" style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b', borderColor: '#f59e0b' }}>
                          <IconCrown style={{ width: 12 }} /> SuperAdmin
                        </span>
                      ) : (
                        <span className="chip sm" style={{ opacity: 0.7 }}>Usuario</span>
                      )}
                    </td>
                    <td>{statusBadge(u.status)}</td>
                    <td>
                      <div className="days-left-cell">
                        <strong style={{ color: u.days_left > 0 ? (u.status === 'active' ? 'var(--accent)' : 'var(--accent-2)') : 'var(--danger)' }}>
                          {formatDays(u.days_left)}
                        </strong>
                        {u.status === 'active' && u.current_period_end && (
                          <small className="faint">Fin: {new Date(u.current_period_end).toLocaleDateString()}</small>
                        )}
                        {u.status === 'trial' && u.trial_end_at && (
                          <small className="faint">Trial: {new Date(u.trial_end_at).toLocaleDateString()}</small>
                        )}
                      </div>
                    </td>
                    <td>
                      {u.hwid ? (
                        <code className="mono" style={{ fontSize: 11.5 }} title={u.hwid}>
                          {u.hwid.slice(0, 8)}…{u.hwid.slice(-6)}
                        </code>
                      ) : (
                        <span className="faint" style={{ fontSize: 12 }}>No vinculado</span>
                      )}
                    </td>
                    <td className="faint" style={{ fontSize: 12 }}>
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                        <button
                          className="btn btn-xs btn-primary"
                          onClick={() => { setModalUser(u); setDaysToAdd(7); setTargetStatus('active'); }}
                          title="Añadir días de suscripción"
                        >
                          <IconGift /> + Días
                        </button>
                        <button
                          className="btn btn-xs btn-ghost"
                          onClick={() => setSelectedUser(selectedUser?.user_id === u.user_id ? null : u)}
                        >
                          {selectedUser?.user_id === u.user_id ? 'Ocultar' : 'Detalles'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Vista Detallada de Usuario Seleccionado */}
      {selectedUser && (
        <div className="card detailed-user-card">
          <div className="card-title">
            <span className="row" style={{ gap: 8 }}>
              <IconUser style={{ color: 'var(--accent)' }} /> Ficha Detallada: {selectedUser.name}
            </span>
            <button className="btn btn-xs btn-ghost" onClick={() => setSelectedUser(null)}>
              <IconX /> Cerrar detalle
            </button>
          </div>
          <div className="grid grid-3" style={{ gap: 14, marginTop: 12 }}>
            <div className="detail-item">
              <span className="faint">ID de Usuario (UUID)</span>
              <code className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>{selectedUser.user_id}</code>
            </div>
            <div className="detail-item">
              <span className="faint">Correo electrónico</span>
              <strong>{selectedUser.email || 'No especificado'}</strong>
            </div>
            <div className="detail-item">
              <span className="faint">Teléfono móvil</span>
              <strong>{selectedUser.phone || 'No registrado'} {selectedUser.phone_confirmed ? '✔️' : ''}</strong>
            </div>
            <div className="detail-item">
              <span className="faint">Hardware ID (HWID de PC)</span>
              <code className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>{selectedUser.hwid || 'Sin máquina registrada'}</code>
            </div>
            <div className="detail-item">
              <span className="faint">Estado de Licencia</span>
              <div>{statusBadge(selectedUser.status)}</div>
            </div>
            <div className="detail-item">
              <span className="faint">Días calculados restantes</span>
              <strong style={{ fontSize: 16, color: selectedUser.days_left > 0 ? 'var(--accent)' : 'var(--danger)' }}>
                {formatDays(selectedUser.days_left)}
              </strong>
            </div>
          </div>
          <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn btn-sm btn-primary" onClick={() => { setModalUser(selectedUser); setDaysToAdd(30); setTargetStatus('active'); }}>
              <IconGift /> Conceder 30 días de suscripción
            </button>
          </div>
        </div>
      )}

      {/* Modal para Añadir / Modificar Días */}
      {modalUser && (
        <div className="superadmin-modal-overlay">
          <div className="card superadmin-modal">
            <div className="card-title">
              <span className="row" style={{ gap: 8 }}>
                <IconGift style={{ color: 'var(--accent)' }} /> Gestionar Licencia
              </span>
              <button className="btn btn-xs btn-ghost" onClick={() => setModalUser(null)}>
                <IconX />
              </button>
            </div>

            <p style={{ margin: '8px 0 16px', fontSize: 13.5 }}>
              Modificar la suscripción de <strong>{modalUser.name}</strong> ({modalUser.email}):
            </p>

            <div className="stack" style={{ gap: 14 }}>
              <div className="field">
                <label>Cantidad de días a añadir</label>
                <div className="row" style={{ gap: 8 }}>
                  <input
                    type="number"
                    className="input"
                    min="1"
                    max="3650"
                    value={daysToAdd}
                    onChange={(e) => setDaysToAdd(Math.max(1, parseInt(e.target.value) || 1))}
                    style={{ width: 110 }}
                  />
                  {[3, 7, 15, 30, 90, 365].map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`btn btn-xs ${daysToAdd === d ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setDaysToAdd(d)}
                    >
                      +{d}d
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>Tipo de suscripción asignada</label>
                <div className="row" style={{ gap: 12 }}>
                  <label className="row" style={{ gap: 6, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="status"
                      checked={targetStatus === 'active'}
                      onChange={() => setTargetStatus('active')}
                    />
                    <span><strong>Activo (Pro)</strong></span>
                  </label>
                  <label className="row" style={{ gap: 6, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="status"
                      checked={targetStatus === 'trial'}
                      onChange={() => setTargetStatus('trial')}
                    />
                    <span><strong>Periodo de Prueba (Trial)</strong></span>
                  </label>
                </div>
              </div>

              <div className="alert info" style={{ fontSize: 12 }}>
                <IconInfo />
                <span>
                  Los días se sumarán a la fecha de vencimiento actual. Si la licencia ya había expirado, comenzarán a contar desde el momento presente.
                </span>
              </div>

              <div className="row" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setModalUser(null)} disabled={adjusting}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-primary" onClick={handleAdjustDays} disabled={adjusting}>
                  {adjusting ? <span className="spinner" /> : <IconCheck />} Aplicar {daysToAdd} Días
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
