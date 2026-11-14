import React from 'react';
import type { EmoteType } from '../types';

interface CharacterAvatarProps {
  shirtColor: string;
  view?: 'front' | 'back';
  pose?: 'standing' | 'walking' | 'seated';
  isVibing?: boolean;
  activeEmote?: EmoteType | null;
  danceMode?: 'none' | 'solo' | 'partner-left' | 'partner-right';
  size?: number;
  className?: string;
}

export const CharacterAvatar: React.FC<CharacterAvatarProps> = ({
  shirtColor,
  view = 'back',
  pose = 'seated',
  isVibing = false,
  activeEmote = null,
  danceMode = 'none',
  size = 44,
  className = '',
}) => {
  const isWalking = pose === 'walking';
  const isSeated = pose === 'seated';

  if (view === 'front') {
    let frontAnimClass = '';
    if (activeEmote === 'dance') {
      frontAnimClass = 'animate-character-dance';
    } else if (activeEmote === 'boo') {
      frontAnimClass = 'animate-character-boo';
    } else if (activeEmote === 'whistle') {
      frontAnimClass = 'animate-character-whistle';
    } else if (activeEmote === 'clap') {
      frontAnimClass = 'animate-[bounce_0.9s_ease-in-out_infinite]';
    } else if (danceMode === 'partner-left') {
      frontAnimClass = 'animate-dance-sway-left';
    } else if (danceMode === 'partner-right') {
      frontAnimClass = 'animate-dance-sway-right';
    } else if (danceMode === 'solo') {
      frontAnimClass = 'animate-dance-solo';
    } else if (isVibing) {
      frontAnimClass = 'animate-[bounce_1.8s_ease-in-out_infinite]';
    }

    const isPartnerLeft = danceMode === 'partner-left';
    const isPartnerRight = danceMode === 'partner-right';
    const isSoloDance = danceMode === 'solo' || activeEmote === 'dance';

    return (
      <svg
        width={size}
        height={size * 1.25}
        viewBox="0 0 48 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${className} ${frontAnimClass}`}
        aria-hidden="true"
      >
        {/* Shadow */}
        <ellipse cx="24" cy="56" rx="12" ry="3" fill="rgba(0,0,0,0.45)" />
        {/* Legs */}
        <rect
          x="17"
          y="42"
          width="5.5"
          height="12"
          rx="2.5"
          fill="#1E293B"
          transform={isSoloDance || isPartnerLeft ? 'rotate(6 19 42)' : undefined}
        />
        <rect
          x="25.5"
          y="42"
          width="5.5"
          height="12"
          rx="2.5"
          fill="#1E293B"
          transform={isSoloDance || isPartnerRight ? 'rotate(-6 28 42)' : undefined}
        />
        {/* Shoes */}
        <rect x="16" y="51.5" width="7" height="3.5" rx="1.75" fill="#0F172A" />
        <rect x="25" y="51.5" width="7" height="3.5" rx="1.75" fill="#0F172A" />
        {/* Torso / Shirt */}
        <path
          d="M12 28C12 24.6863 14.6863 22 18 22H30C33.3137 22 36 24.6863 36 28V43C36 44.1046 35.1046 45 34 45H14C12.8954 45 12 44.1046 12 43V28Z"
          fill={shirtColor}
        />
        {/* Collar */}
        <path d="M19.5 22L24 27L28.5 22H19.5Z" fill="rgba(255,255,255,0.85)" />
        {/* Arms tailored to dance / partner pose */}
        {isPartnerLeft ? (
          <>
            <g transform="rotate(32 11 26)">
              <rect x="8.5" y="25" width="4.5" height="14" rx="2.25" fill={shirtColor} />
              <circle cx="10.75" cy="39.5" r="2.2" fill="#F3C6A5" />
            </g>
            <g transform="rotate(-62 37 26)">
              <rect x="35" y="25" width="4.5" height="15" rx="2.25" fill={shirtColor} />
              <circle cx="37.25" cy="40.5" r="2.2" fill="#F3C6A5" />
            </g>
          </>
        ) : isPartnerRight ? (
          <>
            <g transform="rotate(62 11 26)">
              <rect x="8.5" y="25" width="4.5" height="15" rx="2.25" fill={shirtColor} />
              <circle cx="10.75" cy="40.5" r="2.2" fill="#F3C6A5" />
            </g>
            <g transform="rotate(-32 37 26)">
              <rect x="35" y="25" width="4.5" height="14" rx="2.25" fill={shirtColor} />
              <circle cx="37.25" cy="39.5" r="2.2" fill="#F3C6A5" />
            </g>
          </>
        ) : isSoloDance ? (
          <>
            <g transform="rotate(42 11 26)">
              <rect x="8.5" y="24" width="4.5" height="14" rx="2.25" fill={shirtColor} />
              <circle cx="10.75" cy="38.5" r="2.2" fill="#F3C6A5" />
            </g>
            <g transform="rotate(-42 37 26)">
              <rect x="35" y="24" width="4.5" height="14" rx="2.25" fill={shirtColor} />
              <circle cx="37.25" cy="38.5" r="2.2" fill="#F3C6A5" />
            </g>
          </>
        ) : (
          <>
            <rect x="8.5" y="25" width="4.5" height="15" rx="2.25" fill={shirtColor} />
            <rect x="35" y="25" width="4.5" height="15" rx="2.25" fill={shirtColor} />
            <circle cx="10.75" cy="40.5" r="2.2" fill="#F3C6A5" />
            <circle cx="37.25" cy="40.5" r="2.2" fill="#F3C6A5" />
          </>
        )}
        {/* Neck */}
        <rect x="21" y="18" width="6" height="5" rx="2" fill="#E8B490" />
        {/* Ears */}
        <circle cx="14.5" cy="13.5" r="2.5" fill="#E8B490" />
        <circle cx="33.5" cy="13.5" r="2.5" fill="#E8B490" />
        {/* Head */}
        <circle cx="24" cy="12.5" r="9" fill="#F3C6A5" />
        {/* Hair */}
        <path
          d="M15 11.5C15 6.5 19 3 24 3C29 3 33 6.5 33 11.5C31.5 8.5 28 7.5 24 7.5C20 7.5 16.5 8.5 15 11.5Z"
          fill="#271C19"
        />
        {/* Eyes & Smile */}
        <circle cx="20.8" cy="13" r="1.2" fill="#1F1614" />
        <circle cx="27.2" cy="13" r="1.2" fill="#1F1614" />
        <path
          d="M21.5 16.5C22.3 17.5 25.7 17.5 26.5 16.5"
          stroke="#9A5B42"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  let bodyAnimClass = '';
  if (isSeated) {
    if (activeEmote === 'dance') {
      bodyAnimClass = 'animate-character-dance';
    } else if (activeEmote === 'boo') {
      bodyAnimClass = 'animate-character-boo';
    } else if (activeEmote === 'whistle') {
      bodyAnimClass = 'animate-character-whistle';
    } else if (activeEmote === 'clap') {
      bodyAnimClass = 'animate-[bounce_0.9s_ease-in-out_infinite]';
    } else if (isVibing) {
      bodyAnimClass = 'animate-[bounce_1.8s_ease-in-out_infinite]';
    }
  }

  const isDancing = isSeated && activeEmote === 'dance';
  const isClapping = isSeated && activeEmote === 'clap';
  const isWhistling = isSeated && activeEmote === 'whistle';
  const isBooing = isSeated && activeEmote === 'boo';

  return (
    <svg
      width={size}
      height={size * 1.2}
      viewBox="0 0 48 58"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} ${bodyAnimClass}`}
      aria-hidden="true"
    >
      {/* Walking / standing legs (hidden when seated behind chair back) */}
      {!isSeated && (
        <g>
          <rect
            x="17.5"
            y={isWalking ? '39' : '40'}
            width="5"
            height="12"
            rx="2.5"
            fill="#1E293B"
            transform={isWalking ? 'rotate(-10 20 40)' : undefined}
          />
          <rect
            x="25.5"
            y={isWalking ? '41' : '40'}
            width="5"
            height="12"
            rx="2.5"
            fill="#1E293B"
            transform={isWalking ? 'rotate(10 28 40)' : undefined}
          />
        </g>
      )}

      {/* Shoulders & Shirt Back */}
      <path
        d="M11.5 28.5C11.5 24.5 14.8 21.5 18.8 21.5H29.2C33.2 21.5 36.5 24.5 36.5 28.5V41.5C36.5 42.6 35.6 43.5 34.5 43.5H13.5C12.4 43.5 11.5 42.6 11.5 41.5V28.5Z"
        fill={shirtColor}
      />
      {/* Subtle shoulder seam shading */}
      <path
        d="M14 25C16.5 23.2 20 22.5 24 22.5C28 22.5 31.5 23.2 34 25"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Arms tailored to seated emote */}
      {isClapping ? (
        <>
          <g className="animate-clap-left">
            <rect
              x="7.5"
              y="14.5"
              width="4.2"
              height="13.5"
              rx="2.1"
              fill={shirtColor}
              transform="rotate(-26 10 25)"
            />
            <circle cx="8.2" cy="14" r="2.2" fill="#F3C6A5" />
          </g>
          <g className="animate-clap-right">
            <rect
              x="36.3"
              y="14.5"
              width="4.2"
              height="13.5"
              rx="2.1"
              fill={shirtColor}
              transform="rotate(26 38 25)"
            />
            <circle cx="39.8" cy="14" r="2.2" fill="#F3C6A5" />
          </g>
          {/* Clap Spark Lines */}
          <path d="M21 5L22.5 2.5M27 5L25.5 2.5" stroke="#34D399" strokeWidth="1.6" strokeLinecap="round" />
        </>
      ) : isDancing ? (
        <>
          <rect
            x="6.5"
            y="14"
            width="4.2"
            height="13"
            rx="2.1"
            fill={shirtColor}
            transform="rotate(-38 9 24)"
          />
          <rect
            x="37.3"
            y="14"
            width="4.2"
            height="13"
            rx="2.1"
            fill={shirtColor}
            transform="rotate(38 39 24)"
          />
          <circle cx="4.5" cy="15.5" r="2.1" fill="#F3C6A5" />
          <circle cx="43.5" cy="15.5" r="2.1" fill="#F3C6A5" />
        </>
      ) : isBooing ? (
        <>
          {/* Hands raised on hips / waving in protest */}
          <rect
            x="7"
            y="20"
            width="4.2"
            height="12"
            rx="2.1"
            fill={shirtColor}
            transform="rotate(-20 10 26)"
          />
          <rect
            x="36.8"
            y="20"
            width="4.2"
            height="12"
            rx="2.1"
            fill={shirtColor}
            transform="rotate(20 38 26)"
          />
        </>
      ) : (
        <>
          <rect
            x="8.5"
            y="25.5"
            width="4.2"
            height={isSeated ? '11' : '14'}
            rx="2.1"
            fill={shirtColor}
          />
          <rect
            x="35.3"
            y="25.5"
            width="4.2"
            height={isSeated ? '11' : '14'}
            rx="2.1"
            fill={shirtColor}
          />
        </>
      )}

      {/* Neck */}
      <rect x="21" y="17.5" width="6" height="5" rx="2" fill="#E8B490" />

      {/* Ears */}
      <circle cx="14.2" cy="13" r="2.4" fill="#E8B490" />
      <circle cx="33.8" cy="13" r="2.4" fill="#E8B490" />

      {/* Back of Head (Hair) */}
      <circle cx="24" cy="12" r="9.2" fill="#2A1D19" />
      <path
        d="M17.5 8.5C19.5 6 22 5 25 5.2"
        stroke="rgba(255,255,255,0.14)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />

      {/* Whistle musical note puff */}
      {isWhistling && (
        <g>
          <circle cx="35" cy="5.5" r="2" fill="#60A5FA" />
          <path d="M37 5.5V1L41 2.2" stroke="#60A5FA" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  );
};
