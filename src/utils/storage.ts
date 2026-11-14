import type {OriginPoint, StopItem} from '../types/route';

const STORAGE_KEY = 'rotafacil_state_v1';

export interface PersistedRouteState {
  origin: OriginPoint | null;
  stops: StopItem[];
  roundTrip: boolean;
  pinnedFinalStopId: string | null;
}

const DEFAULT_STATE: PersistedRouteState = {
  origin: null,
  stops: [],
  roundTrip: false,
  pinnedFinalStopId: null,
};

export function loadRouteState(): PersistedRouteState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<PersistedRouteState>;
    return {
      origin: parsed.origin ?? null,
      stops: Array.isArray(parsed.stops) ? parsed.stops : [],
      roundTrip: Boolean(parsed.roundTrip),
      pinnedFinalStopId:
        typeof parsed.pinnedFinalStopId === 'string' ? parsed.pinnedFinalStopId : null,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveRouteState(state: PersistedRouteState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota or private mode errors gracefully
  }
}

export function clearRouteState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore errors
  }
}
