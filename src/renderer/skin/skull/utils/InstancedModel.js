import * as THREE from "three/webgpu";
import ImportGltf from "./ImportGltf";
import { createFresnelMaterial } from "../materials/fresnelMaterial";

export default class InstancedModel {
	constructor(
		scene,
		{
			url,
			meshName,
			heightMax = 1.0,
			roughness = 1.0,
			color,
			emissiveIntensity,
			count = 12,
			spacing = 0.65,
		},
	) {
		this.scene = scene;
		this.count = count;
		this.spacing = spacing;

		const gltf = new ImportGltf(url, {
			onLoad: (model) => {
				let geometry = null;
				model.traverse((child) => {
					if (child.isMesh && (!meshName || child.name === meshName)) {
						if (!geometry) geometry = child.geometry;
					}
				});

				const material = createFresnelMaterial({
					heightMax,
					roughness,
					color,
					emissiveIntensity,
				});
				const mesh = new THREE.InstancedMesh(geometry, material, this.count);
				this.#setPositions(mesh);
				this.scene.add(mesh);
			},
		});
		this.ready = gltf.ready;
	}

	#setPositions(mesh) {
		const { count, spacing } = this;
		const gridSize = Math.ceil(Math.sqrt(count));
		const halfSize = ((gridSize - 1) * spacing) / 2;
		const spacingZ = spacing * 0.65;
		const halfSizeZ = ((gridSize - 1) * spacingZ) / 2;
		const dummy = new THREE.Object3D();

		for (let i = 0; i < count; i++) {
			const x = i % gridSize;
			const z = Math.floor(i / gridSize);
			const xOffset = z % 2 === 1 ? spacing / 2 : 0;

			dummy.position.set(
				x * spacing - halfSize + xOffset,
				0,
				z * spacingZ - halfSizeZ,
			);
			dummy.updateMatrix();
			mesh.setMatrixAt(i, dummy.matrix);
		}
		mesh.instanceMatrix.needsUpdate = true;
	}
}
