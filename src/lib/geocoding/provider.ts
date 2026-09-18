// src/lib/geocoding/provider.ts

export interface GeocodeResult {
  display_name: string;
  lat: string;
  lon: string;
  place_id?: string;
}

export abstract class GeocodingProvider {
  abstract search(
    query: string, 
    limit?: number, 
    options?: { biasToBarcelona?: boolean }
  ): Promise<GeocodeResult[]>;
}

export class OSMProvider extends GeocodingProvider {
  async search(
    query: string, 
    limit: number = 5, 
    options?: { biasToBarcelona?: boolean }
  ): Promise<GeocodeResult[]> {
    if (!query) return [];
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', limit.toString());
    
    // Strictly restrict results to Spain
    url.searchParams.set('countrycodes', 'es'); 
    
    if (options?.biasToBarcelona) {
      // Southwest & Northeast matching the Barcelona bounds
      url.searchParams.set('viewbox', '2.052,41.317,2.228,41.468'); 
      url.searchParams.set('bounded', '0'); // prioritizes (biases) results in the bounding box
    } else {
      // Broader default Catalan/Spain viewbox
      url.searchParams.set('viewbox', '1.9,41.28,2.3,41.50');
      url.searchParams.set('bounded', '0');
    }
    
    try {
      const response = await fetch(url.toString(), {
        headers: { 'Accept-Language': 'en' },
      });
      if (!response.ok) {
        console.error('OSM geocoding error', response.statusText);
        return [];
      }
      const data = (await response.json()) as any[];
      return data.map((item) => ({
        display_name: item.display_name,
        lat: item.lat,
        lon: item.lon,
      }));
    } catch {
      return [];
    }
  }
}

let googleMapsPromise: Promise<any> | null = null;

export function loadGoogleMapsScript(apiKey: string): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject('Server side');
  if ((window as any).google && (window as any).google.maps && (window as any).google.maps.places) {
    return Promise.resolve((window as any).google);
  }
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      resolve((window as any).google);
    };
    script.onerror = (err) => {
      googleMapsPromise = null;
      reject(err);
    };
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

export class GoogleMapsPlacesProvider extends GeocodingProvider {
  private autocompleteService: any = null;
  private apiKey: string;

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  private async init() {
    if (this.autocompleteService) return;
    try {
      const google = await loadGoogleMapsScript(this.apiKey);
      this.autocompleteService = new google.maps.places.AutocompleteService();
    } catch (e) {
      console.error("Failed to load Google Maps script", e);
    }
  }

  async search(
    query: string, 
    limit: number = 5, 
    options?: { biasToBarcelona?: boolean }
  ): Promise<GeocodeResult[]> {
    if (!query) return [];
    await this.init();
    if (!this.autocompleteService) {
      throw new Error("Google AutocompleteService failed to initialize");
    }

    return new Promise((resolve, reject) => {
      const google = (window as any).google;
      const request: any = {
        input: query,
        componentRestrictions: { country: "es" }, // Spain restriction
      };

      if (options?.biasToBarcelona) {
        // Set LatLngBounds bias towards Barcelona (Southwest: 41.317, 2.052 | Northeast: 41.468, 2.228)
        request.locationBias = new google.maps.LatLngBounds(
          { lat: 41.317, lng: 2.052 }, // Southwest
          { lat: 41.468, lng: 2.228 }  // Northeast
        );
      } else {
        // Broad Catalan area bias for general search
        request.locationBias = new google.maps.LatLngBounds(
          { lat: 41.28, lng: 1.9 },
          { lat: 41.50, lng: 2.3 }
        );
      }

      this.autocompleteService.getPlacePredictions(
        request,
        (predictions: any[] | null, status: any) => {
          if (status !== "OK" || !predictions) {
            if (status === "ZERO_RESULTS") {
              resolve([]);
            } else {
              reject(new Error(`Google Maps API error: ${status}`));
            }
            return;
          }
          const results = predictions.slice(0, limit).map((p) => ({
            display_name: p.description,
            lat: "",
            lon: "",
            place_id: p.place_id,
          }));
          resolve(results);
        }
      );
    });
  }
}

export class HybridProvider extends GeocodingProvider {
  private googleProvider: GoogleMapsPlacesProvider | null = null;
  private osmProvider: OSMProvider;

  constructor() {
    super();
    this.osmProvider = new OSMProvider();
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || 
                   process.env.NEXT_PUBLIC_GOOGLE_MAPS_JS_API_KEY || 
                   process.env.NEXT_PUBLIC_GOOGLE_MAPS_PLACES_API_KEY;
    if (apiKey) {
      this.googleProvider = new GoogleMapsPlacesProvider(apiKey);
    }
  }

  async search(
    query: string, 
    limit: number = 5, 
    options?: { biasToBarcelona?: boolean }
  ): Promise<GeocodeResult[]> {
    if (this.googleProvider) {
      try {
        const results = await this.googleProvider.search(query, limit, options);
        return results;
      } catch (e) {
        console.warn("Google Maps Places Autocomplete failed, falling back to OSM:", e);
      }
    }
    return this.osmProvider.search(query, limit, options);
  }
}

export const geocodeProvider = new HybridProvider();
