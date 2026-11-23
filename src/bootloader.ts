// bootloader.art integration.
// window.$bootloader comes from public/bootloader.js (boot:web@1.0.0), loaded
// before the app module. Keep that file standalone. Do not bundle it.

type BootloaderAPI = {
  hash: string;
  rnd: () => number;
  iteration: number;
  isCapture: boolean;
  setFeatures: (features: Record<string, string | number | boolean>) => void;
  capture: () => void;
};

declare global {
  interface Window { $bootloader: BootloaderAPI }
}

export type BootContext = {
  isCapture: boolean;
  capture: () => void;
  rnd: () => number;
};

export function initBoot(): BootContext {
  const api = window.$bootloader;

  return {
    isCapture: api.isCapture,
    capture: () => api.capture(),
    rnd: () => api.rnd(),
  };
}
