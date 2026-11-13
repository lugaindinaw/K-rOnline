import type { PointerEvent } from "react";
import { gearChoices, type Gear, type Transmission } from "../drive/gears";
import type { CameraView } from "../map/followCamera";

type DrivePadProps = {
  cameraView: CameraView;
  tiltOn: boolean;
  tiltNote: string | null;
  gear: Gear;
  onGear: (gear: Gear) => void;
  transmission?: Transmission;
  onTransmission?: () => void;
  weatherLabel?: string | null;
  onWeather?: () => void;
  onGas: (pressed: boolean) => void;
  onBrake: (pressed: boolean) => void;
  onSteer: (side: "left" | "right", pressed: boolean) => void;
  onIndicator: (side: "left" | "right") => void;
  onCamera: () => void;
  onTilt: () => void;
  onCameraDistance?: (direction: -1 | 1) => void;
  onCameraHeight?: (direction: -1 | 1) => void;
};

function hold(onChange: (pressed: boolean) => void) {
  return {
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      event.currentTarget.setPointerCapture(event.pointerId);
      onChange(true);
    },
    onPointerUp() {
      onChange(false);
    },
    onPointerCancel() {
      onChange(false);
    },
    onLostPointerCapture() {
      onChange(false);
    },
    onClick() {
      onChange(true);
      window.setTimeout(() => onChange(false), 1600);
    },
  };
}


export function DrivePad({
  cameraView,
  tiltOn,
  tiltNote,
  gear,
  onGear,
  transmission = "auto",
  onTransmission,
  weatherLabel = null,
  onWeather,
  onGas,
  onBrake,
  onSteer,
  onIndicator,
  onCamera,
  onTilt,
  onCameraDistance,
  onCameraHeight,
}: DrivePadProps) {
  return (
    <div className="drive-pad">
      <div className="drive-pad-steer">
        <button type="button" {...hold((pressed) => onSteer("left", pressed))}>
          Vänster
        </button>
        <button type="button" {...hold((pressed) => onSteer("right", pressed))}>
          Höger
        </button>
      </div>
      <div className="drive-pad-center">
        <p className="drive-gear">Växel {gear}</p>
        <div className="drive-pad-gears">
          {gearChoices(transmission).map((item) => (
            <button key={item} type="button" aria-pressed={gear === item} onClick={() => onGear(item)}>
              {item}
            </button>
          ))}
        </div>
        <button type="button" onClick={onTransmission} disabled={!onTransmission}>
          {transmission === "manual" ? "Manuell" : "Automat"}
        </button>
        <button type="button" onClick={onCamera}>
          {cameraView === "driver" ? "Utanför bilen" : "I bilen"}
        </button>
        <details className="drive-pad-more">
          <summary>Mer</summary>
          {weatherLabel ? (
            <button type="button" onClick={onWeather} disabled={!onWeather}>
              Väder: {weatherLabel}
            </button>
          ) : null}
          {cameraView === "chase" && onCameraDistance && onCameraHeight ? (
            <div className="drive-pad-camera">
              <button type="button" onClick={() => onCameraDistance(-1)}>
                Närmare
              </button>
              <button type="button" onClick={() => onCameraDistance(1)}>
                Längre
              </button>
              <button type="button" onClick={() => onCameraHeight(-1)}>
                Lägre
              </button>
              <button type="button" onClick={() => onCameraHeight(1)}>
                Högre
              </button>
            </div>
          ) : null}
          <button type="button" aria-pressed={tiltOn} onClick={onTilt}>
            {tiltOn ? "Lutning på" : "Styr med lutning"}
          </button>
          <div className="drive-pad-blinkers">
            <button type="button" onClick={() => onIndicator("left")}>
              Blinkers vänster
            </button>
            <button type="button" onClick={() => onIndicator("right")}>
              Blinkers höger
            </button>
          </div>
          {tiltNote ? <p>{tiltNote}</p> : null}
        </details>
      </div>
      <div className="drive-pad-pedals">
        <button type="button" {...hold(onBrake)}>
          Broms
        </button>
        <button type="button" {...hold(onGas)}>
          Gas
        </button>
      </div>
    </div>
  );
}
