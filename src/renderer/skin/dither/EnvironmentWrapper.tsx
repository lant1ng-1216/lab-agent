/**
 * Environment / room lighting — adapted from
 * https://github.com/niccolofanton/dithering-shader (MIT)
 * Room lighting originally inspired by @0xca0a.
 */

import { memo, type FC } from "react";
import {
  AccumulativeShadows,
  Environment,
  Lightformer,
  RandomizedLight,
} from "@react-three/drei";
import * as THREE from "three";

interface RoomProps {
  highlight: string;
}

const boxGeometry = new THREE.BoxGeometry();
const whiteMaterial = new THREE.MeshStandardMaterial({
  color: new THREE.Color(1, 1, 1),
});

function Room({ highlight }: RoomProps) {
  return (
    <group position={[0, -0.5, 0]}>
      <spotLight castShadow position={[-15, 20, 15]} angle={0.2} penumbra={1} intensity={2} decay={0} />
      <spotLight castShadow position={[15, 20, 15]} angle={0.2} penumbra={1} intensity={2} decay={0} />
      <spotLight castShadow position={[15, 20, -15]} angle={0.2} penumbra={1} intensity={2} decay={0} />
      <spotLight castShadow position={[-15, 20, -15]} angle={0.2} penumbra={1} intensity={2} decay={0} />

      <pointLight castShadow color="white" intensity={100} distance={28} decay={2} position={[0.5, 14.0, 0.5]} />

      <mesh geometry={boxGeometry} castShadow receiveShadow position={[0.0, 13.2, 0.0]} scale={[31.5, 28.5, 31.5]}>
        <meshStandardMaterial color="gray" side={THREE.BackSide} />
      </mesh>

      <mesh geometry={boxGeometry} material={whiteMaterial} castShadow receiveShadow position={[-10.906, -1.0, 1.846]} rotation={[0, -0.195, 0]} scale={[2.328, 7.905, 4.651]} />
      <mesh geometry={boxGeometry} material={whiteMaterial} castShadow receiveShadow position={[-5.607, -0.754, -0.758]} rotation={[0, 0.994, 0]} scale={[1.97, 1.534, 3.955]} />
      <mesh geometry={boxGeometry} material={whiteMaterial} castShadow receiveShadow position={[6.167, -0.16, 7.803]} rotation={[0, 0.561, 0]} scale={[3.927, 6.285, 3.687]} />
      <mesh geometry={boxGeometry} material={whiteMaterial} castShadow receiveShadow position={[-2.017, 0.018, 6.124]} rotation={[0, 0.333, 0]} scale={[2.002, 4.566, 2.064]} />
      <mesh geometry={boxGeometry} material={whiteMaterial} castShadow receiveShadow position={[2.291, -0.756, -2.621]} rotation={[0, -0.286, 0]} scale={[1.546, 1.552, 1.496]} />
      <mesh geometry={boxGeometry} material={whiteMaterial} castShadow receiveShadow position={[-2.193, -0.369, -5.547]} rotation={[0, 0.516, 0]} scale={[3.875, 3.487, 2.986]} />

      <Lightformer form="ring" position={[2, 3, -2]} scale={10} color={highlight} intensity={15} />
      <Lightformer form="box" intensity={80} position={[-14.0, 10.0, 8.0]} scale={[0.1, 2.5, 2.5]} />
      <Lightformer form="box" intensity={80} position={[-14.0, 14.0, -4.0]} scale={[0.1, 2.5, 2.5]} />
      <Lightformer form="box" intensity={23} position={[14.0, 12.0, 0.0]} scale={[0.1, 5.0, 5.0]} />
      <Lightformer form="box" intensity={16} position={[0.0, 9.0, 14.0]} scale={[5.0, 5.0, 0.1]} />
      <Lightformer form="box" intensity={80} position={[7.0, 8.0, -14.0]} scale={[2.5, 2.5, 0.1]} />
      <Lightformer form="box" intensity={80} position={[-7.0, 16.0, -14.0]} scale={[2.5, 2.5, 0.1]} />
      <Lightformer form="box" intensity={1} position={[0.0, 20.0, 0.0]} scale={[0.1, 0.1, 0.1]} />
      <Lightformer form="box" intensity={20} position={[0.0, 15, 0.0]} scale={[10, 1, 10]} />
    </group>
  );
}

export const Shadows: FC = memo(() => (
  <AccumulativeShadows frames={100} temporal alphaTest={0.8} opacity={1.25} scale={15} position={[0, -1.12, 0]}>
    <RandomizedLight amount={8} radius={4} position={[1, 5.5, 1]} />
  </AccumulativeShadows>
));

export function EnvironmentWrapper({
  intensity,
  highlight,
}: {
  intensity: number;
  highlight: string;
}) {
  return (
    <Environment resolution={1024} background={false} environmentIntensity={intensity}>
      <Room highlight={highlight} />
    </Environment>
  );
}
