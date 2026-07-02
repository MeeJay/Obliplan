import { cn } from '../../utils/cn';

interface UserAvatarProps {
  /** Profile photo URL (synced from Obligate). Null/undefined renders the gradient initial. */
  avatar?: string | null;
  username: string;
  /** Pixel size; always a circle. */
  size?: number;
  className?: string;
}

/**
 * Round avatar - image when available, else a gradient circle with the first
 * uppercase letter. Same visual the rest of the Obli suite uses.
 */
export function UserAvatar({ avatar, username, size = 26, className }: UserAvatarProps) {
  const initial = (username?.startsWith('og_') ? username.slice(3) : username || '?').charAt(0).toUpperCase();
  const dim = `${size}px`;
  const fontSize = `${Math.max(9, Math.round(size * 0.42))}px`;

  if (avatar) {
    return (
      <img
        src={avatar}
        alt={username}
        className={cn('rounded-full object-cover shrink-0', className)}
        style={{ width: dim, height: dim }}
      />
    );
  }

  return (
    <div
      className={cn('flex shrink-0 items-center justify-center rounded-full font-semibold text-white', className)}
      style={{
        width: dim,
        height: dim,
        fontSize,
        background: 'linear-gradient(135deg, rgba(124,108,255,0.7), rgba(157,140,255,0.45))',
      }}
    >
      {initial}
    </div>
  );
}
