import { visibleCabinParts, type CabinBox } from "./cabinMesh";
import { projectCabinPoint, projectCabinSize, type CabinLean } from "./cabinProject";

export type CabinFrame = CabinLean & {
  tiltDegrees: number;
  wheelDegrees: number;
  needleDegrees: number;
};

export type ScreenAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CabinAnchors = {
  gauge: ScreenAnchor | null;
  rearMirror: ScreenAnchor | null;
  leftMirror: ScreenAnchor | null;
  rightMirror: ScreenAnchor | null;
};

export type CabinOverlay = {
  render: (frame: CabinFrame) => CabinAnchors;
  remove: () => void;
};

const VERTEX = `
attribute vec3 position;
attribute vec3 color;
varying vec3 vColor;
void main() {
  gl_Position = vec4(position.xy, position.z, 1.0);
  vColor = color;
}
`;

const FRAGMENT = `
precision mediump float;
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, 1.0);
}
`;

const FACES: Array<{ normal: [number, number, number]; corners: Array<[number, number, number]> }> = [
  { normal: [0, 0, 1], corners: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
  { normal: [0, 0, -1], corners: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
  { normal: [-1, 0, 0], corners: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]] },
  { normal: [1, 0, 0], corners: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, -0.5, 0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]] },
  { normal: [0, 1, 0], corners: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] },
  { normal: [0, -1, 0], corners: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] },
];

const LIGHT: [number, number, number] = [0.18, 0.74, 0.65];

function rotateVector(vector: [number, number, number], quat: [number, number, number, number]): [number, number, number] {
  const [x, y, z] = vector;
  const [qx, qy, qz, qw] = quat;
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

function shade(normal: [number, number, number], color: [number, number, number]): [number, number, number] {
  const length = Math.hypot(LIGHT[0], LIGHT[1], LIGHT[2]);
  const dot = (normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2]) / length;
  const light = 0.4 + 0.6 * Math.max(0, dot);
  return [color[0] * light, color[1] * light, color[2] * light];
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) {
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function anchor(
  local: readonly [number, number, number],
  widthMeters: number,
  heightMeters: number,
  frame: CabinFrame,
  width: number,
  height: number,
): ScreenAnchor | null {
  const aspect = width / Math.max(1, height);
  const lean = { pitchDegrees: frame.pitchDegrees, rollDegrees: frame.rollDegrees };
  const projected = projectCabinPoint(local, frame.tiltDegrees, aspect, lean);
  if (!projected || projected.x < -0.05 || projected.x > 1.05 || projected.y < -0.05 || projected.y > 1.05) {
    return null;
  }
  return {
    x: projected.x * width,
    y: projected.y * height,
    width: projectCabinSize(widthMeters, projected.depth, width, "x", aspect),
    height: projectCabinSize(heightMeters, projected.depth, height, "y", aspect),
  };
}

export function mountCabinOverlay(host: HTMLElement): CabinOverlay | null {
  const canvas = document.createElement("canvas");
  canvas.className = "cockpit-canvas";
  const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false });
  if (!gl) {
    return null;
  }
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = vertex && fragment ? gl.createProgram() : null;
  if (!program || !vertex || !fragment) {
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, "position");
  gl.bindAttribLocation(program, 1, "color");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return null;
  }
  const buffer = gl.createBuffer();
  host.append(canvas);
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 0);

  const resize = () => {
    const rect = host.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  };

  return {
    render(frame) {
      resize();
      const width = canvas.clientWidth || host.clientWidth;
      const height = canvas.clientHeight || host.clientHeight;
      const aspect = canvas.width / Math.max(1, canvas.height);
      const lean = { pitchDegrees: frame.pitchDegrees ?? 0, rollDegrees: frame.rollDegrees ?? 0 };
      const parts = visibleCabinParts(frame.wheelDegrees, frame.needleDegrees);
      const combined = new Float32Array(packCabin(parts, frame.tiltDegrees, aspect, lean));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, combined, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      gl.drawArrays(gl.TRIANGLES, 0, combined.length / 6);
      return {
        gauge: anchor([-0.38, 1.02, 0.88], 0.16, 0.16, frame, width, height),
        rearMirror: anchor([-0.38, 1.39, 0.8], 0.16, 0.045, frame, width, height),
        leftMirror: anchor([-0.98, 1.0, 0.55], 0.16, 0.1, frame, width, height),
        rightMirror: anchor([0.98, 1.0, 0.55], 0.16, 0.1, frame, width, height),
      };
    },
    remove() {
      canvas.remove();
    },
  };
}

function packCabin(parts: CabinBox[], tiltDegrees: number, aspect: number, lean: CabinLean): number[] {
  const packed: number[] = [];
  for (const part of parts) {
    const rotation = part.rotation ?? [0, 0, 0, 1];
    for (const face of FACES) {
      const normal = rotateVector(face.normal, rotation);
      const color = shade(normal, part.color);
      const faceVerts: number[] = [];
      let visible = true;
      for (const corner of face.corners) {
        const scaled: [number, number, number] = [
          corner[0] * part.size[0],
          corner[1] * part.size[1],
          corner[2] * part.size[2],
        ];
        const turned = rotateVector(scaled, rotation);
        const projected = projectCabinPoint(
          [turned[0] + part.center[0], turned[1] + part.center[1], turned[2] + part.center[2]],
          tiltDegrees,
          aspect,
          lean,
        );
        if (!projected || Math.abs(projected.x * 2 - 1) > 2.4 || Math.abs(1 - projected.y * 2) > 2.4) {
          visible = false;
          break;
        }
        faceVerts.push(
          projected.x * 2 - 1,
          1 - projected.y * 2,
          Math.min(0.98, projected.depth / 40),
          color[0],
          color[1],
          color[2],
        );
      }
      if (visible) {
        packed.push(...faceVerts);
      }
    }
  }
  return packed;
}
