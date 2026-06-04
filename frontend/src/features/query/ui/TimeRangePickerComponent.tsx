import dayjs from 'dayjs';
import { Clock } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface TimeRange {
  from: dayjs.Dayjs;
  to: dayjs.Dayjs;
}

export interface TimeRangePreset {
  label: string;
  value: string;
  getRange: () => TimeRange;
}

const presets: TimeRangePreset[] = [
  {
    label: 'Last 5 minutes',
    value: '5m',
    getRange: () => ({
      from: dayjs().subtract(5, 'minutes'),
      to: dayjs(),
    }),
  },
  {
    label: 'Last 15 minutes',
    value: '15m',
    getRange: () => ({
      from: dayjs().subtract(15, 'minutes'),
      to: dayjs(),
    }),
  },
  {
    label: 'Last 30 minutes',
    value: '30m',
    getRange: () => ({
      from: dayjs().subtract(30, 'minutes'),
      to: dayjs(),
    }),
  },
  {
    label: 'Last 1 hour',
    value: '1h',
    getRange: () => ({
      from: dayjs().subtract(1, 'hour'),
      to: dayjs(),
    }),
  },
  {
    label: 'Last 4 hours',
    value: '4h',
    getRange: () => ({
      from: dayjs().subtract(4, 'hours'),
      to: dayjs(),
    }),
  },
  {
    label: 'Last 12 hours',
    value: '12h',
    getRange: () => ({
      from: dayjs().subtract(12, 'hours'),
      to: dayjs(),
    }),
  },
  {
    label: 'Last 24 hours',
    value: '24h',
    getRange: () => ({
      from: dayjs().subtract(24, 'hours'),
      to: dayjs(),
    }),
  },
  {
    label: 'Last 7 days',
    value: '7d',
    getRange: () => ({
      from: dayjs().subtract(7, 'days'),
      to: dayjs(),
    }),
  },
  {
    label: 'Last 1 month',
    value: '1m',
    getRange: () => ({
      from: dayjs().subtract(1, 'month'),
      to: dayjs(),
    }),
  },
  {
    label: 'Last 3 months',
    value: '3m',
    getRange: () => ({
      from: dayjs().subtract(3, 'months'),
      to: dayjs(),
    }),
  },
  {
    label: 'Last 1 year',
    value: '1y',
    getRange: () => ({
      from: dayjs().subtract(1, 'year'),
      to: dayjs(),
    }),
  },
];

interface Props {
  onChange: (range: TimeRange | null) => void;
  onGetCurrentRange?: (getCurrentRange: () => TimeRange | null) => void;
  onGetRangeHelpers?: (helpers: { isUntilNow: () => boolean; refreshRange: () => void }) => void;
}

export const TimeRangePickerComponent = ({
  onChange,
  onGetCurrentRange,
  onGetRangeHelpers,
}: Props): React.JSX.Element => {
  // States
  const [selectedPreset, setSelectedPreset] = useState<string>('24h');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');

  // Functions
  const getCustomRange = (): TimeRange | null => {
    if (!customFrom || !customTo) return null;
    return { from: dayjs(customFrom), to: dayjs(customTo) };
  };

  const getCurrentRange = (): TimeRange | null => {
    if (selectedPreset === 'custom') {
      return getCustomRange();
    }

    const preset = presets.find((p) => p.value === selectedPreset);
    return preset ? preset.getRange() : null;
  };

  const isUntilNow = (): boolean => {
    // Only presets (not custom) can be "until now"
    return selectedPreset !== 'custom';
  };

  const refreshRange = (): void => {
    if (selectedPreset !== 'custom') {
      // For presets, recalculate the range (which will update "now")
      const preset = presets.find((p) => p.value === selectedPreset);
      if (preset) {
        const range = preset.getRange();
        onChange(range);
      }
    }
  };

  const handlePresetChange = (presetValue: string) => {
    setSelectedPreset(presetValue);

    if (presetValue === 'custom') {
      // Keep custom range if available, otherwise notify parent with null
      const range = getCustomRange();
      onChange(range);
    } else {
      // Calculate and notify parent with preset range
      const preset = presets.find((p) => p.value === presetValue);
      if (preset) {
        const range = preset.getRange();
        onChange(range);
      }
    }
  };

  const handleCustomFromChange = (value: string) => {
    setCustomFrom(value);
    if (selectedPreset === 'custom' && value && customTo) {
      onChange({ from: dayjs(value), to: dayjs(customTo) });
    }
  };

  const handleCustomToChange = (value: string) => {
    setCustomTo(value);
    if (selectedPreset === 'custom' && customFrom && value) {
      onChange({ from: dayjs(customFrom), to: dayjs(value) });
    }
  };

  // useEffect hooks
  useEffect(() => {
    const defaultPreset = presets.find((p) => p.value === selectedPreset);
    if (defaultPreset) {
      const range = defaultPreset.getRange();
      onChange(range);
    }
  }, []);

  useEffect(() => {
    if (onGetCurrentRange) {
      onGetCurrentRange(getCurrentRange);
    }
  }, [selectedPreset, customFrom, customTo, onGetCurrentRange]);

  useEffect(() => {
    if (onGetRangeHelpers) {
      onGetRangeHelpers({
        isUntilNow,
        refreshRange,
      });
    }
  }, [selectedPreset, customFrom, customTo, onGetRangeHelpers]);

  return (
    <div>
      <Select value={selectedPreset} onValueChange={handlePresetChange}>
        <SelectTrigger className="h-8 w-36 gap-0 px-2">
          <Clock className="size-3.5 shrink-0 opacity-50" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="custom">Custom Range</SelectItem>

          {presets.map((preset) => (
            <SelectItem key={preset.value} value={preset.value}>
              {preset.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedPreset === 'custom' && (
        <div className="mt-2 flex items-center gap-2">
          <Input
            type="datetime-local"
            value={customFrom}
            onChange={(e) => handleCustomFromChange(e.target.value)}
            placeholder="Start time"
            className="h-8 w-40"
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="datetime-local"
            value={customTo}
            onChange={(e) => handleCustomToChange(e.target.value)}
            placeholder="End time"
            className="h-8 w-40"
          />
        </div>
      )}
    </div>
  );
};
