import { useMemo } from "react";
import { Avatar, Style } from "@dicebear/core";
import definition from "@dicebear/styles/line-face.json";

const lineFaceStyle = new Style(definition);

/** DiceBear line-face — https://www.dicebear.com/styles/line-face/ */
export function lineFaceDataUri(seed: string, size = 64): string {
  const svg = new Avatar(lineFaceStyle, {
    seed: seed || "lab-guest",
    size,
  }).toString();
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function newAvatarSeed(): string {
  return `lab-${Math.random().toString(36).slice(2, 10)}`;
}

export default function LineFaceAvatar({
  seed,
  size = 28,
  className = "",
  alt = "",
}: {
  seed: string;
  size?: number;
  className?: string;
  alt?: string;
}) {
  const src = useMemo(() => lineFaceDataUri(seed, size * 2), [seed, size]);
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt={alt}
      className={`shrink-0 rounded-full object-cover ${className}`}
      draggable={false}
    />
  );
}
