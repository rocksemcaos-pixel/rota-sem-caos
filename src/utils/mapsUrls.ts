import type {LatLngPoint, OriginPoint, StopItem} from '../types/route';

function formatCoordParam(location: LatLngPoint): string {
  return `${location.lat.toFixed(6)},${location.lng.toFixed(6)}`;
}

export function buildStopGpsUrl(stop: StopItem, origin?: OriginPoint | null): string {
  const params = new URLSearchParams({
    api: '1',
    destination: formatCoordParam(stop.location),
    travelmode: 'driving',
  });

  if (origin) {
    params.set('origin', formatCoordParam(origin.location));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildFullRouteExportUrl(
  origin: OriginPoint | null,
  orderedStops: StopItem[],
  roundTrip: boolean
): string | null {
  if (orderedStops.length === 0) return null;

  const params = new URLSearchParams({
    api: '1',
    travelmode: 'driving',
  });

  if (origin) {
    params.set('origin', formatCoordParam(origin.location));
  }

  if (roundTrip && origin) {
    params.set('destination', formatCoordParam(origin.location));
    const waypoints = orderedStops.map((s) => formatCoordParam(s.location));
    if (waypoints.length > 0) {
      params.set('waypoints', waypoints.join('|'));
    }
  } else {
    const finalStop = orderedStops[orderedStops.length - 1];
    params.set('destination', formatCoordParam(finalStop.location));

    const intermediateStops = orderedStops.slice(0, -1);
    if (intermediateStops.length > 0) {
      params.set(
        'waypoints',
        intermediateStops.map((s) => formatCoordParam(s.location)).join('|')
      );
    }
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function formatDistanceKm(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return '0,0 km';
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  const km = meters / 1000;
  return `${km.toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1})} km`;
}

export function formatDurationPt(millis: number): string {
  if (!Number.isFinite(millis) || millis <= 0) return '0 min';
  const totalMinutes = Math.max(1, Math.round(millis / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) {
    return `${mins} min`;
  }
  if (mins === 0) {
    return `${hours} h`;
  }
  return `${hours} h ${mins} min`;
}

export function formatEtaTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
