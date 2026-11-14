import type {LatLngPoint} from '../types/route';

export interface AddressSuggestion {
  id: string;
  name: string;
  secondary: string;
  address: string;
  location: LatLngPoint;
}

interface PhotonFeature {
  geometry?: {
    coordinates?: [number, number];
  };
  properties?: {
    osm_id?: number;
    osm_type?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
}

interface NominatimItem {
  place_id?: number;
  display_name?: string;
  lat?: string;
  lon?: string;
  name?: string;
  address?: {
    road?: string;
    house_number?: string;
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
}

function formatPhotonFeature(feature: PhotonFeature, index: number): AddressSuggestion | null {
  const coords = feature.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;

  const [lng, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const p = feature.properties ?? {};
  const streetLine = [p.street, p.housenumber].filter(Boolean).join(', ');
  const primary = p.name || streetLine || p.city || p.town || p.village || 'Endereço selecionado';
  const locality = p.city || p.town || p.village || p.municipality;
  const neighborhood = p.district || p.suburb;

  const secondaryParts = [
    p.name && streetLine && streetLine !== p.name ? streetLine : undefined,
    neighborhood,
    locality,
    p.state,
    p.country,
  ].filter((part, i, arr): part is string => Boolean(part) && arr.indexOf(part) === i);

  const secondary = secondaryParts.join(', ');
  const fullAddress = secondary ? `${primary} - ${secondary}` : primary;

  return {
    id: `photon_${p.osm_type ?? 'X'}_${p.osm_id ?? index}_${lat.toFixed(5)}_${lng.toFixed(5)}`,
    name: primary,
    secondary,
    address: fullAddress,
    location: {lat, lng},
  };
}

function formatNominatimItem(item: NominatimItem, index: number): AddressSuggestion | null {
  const lat = Number(item.lat);
  const lng = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const addr = item.address ?? {};
  const streetLine = [addr.road, addr.house_number].filter(Boolean).join(', ');
  const locality = addr.city || addr.town || addr.village || addr.municipality;
  const primary =
    item.name ||
    streetLine ||
    item.display_name?.split(',')[0]?.trim() ||
    'Endereço selecionado';

  const secondaryParts = [
    item.name && streetLine && streetLine !== item.name ? streetLine : undefined,
    addr.neighbourhood || addr.suburb,
    locality,
    addr.state,
    addr.country,
  ].filter((part, i, arr): part is string => Boolean(part) && arr.indexOf(part) === i);

  const secondary =
    secondaryParts.length > 0
      ? secondaryParts.join(', ')
      : item.display_name?.split(',').slice(1, 4).join(',').trim() || '';

  const fullAddress = item.display_name || (secondary ? `${primary} - ${secondary}` : primary);

  return {
    id: `nom_${item.place_id ?? index}_${lat.toFixed(5)}_${lng.toFixed(5)}`,
    name: primary,
    secondary,
    address: fullAddress,
    location: {lat, lng},
  };
}

export async function searchAddresses(
  query: string,
  biasLocation?: LatLngPoint | null,
  signal?: AbortSignal
): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  // 1. Primary: Photon API (komoot.io) — fast, open, no API key required
  try {
    const params = new URLSearchParams({
      q: trimmed,
      limit: '6',
    });
    if (biasLocation) {
      params.set('lat', biasLocation.lat.toFixed(5));
      params.set('lon', biasLocation.lng.toFixed(5));
    }

    const res = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, {
      signal,
    });

    if (res.ok) {
      const data = (await res.json()) as {features?: PhotonFeature[]};
      const items = (data.features ?? [])
        .map((f, idx) => formatPhotonFeature(f, idx))
        .filter((item): item is AddressSuggestion => Boolean(item));
      if (items.length > 0) {
        return items;
      }
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw err;
    }
    // Fall through to Nominatim if Photon fails or times out
  }

  // 2. Fallback: Nominatim (OpenStreetMap)
  const nomParams = new URLSearchParams({
    format: 'jsonv2',
    q: trimmed,
    limit: '6',
    addressdetails: '1',
    'accept-language': 'pt-BR,pt',
  });

  const nomRes = await fetch(
    `https://nominatim.openstreetmap.org/search?${nomParams.toString()}`,
    {signal}
  );

  if (!nomRes.ok) {
    throw new Error('Falha ao consultar serviço de endereços.');
  }

  const nomData = (await nomRes.json()) as NominatimItem[];
  return nomData
    .map((item, idx) => formatNominatimItem(item, idx))
    .filter((item): item is AddressSuggestion => Boolean(item));
}

export async function reverseGeocodeCoords(
  location: LatLngPoint
): Promise<{label: string; address: string}> {
  try {
    const params = new URLSearchParams({
      format: 'jsonv2',
      lat: location.lat.toFixed(6),
      lon: location.lng.toFixed(6),
      addressdetails: '1',
      'accept-language': 'pt-BR,pt',
    });

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${params.toString()}`
    );
    if (!res.ok) {
      throw new Error('Reverse geocode error');
    }

    const data = (await res.json()) as NominatimItem;
    const formatted = formatNominatimItem(data, 0);
    if (formatted) {
      return {
        label: formatted.name,
        address: formatted.address,
      };
    }
  } catch {
    // Fallback cleanly to coordinates label
  }

  return {
    label: 'Minha localização atual',
    address: `Minha localização (${location.lat.toFixed(5)}, ${location.lng.toFixed(5)})`,
  };
}
