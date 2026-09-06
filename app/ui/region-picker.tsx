'use client';

import { useRef, useState } from 'react';
import { Check, ChevronDown, MapPin, RotateCcw } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { REGION_NAMES, type RegionSelection } from './regions';
import './region-picker.css';

type Props = {
  value: RegionSelection;
  counts: Record<RegionSelection, number>;
  onChange: (region: RegionSelection) => void;
  canReset: boolean;
  onReset: () => void;
};

export function RegionPicker({
  value,
  counts,
  onChange,
  canReset,
  onReset,
}: Props) {
  const [open, setOpen] = useState(false);
  const selectedRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="atlas-region-control">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className="atlas-region-trigger"
          aria-label={`选择地区：${value}`}
        >
          <MapPin size={15} aria-hidden="true" />
          <span>{value}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent
          className="atlas-region-popover"
          align="start"
          sideOffset={8}
          initialFocus={selectedRef}
        >
          <div className="atlas-region-heading">
            <PopoverTitle>按大区浏览</PopoverTitle>
            <PopoverDescription>
              当前筛选下共 {counts['全部地区']} 所高校
            </PopoverDescription>
          </div>
          <fieldset className="atlas-region-grid" aria-label="地区选项">
            {(['全部地区', ...REGION_NAMES] as const).map((region) => (
              <button
                key={region}
                ref={region === value ? selectedRef : undefined}
                type="button"
                className="atlas-region-option"
                aria-label={`${region}，${counts[region]} 所高校`}
                aria-pressed={region === value}
                onClick={() => {
                  onChange(region);
                  setOpen(false);
                }}
              >
                <span className="atlas-region-option-name">
                  {region}
                  {region === value && <Check size={13} aria-hidden="true" />}
                </span>
                <span className="atlas-region-count">{counts[region]} 所</span>
              </button>
            ))}
          </fieldset>
        </PopoverContent>
      </Popover>
      {canReset && (
        <button
          type="button"
          className="atlas-region-reset"
          onClick={onReset}
          aria-label="重置全部筛选"
          title="重置全部筛选"
        >
          <RotateCcw size={13} aria-hidden="true" />
          <span>重置</span>
        </button>
      )}
    </div>
  );
}
