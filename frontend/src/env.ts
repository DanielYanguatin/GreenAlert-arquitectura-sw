/** Única lectura de import.meta.env (aislada para poder simularla en pruebas). */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';
export const TILE_URL: string =
  (import.meta.env.VITE_TILE_URL as string | undefined) ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
