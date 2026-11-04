import { Center, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Mesh } from 'three'

export function TestModel() {
  const { scene } = useGLTF('/models/test.glb')

  return (
    <Center top>
      <primitive object={scene} />
    </Center>
  )
}

export function RotatingCube() {
  const cube = useRef<Mesh>(null)

  useFrame((_, delta) => {
    if (cube.current) {
      cube.current.rotation.y += delta
    }
  })

  return (
    <mesh ref={cube} castShadow position={[0, 0.5, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#e8a33d" />
    </mesh>
  )
}
