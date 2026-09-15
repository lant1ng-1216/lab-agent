import { MeshStandardNodeMaterial } from "three/webgpu";
import {
	positionLocal,
	mix,
	vec3,
	smoothstep,
	float,
	normalView,
	positionViewDirection,
	pow,
	sub,
} from "three/tsl";

export function createFresnelMaterial({
	heightMax = 1.0,
	roughness = 1.0,
	color = vec3(0.2, 0.6, 1.0),
	emissiveIntensity = 0.75,
}) {
	const material = new MeshStandardNodeMaterial({
		metalness: 0,
		roughness,
	});

	// Fresnel: bright at silhouette edges, dark facing camera
	const fresnel = pow(
		sub(float(1.0), normalView.dot(positionViewDirection.negate())),
		float(1.0),
	);

	const coreColor = vec3(0.0, 0.05, 0.1);
	const fresnelColor = mix(coreColor, color, fresnel);

	// Fade out below heightMax
	const heightFade = smoothstep(0.5, heightMax, positionLocal.y);
	const finalColor = fresnelColor.mul(heightFade);

	material.colorNode = finalColor;
	material.emissiveNode = finalColor.mul(emissiveIntensity);

	return material;
}
