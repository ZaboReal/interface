"use client";

export function Scanlines() {
  return (
    <div
      className="fixed inset-0 z-50 pointer-events-none opacity-[0.03]"
      style={{
        background: `linear-gradient(
          to bottom,
          rgba(18, 16, 16, 0) 50%,
          rgba(0, 0, 0, 0.1) 50%
        )`,
        backgroundSize: '100% 4px',
      }}
    />
  );
}
