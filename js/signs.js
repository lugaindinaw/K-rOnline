const SIGN_MARKUP = {
  yield: `<svg viewBox="0 0 120 120" class="sign" role="img" aria-label="Vägmärke, väjningsplikt">
    <polygon points="4,8 116,8 60,116" fill="#c1121f"/>
    <polygon points="16,16 104,16 60,100" fill="#fff"/>
  </svg>`,
  stop: `<svg viewBox="0 0 120 120" class="sign" role="img" aria-label="Vägmärke, stopp">
    <polygon points="36,6 84,6 114,36 114,84 84,114 36,114 6,84 6,36" fill="#c1121f"/>
    <text x="60" y="70" text-anchor="middle" font-size="22" font-family="Outfit, sans-serif" font-weight="700" fill="#fff">STOP</text>
  </svg>`,
  "no-entry": `<svg viewBox="0 0 120 120" class="sign" role="img" aria-label="Vägmärke, förbud mot infart">
    <circle cx="60" cy="60" r="52" fill="#c1121f"/>
    <rect x="22" y="48" width="76" height="24" rx="2" fill="#fff"/>
  </svg>`,
  "speed-30": speedSign("30"),
  "speed-50": speedSign("50"),
  "speed-70": speedSign("70"),
  "speed-110": speedSign("110"),
  "no-parking": `<svg viewBox="0 0 120 120" class="sign" role="img" aria-label="Vägmärke, parkering förbjuden">
    <circle cx="60" cy="60" r="52" fill="#0b5cab"/>
    <circle cx="60" cy="60" r="46" fill="none" stroke="#c1121f" stroke-width="8"/>
    <line x1="30" y1="90" x2="90" y2="30" stroke="#c1121f" stroke-width="10" stroke-linecap="round"/>
  </svg>`,
  "no-stopping": `<svg viewBox="0 0 120 120" class="sign" role="img" aria-label="Vägmärke, stannande och parkering förbjuden">
    <circle cx="60" cy="60" r="52" fill="#0b5cab"/>
    <circle cx="60" cy="60" r="46" fill="none" stroke="#c1121f" stroke-width="8"/>
    <line x1="30" y1="90" x2="90" y2="30" stroke="#c1121f" stroke-width="8" stroke-linecap="round"/>
    <line x1="30" y1="30" x2="90" y2="90" stroke="#c1121f" stroke-width="8" stroke-linecap="round"/>
  </svg>`,
  "main-road": `<svg viewBox="0 0 120 120" class="sign" role="img" aria-label="Vägmärke, huvudled">
    <polygon points="60,2 118,60 60,118 2,60" fill="#1c1c1c"/>
    <polygon points="60,12 108,60 60,108 12,60" fill="#f0c419"/>
  </svg>`,
  "end-main-road": `<svg viewBox="0 0 120 120" class="sign" role="img" aria-label="Vägmärke, huvudled upphör">
    <polygon points="60,2 118,60 60,118 2,60" fill="#1c1c1c"/>
    <polygon points="60,12 108,60 60,108 12,60" fill="#f0c419"/>
    <line x1="86" y1="26" x2="34" y2="94" stroke="#1c1c1c" stroke-width="10" stroke-linecap="round"/>
  </svg>`,
  warning: `<svg viewBox="0 0 120 120" class="sign" role="img" aria-label="Varningsmärke">
    <polygon points="60,6 114,110 6,110" fill="#c1121f"/>
    <polygon points="60,22 100,104 20,104" fill="#fff"/>
  </svg>`,
  motorway: `<svg viewBox="0 0 120 120" class="sign" role="img" aria-label="Vägmärke, motorväg">
    <rect x="6" y="34" width="108" height="52" rx="4" fill="#0b5cab"/>
    <path d="M18 70 H102 M18 50 H102" stroke="#fff" stroke-width="4"/>
    <path d="M60 42 V78" stroke="#fff" stroke-width="3"/>
    <path d="M46 60 H74" stroke="#f0c419" stroke-width="4"/>
  </svg>`,
};

function speedSign(number) {
  return `<svg viewBox="0 0 120 120" class="sign" role="img" aria-label="Hastighetsbegränsning ${number}">
    <circle cx="60" cy="60" r="54" fill="#c1121f"/>
    <circle cx="60" cy="60" r="44" fill="#fff"/>
    <text x="60" y="74" text-anchor="middle" font-size="${number.length > 2 ? 32 : 40}" font-family="Outfit, sans-serif" font-weight="700" fill="#161616">${number}</text>
  </svg>`;
}

export const SIGN_NAMES = Object.keys(SIGN_MARKUP);

export function signSvg(name) {
  return SIGN_MARKUP[name] || "";
}
