export default function BrandMark({ size = 34, className = '', withRing = false }) {
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-brand-500 shadow-sm shadow-brand-500/20 ${
        withRing ? 'ring-1 ring-brand-600/20' : ''
      } ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" className="h-full w-full" fill="none">
        <path d="M22 20.5 34 32 22 43.5" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M36 43.5h9" stroke="white" strokeWidth="5" strokeLinecap="round" />
      </svg>
    </span>
  );
}
