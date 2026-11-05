import { useEffect, useRef } from "react";
import type { Map3DViewElement, Maps3dLibrary } from "./maps3dTypes";
import { mirrorCamera, needleDegrees, sideMirrorCamera, stepCockpit, type CockpitMotion, type CockpitPose } from "./cockpit";
import { displayedSpeedKmh } from "../drive/driveFeel";

type CarInteriorProps = {
  poseRef: { current: CockpitPose };
  library: Maps3dLibrary | null;
};

export function CarInterior({ poseRef, library }: CarInteriorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef<HTMLDivElement>(null);
  const dashRef = useRef<HTMLDivElement>(null);
  const needleRef = useRef<SVGLineElement>(null);
  const speedRef = useRef<HTMLSpanElement>(null);
  const clusterRef = useRef<HTMLDivElement>(null);
  const rearMirrorRef = useRef<HTMLDivElement>(null);
  const mirrorHostRef = useRef<HTMLDivElement>(null);
  const leftMirrorHostRef = useRef<HTMLDivElement>(null);
  const rightMirrorHostRef = useRef<HTMLDivElement>(null);
  const leftMirrorFrameRef = useRef<HTMLDivElement>(null);
  const rightMirrorFrameRef = useRef<HTMLDivElement>(null);
  const leftLampRef = useRef<HTMLDivElement>(null);
  const rightLampRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<Map3DViewElement | null>(null);
  const leftMirrorRef = useRef<Map3DViewElement | null>(null);
  const rightMirrorRef = useRef<Map3DViewElement | null>(null);
  const motionRef = useRef<CockpitMotion>({ wheelDegrees: 0, needleDegrees: needleDegrees(0) });

  useEffect(() => {
    const host = mirrorHostRef.current;
    if (!host || !library || typeof library.Map3DElement !== "function") {
      return;
    }
    const pose = poseRef.current;
    const view = mirrorCamera(pose);
    let map: Map3DViewElement;
    try {
      map = new library.Map3DElement({
        center: { lat: view.lat, lng: view.lng, altitude: pose.altitude },
        range: view.rangeMeters,
        tilt: view.tiltDegrees,
        heading: view.headingDegrees,
        mode: "HYBRID",
      });
    } catch {
      return;
    }
    host.replaceChildren(map);
    mirrorRef.current = map;
    const extras: Array<{ host: HTMLDivElement | null; slot: "left" | "right"; target: { current: Map3DViewElement | null } }> = [
      { host: leftMirrorHostRef.current, slot: "left", target: leftMirrorRef },
      { host: rightMirrorHostRef.current, slot: "right", target: rightMirrorRef },
    ];
    const created: Map3DViewElement[] = [];
    for (const extra of extras) {
      if (!extra.host) {
        continue;
      }
      try {
        const side = new library.Map3DElement({
          center: { lat: view.lat, lng: view.lng, altitude: pose.altitude },
          range: 14,
          tilt: 78,
          heading: view.headingDegrees,
          mode: "HYBRID",
        });
        extra.host.replaceChildren(side);
        extra.target.current = side;
        created.push(side);
      } catch {
        extra.target.current = null;
      }
    }
    return () => {
      mirrorRef.current = null;
      leftMirrorRef.current = null;
      rightMirrorRef.current = null;
      map.remove();
      for (const side of created) {
        side.remove();
      }
    };
  }, [library, poseRef]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const pose = poseRef.current;
      const motion = stepCockpit(motionRef.current, pose, dt);
      motionRef.current = motion;
      const pitch = Number.isFinite(pose.pitchDegrees) ? pose.pitchDegrees : 0;
      const roll = Number.isFinite(pose.rollDegrees) ? pose.rollDegrees : 0;
      if (wheelRef.current) {
        wheelRef.current.style.transform = `rotate(${motion.wheelDegrees.toFixed(2)}deg) translateY(${(-pitch * 5).toFixed(1)}px)`;
      }
      if (dashRef.current) {
        dashRef.current.style.transform = `perspective(640px) rotateX(${(16 - pitch).toFixed(2)}deg) rotateZ(${(-roll * 0.6).toFixed(2)}deg)`;
      }
      if (needleRef.current) {
        needleRef.current.setAttribute("transform", `rotate(${motion.needleDegrees.toFixed(2)} 100 108)`);
      }
      if (speedRef.current) {
        speedRef.current.textContent = String(displayedSpeedKmh(pose.speedKmh / 3.6));
      }
      const mirror = mirrorRef.current;
      if (mirror) {
        const view = mirrorCamera(pose);
        mirror.center = { lat: view.lat, lng: view.lng, altitude: pose.altitude };
        mirror.range = view.rangeMeters;
        mirror.tilt = view.tiltDegrees;
        mirror.heading = view.headingDegrees;
      }
      for (const [element, side] of [
        [leftMirrorRef.current, "left"],
        [rightMirrorRef.current, "right"],
      ] as const) {
        if (!element) {
          continue;
        }
        const view = sideMirrorCamera(pose, side);
        element.center = { lat: view.lat, lng: view.lng, altitude: pose.altitude };
        element.range = view.rangeMeters;
        element.tilt = view.tiltDegrees;
        element.heading = view.headingDegrees;
      }
      const indicator = pose.indicator ?? "off";
      const lit = indicator !== "off" && Math.floor(now / 420) % 2 === 0;
      leftLampRef.current?.classList.toggle("active", indicator === "left");
      rightLampRef.current?.classList.toggle("active", indicator === "right");
      leftLampRef.current?.classList.toggle("on", indicator === "left" && lit);
      rightLampRef.current?.classList.toggle("on", indicator === "right" && lit);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [poseRef]);

  return (
    <div ref={rootRef} className="cockpit" aria-hidden="true">
      <div ref={leftLampRef} className="cockpit-indicator cockpit-indicator-left" />
      <div ref={rightLampRef} className="cockpit-indicator cockpit-indicator-right" />
      <div className="cockpit-glass">
        <div className="cockpit-header" />
        <div className="cockpit-pillar cockpit-pillar-left" />
        <div className="cockpit-pillar cockpit-pillar-right" />
        <div ref={rearMirrorRef} className="cockpit-mirror">
          <div ref={mirrorHostRef} className="cockpit-mirror-glass" />
        </div>
        <div className="cockpit-hood" />
        <div ref={leftMirrorFrameRef} className="cockpit-side-mirror cockpit-side-mirror-left">
          <div ref={leftMirrorHostRef} className="cockpit-mirror-glass" />
        </div>
        <div ref={rightMirrorFrameRef} className="cockpit-side-mirror cockpit-side-mirror-right">
          <div ref={rightMirrorHostRef} className="cockpit-mirror-glass" />
        </div>
      </div>
      <div className="cockpit-door cockpit-door-left">
        <span className="cockpit-armrest" />
      </div>
      <div className="cockpit-door cockpit-door-right">
        <span className="cockpit-armrest" />
      </div>
      <div ref={dashRef} className="cockpit-dash">
        <div className="cockpit-vent" />
        <div ref={wheelRef} className="cockpit-wheel">
          <svg viewBox="0 0 200 200">
            <title>Ratt</title>
            <circle cx="100" cy="100" r="78" fill="none" stroke="#1a1d21" strokeWidth="18" />
            <circle cx="100" cy="100" r="68" fill="none" stroke="#3a4148" strokeWidth="6" />
            <path d="M100 32 V78 M40 128 L86 108 M160 128 L114 108" fill="none" stroke="#1a1d21" strokeWidth="12" strokeLinecap="round" />
            <circle cx="100" cy="100" r="16" fill="#2c3238" stroke="#d7c4a3" strokeWidth="3" />
            <ellipse cx="46" cy="108" rx="18" ry="24" fill="#e4b89a" />
            <ellipse cx="154" cy="108" rx="18" ry="24" fill="#e4b89a" />
          </svg>
        </div>
      </div>
      <div ref={clusterRef} className="cockpit-cluster">
          <span ref={speedRef} className="cockpit-speed">
            0
          </span>
          <svg className="cockpit-speedo" viewBox="0 0 200 150" role="img">
            <title>Hastighetsmätare</title>
            <path d="M28 118 A72 72 0 1 1 172 118" fill="none" stroke="#2a3138" strokeWidth="14" strokeLinecap="round" />
            <path d="M36 114 A64 64 0 1 1 164 114" fill="none" stroke="#9fd7c3" strokeWidth="3" strokeLinecap="round" />
            <line
              ref={needleRef}
              x1="100"
              y1="108"
              x2="100"
              y2="48"
              stroke="#f2efe8"
              strokeWidth="3"
              strokeLinecap="round"
              transform={`rotate(${needleDegrees(0)} 100 108)`}
            />
            <circle cx="100" cy="108" r="7" fill="#d7c4a3" />
            <text x="100" y="136" textAnchor="middle" fill="#c8d5ce" fontSize="12" fontFamily="Segoe UI, sans-serif">
              km/h
            </text>
          </svg>
      </div>
    </div>
  );
}
