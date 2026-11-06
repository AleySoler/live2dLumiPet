/// <reference types="vite/client" />
import type { PetAPI } from '../preload/index';

declare global {
  interface Window {
    petAPI: PetAPI;
  }
}

export {};
