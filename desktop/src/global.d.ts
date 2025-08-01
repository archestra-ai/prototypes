declare global {
  interface Window {
    __TAURI__?: {
      [key: string]: any;
    };
  }
}

export {};
