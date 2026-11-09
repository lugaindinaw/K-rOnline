import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import type { CockpitPose } from "./cockpit";
import { wheelRotationDegrees } from "./cockpit";

type CabinOverlayProps = {
  active: boolean;
  poseRef: RefObject<CockpitPose>;
};

function paintCluster(canvas: HTMLCanvasElement, speedKmh: number, gear: string, indicator: string) {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#07080c";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#2c3544";
  context.lineWidth = 10;
  context.strokeRect(18, 18, width - 36, height - 36);
  context.fillStyle = indicator === "left" ? "#ff9a1f" : "#3a4250";
  context.beginPath();
  context.moveTo(54, 78);
  context.lineTo(92, 56);
  context.lineTo(92, 100);
  context.closePath();
  context.fill();
  context.fillStyle = indicator === "right" ? "#ff9a1f" : "#3a4250";
  context.beginPath();
  context.moveTo(width - 54, 78);
  context.lineTo(width - 92, 56);
  context.lineTo(width - 92, 100);
  context.closePath();
  context.fill();
  context.fillStyle = "#f4f7fb";
  context.font = "700 150px sans-serif";
  context.textAlign = "center";
  context.fillText(String(Math.round(speedKmh)), width * 0.4, 230);
  context.font = "600 36px sans-serif";
  context.fillStyle = "#9aa6b8";
  context.fillText("km/h", width * 0.4, 278);
  context.fillStyle = "#7dcea0";
  context.font = "700 108px sans-serif";
  context.fillText(gear || "D", width * 0.74, 220);
}

function paintNav(canvas: HTMLCanvasElement, roadName: string) {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const width = canvas.width;
  const height = canvas.height;
  context.fillStyle = "#10140f";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#2f6b45";
  context.lineWidth = 14;
  context.beginPath();
  context.moveTo(width * 0.5, height * 0.78);
  context.lineTo(width * 0.5, height * 0.34);
  context.stroke();
  context.fillStyle = "#d5ffe4";
  context.beginPath();
  context.moveTo(width * 0.5, height * 0.22);
  context.lineTo(width * 0.42, height * 0.38);
  context.lineTo(width * 0.58, height * 0.38);
  context.closePath();
  context.fill();
  context.font = "600 40px sans-serif";
  context.textAlign = "left";
  context.fillText(roadName || "Väg", 28, 64);
}

/**
 * The map camera cannot sit in the seat. This cockpit frames the live street:
 * the windshield stays open, and the wheel, dash and screens sit along the bottom.
 */
export function CabinOverlay({ active, poseRef }: CabinOverlayProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!active || !host) {
      return;
    }
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 30);
    camera.position.set(0, 1.28, -1.35);
    camera.lookAt(0, 0.92, 6);

    scene.add(new THREE.AmbientLight(0xc5ccd6, 0.7));
    const sun = new THREE.DirectionalLight(0xfff4e4, 0.7);
    sun.position.set(0.6, 2.4, 2);
    scene.add(sun);

    const leather = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.72, metalness: 0.08 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.38, metalness: 0.62 });
    const gloss = new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.28, metalness: 0.55 });
    const stitch = new THREE.MeshStandardMaterial({
      color: 0x1a3c66,
      emissive: 0x143055,
      emissiveIntensity: 0.7,
      roughness: 0.5,
    });

    const dash = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.42, 0.72), leather);
    dash.position.set(0, 0.28, 0.62);
    scene.add(dash);
    const cowl = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.28), trim);
    cowl.position.set(0, 0.5, 0.86);
    scene.add(cowl);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 1.35), gloss);
    hood.position.set(0, 0.16, 1.35);
    hood.rotation.x = -0.08;
    scene.add(hood);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.012, 0.02), stitch);
    strip.position.set(0, 0.5, 0.74);
    scene.add(strip);

    const wheel = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.018, 12, 36), gloss);
    wheel.add(rim);
    for (const angle of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.016, 0.018), trim);
      spoke.position.set(Math.cos(angle) * 0.08, Math.sin(angle) * 0.08, 0);
      spoke.rotation.z = angle;
      wheel.add(spoke);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 20), trim);
    hub.rotation.x = Math.PI / 2;
    wheel.add(hub);
    wheel.position.set(-0.28, 0.58, 0.36);
    scene.add(wheel);

    const screenMaterial = (map: THREE.CanvasTexture) =>
      new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide });

    const clusterCanvas = document.createElement("canvas");
    clusterCanvas.width = 640;
    clusterCanvas.height = 360;
    const clusterMap = new THREE.CanvasTexture(clusterCanvas);
    clusterMap.colorSpace = THREE.SRGBColorSpace;
    const cluster = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.22), screenMaterial(clusterMap));
    cluster.position.set(-0.02, 0.56, 0.78);
    cluster.lookAt(camera.position);
    scene.add(cluster);

    const navCanvas = document.createElement("canvas");
    navCanvas.width = 640;
    navCanvas.height = 360;
    const navMap = new THREE.CanvasTexture(navCanvas);
    navMap.colorSpace = THREE.SRGBColorSpace;
    const nav = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.24), screenMaterial(navMap));
    nav.position.set(0.58, 0.52, 0.84);
    nav.lookAt(camera.position);
    scene.add(nav);

    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.95, 0.12), leather);
      pillar.position.set(side * 1.22, 1.02, 0.48);
      pillar.rotation.z = side * -0.06;
      scene.add(pillar);
      const sideMirror = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.06), gloss);
      sideMirror.position.set(side * 1.32, 0.92, 0.55);
      scene.add(sideMirror);
    }

    const shifter = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.16, 12), trim);
    shifter.position.set(0.34, 0.58, 0.42);
    scene.add(shifter);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), gloss);
    knob.position.set(0.34, 0.67, 0.42);
    scene.add(knob);

    const brakePedal = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.11), trim);
    brakePedal.position.set(0.05, 0.12, 0.72);
    scene.add(brakePedal);
    const gasPedal = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.13), gloss);
    gasPedal.position.set(0.16, 0.12, 0.78);
    scene.add(gasPedal);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.12), leather);
    seat.position.set(-0.28, 0.55, -0.85);
    scene.add(seat);

    let shownSpeed = -1;
    let shownGear = "";
    let shownRoad = "";
    let shownIndicator = "";
    let frame = 0;
    const draw = () => {
      frame = window.requestAnimationFrame(draw);
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const pose = poseRef.current;
      const speed = pose?.speedKmh ?? 0;
      const gear = pose?.gear || "D";
      const road = pose?.roadName || "";
      const indicator = pose?.indicator || "off";
      wheel.rotation.z = (-wheelRotationDegrees(pose?.steer ?? 0) * Math.PI) / 180;
      brakePedal.position.y = pose?.braking ? 0.09 : 0.12;
      gasPedal.position.y = pose?.accelerating ? 0.09 : 0.12;
      if (speed !== shownSpeed || gear !== shownGear || indicator !== shownIndicator) {
        shownSpeed = speed;
        shownGear = gear;
        shownIndicator = indicator;
        paintCluster(clusterCanvas, speed, gear, indicator);
        clusterMap.needsUpdate = true;
      }
      if (road !== shownRoad) {
        shownRoad = road;
        paintNav(navCanvas, road);
        navMap.needsUpdate = true;
      }
      renderer.render(scene, camera);
    };
    paintCluster(clusterCanvas, 0, "D", "off");
    paintNav(navCanvas, "");
    draw();

    return () => {
      window.cancelAnimationFrame(frame);
      renderer.dispose();
      clusterMap.dispose();
      navMap.dispose();
      renderer.domElement.remove();
      scene.traverse((child) => {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) {
          material.forEach((item) => item.dispose());
        } else if (material && material !== leather && material !== trim && material !== gloss && material !== stitch) {
          material.dispose();
        }
      });
      leather.dispose();
      trim.dispose();
      gloss.dispose();
      stitch.dispose();
    };
  }, [active, poseRef]);

  if (!active) {
    return null;
  }
  return <div ref={hostRef} className="cabin-overlay" />;
}
