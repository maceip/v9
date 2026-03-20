import { Canvas, extend, useFrame, useLoader, useThree, createPortal } from '@react-three/fiber';
import { Environment, Float, OrbitControls, PerspectiveCamera, Points, PointMaterial, shaderMaterial, useGLTF, useTexture } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

const project = {"name":"tumble","title":"Complex Numbers","type":"tumble","screenshot":"Screenshot 2026-03-06 233928.png","copy":[]};

const fullScreenVertex = `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const ShaderPlaneMaterial = shaderMaterial(
  { 
    uTime: 0, 
    uFrame: 0,
    uResolution: new THREE.Vector2(1, 1), 
    uMouse: new THREE.Vector2(0, 0),
    uTexture: null,
    uTex: null,
    resolution: new THREE.Vector2(1, 1),
    uLensOblateness: 0.75,
    uLensCenter: new THREE.Vector2(0.5, 0.5),
    uBevelEdge: 0.9,
    uLensIOR: 1.25,
    uChromaticAberration: 0.09,
    uRefractionDisplacementScale: 0.1
  },
  fullScreenVertex,
  /* glsl */ "\nprecision highp float;\nvarying vec2 vUv;\nuniform float uTime;\nvec3 palette(float t){ vec3 a=vec3(0.78,0.78,0.78); vec3 b=vec3(0.76,0.1,0.45); vec3 c=vec3(0.45,0.62,0.88); return mix(a,b,smoothstep(-0.02,0.02,t)) + max(0.0, 0.4-abs(t))*c; }\nvoid main(){ vec2 uv=vUv*2.0-1.0; float line = uv.y - uv.x*0.28 + 0.06*sin(uTime*0.2); vec3 top = vec3(0.94,0.82,0.84); vec3 bottom = vec3(0.73,0.84,0.91); vec3 col = mix(bottom, top, step(line, 0.0)); col += vec3(1.0,0.35,0.72) * exp(-120.0*abs(line)); gl_FragColor = vec4(col,1.0); }"
);

const SharpenMaterial = shaderMaterial(
  { 
    tDiffuse: null, 
    uResolution: new THREE.Vector2(1, 1) 
  },
  fullScreenVertex,
  /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    varying vec2 vUv;
    void main() {
      vec2 step = 1.0 / uResolution;
      vec3 texel = texture2D(tDiffuse, vUv).rgb;
      vec3 up = texture2D(tDiffuse, vUv + vec2(0, step.y)).rgb;
      vec3 down = texture2D(tDiffuse, vUv - vec2(0, step.y)).rgb;
      vec3 left = texture2D(tDiffuse, vUv - vec2(step.x, 0)).rgb;
      vec3 right = texture2D(tDiffuse, vUv + vec2(step.x, 0)).rgb;
      
      // Hyper-optimized sharpening filter
      vec3 sharpened = 5.0 * texel - (up + down + left + right);
      gl_FragColor = vec4(mix(texel, sharpened, 0.35), 1.0);
    }
  `
);

const BlobMaterial = shaderMaterial(
  { uTime: 0, uIntensity: 0.2 },
  /* glsl */ "varying vec2 vUv; varying float displacement; uniform float uTime; float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,53.539))) * 43758.5453); } float noise(vec3 p){ vec3 i=floor(p); vec3 f=fract(p); f=f*f*(3.0-2.0*f); float n = mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y), mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z); return n; } void main(){ vUv = uv; displacement = noise(normal*2.0 + vec3(uTime*0.4))*2.0-1.0; vec3 p = position + normal*displacement*0.28; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }",
  /* glsl */ "varying vec2 vUv; varying float displacement; void main(){ float band = sin((vUv.y + displacement*0.5) * 14.0); vec3 cool = vec3(0.1, 0.3, 0.95); vec3 warm = vec3(0.95, 0.68, 0.32); vec3 glow = vec3(0.9, 0.96, 0.9); vec3 color = mix(cool, warm, band*0.5+0.5); color = mix(color, glow, smoothstep(0.3, 0.9, band*0.5+0.5)); gl_FragColor = vec4(color, 1.0); }"
);

extend({ ShaderPlaneMaterial, SharpenMaterial, BlobMaterial });

function TitleOverlay() {
  return (
    <div className="overlay">
      <div className="title">Complex Numbers</div>
      <div className="credit">best-effort r3f reconstruction</div>
    </div>
  );
}

function FullscreenShader() {
  const ref = useRef();
  const finalRef = useRef();
  const { size, gl } = useThree();
  const mouse = useRef({ x: 0, y: 0 });
  
  const [offscreenScene] = useMemo(() => [new THREE.Scene()], []);
  
  useEffect(() => {
    const handleMouseMove = (e) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const noise = null;
  
  if (noise) {
    noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
    noise.minFilter = noise.magFilter = THREE.NearestFilter;
  }

  const isSpacex = false;
  const scale = 0.6;
  const target = useMemo(() => new THREE.WebGLRenderTarget(size.width * scale, size.height * scale, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat
  }), []);

  useEffect(() => {
    target.setSize(size.width * scale, size.height * scale);
  }, [size, target]);

  useFrame((state) => {
    if (!ref.current) return;
    
    // Update uniforms
    ref.current.uTime = state.clock.elapsedTime;
    ref.current.uFrame = state.clock.oldTime;
    ref.current.uResolution.set(size.width * scale, size.height * scale);
    ref.current.uMouse.set(mouse.current.x, mouse.current.y);
    if (noise) ref.current.uTexture = noise;

    if (isSpacex) {
      // 1. Render the offscreen scene to the target
      state.gl.setRenderTarget(target);
      state.gl.render(offscreenScene, state.camera);
      state.gl.setRenderTarget(null);
      
      // 2. Update the final display material
      if (finalRef.current) {
        finalRef.current.tDiffuse = target.texture;
        finalRef.current.uResolution.set(size.width, size.height);
      }
    }
  }, isSpacex ? 1 : 0); // High priority for manual rendering

  if (isSpacex) {
    return (
      <>
        {/* Rendered manually into the FBO */}
        {createPortal(
          <mesh>
            <planeGeometry args={[2, 2]} />
            <shaderPlaneMaterial ref={ref} />
          </mesh>,
          offscreenScene
        )}
        
        {/* Rendered to the screen by R3F */}
        <mesh>
          <planeGeometry args={[2, 2]} />
          <sharpenMaterial ref={finalRef} transparent />
        </mesh>
      </>
    );
  }

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderPlaneMaterial ref={ref} />
    </mesh>
  );
}

function LensScene() {
  const ref = useRef();
  const { size, viewport, camera, scene, gl } = useThree();
  let texture = null;
  try {
    texture = useTexture('/copied-assets/honda_3000.jpg');
  } catch (e) {}

  useFrame((state) => {
    if (!ref.current) return;
    if (texture) ref.current.material.uTex = texture;
    ref.current.material.resolution.set(size.width * window.devicePixelRatio, size.height * window.devicePixelRatio);
    const x = state.pointer.x * viewport.width / 2;
    const y = state.pointer.y * viewport.height / 2;
    ref.current.position.set(x, y, 0);
    const screenPos = ref.current.position.clone().project(camera);
    ref.current.material.uLensCenter.set((screenPos.x + 1) / 2, (screenPos.y + 1) / 2);
  });

  return (
    <>
      <color attach="background" args={['#e1e1e1']} />
      <mesh ref={ref}>
        <circleGeometry args={[1.5, 64]} />
        <shaderPlaneMaterial 
          transparent
          uLensOblateness={0.75}
          uBevelEdge={0.9}
          uLensIOR={1.25}
          uChromaticAberration={0.09}
          uRefractionDisplacementScale={0.1}
        />
      </mesh>
    </>
  );
}

function BlobbySphere({ scale = 1, position = [0, 0, 0], transparent = false, opacity = 1 }) {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.uTime = state.clock.elapsedTime;
  });
  return (
    <mesh position={position} scale={scale}>
      <icosahedronGeometry args={[1, 160]} />
      <blobMaterial ref={ref} transparent={transparent} opacity={opacity} />
    </mesh>
  );
}

function collectPositions(object, limit = 30000) {
  const positions = [];
  object.updateWorldMatrix(true, true);
  object.traverse((child) => {
    if (!child.isMesh || !child.geometry?.attributes?.position) return;
    const attr = child.geometry.attributes.position;
    const step = Math.max(1, Math.floor(attr.count / limit));
    for (let i = 0; i < attr.count; i += step) {
      const p = new THREE.Vector3().fromBufferAttribute(attr, i).applyMatrix4(child.matrixWorld);
      positions.push(p.x, p.y, p.z);
    }
  });
  return new Float32Array(positions);
}

function TreePoints() {
  const gltf = useGLTF('/copied-assets/orangetree/scene-optimized.gltf');
  const points = useMemo(() => collectPositions(gltf.scene, 40000), [gltf]);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(points, 3));
    return g;
  }, [points]);
  return (
    <points geometry={geometry} position={[0, -2.3, 0]}>
      <PointMaterial color="#bed5ff" size={0.065} transparent depthWrite={false} sizeAttenuation />
    </points>
  );
}

function VenusScene() {
  const gltf = useGLTF('/copied-assets/venus/scene.gltf');
  useMemo(() => {
    gltf.scene.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshStandardMaterial({ color: '#dbe1ff', roughness: 0.6, metalness: 0.05, emissive: '#1f3d9b', emissiveIntensity: 0.2 });
      }
    });
  }, [gltf]);
  return <primitive object={gltf.scene} position={[0, -1.6, 0]} scale={3.2} rotation={[0, -0.4, 0]} />;
}

function ShipScene() {
  const gltf = useGLTF('/copied-assets/spaceship-optimized.glb');
  const ref = useRef();
  
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.x = Math.cos(state.clock.elapsedTime * 2) * Math.cos(state.clock.elapsedTime) * 0.15;
      ref.current.position.y = Math.sin(state.clock.elapsedTime * 2) + 1.25;
    }
  });

  useMemo(() => {
    gltf.scene.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshToonMaterial({ color: '#111', roughness: 0.3 });
      }
    });
  }, [gltf]);

  return (
    <group ref={ref} rotation={[0, Math.PI / 2, 0]} position={[0, 1.25, 0]}>
      <primitive object={gltf.scene} scale={1.5} />
    </group>
  );
}

function MoebiusGround() {
  const ref = useRef();
  useFrame((state) => {
    if (ref.current) {
      ref.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]} receiveShadow>
      <planeGeometry args={[300, 300, 150, 150]} />
      <shaderMaterial
        vertexShader={`
          varying vec2 vUv;
          varying vec3 vNormal;
          uniform float uTime;
          
          float getDisp(vec3 p) {
            return cos(p.x * 0.05 - uTime * 2.5) * 2.2 + sin(p.y * 0.05) * 1.5;
          }

          void main() {
            vUv = uv;
            vec3 p = position;
            float disp = getDisp(p);
            p.z += disp;
            
            float e = 0.1;
            float dx = getDisp(vec3(position.x + e, position.y, position.z)) - disp;
            float dy = getDisp(vec3(position.x, position.y + e, position.z)) - disp;
            vNormal = normalize(vec3(-dx, -dy, e));

            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `}
        fragmentShader={`
          varying vec2 vUv;
          varying vec3 vNormal;
          void main() {
            vec3 lightDir = normalize(vec3(-0.5, 0.5, 0.5));
            float d = dot(vNormal, lightDir) * 0.5 + 0.5;
            float steps = 4.0;
            d = floor(d * steps) / steps;
            vec3 col = mix(vec3(1.0, 0.39, 0.34), vec3(1.0, 0.8, 0.7), d);
            float grid = step(0.98, fract(vUv.x * 50.0)) + step(0.98, fract(vUv.y * 50.0));
            col = mix(col, vec3(0.0), clamp(grid, 0.0, 1.0));
            gl_FragColor = vec4(col, 1.0);
          }
        `}
        uniforms={{ uTime: { value: 0 } }}
      />
    </mesh>
  );
}

function Planet({ position, scale, color }) {
  return (
    <mesh position={position} scale={scale}>
      <sphereGeometry args={[2, 32, 32]} />
      <meshStandardMaterial color={color} roughness={0.2} />
    </mesh>
  );
}

function ColumnsScene() {
  const count = 96;
  const mesh = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.9;
    let i = 0;
    for (let x = -count / 2; x < count / 2; x += 1) {
      for (let z = -count / 2; z < count / 2; z += 1) {
        const h = 0.2 + Math.pow(0.5 + 0.5 * Math.sin(x * 0.35 + t) * Math.cos(z * 0.35 - t * 1.3), 2.0) * 6.0;
        dummy.position.set(x * 0.32, h / 2, z * 0.32);
        dummy.scale.set(0.18, h, 0.18);
        dummy.updateMatrix();
        mesh.current.setMatrixAt(i++, dummy.matrix);
      }
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[null, null, count * count]}>
      <cylinderGeometry args={[0.08, 0.08, 1, 12]} />
      <meshStandardMaterial color="#d9ffff" emissive="#7efcff" emissiveIntensity={0.25} />
    </instancedMesh>
  );
}

function AttractorScene() {
  const points = useMemo(() => {
    const arr = new Float32Array(180000 * 3);
    let x = 0.1, y = 0.0, z = 0.0;
    const b = 0.208186;
    for (let i = 0; i < 180000; i++) {
      const dx = Math.sin(y) - b * x;
      const dy = Math.sin(z) - b * y;
      const dz = Math.sin(x) - b * z;
      x += dx * 0.12;
      y += dy * 0.12;
      z += dz * 0.12;
      arr[i * 3] = x * 7.0;
      arr[i * 3 + 1] = y * 7.0;
      arr[i * 3 + 2] = z * 7.0;
    }
    return arr;
  }, []);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(points, 3));
    return g;
  }, [points]);
  return (
    <Points geometry={geometry}>
      <PointMaterial color="#edf4ff" size={0.03} transparent sizeAttenuation depthWrite={false} />
    </Points>
  );
}

function InfinityPoints() {
  const points = useMemo(() => {
    const arr = new Float32Array(280000 * 3);
    for (let i = 0; i < 280000; i++) {
      const t = (i / 280000) * Math.PI * 2.0;
      const d = 2.0 / (3.0 - Math.cos(2.0 * t));
      const x = Math.cos(t) * d;
      const y = Math.sin(2.0 * t) * d * 0.5;
      const z = Math.sin(t) * d * 0.16;
      arr[i * 3] = x * 3.3 + (Math.random() - 0.5) * 0.03;
      arr[i * 3 + 1] = y * 2.0 + (Math.random() - 0.5) * 0.03;
      arr[i * 3 + 2] = z + (Math.random() - 0.5) * 0.03;
    }
    return arr;
  }, []);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(points, 3));
    return g;
  }, [points]);
  return (
    <Points geometry={geometry}>
      <PointMaterial color="#e9f3ff" size={0.02} transparent sizeAttenuation depthWrite={false} />
    </Points>
  );
}

function Scene({ project }) {
  switch (project.type) {
    case 'berghain':
    case 'artreyu':
    case 'bigleaguechew':
    case 'gaudi':
    case 'howhigh':
    case 'laserprinter':
    case 'trumanshow':
    case 'tumble':
    case 'spacex':
    case 'billandted':
      return <FullscreenShader />;
    case 'lens':
      return <LensScene />;
    case 'corvette':
      return (
        <>
          <color attach="background" args={['#010101']} />
          <ambientLight intensity={0.3} />
          <directionalLight position={[4, 5, 4]} intensity={1.8} />
          <BlobbySphere scale={1.55} />
        </>
      );
    case 'crochet':
      return (
        <>
          <color attach="background" args={['#081315']} />
          <ambientLight intensity={0.2} />
          <TreePoints />
        </>
      );
    case 'fasttimes':
      return (
        <>
          <color attach="background" args={['#010208']} />
          <fog attach="fog" args={['#061131', 6, 18]} />
          <ambientLight intensity={0.25} />
          <directionalLight position={[2, 6, 4]} intensity={2.5} color="#ccd6ff" />
          <VenusScene />
        </>
      );
    case 'flight':
      return <FullscreenShader />;
    case 'narnia':
      return (
        <>
          <color attach="background" args={['#000000']} />
          <AttractorScene />
        </>
      );
    case 'simcity':
      return (
        <>
          <color attach="background" args={['#dffbfb']} />
          <ambientLight intensity={1.0} />
          <directionalLight position={[5, 8, 3]} intensity={1.4} color="#ffffff" />
          <ColumnsScene />
        </>
      );
    case 'snek':
      return (
        <>
          <color attach="background" args={['#000000']} />
          <InfinityPoints />
        </>
      );
    case 'winamp':
      return (
        <>
          <color attach="background" args={['#617fc1']} />
          <fog attach="fog" args={['#7591cf', 5, 14]} />
          <ambientLight intensity={0.8} />
          <spotLight position={[-4, 8, 2]} angle={0.22} penumbra={0.9} intensity={90} color="#ffffff" castShadow />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.15, 0]} receiveShadow>
            <planeGeometry args={[8, 8]} />
            <meshPhysicalMaterial color="#8ba4d4" roughness={0.35} metalness={0.05} transmission={0.18} opacity={0.5} transparent />
          </mesh>
          <Float speed={1.2} rotationIntensity={0.15} floatIntensity={0.2}>
            <mesh position={[0, 0.45, 0]} castShadow>
              <icosahedronGeometry args={[1.2, 64]} />
              <meshPhysicalMaterial color="#eef4ff" roughness={0.05} transmission={0.92} thickness={1.1} ior={1.35} attenuationColor="#7cbcff" attenuationDistance={0.7} />
            </mesh>
          </Float>
        </>
      );
    case 'wipeout':
      return (
        <>
          <color attach="background" args={['#3586E1']} />
          <ambientLight intensity={1.25} color="#f0f0f0" />
          <directionalLight position={[-50, 50, -20]} intensity={2.5} color="#fff" />
          <Planet position={[200, 100, 500]} scale={20} color="#FF8477" />
          <Planet position={[130, 70, 400]} scale={8} color="#4DC1BF" />
          <MoebiusGround />
          <ShipScene />
        </>
      );
    case 'z0rg':
      return (
        <>
          <color attach="background" args={['#000000']} />
          <ambientLight intensity={0.2} />
          <directionalLight position={[2.5, 4.5, 4.0]} intensity={1.3} />
          <BlobbySphere scale={1.8} />
        </>
      );
    default:
      return <FullscreenShader />;
  }
}

function cameraProps(type) {
  switch (type) {
    case 'crochet': return { position: [0, 0, 7], fov: 26 };
    case 'fasttimes': return { position: [0, 0.8, 6], fov: 28 };
    case 'narnia': return { position: [0, 0, 24], fov: 45 };
    case 'simcity': return { position: [7, 7, 7], fov: 38 };
    case 'snek': return { position: [0, 0, 8], fov: 30 };
    case 'winamp': return { position: [0, 1.5, 7], fov: 32 };
    case 'wipeout': return { position: [0, 2.2, 12], fov: 32 };
    case 'z0rg': return { position: [0, 0, 5], fov: 35 };
    case 'corvette': return { position: [0, 0, 5.5], fov: 35 };
    default: return { position: [0, 0, 1], fov: 50 };
  }
}

export default function App() {
  const cam = cameraProps("tumble");
  const isShader = ['artreyu','berghain','bigleaguechew','gaudi','howhigh','laserprinter','trumanshow','tumble','flight','billandted'].includes("tumble");
  const intensive = ['spacex', 'berghain', 'howhigh', 'billandted'].includes("tumble");
  return (
    <>
      <TitleOverlay />
      <Canvas dpr={intensive ? 1 : [1, 1.75]} gl={{ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true }}>
        {!isShader && <PerspectiveCamera makeDefault position={cam.position} fov={cam.fov} />}
        {!isShader && ['simcity','wipeout'].includes("tumble") && <OrbitControls enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={0.4} />}
        {!isShader && "tumble" === 'narnia' && <OrbitControls enablePan={false} autoRotate autoRotateSpeed={0.3} />}
        <Scene project={project} />
        {!isShader && <Environment preset="city" />}
      </Canvas>
      {"tumble" === 'fasttimes' && <div className="crt-overlay" />}
    </>
  );
}
