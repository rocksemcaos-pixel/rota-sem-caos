import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Loader2, MapPin, Plus, Search, X} from 'lucide-react';
import {useAutocompleteSuggestions} from '../hooks/useAutocompleteSuggestions';
import type {LatLngPoint} from '../types/route';
import {type AddressSuggestion, searchAddresses} from '../utils/geocoding';

export interface SelectedPlaceResult {
  name: string;
  address: string;
  location: LatLngPoint;
}

interface PlaceAutocompleteInputProps {
  id: string;
  placeholder: string;
  value?: string;
  onPlaceSelected: (place: SelectedPlaceResult) => void;
  clearOnSelect?: boolean;
  mode?: 'origin' | 'stop';
  biasLocation?: LatLngPoint | null;
  disabled?: boolean;
}

export const PlaceAutocompleteInput: React.FC<PlaceAutocompleteInputProps> = ({
  id,
  placeholder,
  value = '',
  onPlaceSelected,
  clearOnSelect = false,
  mode = 'stop',
  biasLocation = null,
  disabled = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const [inputValue, setInputValue] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const {
    suggestions,
    isLoading,
    error: suggestionError,
    clearSuggestions,
  } = useAutocompleteSuggestions(inputValue, isFocused && !disabled, biasLocation);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectSuggestion = useCallback(
    (suggestion: AddressSuggestion) => {
      setLookupError(null);
      onPlaceSelected({
        name: suggestion.name,
        address: suggestion.address,
        location: suggestion.location,
      });

      clearSuggestions();
      setIsFocused(false);
      if (clearOnSelect) {
        setInputValue('');
      } else {
        setInputValue(suggestion.address);
      }
    },
    [clearOnSelect, clearSuggestions, onPlaceSelected]
  );

  const handleManualSearch = useCallback(async () => {
    const query = inputValue.trim();
    if (query.length < 2) return;

    if (suggestions.length > 0) {
      handleSelectSuggestion(suggestions[0]);
      return;
    }

    setIsResolving(true);
    setLookupError(null);
    try {
      const results = await searchAddresses(query, biasLocation);
      const found = results[0];
      if (!found) {
        setLookupError('Endereço não encontrado. Tente incluir rua, número e cidade.');
        setIsResolving(false);
        return;
      }

      handleSelectSuggestion(found);
    } catch {
      setLookupError('Endereço não encontrado. Verifique a grafia ou tente novamente.');
    } finally {
      setIsResolving(false);
    }
  }, [biasLocation, handleSelectSuggestion, inputValue, suggestions]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleManualSearch();
    } else if (e.key === 'Escape') {
      setIsFocused(false);
    }
  };

  const showDropdown = isFocused && (suggestions.length > 0 || isLoading);
  const activeError = lookupError || suggestionError;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]">
            {mode === 'origin' ? (
              <MapPin className="h-4 w-4 text-[#22D3EE]" aria-hidden="true" />
            ) : (
              <Search className="h-4 w-4 text-[#00E599]" aria-hidden="true" />
            )}
          </div>
          <input
            id={id}
            type="text"
            value={inputValue}
            disabled={disabled}
            onFocus={() => setIsFocused(true)}
            onChange={(e) => {
              setInputValue(e.target.value);
              setLookupError(null);
              if (!isFocused) setIsFocused(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            className="min-h-[48px] w-full rounded-xl border border-white/10 bg-[#161C27] pl-10 pr-10 text-sm text-[#F3F6FA] placeholder-[#64748B] transition-colors focus:border-[#00E599]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E599]/30 disabled:opacity-50"
          />
          {(isLoading || isResolving) && (
            <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#00E599]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            </div>
          )}
          {!isLoading && !isResolving && inputValue.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setInputValue('');
                setLookupError(null);
                clearSuggestions();
              }}
              aria-label="Limpar campo"
              className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#94A3B8] hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E599]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {mode === 'stop' && (
          <button
            type="button"
            onClick={() => void handleManualSearch()}
            disabled={disabled || isResolving || inputValue.trim().length < 2}
            aria-label="Adicionar parada"
            className="flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl bg-[#00E599] px-3.5 text-sm font-semibold text-[#05130D] transition-all hover:bg-[#19F0A6] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#1E293B] disabled:text-[#64748B]"
          >
            {isResolving ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        )}
      </div>

      {activeError && (
        <p className="mt-2 text-xs font-medium text-[#FB7185]" role="alert">
          {activeError}
        </p>
      )}

      {showDropdown && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[500] max-h-72 overflow-y-auto rounded-xl border border-white/12 bg-[#121721] shadow-2xl shadow-black/70">
          {isLoading && suggestions.length === 0 ? (
            <div className="flex items-center gap-2.5 px-4 py-3.5 text-xs text-[#94A3B8]">
              <Loader2 className="h-4 w-4 animate-spin text-[#00E599]" aria-hidden="true" />
              <span>Buscando endereços no OpenStreetMap...</span>
            </div>
          ) : (
            <ul role="listbox" className="divide-y divide-white/[0.06]">
              {suggestions.map((suggestion) => (
                <li key={suggestion.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectSuggestion(suggestion);
                    }}
                    className="flex min-h-[52px] w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.05] active:bg-white/[0.08]"
                  >
                    <MapPin
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#00E599]"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[#F3F6FA]">
                        {suggestion.name}
                      </div>
                      {suggestion.secondary && (
                        <div className="mt-0.5 truncate text-xs text-[#94A3B8]">
                          {suggestion.secondary}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
