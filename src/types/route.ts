export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface OriginPoint {
  label: string;
  address: string;
  location: LatLngPoint;
  placeId?: string;
  isCurrentLocation?: boolean;
}

export interface StopItem {
  id: string;
  name: string;
  address: string;
  location: LatLngPoint;
  placeId?: string;
  completed: boolean;
}

export interface OptimizedLegMetric {
  stopId: string;
  distanceMeters: number;
  durationMillis: number;
  etaTimestamp: number;
}

export interface CalculatedRouteData {
  orderedStopIds: string[];
  totalDistanceMeters: number;
  totalDurationMillis: number;
  estimatedFinishTimestamp: number;
  returnLeg?: {
    distanceMeters: number;
    durationMillis: number;
  };
  legsByStopId: Record<string, OptimizedLegMetric>;
  path: LatLngPoint[];
  viewport?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  calculatedAt: number;
  roundTrip: boolean;
}
