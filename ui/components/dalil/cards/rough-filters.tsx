/**
 * Hand-roughened edges for boxes, arrows, checks and highlight blobs. Mount once per page (the
 * /cards route does); every GuideCard on the page then references the same filters through
 * CSS filter: url(#id). The displacement is static and baked, never animated, and text is never
 * put inside a filtered element so it stays crisp.
 */
export const ROUGH_FILTER_ID = "dalil-rough";
export const ROUGH_BLOB_FILTER_ID = "dalil-rough-blob";

/** Class names that apply the filters. Keep as literals so Tailwind sees them. */
export const ROUGH = "[filter:url(#dalil-rough)]";
export const ROUGH_BLOB = "[filter:url(#dalil-rough-blob)]";

export function RoughFilters() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      className="pointer-events-none absolute size-0 overflow-hidden"
    >
      <defs>
        <filter id={ROUGH_FILTER_ID} x="-6%" y="-12%" width="112%" height="124%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id={ROUGH_BLOB_FILTER_ID} x="-6%" y="-18%" width="112%" height="136%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="2" seed="9" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}
