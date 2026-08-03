export type PlacesAutocompleteResponse = {
  suggestions: Array<{
    place_id: string;
    label: string;
    main_text: string;
    secondary_text: string | null;
  }>;
  fallback_used: boolean;
};

export type EdgePlacesResolveResult = {
  fallback_used: boolean;
  label: string | null;
  location: { lat: number; lng: number } | null;
  place_id: string;
  provider: "vietmap" | "google_maps" | "fallback";
};
