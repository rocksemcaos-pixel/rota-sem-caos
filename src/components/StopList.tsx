import React from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Circle,
  ExternalLink,
  Flag,
  MapPin,
  Navigation,
  Trash2,
} from 'lucide-react';
import type {CalculatedRouteData, OriginPoint, StopItem} from '../types/route';
import {
  buildStopGpsUrl,
  formatDistanceKm,
  formatDurationPt,
  formatEtaTime,
} from '../utils/mapsUrls';

interface StopListProps {
  mode: 'edit' | 'track';
  origin: OriginPoint | null;
  stops: StopItem[];
  routeData: CalculatedRouteData | null;
  nextStopId: string | null;
  pinnedFinalStopId: string | null;
  roundTrip: boolean;
  onMoveStop: (index: number, direction: 'up' | 'down') => void;
  onRemoveStop: (stopId: string) => void;
  onToggleComplete: (stopId: string) => void;
  onTogglePinFinal: (stopId: string) => void;
  onFocusStop: (stopId: string) => void;
}

export const StopList: React.FC<StopListProps> = ({
  mode,
  origin,
  stops,
  routeData,
  nextStopId,
  pinnedFinalStopId,
  roundTrip,
  onMoveStop,
  onRemoveStop,
  onToggleComplete,
  onTogglePinFinal,
  onFocusStop,
}) => {
  if (stops.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-[#121721]/60 px-4 py-8 text-center">
        <MapPin className="mx-auto h-6 w-6 text-[#64748B]" aria-hidden="true" />
        <p className="mt-2.5 text-sm font-medium text-[#CBD5E1]">
          Nenhuma parada adicionada ainda
        </p>
        <p className="mt-1 text-xs text-[#64748B]">
          Digite um endereço acima e escolha uma sugestão para montar sua rota.
        </p>
      </div>
    );
  }

  if (mode === 'edit') {
    return (
      <ul className="divide-y divide-white/[0.07] rounded-xl border border-white/10 bg-[#121721]">
        {stops.map((stop, index) => {
          const isPinnedFinal = !roundTrip && pinnedFinalStopId === stop.id;
          return (
            <li
              key={stop.id}
              className="flex items-center gap-2 px-3 py-3 transition-colors hover:bg-white/[0.02]"
            >
              <button
                type="button"
                onClick={() => onFocusStop(stop.id)}
                className="flex min-w-0 flex-1 items-start gap-3 text-left"
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 bg-[#1A2130] font-mono-num text-xs font-bold text-[#F3F6FA]">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-[#F3F6FA]">
                    {stop.name}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-[#94A3B8]">
                    {stop.address}
                  </div>
                  {isPinnedFinal && (
                    <div className="mt-1 text-[11px] font-medium text-[#22D3EE]">
                      Definido como destino final fixo
                    </div>
                  )}
                </div>
              </button>

              <div className="flex shrink-0 items-center gap-0.5">
                {!roundTrip && stops.length >= 2 && (
                  <button
                    type="button"
                    onClick={() => onTogglePinFinal(stop.id)}
                    title={
                      isPinnedFinal
                        ? 'Remover trava de destino final'
                        : 'Fixar como última parada'
                    }
                    aria-label={
                      isPinnedFinal
                        ? 'Remover trava de destino final'
                        : 'Fixar como última parada'
                    }
                    className={`flex h-11 w-10 items-center justify-center rounded-lg transition-colors ${
                      isPinnedFinal
                        ? 'bg-[#22D3EE]/15 text-[#22D3EE]'
                        : 'text-[#64748B] hover:bg-white/5 hover:text-[#CBD5E1]'
                    }`}
                  >
                    <Flag className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onMoveStop(index, 'up')}
                  disabled={index === 0}
                  aria-label={`Mover ${stop.name} para cima`}
                  className="flex h-11 w-10 items-center justify-center rounded-lg text-[#94A3B8] transition-colors hover:bg-white/5 hover:text-white disabled:opacity-25"
                >
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => onMoveStop(index, 'down')}
                  disabled={index === stops.length - 1}
                  aria-label={`Mover ${stop.name} para baixo`}
                  className="flex h-11 w-10 items-center justify-center rounded-lg text-[#94A3B8] transition-colors hover:bg-white/5 hover:text-white disabled:opacity-25"
                >
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => onRemoveStop(stop.id)}
                  aria-label={`Remover ${stop.name}`}
                  className="flex h-11 w-10 items-center justify-center rounded-lg text-[#94A3B8] transition-colors hover:bg-[#F43F5E]/15 hover:text-[#FB7185]"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  // Tracking mode: step-by-step optimized stops with GPS and Concluído actions
  return (
    <div className="space-y-3">
      {stops.map((stop, index) => {
        const isNext = stop.id === nextStopId && !stop.completed;
        const leg = routeData?.legsByStopId[stop.id];
        const gpsUrl = buildStopGpsUrl(stop, origin);

        return (
          <article
            key={stop.id}
            className={`rounded-2xl border p-4 transition-colors ${
              stop.completed
                ? 'border-white/[0.06] bg-[#0F141D]/70 opacity-65'
                : isNext
                  ? 'border-[#00E599]/50 bg-[#121D1B]'
                  : 'border-white/10 bg-[#121721]'
            }`}
          >
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => onFocusStop(stop.id)}
                aria-label={`Focar parada ${index + 1} no mapa`}
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono-num text-sm font-bold transition-transform active:scale-95 ${
                  stop.completed
                    ? 'bg-[#1E293B] text-[#94A3B8]'
                    : isNext
                      ? 'bg-[#00E599] text-[#04140D]'
                      : 'border border-[#22D3EE]/50 bg-[#161E2B] text-[#F3F6FA]'
                }`}
              >
                {index + 1}
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-xs font-semibold ${
                      stop.completed
                        ? 'text-[#64748B]'
                        : isNext
                          ? 'text-[#00E599]'
                          : 'text-[#22D3EE]'
                    }`}
                  >
                    {stop.completed
                      ? 'Entrega concluída'
                      : isNext
                        ? 'Próxima parada'
                        : `Parada ${index + 1}`}
                  </span>

                  {leg && (
                    <span className="font-mono-num text-xs text-[#94A3B8]">
                      {formatDistanceKm(leg.distanceMeters)} · {formatDurationPt(leg.durationMillis)}
                    </span>
                  )}
                </div>

                <h3
                  onClick={() => onFocusStop(stop.id)}
                  className={`mt-1 cursor-pointer text-base font-semibold leading-snug ${
                    stop.completed ? 'text-[#94A3B8] line-through' : 'text-[#F3F6FA]'
                  }`}
                >
                  {stop.name}
                </h3>

                <p
                  className={`mt-0.5 text-xs leading-relaxed ${
                    stop.completed ? 'text-[#64748B] line-through' : 'text-[#94A3B8]'
                  }`}
                >
                  {stop.address}
                </p>

                {leg && !stop.completed && (
                  <div className="mt-1.5 font-mono-num text-xs text-[#CBD5E1]">
                    Previsão de chegada: {formatEtaTime(leg.etaTimestamp)}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3.5 grid grid-cols-2 gap-2.5">
              <a
                href={gpsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex min-h-[46px] items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-all active:scale-[0.98] ${
                  stop.completed
                    ? 'border border-white/10 bg-[#161C27] text-[#94A3B8] hover:text-white'
                    : isNext
                      ? 'bg-[#22D3EE] text-[#051821] hover:bg-[#38E2FB]'
                      : 'border border-[#22D3EE]/35 bg-[#10232D] text-[#22D3EE] hover:bg-[#14303E]'
                }`}
              >
                <Navigation className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap">Abrir no GPS</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-75" aria-hidden="true" />
              </a>

              <button
                type="button"
                onClick={() => onToggleComplete(stop.id)}
                className={`flex min-h-[46px] items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-all active:scale-[0.98] ${
                  stop.completed
                    ? 'border border-[#00E599]/35 bg-[#0B251D] text-[#00E599] hover:bg-[#0F3126]'
                    : 'border border-white/15 bg-[#1A2130] text-[#F3F6FA] hover:border-[#00E599]/50 hover:text-[#00E599]'
                }`}
              >
                {stop.completed ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="whitespace-nowrap">Concluído</span>
                  </>
                ) : (
                  <>
                    <Circle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="whitespace-nowrap">Concluído</span>
                  </>
                )}
              </button>
            </div>
          </article>
        );
      })}

      {routeData?.roundTrip && routeData.returnLeg && origin && (
        <div className="rounded-2xl border border-white/10 bg-[#121721] px-4 py-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#22D3EE]/40 bg-[#083344] text-[#22D3EE]">
                <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[#22D3EE]">
                  Retorno ao ponto de partida
                </div>
                <div className="truncate text-sm font-medium text-[#CBD5E1]">
                  {origin.label}
                </div>
              </div>
            </div>
            <span className="shrink-0 font-mono-num text-xs text-[#94A3B8]">
              {formatDistanceKm(routeData.returnLeg.distanceMeters)} ·{' '}
              {formatDurationPt(routeData.returnLeg.durationMillis)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
