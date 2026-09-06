'use client';

import type { RefObject, CSSProperties } from 'react';

export type WalkInput = { x: number; z: number; yaw: number; pitch: number };
export type WalkInputRef = RefObject<WalkInput>;

const padStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 42px)',
  gap: 3,
  position: 'absolute',
  bottom: 96,
  left: 20,
  zIndex: 12,
  padding: 8,
  borderRadius: 24,
  background: 'rgba(255,255,255,.8)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,.9)',
  boxShadow: '0 8px 32px rgba(31,54,76,.12)',
  touchAction: 'none',
};

export function CampusWalkControls({ input }: { input: WalkInputRef }) {
  return (
    <div
      style={padStyle}
      className="campus-walk-controls"
      aria-label="校园行走控制"
    >
      {[
        { label: '向前行走', symbol: '↑', x: 0, z: -1, column: 2 },
        { label: '向左行走', symbol: '←', x: -1, z: 0, column: 1 },
        { label: '向后行走', symbol: '↓', x: 0, z: 1, column: 2 },
        { label: '向右行走', symbol: '→', x: 1, z: 0, column: 3 },
      ].map((direction) => (
        <button
          key={direction.label}
          aria-label={direction.label}
          style={{
            gridColumn: direction.column,
            width: 42,
            height: 42,
            border: 0,
            borderRadius: 14,
            color: '#1d344b',
            background: 'rgba(233,241,250,.95)',
            fontSize: 22,
            touchAction: 'none',
            userSelect: 'none',
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            input.current.x = direction.x;
            input.current.z = direction.z;
          }}
          onPointerUp={() => {
            input.current.x = 0;
            input.current.z = 0;
          }}
          onPointerCancel={() => {
            input.current.x = 0;
            input.current.z = 0;
          }}
          onLostPointerCapture={() => {
            input.current.x = 0;
            input.current.z = 0;
          }}
          onKeyDown={(event) => {
            if (event.key === ' ' || event.key === 'Enter') {
              event.preventDefault();
              input.current.x = direction.x;
              input.current.z = direction.z;
            }
          }}
          onKeyUp={() => {
            input.current.x = 0;
            input.current.z = 0;
          }}
          onBlur={() => {
            input.current.x = 0;
            input.current.z = 0;
          }}
        >
          {direction.symbol}
        </button>
      ))}
    </div>
  );
}
