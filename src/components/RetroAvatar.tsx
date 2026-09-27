import React from 'react';

interface RetroAvatarProps {
  src: string;
  alt: string;
  className?: string;
}

export const RetroAvatar: React.FC<RetroAvatarProps> = ({ src, alt, className = '' }) => {
  return (
    <img 
      src={src} 
      alt={alt} 
      className={`pixelated ${className}`}
      referrerPolicy="no-referrer"
    />
  );
};
