import { useMastersStore } from '@/src/store/useMastersStore';
import { useEffect } from 'react';

export function useMasters() {
  const {
    races, sexes, measurementSystems, units, healthConditions,
    loading, error, loadMastersOnce,
  } = useMastersStore();

  useEffect(() => {
    loadMastersOnce(); // safe to call on mount; should internally guard duplicate loading
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  return { races, sexes, measurementSystems, units, healthConditions, loading, error };
}
