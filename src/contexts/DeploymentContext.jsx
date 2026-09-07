import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useDeployments } from '@/hooks/useEntities';
import { canAccessDeployment, visibleDeployments } from '@/lib/deployments';
import { STORAGE_KEYS } from '@/lib/constants';

/**
 * @typedef {Object} DeploymentState
 * @property {string|null} deploymentId currently selected deployment id (persisted)
 * @property {Object|null} deployment the selected deployment row, if loaded and visible
 * @property {Object[]} deployments deployments the user may open
 * @property {boolean} isLoading
 * @property {boolean} isError
 * @property {'none'|'loading'|'ready'|'forbidden'|'missing'} status
 * @property {(id: string|null) => void} selectDeployment
 */

const DeploymentContext = createContext(/** @type {DeploymentState|null} */ (null));

function readStoredId() {
  try { return localStorage.getItem(STORAGE_KEYS.currentDeploymentId) || null; } catch { return null; }
}

export function DeploymentProvider({ children }) {
  const { user } = useAuth();
  const [deploymentId, setDeploymentId] = useState(readStoredId);
  const { data: allDeployments = [], isLoading, isError } = useDeployments();

  const deployments = useMemo(() => visibleDeployments(user, allDeployments), [user, allDeployments]);
  const stored = allDeployments.find(d => d.id === deploymentId) ?? null;

  let status = /** @type {DeploymentState['status']} */ ('none');
  if (deploymentId) {
    if (isLoading) status = 'loading';
    else if (!stored) status = 'missing';
    else if (!canAccessDeployment(user, stored)) status = 'forbidden';
    else status = 'ready';
  }

  const selectDeployment = useCallback((id) => {
    try {
      if (id) localStorage.setItem(STORAGE_KEYS.currentDeploymentId, id);
      else localStorage.removeItem(STORAGE_KEYS.currentDeploymentId);
      localStorage.removeItem(STORAGE_KEYS.currentLocationId);
    } catch { /* ignore */ }
    setDeploymentId(id);
  }, []);

  // If nothing is selected but the user can see exactly one deployment, open it.
  useEffect(() => {
    if (!deploymentId && !isLoading && deployments.length === 1) selectDeployment(deployments[0].id);
  }, [deploymentId, isLoading, deployments, selectDeployment]);

  const value = useMemo(() => ({
    deploymentId,
    deployment: status === 'ready' ? stored : null,
    deployments,
    isLoading,
    isError,
    status,
    selectDeployment,
  }), [deploymentId, status, stored, deployments, isLoading, isError, selectDeployment]);

  return <DeploymentContext.Provider value={value}>{children}</DeploymentContext.Provider>;
}

/** @returns {DeploymentState} */
export function useCurrentDeployment() {
  const ctx = useContext(DeploymentContext);
  if (!ctx) throw new Error('useCurrentDeployment must be used within DeploymentProvider');
  return ctx;
}
