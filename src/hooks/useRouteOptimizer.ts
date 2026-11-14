import {useCallback, useState} from 'react';
import type {
  CalculatedRouteData,
  LatLngPoint,
  OptimizedLegMetric,
  OriginPoint,
  StopItem,
} from '../types/route';

interface OptimizeParams {
  origin: OriginPoint;
  stops: StopItem[];
  roundTrip: boolean;
  pinnedFinalStopId: string | null;
}

interface OsrmLeg {
  distance: number; // meters
  duration: number; // seconds
}

interface OsrmRouteOrTrip {
  distance: number; // meters
  duration: number; // seconds
  legs: OsrmLeg[];
  geometry?: {
    type: string;
    coordinates: [number, number][];
  };
}

interface OsrmWaypoint {
  waypoint_index: number;
  trips_index?: number;
  location: [number, number];
  name?: string;
}

interface OsrmResponse {
  code: string;
  message?: string;
  routes?: OsrmRouteOrTrip[];
  trips?: OsrmRouteOrTrip[];
  waypoints?: OsrmWaypoint[];
}

function computeBounds(points: LatLngPoint[]) {
  if (points.length === 0) return undefined;
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;

  for (const pt of points) {
    if (pt.lat > north) north = pt.lat;
    if (pt.lat < south) south = pt.lat;
    if (pt.lng > east) east = pt.lng;
    if (pt.lng < west) west = pt.lng;
  }

  return {north, south, east, west};
}

export function useRouteOptimizer() {
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const calculateOptimalRoute = useCallback(
    async ({
      origin,
      stops,
      roundTrip,
      pinnedFinalStopId,
    }: OptimizeParams): Promise<CalculatedRouteData | null> => {
      if (stops.length === 0) {
        setError('Adicione pelo menos uma parada para calcular a rota.');
        return null;
      }

      if (stops.length > 40) {
        setError('Para melhor desempenho na API pública do OSRM, use até 40 paradas por rota.');
        return null;
      }

      setIsCalculating(true);
      setError(null);

      try {
        const formatCoord = (pt: LatLngPoint) => `${pt.lng.toFixed(6)},${pt.lat.toFixed(6)}`;
        let orderedStops: StopItem[] = [];
        let primaryTrip: OsrmRouteOrTrip | undefined;

        if (stops.length === 1) {
          // Single stop: use OSRM Route service directly
          const singleStop = stops[0];
          const coordsList = roundTrip
            ? [origin.location, singleStop.location, origin.location]
            : [origin.location, singleStop.location];

          const url = `https://router.project-osrm.org/route/v1/driving/${coordsList
            .map(formatCoord)
            .join(';')}?overview=full&geometries=geojson`;

          const res = await fetch(url);
          if (!res.ok) {
            throw new Error(`OSRM HTTP ${res.status}`);
          }

          const data = (await res.json()) as OsrmResponse;
          if (data.code !== 'Ok' || !data.routes?.[0]) {
            setError(
              'Não foi possível traçar uma rota viável entre esses endereços. Verifique se há trechos inacessíveis de carro.'
            );
            return null;
          }

          primaryTrip = data.routes[0];
          orderedStops = [singleStop];
        } else {
          // Multi-stop TSP optimization via OSRM Trip service
          const pinnedFinal =
            !roundTrip && pinnedFinalStopId
              ? stops.find((s) => s.id === pinnedFinalStopId)
              : undefined;

          const inputStops = pinnedFinal
            ? [...stops.filter((s) => s.id !== pinnedFinal.id), pinnedFinal]
            : [...stops];

          const coords = [origin.location, ...inputStops.map((s) => s.location)];

          const params = new URLSearchParams({
            source: 'first',
            roundtrip: roundTrip ? 'true' : 'false',
            overview: 'full',
            geometries: 'geojson',
          });

          if (!roundTrip) {
            params.set('destination', pinnedFinal ? 'last' : 'any');
          }

          const url = `https://router.project-osrm.org/trip/v1/driving/${coords
            .map(formatCoord)
            .join(';')}?${params.toString()}`;

          const res = await fetch(url);
          if (!res.ok) {
            throw new Error(`OSRM HTTP ${res.status}`);
          }

          const data = (await res.json()) as OsrmResponse;
          if (data.code !== 'Ok' || !data.trips?.[0]) {
            setError(
              'Não foi possível otimizar a rota entre esses endereços. Verifique se todas as paradas são acessíveis de carro.'
            );
            return null;
          }

          primaryTrip = data.trips[0];
          const waypoints = data.waypoints ?? [];

          if (waypoints.length === coords.length) {
            orderedStops = inputStops
              .map((stop, idx) => ({
                stop,
                order: waypoints[idx + 1]?.waypoint_index ?? idx + 1,
              }))
              .sort((a, b) => a.order - b.order)
              .map((entry) => entry.stop);
          } else {
            orderedStops = inputStops;
          }
        }

        const now = Date.now();
        const legs = primaryTrip.legs ?? [];
        let cumulativeMillis = 0;
        const legsByStopId: Record<string, OptimizedLegMetric> = {};

        orderedStops.forEach((stop, idx) => {
          const leg = legs[idx];
          const legDist = leg?.distance ?? 0;
          const legDur =
            typeof leg?.duration === 'number' && Number.isFinite(leg.duration)
              ? leg.duration * 1000
              : 0;
          cumulativeMillis += legDur;
          legsByStopId[stop.id] = {
            stopId: stop.id,
            distanceMeters: legDist,
            durationMillis: legDur,
            etaTimestamp: now + cumulativeMillis,
          };
        });

        let returnLeg: {distanceMeters: number; durationMillis: number} | undefined;
        if (roundTrip && legs.length > orderedStops.length) {
          const lastLeg = legs[orderedStops.length];
          const retDist = lastLeg?.distance ?? 0;
          const retDur =
            typeof lastLeg?.duration === 'number' && Number.isFinite(lastLeg.duration)
              ? lastLeg.duration * 1000
              : 0;
          cumulativeMillis += retDur;
          returnLeg = {
            distanceMeters: retDist,
            durationMillis: retDur,
          };
        }

        const totalDistanceMeters =
          typeof primaryTrip.distance === 'number' && Number.isFinite(primaryTrip.distance)
            ? primaryTrip.distance
            : legs.reduce((sum, l) => sum + (l.distance ?? 0), 0);

        const totalDurationMillis =
          typeof primaryTrip.duration === 'number' && Number.isFinite(primaryTrip.duration)
            ? primaryTrip.duration * 1000
            : cumulativeMillis;

        const path: LatLngPoint[] = (primaryTrip.geometry?.coordinates ?? []).map(
          ([lng, lat]) => ({lat, lng})
        );

        const allPoints = [
          origin.location,
          ...orderedStops.map((s) => s.location),
          ...path,
        ];

        return {
          orderedStopIds: orderedStops.map((s) => s.id),
          totalDistanceMeters,
          totalDurationMillis,
          estimatedFinishTimestamp: now + totalDurationMillis,
          returnLeg,
          legsByStopId,
          path,
          viewport: computeBounds(allPoints),
          calculatedAt: now,
          roundTrip,
        };
      } catch {
        setError(
          'Erro ao consultar o servidor de rotas OSRM. Verifique sua conexão e tente novamente.'
        );
        return null;
      } finally {
        setIsCalculating(false);
      }
    },
    []
  );

  return {
    calculateOptimalRoute,
    isCalculating,
    error,
    clearError,
  };
}
