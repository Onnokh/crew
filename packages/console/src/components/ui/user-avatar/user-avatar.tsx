import { useState } from "react";

/** DiceBear "thumbs" — deterministic, friendly avatars keyed off a stable seed. */
const DICEBEAR = "https://api.dicebear.com/9.x/thumbs/svg";

/** Deterministic avatar image URL for a seed (user id, email, or name). */
export function avatarUrl(seed: string): string {
  return `${DICEBEAR}?seed=${encodeURIComponent(seed)}`;
}

/** Up to two uppercase initials, for the fallback when the image can't load. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const letters =
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "");
  return letters.toUpperCase() || "?";
}

/**
 * A deterministic DiceBear thumbs avatar for a user, falling back to initials
 * if the image can't load. `className` controls size/shape (size, border-radius);
 * the same class is reused for the fallback so layout stays identical.
 */
export function UserAvatar({
  seed,
  name,
  className,
}: {
  seed: string | null | undefined;
  name?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const label = (name && name.trim()) || seed || "Unknown user";
  if (!seed || failed) {
    return (
      <span className={className} aria-label={label}>
        {initials(label)}
      </span>
    );
  }
  return (
    <img
      className={className}
      src={avatarUrl(seed)}
      alt=""
      aria-hidden="true"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
