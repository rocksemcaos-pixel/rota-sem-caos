import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  AlertCircle,
  Check,
  Clock,
  Copy,
  ExternalLink,
  ListChecks,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  RotateCcw,
  Route as RouteIcon,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import {PlaceAutocompleteInput, type SelectedPlaceResult} from './components/PlaceAutocompleteInput';
import {RouteMap} from './components/RouteMap';
import {StopList} from './components/StopList';
import {useRouteOptimizer} from './hooks/useRouteOptimizer';
import type {CalculatedRouteData, OriginPoint, StopItem} from './types/route';
import {reverseGeocodeCoords} from './utils/geocoding';
import {
  buildFullRouteExportUrl,
  formatDistanceKm,
  formatDurationPt,
  formatEtaTime,
} from './utils/mapsUrls';
import {clearRouteState, loadRouteState, saveRouteState} from './utils/storage';

function createStopId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `stop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const initialPersisted = useMemo(() => loadRouteState(), []);

  const [origin, setOrigin] = useState<OriginPoint | null>(initialPersisted.origin);
  const [stops, setStops] = useState<StopItem[]>(initialPersisted.stops);
  const [roundTrip, setRoundTrip] = useState<boolean>(initialPersisted.roundTrip);
  const [pinnedFinalStopId, setPinnedFinalStopId] = useState<string | null>(
    initialPersisted.pinnedFinalStopId
  );

  const [routeData, setRouteData] = useState<CalculatedRouteData | null>(null);
  const [routeStale, setRouteStale] = useState(false);
  const [activeTab, setActiveTab] = useState<'setup' | 'route'>('setup');
  const [focusedStopId, setFocusedStopId] = useState<string | null>(null);

  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  const {calculateOptimalRoute, isCalculating, error: routeError, clearError} =
    useRouteOptimizer();

  // Auto-save to localStorage whenever origin, stops, or options change
  useEffect(() => {
    saveRouteState({
      origin,
      stops,
      roundTrip,
      pinnedFinalStopId,
    });
  }, [origin, stops, roundTrip, pinnedFinalStopId]);

  const orderedStops = useMemo(() => {
    if (!routeData) return stops;
    const dict: Record<string, StopItem> = {};
    stops.forEach((s) => {
      dict[s.id] = s;
    });
    const ordered = routeData.orderedStopIds
      .map((id) => dict[id])
      .filter((s): s is StopItem => Boolean(s));
    return ordered.length === stops.length ? ordered : stops;
  }, [stops, routeData]);

  const nextPendingStop = useMemo(() => {
    return orderedStops.find((s) => !s.completed) ?? null;
  }, [orderedStops]);

  const completedCount = useMemo(
    () => stops.filter((s) => s.completed).length,
    [stops]
  );

  const exportUrl = useMemo(
    () => buildFullRouteExportUrl(origin, orderedStops, roundTrip),
    [origin, orderedStops, roundTrip]
  );

  const handleUseCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError('Geolocalização não suportada pelo seu navegador.');
      return;
    }

    setGeoLoading(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const coords = {lat, lng};

        // Set coordinates immediately for instant feedback
        setOrigin({
          label: 'Minha localização atual',
          address: `Minha localização (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
          location: coords,
          isCurrentLocation: true,
        });
        setGeoLoading(false);
        if (routeData) setRouteStale(true);

        // Enrich with street address via Nominatim reverse geocoding
        const resolved = await reverseGeocodeCoords(coords);
        setOrigin((current) => {
          if (
            !current ||
            current.location.lat !== lat ||
            current.location.lng !== lng
          ) {
            return current;
          }
          return {
            ...current,
            label: resolved.label,
            address: resolved.address,
          };
        });
      },
      (err) => {
        setGeoLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError('Permissão de localização negada. Ative o GPS ou digite o endereço.');
        } else if (err.code === err.TIMEOUT) {
          setGeoError('Tempo esgotado ao buscar o GPS. Tente novamente ou digite o endereço.');
        } else {
          setGeoError('Não foi possível obter sua localização atual.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  }, [routeData]);

  const handleOriginSelected = useCallback(
    (place: SelectedPlaceResult) => {
      setGeoError(null);
      setOrigin({
        label: place.name,
        address: place.address,
        location: place.location,
        isCurrentLocation: false,
      });
      if (routeData) setRouteStale(true);
    },
    [routeData]
  );

  const handleAddStop = useCallback(
    (place: SelectedPlaceResult) => {
      if (stops.length >= 40) {
        setStatusFeedback('Limite máximo de 40 paradas atingido.');
        return;
      }

      const newStop: StopItem = {
        id: createStopId(),
        name: place.name,
        address: place.address,
        location: place.location,
        completed: false,
      };

      setStops((prev) => [...prev, newStop]);
      setFocusedStopId(newStop.id);
      setStatusFeedback(null);
      if (routeData) setRouteStale(true);
    },
    [stops.length, routeData]
  );

  const handleMoveStop = useCallback(
    (index: number, direction: 'up' | 'down') => {
      setStops((prev) => {
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= prev.length) return prev;
        const copy = [...prev];
        const [moved] = copy.splice(index, 1);
        copy.splice(targetIndex, 0, moved);
        return copy;
      });
      if (routeData) setRouteStale(true);
    },
    [routeData]
  );

  const handleRemoveStop = useCallback(
    (stopId: string) => {
      setStops((prev) => prev.filter((s) => s.id !== stopId));
      if (pinnedFinalStopId === stopId) {
        setPinnedFinalStopId(null);
      }
      if (focusedStopId === stopId) {
        setFocusedStopId(null);
      }
      if (routeData) setRouteStale(true);
    },
    [pinnedFinalStopId, focusedStopId, routeData]
  );

  const handleToggleComplete = useCallback((stopId: string) => {
    setStops((prev) =>
      prev.map((s) => (s.id === stopId ? {...s, completed: !s.completed} : s))
    );
  }, []);

  const handleTogglePinFinal = useCallback(
    (stopId: string) => {
      setPinnedFinalStopId((prev) => (prev === stopId ? null : stopId));
      if (routeData) setRouteStale(true);
    },
    [routeData]
  );

  const handleClearAll = useCallback(() => {
    setOrigin(null);
    setStops([]);
    setRouteData(null);
    setRouteStale(false);
    setPinnedFinalStopId(null);
    setFocusedStopId(null);
    setActiveTab('setup');
    setGeoError(null);
    setStatusFeedback(null);
    clearError();
    clearRouteState();
  }, [clearError]);

  const handleCopyExportLink = useCallback(async () => {
    if (!exportUrl) return;
    try {
      await navigator.clipboard.writeText(exportUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setStatusFeedback('Não foi possível copiar o link automaticamente.');
    }
  }, [exportUrl]);

  const handleCalculateClick = async () => {
    if (!origin) return;
    const data = await calculateOptimalRoute({
      origin,
      stops,
      roundTrip,
      pinnedFinalStopId,
    });
    if (data) {
      setRouteData(data);
      setRouteStale(false);
      setActiveTab('route');
      const dict: Record<string, StopItem> = {};
      stops.forEach((s) => {
        dict[s.id] = s;
      });
      const reordered = data.orderedStopIds
        .map((id) => dict[id])
        .filter((s): s is StopItem => Boolean(s));
      if (reordered.length === stops.length) {
        setStops(reordered);
      }
    }
  };

  const canCalculate = Boolean(origin && stops.length > 0 && !isCalculating);

  return (
    <div className="min-h-screen bg-[#0A0D12] text-[#F3F6FA] flex flex-col">
      {/* Compact Sticky Top Bar */}
      <header className="sticky top-0 z-[450] flex h-14 items-center justify-between gap-4 border-b border-white/[0.08] bg-[#0A0D12]/95 px-4 backdrop-blur-md lg:px-6">
        <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
          RotaFácil
        </span>

        <div className="hidden md:flex items-center gap-4 text-xs text-[#94A3B8]">
          <span>{stops.length} {stops.length === 1 ? 'parada' : 'paradas'}</span>
          {routeData && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num text-[#00E599]">
                {completedCount}/{stops.length} concluídas
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {exportUrl && (
            <a
              href={exportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#22D3EE]/35 bg-[#0C212B] px-3 py-1.5 text-xs font-semibold text-[#22D3EE] transition-colors hover:bg-[#102E3C] whitespace-nowrap shrink-0"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Exportar Maps</span>
            </a>
          )}
        </div>
      </header>

      {/* Main Responsive Workspace: Mobile Stacked / Desktop 2-Column Split */}
      <main className="flex flex-1 flex-col lg:grid lg:grid-cols-[440px_1fr] lg:h-[calc(100vh-56px)] lg:overflow-hidden">
        {/* Map Viewport: Prominent top panel on mobile, full-height right canvas on desktop */}
        <section
          aria-label="Mapa interativo da rota"
          className="relative h-[44vh] min-h-[280px] w-full border-b border-white/[0.08] lg:order-2 lg:h-full lg:border-b-0 lg:border-l"
        >
          <RouteMap
            origin={origin}
            stops={orderedStops}
            routeData={routeData}
            nextStopId={nextPendingStop?.id ?? null}
            focusedStopId={focusedStopId}
            onSelectStop={setFocusedStopId}
          />
        </section>

        {/* Controls & Tracking Panel */}
        <section className="flex flex-col bg-[#0A0D12] lg:order-1 lg:h-full lg:overflow-y-auto">
          {/* Compact Route Summary Panel */}
          {routeData && (
            <div className="border-b border-white/[0.08] bg-[#101620] px-4 py-3.5 lg:px-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#00E599]">
                  {routeStale ? 'Rota desatualizada — recalcule' : 'Resumo do trajeto otimizado'}
                </span>
                <span className="font-mono-num text-xs text-[#94A3B8]">
                  {completedCount}/{stops.length} entregas
                </span>
              </div>

              <div className="mt-2.5 grid grid-cols-3 gap-2 divide-x divide-white/[0.08]">
                <div className="pr-2">
                  <div className="text-[11px] text-[#94A3B8]">Distância Total</div>
                  <div className="mt-0.5 font-mono-num text-base font-bold text-white sm:text-lg">
                    {formatDistanceKm(routeData.totalDistanceMeters)}
                  </div>
                </div>

                <div className="px-2">
                  <div className="text-[11px] text-[#94A3B8]">Tempo Estimado</div>
                  <div className="mt-0.5 font-mono-num text-base font-bold text-[#00E599] sm:text-lg">
                    {formatDurationPt(routeData.totalDurationMillis)}
                  </div>
                </div>

                <div className="pl-2">
                  <div className="text-[11px] text-[#94A3B8]">Conclusão</div>
                  <div className="mt-0.5 flex items-center gap-1 font-mono-num text-base font-bold text-[#22D3EE] sm:text-lg">
                    <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{formatEtaTime(routeData.estimatedFinishTimestamp)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Functional Mode Segmented Control */}
          <div className="border-b border-white/[0.08] px-4 py-3 lg:px-5">
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/[0.07] bg-[#121721] p-1">
              <button
                type="button"
                onClick={() => setActiveTab('setup')}
                className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors whitespace-nowrap ${
                  activeTab === 'setup'
                    ? 'bg-[#1C2433] text-white'
                    : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Montar Rota ({stops.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('route')}
                className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors whitespace-nowrap ${
                  activeTab === 'route'
                    ? 'bg-[#1C2433] text-[#00E599]'
                    : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                <ListChecks className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Guia de Entregas</span>
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-5 p-4 pb-8 lg:p-5">
            {activeTab === 'setup' ? (
              <>
                {/* 1. Ponto de Partida */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="origin-input"
                      className="text-sm font-semibold text-[#F3F6FA]"
                    >
                      Ponto de partida
                    </label>
                    {origin && (
                      <span className="truncate max-w-[200px] text-xs text-[#22D3EE]">
                        Definido
                      </span>
                    )}
                  </div>

                  <PlaceAutocompleteInput
                    id="origin-input"
                    mode="origin"
                    placeholder="Digite o endereço inicial..."
                    value={origin ? origin.address : ''}
                    onPlaceSelected={(place) => {
                      clearError();
                      handleOriginSelected(place);
                    }}
                    biasLocation={origin?.location ?? null}
                  />

                  <button
                    type="button"
                    onClick={handleUseCurrentLocation}
                    disabled={geoLoading}
                    className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-[#22D3EE]/30 bg-[#0D2029] px-4 py-2.5 text-sm font-semibold text-[#22D3EE] transition-colors hover:bg-[#122B37] active:scale-[0.99] disabled:opacity-60"
                  >
                    {geoLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        <span>Obtendo localização via GPS...</span>
                      </>
                    ) : (
                      <>
                        <LocateFixed className="h-4 w-4" aria-hidden="true" />
                        <span>Usar minha localização atual</span>
                      </>
                    )}
                  </button>

                  {geoError && (
                    <p className="text-xs font-medium text-[#FB7185]" role="alert">
                      {geoError}
                    </p>
                  )}
                </div>

                {/* 2. Adicionar Paradas */}
                <div className="space-y-2.5 border-t border-white/[0.08] pt-5">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="stop-input"
                      className="text-sm font-semibold text-[#F3F6FA]"
                    >
                      Adicionar paradas ({stops.length})
                    </label>
                    <span className="text-xs text-[#94A3B8]">
                      Salvo automaticamente
                    </span>
                  </div>

                  <PlaceAutocompleteInput
                    id="stop-input"
                    mode="stop"
                    placeholder="Buscar endereço de entrega ou visita..."
                    clearOnSelect={true}
                    onPlaceSelected={(place) => {
                      clearError();
                      handleAddStop(place);
                    }}
                    biasLocation={origin?.location ?? stops[0]?.location ?? null}
                  />

                  {statusFeedback && (
                    <p className="text-xs font-medium text-[#F59E0B]" role="status">
                      {statusFeedback}
                    </p>
                  )}
                </div>

                {/* Round-trip vs One-way Mode */}
                {stops.length > 0 && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#121721] px-3.5 py-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[#F3F6FA]">
                        Retornar ao ponto de partida
                      </div>
                      <div className="text-xs text-[#94A3B8]">
                        {roundTrip
                          ? 'Encerra a rota voltando à origem'
                          : 'Encerra na última parada otimizada'}
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={roundTrip}
                      onClick={() => {
                        setRoundTrip(!roundTrip);
                        if (routeData) setRouteStale(true);
                      }}
                      className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors ${
                        roundTrip ? 'bg-[#00E599]' : 'bg-[#263042]'
                      }`}
                    >
                      <span
                        className={`inline-block h-6 w-6 transform rounded-full bg-[#0A0D12] transition-transform ${
                          roundTrip ? 'translate-x-7' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                )}

                {/* 3. Lista Dinâmica de Paradas */}
                <StopList
                  mode="edit"
                  origin={origin}
                  stops={stops}
                  routeData={routeData}
                  nextStopId={nextPendingStop?.id ?? null}
                  pinnedFinalStopId={pinnedFinalStopId}
                  roundTrip={roundTrip}
                  onMoveStop={handleMoveStop}
                  onRemoveStop={handleRemoveStop}
                  onToggleComplete={handleToggleComplete}
                  onTogglePinFinal={handleTogglePinFinal}
                  onFocusStop={(id) => setFocusedStopId(id)}
                />

                {routeError && (
                  <div
                    className="flex items-start gap-2.5 rounded-xl border border-[#F43F5E]/35 bg-[#2A1018] p-3.5 text-xs text-[#FDA4AF]"
                    role="alert"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#FB7185]" aria-hidden="true" />
                    <span>{routeError}</span>
                  </div>
                )}

                {/* Primary CTA: Calcular Melhor Rota */}
                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => void handleCalculateClick()}
                    disabled={!canCalculate}
                    className="flex min-h-[54px] w-full items-center justify-center gap-2.5 rounded-xl bg-[#00E599] px-5 py-3 text-base font-bold text-[#04140D] shadow-lg shadow-[#00E599]/15 transition-all hover:bg-[#1AF0A8] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#1E293B] disabled:text-[#64748B] disabled:shadow-none"
                  >
                    {isCalculating ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                        <span>Calculando melhor rota...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-5 w-5" aria-hidden="true" />
                        <span>Calcular Melhor Rota</span>
                      </>
                    )}
                  </button>

                  {!origin && stops.length > 0 && (
                    <p className="text-center text-xs text-[#94A3B8]">
                      Defina o ponto de partida acima para liberar o cálculo otimizado.
                    </p>
                  )}

                  {(origin || stops.length > 0) && (
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-transparent px-4 text-xs font-semibold text-[#94A3B8] transition-colors hover:border-white/20 hover:text-white"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Limpar toda a rota</span>
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Tracking View */}
                {!routeData && stops.length > 0 && (
                  <div className="rounded-xl border border-[#22D3EE]/30 bg-[#0D1E26] p-4">
                    <p className="text-sm font-medium text-[#E2E8F0]">
                      Sua rota ainda não foi otimizada pelo OSRM.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleCalculateClick()}
                      disabled={!canCalculate}
                      className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#00E599] px-4 text-sm font-bold text-[#04140D] hover:bg-[#1AF0A8] disabled:bg-[#1E293B] disabled:text-[#64748B]"
                    >
                      {isCalculating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          <span>Calculando melhor rota...</span>
                        </>
                      ) : (
                        <>
                          <RouteIcon className="h-4 w-4" aria-hidden="true" />
                          <span>Calcular Melhor Rota Agora</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {routeStale && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-[#F59E0B]/40 bg-[#271C0B] px-4 py-3">
                    <span className="text-xs font-medium text-[#FCD34D]">
                      Você alterou as paradas. Recalcule para atualizar a ordem e horários.
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCalculateClick()}
                      disabled={!canCalculate}
                      className="min-h-[40px] shrink-0 rounded-lg bg-[#F59E0B] px-3 text-xs font-bold text-[#1A1002] hover:bg-[#FBBF24]"
                    >
                      Recalcular
                    </button>
                  </div>
                )}

                {stops.length > 0 && completedCount === stops.length && (
                  <div className="rounded-2xl border border-[#00E599]/40 bg-[#0A221A] p-4 text-center">
                    <Check className="mx-auto h-7 w-7 text-[#00E599]" aria-hidden="true" />
                    <div className="mt-1.5 text-base font-bold text-white">
                      Todas as entregas concluídas!
                    </div>
                    <p className="mt-1 text-xs text-[#A7F3D0]">
                      Você finalizou todas as {stops.length} paradas da rota.
                    </p>
                  </div>
                )}

                <StopList
                  mode="track"
                  origin={origin}
                  stops={orderedStops}
                  routeData={routeData}
                  nextStopId={nextPendingStop?.id ?? null}
                  pinnedFinalStopId={pinnedFinalStopId}
                  roundTrip={roundTrip}
                  onMoveStop={handleMoveStop}
                  onRemoveStop={handleRemoveStop}
                  onToggleComplete={handleToggleComplete}
                  onTogglePinFinal={handleTogglePinFinal}
                  onFocusStop={(id) => setFocusedStopId(id)}
                />

                {/* Export Final Route to Google Maps */}
                {exportUrl && (
                  <div className="space-y-2.5 border-t border-white/[0.08] pt-4">
                    <a
                      href={exportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-xl bg-[#00E599] px-4 text-sm font-bold text-[#04140D] transition-all hover:bg-[#1AF0A8] active:scale-[0.98]"
                    >
                      <Navigation className="h-4 w-4" aria-hidden="true" />
                      <span>Exportar Rota Completa no Google Maps</span>
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    </a>

                    <button
                      type="button"
                      onClick={handleCopyExportLink}
                      className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#121721] px-4 text-sm font-semibold text-[#F3F6FA] transition-colors hover:border-white/25 hover:bg-[#18202E]"
                    >
                      {copiedLink ? (
                        <>
                          <Check className="h-4 w-4 text-[#00E599]" aria-hidden="true" />
                          <span className="text-[#00E599]">Link da rota copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 text-[#22D3EE]" aria-hidden="true" />
                          <span>Copiar link da rota</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {stops.length === 0 && (
                  <div className="rounded-xl border border-white/10 bg-[#121721] p-5 text-center">
                    <MapPin className="mx-auto h-6 w-6 text-[#64748B]" aria-hidden="true" />
                    <p className="mt-2 text-sm text-[#CBD5E1]">
                      Adicione paradas na aba Montar Rota para acompanhar suas entregas aqui.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('setup')}
                      className="mt-3 min-h-[44px] rounded-xl bg-[#1C2433] px-4 text-sm font-semibold text-[#00E599]"
                    >
                      Ir para Montar Rota
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
