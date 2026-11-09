import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/**
 * The map camera cannot sit inside the car: photogrammetry pushes it back
 * out to the street. This overlay draws the same cabin from the driver's
 * eyes, with a clear windshield, so the map behind it is the road ahead.
 */
export function CabinOverlay({ active }: { active: boolean }) {
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
    const camera = new THREE.PerspectiveCamera(52, 1, 0.05, 20);
    // Mirrored cabin: the wheel is on the left, just ahead of the seat.
    camera.position.set(-0.36, 1.06, -0.22);
    camera.lookAt(-0.08, 0.98, 6);
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const sun = new THREE.DirectionalLight(0xfff6ea, 1.6);
    sun.position.set(1.5, 3.2, 2.4);
    scene.add(sun);
    const loader = new GLTFLoader();
    let cabin: THREE.Object3D | null = null;
    loader.load("/cabin.glb", (gltf) => {
      cabin = gltf.scene;
      scene.add(cabin);
    });
    let frame = 0;
    const draw = () => {
      frame = window.requestAnimationFrame(draw);
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    draw();
    return () => {
      window.cancelAnimationFrame(frame);
      renderer.dispose();
      renderer.domElement.remove();
      cabin?.traverse((child) => {
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
  }, [active]);

  if (!active) {
    return null;
  }
  return <div ref={hostRef} className="cabin-overlay" />;
}
