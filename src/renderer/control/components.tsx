import React from 'react';

export function Card(props: {
  title?: React.ReactNode;
  hint?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={'card ' + (props.className ?? '')}>
      {props.title && (
        <h3>
          {props.title}
          {props.hint && <span className="hint">{props.hint}</span>}
          <div className="spacer" />
          {props.right}
        </h3>
      )}
      {props.children}
    </div>
  );
}

export function Row(props: { label: React.ReactNode; desc?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="row">
      <div>
        <div className="label">{props.label}</div>
        {props.desc && <div className="desc">{props.desc}</div>}
      </div>
      <div className="flex">{props.children}</div>
    </div>
  );
}

export function Toggle(props: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div
      className={'switch' + (props.on ? ' on' : '')}
      role="switch"
      aria-checked={props.on}
      style={props.disabled ? { opacity: 0.45, pointerEvents: 'none' } : undefined}
      onClick={() => props.onChange(!props.on)}
    />
  );
}

export function Slider(props: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="flex">
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 0.01}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <span className="mono" style={{ minWidth: 46, textAlign: 'right', color: 'var(--text-dim)' }}>
        {props.format ? props.format(props.value) : props.value.toFixed(2)}
      </span>
    </div>
  );
}

export function Badge({ kind, children }: { kind?: 'exp' | 'mot' | 'clr' | 'ok' | 'err'; children: React.ReactNode }) {
  return <span className={'badge ' + (kind ?? '')}>{children}</span>;
}

export function Stat({ k, v, max }: { k: string; v: React.ReactNode; max?: number }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      {max !== undefined && <div className="meter"><i style={{ width: `${Math.min(100, Math.max(0, (Number(v) / max) * 100))}%` }} /></div>}
    </div>
  );
}
