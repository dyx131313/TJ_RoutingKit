import { useCallback } from 'react';
import { useRouteStore } from '../stores';
import { useMapStore } from '../stores';
import { queryRoute, getErrorMessage } from '../services/api';

export function useRoute() {
  const {
    profile,
    ruleId,
    setRouteResult,
    setRouteCoords,
    setLoading,
    setError,
    clearRoute,
  } = useRouteStore();

  const { from, to } = useMapStore();

  const executeRoute = useCallback(async () => {
    if (!from || !to) {
      setError('请选择起点和终点');
      return;
    }

    setLoading(true);
    setError(null);
    clearRoute();

    console.log('executeRoute:', { from, to, profile, ruleId });

    try {
      const result = await queryRoute(
        `${from.lat},${from.lon}`,
        `${to.lat},${to.lon}`,
        profile,
        undefined,
        ruleId || undefined
      );

      console.log('Route result:', result);
      setRouteResult(result);
      // 兼容 path_coordinates 和 route 两种字段名
      setRouteCoords(result.route || result.path_coordinates || null);
      setLoading(false);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      setLoading(false);
    }
  }, [from, to, profile, ruleId, setRouteResult, setRouteCoords, setLoading, setError, clearRoute]);

  return {
    executeRoute,
  };
}
