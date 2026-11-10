import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CAR_MODEL_URL } from "./roadVehicle";
import {
  chaseSceneCamera,
  frontWheelSteerRadians,
  wheelSpinRadians,
  type ChaseScenePose,
} from "./chaseCarMath";

type ChaseCarOverlayProps = {
  active: boolean;
  poseRef: RefObject<ChaseScenePose | null>;
};

/**
 * Maps Model3DElement often shreds or hides the Grab3D mesh at street range.
 * This overlay loads the same car.glb in Three.js, matches the chase camera
 * geometry, and keeps the tires on the look altitude without the mesh lift.
 */
export function ChaseCarOverlay({ active, poseRef }: ChaseCarOverlayProps) {
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
    const camera = new THREE.PerspectiveCamera(46, 1, 0.2, 400);
    scene.add(new THREE.AmbientLight(0xd7dde6, 0.85));
    const sun = new THREE.DirectionalLight(0xfff1df, 1.05);
    sun.position.set(4, 10, 2);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xb9c7d8, 0.35);
    fill.position.set(-6, 4, -3);
    scene.add(fill);

    const root = new THREE.Group();
    scene.add(root);
    const frontWheels: THREE.Object3D[] = [];
    const allWheels: THREE.Object3D[] = [];
    let spin = 0;

    // Bright stand-in so a failed GLB load is still obvious in chase view.
    const fallback = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 1.35, 4.4),
      new THREE.MeshStandardMaterial({ color: 0x7a828c, metalness: 0.45, roughness: 0.4 }),
    );
    fallback.position.y = 0.68;
    root.add(fallback);
    host.dataset.chaseCar = "fallback";

    const loader = new GLTFLoader();
    loader.load(
      CAR_MODEL_URL,
      (gltf) => {
        const car = gltf.scene;
        const bodyPaint = new THREE.MeshStandardMaterial({
          color: 0x8a9098,
          metalness: 0.55,
          roughness: 0.32,
          side: THREE.DoubleSide,
        });
        const glassPaint = new THREE.MeshStandardMaterial({
          color: 0x1c242c,
          metalness: 0.2,
          roughness: 0.08,
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const wheelPaint = new THREE.MeshStandardMaterial({
          color: 0x141414,
          metalness: 0.35,
          roughness: 0.55,
          side: THREE.DoubleSide,
        });
        const rimPaint = new THREE.MeshStandardMaterial({
          color: 0xb0b4b8,
          metalness: 0.8,
          roughness: 0.25,
          side: THREE.DoubleSide,
        });
        car.traverse((node) => {
          const mesh = node as THREE.Mesh;
          const name = node.name.toLowerCase();
          if (mesh.isMesh) {
            mesh.frustumCulled = false;
            if (name.includes("window") || name.includes("glass")) {
              mesh.material = glassPaint;
            } else if (name.includes("wheel") || name.includes("tire") || name.includes("tyre")) {
              mesh.material = wheelPaint;
            } else if (name.includes("rim")) {
              mesh.material = rimPaint;
            } else {
              mesh.material = bodyPaint;
            }
          }
          if (!name.includes("wheel")) {
            return;
          }
          allWheels.push(node);
          if (name.includes("wheel_fl") || name.includes("wheel_fr")) {
            frontWheels.push(node);
          }
        });
        fallback.visible = false;
        root.add(car);
        host.dataset.chaseCar = "glb";
      },
      undefined,
      (error) => {
        host.dataset.chaseCar = "error";
        host.dataset.chaseCarError = error instanceof Error ? error.message : "glb-load-failed";
      },
    );

    let frame = 0;
    let last = performance.now();
    const draw = (now: number) => {
      frame = window.requestAnimationFrame(draw);
      const dt = Math.min(Math.max((now - last) / 1000, 0), 0.1);
      last = now;
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;

      const pose: ChaseScenePose = poseRef.current ?? {
        lookLat: 59.3293,
        lookLng: 18.0686,
        lookAltitude: 12,
        carLat: 59.3293,
        carLng: 18.0686,
        headingDegrees: 0,
        rangeMeters: 20,
        tiltDegrees: 66,
        fovDegrees: 46,
        steer: 0,
        speedKmh: 0,
        pitchDegrees: 0,
        rollDegrees: 0,
      };
      const matched = chaseSceneCamera(pose);
      camera.fov = matched.fovDegrees;
      camera.updateProjectionMatrix();
      camera.position.set(matched.camera.x, matched.camera.y, matched.camera.z);
      camera.lookAt(matched.look.x, matched.look.y, matched.look.z);

      root.position.set(matched.car.x, matched.car.y, matched.car.z);
      root.rotation.set(
        ((pose.pitchDegrees || 0) * Math.PI) / 180,
        matched.yawRadians,
        ((pose.rollDegrees || 0) * Math.PI) / 180,
        "YXZ",
      );

      const steer = frontWheelSteerRadians(pose.steer);
      spin += wheelSpinRadians(pose.speedKmh, dt);
      for (const wheel of allWheels) {
        wheel.rotation.x = spin;
      }
      for (const wheel of frontWheels) {
        wheel.rotation.y = steer;
      }

      renderer.render(scene, camera);
    };
    draw(performance.now());

    return () => {
      window.cancelAnimationFrame(frame);
      renderer.dispose();
      renderer.domElement.remove();
      scene.traverse((child) => {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) {
          material.forEach((item) => item.dispose());
        } else {
          material?.dispose();
        }
      });
    };
  }, [active, poseRef]);

  if (!active) {
    return null;
  }
  return <div ref={hostRef} className="chase-car-overlay" aria-hidden="true" />;
}
