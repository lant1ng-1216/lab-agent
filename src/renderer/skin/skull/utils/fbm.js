import {
	vec2,
	float,
	sub,
	sin,
	cos,
	mul,
	add,
	mix,
	dot,
	Fn,
	fract,
	floor,
} from "three/tsl";

const rand = Fn(([n]) => {
	const dp = dot(n, vec2(12.9898, 4.1414));
	return fract(mul(sin(dp), 43758.5453));
});

const noise = Fn(([p]) => {
	const ip = floor(p);
	const u = fract(p);
	const uu = mul(mul(u, u), sub(float(3.0), mul(u, 2.0)));

	const res = mix(
		mix(rand(ip), rand(add(ip, vec2(1.0, 0.0))), uu.x),
		mix(rand(add(ip, vec2(0.0, 1.0))), rand(add(ip, vec2(1.0, 1.0))), uu.x),
		uu.y,
	);
	return mul(res, res);
});

export const fbm = Fn(([x, numOctaves]) => {
	const v = float(0.0).toVar();
	const a = float(0.5).toVar();
	const shift = vec2(100);
	const angle = float(0.5);
	const c = cos(angle);
	const s = sin(angle);
	const xx = x.toVar();

	// 4 octaves (unrolled — TSL has no loops)
	v.assign(add(v, mul(a, noise(xx))));
	xx.assign(add(mul(vec2(sub(mul(xx.x, c), mul(xx.y, s)), add(mul(xx.x, s), mul(xx.y, c))), 2.0), shift));
	a.assign(mul(a, 0.5));

	v.assign(add(v, mul(a, noise(xx))));
	xx.assign(add(mul(vec2(sub(mul(xx.x, c), mul(xx.y, s)), add(mul(xx.x, s), mul(xx.y, c))), 2.0), shift));
	a.assign(mul(a, 0.5));

	v.assign(add(v, mul(a, noise(xx))));
	xx.assign(add(mul(vec2(sub(mul(xx.x, c), mul(xx.y, s)), add(mul(xx.x, s), mul(xx.y, c))), 2.0), shift));
	a.assign(mul(a, 0.5));

	v.assign(add(v, mul(a, noise(xx))));

	return v;
});
