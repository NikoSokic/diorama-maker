import { Environment, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { CanvasErrorBoundary } from './components/CanvasErrorBoundary'
import { HealthStatus } from './components/HealthStatus'
import { RotatingCube, TestModel } from './components/TestModel'

function App() {
  return (
    <>
      <Canvas shadows camera={{ position: [4, 3, 5], fov: 50 }}>
        <ambientLight intensity={0.4} />
        <directionalLight castShadow position={[5, 8, 5]} intensity={1.5} />

        {/* Preset se preuzima s CDN-a; bez mreže scena ostaje na gornjim svjetlima. */}
        <CanvasErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <Environment preset="sunset" />
          </Suspense>
        </CanvasErrorBoundary>

        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[6, 64]} />
          <meshStandardMaterial color="#6b8f71" />
        </mesh>

        <CanvasErrorBoundary fallback={<RotatingCube />}>
          <Suspense fallback={<RotatingCube />}>
            <TestModel />
          </Suspense>
        </CanvasErrorBoundary>

        <OrbitControls makeDefault />
      </Canvas>
      <HealthStatus />
    </>
  )
}

export default App
