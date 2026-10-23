const GOOGLE_MAP_ERROR =
  /Google Maps JavaScript API error:\s*([A-Za-z0-9]+)/;

const ERROR_MESSAGES: Record<string, string> = {
  InvalidKeyMapError:
    "Google känner inte igen API-nyckeln. Kontrollera VITE_GOOGLE_MAPS_API_KEY.",
  MissingKeyMapError: "Google fick ingen API-nyckel.",
  RefererNotAllowedMapError:
    "Den här adressen är inte tillåten för API-nyckeln. Lägg till http://localhost:5173/* som HTTP-referer.",
  ApiNotActivatedMapError:
    "Maps JavaScript API är inte aktiverat i Google Cloud-projektet.",
  BillingNotEnabledMapError:
    "Fakturering är inte påslagen i Google Cloud-projektet. 3D Maps kräver ett betalkonto.",
  ExpiredKeyMapError: "API-nyckeln är ogiltig eller har gått ut.",
  ApiTargetBlockedMapError:
    "API-nyckeln får inte anropa Maps JavaScript API. Kontrollera nyckelns API-begränsningar.",
};

let pendingMessage: string | null = null;
let listener: ((message: string) => void) | null = null;
let hookInstalled = false;

export function messageForGoogleMapsConsole(text: string): string | null {
  const match = GOOGLE_MAP_ERROR.exec(text);
  if (!match) {
    return null;
  }
  return ERROR_MESSAGES[match[1]] ?? `Google Maps rapporterade ${match[1]}.`;
}

export function noteGoogleMapFailure(message: string): void {
  pendingMessage = message;
  listener?.(message);
}

export function subscribeGoogleMapFailure(
  callback: (message: string) => void,
): () => void {
  listener = callback;
  if (pendingMessage) {
    callback(pendingMessage);
  }
  return () => {
    if (listener === callback) {
      listener = null;
    }
  };
}

export function installGoogleMapFailureHook(): void {
  if (hookInstalled || typeof window === "undefined") {
    return;
  }
  hookInstalled = true;

  window.gm_authFailure = () => {
    noteGoogleMapFailure(
      "Google avvisade API-nyckeln. Kontrollera nyckeln, faktureringen och att Maps JavaScript API är aktiverat.",
    );
  };

  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const text = args
      .map((arg) => (typeof arg === "string" ? arg : arg instanceof Error ? arg.message : ""))
      .join(" ");
    const message = messageForGoogleMapsConsole(text);
    if (message) {
      noteGoogleMapFailure(message);
    }
    originalError(...args);
  };
}
