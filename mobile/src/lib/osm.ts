// Nominatim (OpenStreetMap's free geocoding/search service) and OSRM (the
// free public routing server) — replace what used to be Google's Geocoding,
// Places Autocomplete, and Directions APIs, respectively. Neither requires
// an API key. Nominatim's usage policy
// (https://operations.osmfoundation.org/policies/nominatim/) asks for a
// descriptive User-Agent and roughly no more than 1 request/second — well
// within what a human typing an address, or a dispatcher occasionally
// opening a route, actually generates.
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const NOMINATIM_HEADERS = { "User-Agent": "GiantManExpressApp (delivery dispatch app)" };

export interface LatLng {
  latitude: number;
  longitude: number;
}

// Converts a free-text address (as entered by dispatch — pickupAddress /
// a JobStop's address, never validated or geocoded at entry time) into
// coordinates. Returns null rather than throwing on any failure (network
// error, address not found) so callers can fall back to showing the
// address as plain text instead of a map.
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  if (!address.trim()) return null;

  try {
    const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const res = await fetch(url, { headers: NOMINATIM_HEADERS });
    const data = await res.json();
    const first = Array.isArray(data) ? data[0] : null;
    if (!first) return null;
    return { latitude: Number(first.lat), longitude: Number(first.lon) };
  } catch {
    return null;
  }
}

export interface AddressSuggestion {
  placeId: string;
  description: string;
}

// Live address suggestions as dispatch types a pickup/dropoff address —
// same "call the geocoder directly from the device" pattern as
// geocodeAddress above. Returns [] rather than throwing on any failure
// (network error, no matches) so a slow/broken connection never blocks
// typing a plain address by hand — the field this feeds always still works
// as an ordinary text input.
export async function fetchAddressSuggestions(query: string): Promise<AddressSuggestion[]> {
  if (query.trim().length < 3) return [];

  try {
    const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(query)}&format=json&addressdetails=0&limit=5`;
    const res = await fetch(url, { headers: NOMINATIM_HEADERS });
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((r: { place_id: number; display_name: string }) => ({
      placeId: String(r.place_id),
      description: r.display_name,
    }));
  } catch {
    return [];
  }
}

export interface RouteResult {
  coordinates: LatLng[];
  durationMinutes: number;
}

// Driving route + duration between two points via the free public OSRM
// demo server — a best-effort community service (no SLA, no live traffic
// data), not a paid routing API. Fine for this app's request volume; swap
// OSRM_BASE for a self-hosted or paid instance later if it ever becomes
// unreliable at scale.
const OSRM_BASE = "https://router.project-osrm.org";

export async function fetchRoute(origin: LatLng, destination: LatLng): Promise<RouteResult | null> {
  try {
    // OSRM takes coordinates as lng,lat (GeoJSON order), the opposite of
    // this app's LatLng convention — easy to get backwards, so it's
    // spelled out with named vars rather than inlined.
    const originLngLat = `${origin.longitude},${origin.latitude}`;
    const destLngLat = `${destination.longitude},${destination.latitude}`;
    const url = `${OSRM_BASE}/route/v1/driving/${originLngLat};${destLngLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) return null;
    const coordinates: LatLng[] = route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({
      latitude: lat,
      longitude: lng,
    }));
    return { coordinates, durationMinutes: Math.round(route.duration / 60) };
  } catch {
    return null;
  }
}
