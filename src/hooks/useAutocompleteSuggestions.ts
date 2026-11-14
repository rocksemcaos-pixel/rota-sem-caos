import {useCallback, useEffect, useState} from 'react';
import type {LatLngPoint} from '../types/route';
import {type AddressSuggestion, searchAddresses} from '../utils/geocoding';

export interface UseAutocompleteSuggestionsReturn {
  suggestions: AddressSuggestion[];
  isLoading: boolean;
  error: string | null;
  clearSuggestions: () => void;
}

export function useAutocompleteSuggestions(
  inputString: string,
  enabled: boolean = true,
  biasLocation: LatLngPoint | null = null
): UseAutocompleteSuggestionsReturn {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = inputString.trim();
    if (!enabled || trimmed.length < 3) {
      setSuggestions([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    const timer = window.setTimeout(async () => {
      try {
        const results = await searchAddresses(trimmed, biasLocation, controller.signal);
        if (!controller.signal.aborted) {
          setSuggestions(results);
          setIsLoading(false);
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setIsLoading(false);
          setError('Não foi possível carregar sugestões no momento.');
        }
      }
    }, 280);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [inputString, enabled, biasLocation?.lat, biasLocation?.lng]);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setError(null);
  }, []);

  return {
    suggestions,
    isLoading,
    error,
    clearSuggestions,
  };
}
