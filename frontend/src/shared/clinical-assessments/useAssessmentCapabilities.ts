import { useEffect, useState } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

/** Use the same effective resources for navigation and assessment fields. */
export function useAssessmentCapabilities() {
  const { capabilities, currentUser, currentTenant } = useAuth();
  const identity = `${currentTenant?.id}:${currentUser?.id}:${capabilities.join(',')}`;
  const [result, setResult] = useState<{ identity: string; caps: string[] }>();
  useEffect(() => {
    let active = true;
    ApiClient.get<any>('/v1/capabilities/my-resources')
      .then(data => { if (active) setResult({ identity, caps: data.activeCapabilities || [] }); })
      .catch(() => { if (active) setResult({ identity, caps: [] }); });
    return () => { active = false; };
  }, [identity]);
  return result?.identity === identity ? result.caps : [];
}
