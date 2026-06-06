import dayjs from 'dayjs';
import { Copy } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { type LogItem } from '../../../entity/query';
import { getUserTimeFormatWithMs } from '../../../shared/time';

const STORAGE_KEY = 'tracebull-message-length';
const GROUP_SIMILAR_KEY = 'tracebull-group-similar';

/**
 * Normalize a log message into a pattern key by replacing variable parts.
 * Numbers, UUIDs, IPs, emails, and file paths are replaced with placeholders.
 */
const normalizeToPattern = (message: string): string => {
  return (
    message
      // UUIDs: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '{uuid}')
      // IP addresses
      .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '{ip}')
      // Email-like patterns
      .replace(/[\w.-]+@[\w.-]+\.\w+/g, '{email}')
      // File paths (Unix)
      .replace(/(?:\/[\w.-]+){2,}/g, '{path}')
      // Hex sequences (8+ chars)
      .replace(/\b[0-9a-f]{8,}\b/gi, '{hex}')
      // Numbers (including decimals)
      .replace(/\b\d+(?:\.\d+)?\b/g, '#')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  );
};

interface PatternGroup {
  patternKey: string;
  level: string;
  representative: LogItem;
  allLogs: LogItem[];
}

const getStoredGroupSimilar = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(GROUP_SIMILAR_KEY) === 'true';
  } catch {
    return false;
  }
};
const SERVICE_FIELD_NAMES = [
  'service',
  'service_name',
  'serviceName',
  'application',
  'application_name',
  'app',
  'app_name',
  'spring.application.name',
  'component',
];

/**
 * Get default message length based on screen width
 */
const getDefaultMessageLength = (): number => {
  if (typeof window === 'undefined') {
    return 135; // Default for SSR
  }

  const screenWidth = window.innerWidth;

  if (screenWidth <= 1440) {
    return 135;
  } else if (screenWidth <= 1920) {
    return 100;
  } else {
    // 2K and above
    return 145;
  }
};

/**
 * Get stored message length from localStorage, fallback to screen-based default
 */
const getStoredMessageLength = (): number => {
  if (typeof window === 'undefined') {
    return getDefaultMessageLength();
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed >= 10 && parsed <= 1000) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn('Failed to read message length from localStorage:', error);
  }

  return getDefaultMessageLength();
};

interface Props {
  queryResults: LogItem[];
  totalResults: number;
  hasExecuted: boolean;
  isExecuting: boolean;
  hasMoreResults: boolean;
  onLoadMore: () => void;
  onAddFieldToQuery?: (fieldName: string, fieldValue: string) => void;
  isRealtimeStreaming?: boolean;
}

/**
 * QueryResultsComponent - Displays log query results with infinite scroll
 *
 * Features:
 * - Results displayed in flex-based layout with fixed column widths
 * - Color-coded log levels with badges
 * - Infinite scroll loading when user scrolls to bottom
 * - Loading states during query execution
 * - Empty state when no results found
 * - Click to expand/collapse field details
 */
export const QueryResultsComponent = ({
  queryResults,
  totalResults,
  hasExecuted,
  isExecuting,
  hasMoreResults,
  onLoadMore,
  onAddFieldToQuery,
  isRealtimeStreaming = false,
}: Props): React.JSX.Element | null => {
  // States
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [messageLength, setMessageLength] = useState<number>(getStoredMessageLength());
  const [showFields, setShowFields] = useState<boolean>(true);
  const [groupSimilar, setGroupSimilar] = useState<boolean>(getStoredGroupSimilar());

  // Get user's time format preference with milliseconds
  const timeFormat = useMemo(() => getUserTimeFormatWithMs(), []);

  const toggleGroupSimilar = (enabled: boolean) => {
    setGroupSimilar(enabled);
    if (!enabled) {
      setExpandedGroups(new Set());
    }
    try {
      localStorage.setItem(GROUP_SIMILAR_KEY, String(enabled));
    } catch {}
  };

  const patternGroups = useMemo(() => {
    if (!groupSimilar || queryResults.length === 0) return null;

    const groupMap = new Map<string, PatternGroup>();
    const groupOrder: string[] = [];

    for (const log of queryResults) {
      const patternKey = `${log.level}::${normalizeToPattern(log.message)}`;
      const existing = groupMap.get(patternKey);
      if (existing) {
        existing.allLogs.push(log);
      } else {
        groupMap.set(patternKey, {
          patternKey,
          level: log.level,
          representative: log,
          allLogs: [log],
        });
        groupOrder.push(patternKey);
      }
    }

    return groupOrder.map((key) => groupMap.get(key)!);
  }, [queryResults, groupSimilar]);

  const displayEntries = useMemo(() => {
    if (!patternGroups) {
      return queryResults.map((log) => ({ type: 'single' as const, log }));
    }

    const entries: Array<
      { type: 'single'; log: LogItem } | { type: 'group'; group: PatternGroup }
    > = [];

    for (const group of patternGroups) {
      if (group.allLogs.length === 1) {
        entries.push({ type: 'single', log: group.representative });
      } else {
        entries.push({ type: 'group', group });
      }
    }

    return entries;
  }, [patternGroups, queryResults]);

  // Refs
  const isLoadingMore = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Functions
  const handleScroll = useCallback(() => {
    if (isLoadingMore.current || !hasMoreResults || isExecuting) {
      return;
    }

    if (isRealtimeStreaming) {
      return;
    }

    // Find the scrollable parent container
    const scrollContainer = containerRef.current?.closest('.overflow-y-auto') as HTMLElement;
    if (!scrollContainer) {
      return;
    }

    const scrollTop = scrollContainer.scrollTop;
    const scrollHeight = scrollContainer.scrollHeight;
    const clientHeight = scrollContainer.clientHeight;
    const scrollThreshold = 100; // Load more when 100px from bottom

    if (scrollHeight - scrollTop - clientHeight < scrollThreshold) {
      isLoadingMore.current = true;
      onLoadMore();
    }
  }, [hasMoreResults, isExecuting, isRealtimeStreaming, onLoadMore]);

  const renderLogLevel = (level: string) => {
    const colors = {
      ERROR:
        'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800',
      WARN: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
      INFO: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
      DEBUG:
        'bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800/30 dark:text-gray-400 dark:border-gray-700',
      TRACE:
        'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
      FATAL:
        'bg-red-600 text-white border-red-700 dark:bg-red-700 dark:text-white dark:border-red-800',
      CRITICAL:
        'bg-red-500 text-white border-red-600 dark:bg-red-800 dark:text-white dark:border-red-900',
    };

    const colorClass = colors[level as keyof typeof colors] || colors.INFO;

    return (
      <span className={`inline-block rounded border px-1 py-0.5 text-xs font-medium ${colorClass}`}>
        {level}
      </span>
    );
  };

  const getLogFieldValue = (log: LogItem, fieldName: string): string | undefined => {
    const value = log.fields?.[fieldName];
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    return String(value);
  };

  const getServiceName = (log: LogItem): string | undefined => {
    for (const fieldName of SERVICE_FIELD_NAMES) {
      const value = getLogFieldValue(log, fieldName);
      if (value) {
        return value;
      }
    }

    return undefined;
  };

  const truncateText = (
    text: string,
    maxLength: number,
  ): { text: string; isTruncated: boolean } => {
    if (text.length <= maxLength) {
      return { text, isTruncated: false };
    }
    return { text: text.substring(0, maxLength) + '...', isTruncated: true };
  };

  const formatFieldValue = (value: string): { formatted: string; isJson: boolean } => {
    try {
      // Try to parse as JSON
      const parsed = JSON.parse(value);
      // If successful, format with proper indentation
      return {
        formatted: JSON.stringify(parsed, null, 2),
        isJson: true,
      };
    } catch {
      // Not JSON, return as is
      return {
        formatted: value,
        isJson: false,
      };
    }
  };

  const toggleRowExpansion = (logId: string) => {
    // Check if user has selected text - if so, don't toggle the row
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      return;
    }

    const newExpandedRows = new Set(expandedRows);
    if (expandedRows.has(logId)) {
      newExpandedRows.delete(logId);
    } else {
      newExpandedRows.add(logId);
    }
    setExpandedRows(newExpandedRows);
  };

  const renderCustomFields = (log: LogItem, isExpanded: boolean, maxLength: number) => {
    const fieldKeys = Object.keys(log.fields || {});

    if (fieldKeys.length === 0) {
      return <span className="text-muted-foreground text-xs">-</span>;
    }

    // Create a string representation of all fields
    const fieldsString = fieldKeys.map((key) => `${key}: ${log.fields?.[key]}`).join(', ');

    const { text: displayText, isTruncated } = isExpanded
      ? { text: fieldsString, isTruncated: false }
      : truncateText(fieldsString, maxLength);

    if (fieldsString.length === 0) {
      return <span className="text-muted-foreground text-xs">-</span>;
    }

    return (
      <div className="space-y-1">
        {isExpanded ? (
          fieldKeys.map((key) => {
            const { formatted, isJson } = formatFieldValue(log.fields?.[key] || '');

            return (
              <div
                className="flex !font-mono text-xs break-all"
                key={key}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
              >
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <div className="hover:bg-accent cursor-pointer rounded px-1">
                      <span className="text-muted-foreground !font-mono font-medium">{key}:</span>{' '}
                      <span
                        className={`text-muted-foreground !font-mono ${
                          isJson || formatted.includes(' ') ? 'whitespace-pre-wrap' : ''
                        }`}
                      >
                        {formatted}
                      </span>
                    </div>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Add Field to Query</AlertDialogTitle>
                      <AlertDialogDescription>
                        Add &quot;{key}&quot; with value &quot;{log.fields?.[key]}&quot; to the
                        query?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>No</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() => {
                          if (onAddFieldToQuery) {
                            onAddFieldToQuery(key, log.fields?.[key] || '');
                          }
                        }}
                      >
                        Yes
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            );
          })
        ) : (
          <div className="text-xs">
            <span className="text-muted-foreground !font-mono break-all">{displayText}</span>
            {isTruncated && (
              <span className="text-primary hover:text-primary/80 ml-1 cursor-pointer">
                (expand)
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  // useEffect hooks
  useEffect(() => {
    if (!isExecuting) {
      isLoadingMore.current = false;
    }
  }, [isExecuting]);

  useEffect(() => {
    const scrollContainer = containerRef.current?.closest('.overflow-y-auto') as HTMLElement;
    if (!scrollContainer) {
      return;
    }

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Save message length to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, messageLength.toString());
      } catch (error) {
        console.warn('Failed to save message length to localStorage:', error);
      }
    }
  }, [messageLength]);

  if (!hasExecuted) {
    return null;
  }

  return (
    <div ref={containerRef} className="bg-muted/50 w-full rounded-lg">
      <div className="border-border border-b px-4 py-2">
        <div className="flex items-center justify-end">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="messageLength" className="text-muted-foreground text-xs font-normal">
                Message length:
              </label>
              <Input
                id="messageLength"
                type="number"
                value={messageLength}
                onChange={(e) => setMessageLength(Math.max(1, parseInt(e.target.value)))}
                className="h-6 w-16 px-1 py-0.5 text-xs"
                min="1"
                max="1000"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="showFields"
                checked={showFields}
                onCheckedChange={(checked) => setShowFields(checked === true)}
                className="text-xs"
              />
              <label htmlFor="showFields" className="text-muted-foreground text-xs font-normal">
                Show fields
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="groupSimilar"
                checked={groupSimilar}
                onCheckedChange={(checked) => toggleGroupSimilar(checked === true)}
                className="text-xs"
              />
              <label htmlFor="groupSimilar" className="text-muted-foreground text-xs font-normal">
                Group similar
              </label>
            </div>
            <span className="text-muted-foreground text-xs font-normal">
              {isRealtimeStreaming ? (
                `Live - ${queryResults.length.toLocaleString()} results loaded`
              ) : isExecuting && queryResults.length === 0 ? (
                <Spinner size="sm" />
              ) : (
                <>
                  {queryResults.length.toLocaleString()}$
                  {totalResults > queryResults.length
                    ? `+ of ${totalResults.toLocaleString()}`
                    : ''}{' '}
                  results${queryResults.length > 0 ? ' loaded' : ' found'}
                  {groupSimilar && patternGroups && patternGroups.length < queryResults.length && (
                    <span className="text-muted-foreground/60 ml-1">
                      ({patternGroups.length} patterns)
                    </span>
                  )}
                </>
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="p-3">
        {isExecuting && queryResults.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner />
            <span className="ml-2 text-sm">Executing query...</span>
          </div>
        ) : queryResults.length === 0 ? (
          <div className="text-muted-foreground flex h-24 flex-col items-center justify-center gap-1 text-sm">
            <span>No logs found matching your query.</span>
            <span className="text-xs">Try adjusting your filters or time range.</span>
          </div>
        ) : (
          <div className="space-y-1">
            {/* Header Row */}
            <div className="border-border text-foreground flex gap-2 border-b pb-1 text-xs font-medium">
              <div className="w-[150px] shrink-0">Timestamp</div>
              <div className="w-[140px] shrink-0">Service</div>
              <div className="w-[85px] shrink-0">Level</div>
              <div className={showFields ? 'min-w-0 flex-1' : 'min-w-0 flex-[2]'}>Message</div>
              {showFields && (
                <>
                  <div className="w-[10px] shrink-0" />
                  <div className="min-w-0 flex-1">Fields</div>
                </>
              )}
            </div>

            {/* Results Rows */}
            {displayEntries.map((entry) => {
              if (entry.type === 'single') {
                const log = entry.log;
                return (
                  <LogRow
                    key={log.id}
                    log={log}
                    isExpanded={expandedRows.has(log.id)}
                    showFields={showFields}
                    messageLength={messageLength}
                    timeFormat={timeFormat}
                    onToggleExpand={() => toggleRowExpansion(log.id)}
                    renderLogLevel={renderLogLevel}
                    getServiceName={getServiceName}
                    renderCustomFields={renderCustomFields}
                    truncateText={truncateText}
                  />
                );
              }

              const { group } = entry;
              const isGroupExpanded = expandedGroups.has(group.patternKey);
              const count = group.allLogs.length;

              return (
                <div key={`group-${group.patternKey}`} className="space-y-0">
                  <div
                    className="border-border hover:bg-accent group flex cursor-pointer items-start gap-2 border-b py-1 !font-mono text-xs"
                    onClick={() => {
                      setExpandedGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has(group.patternKey)) {
                          next.delete(group.patternKey);
                        } else {
                          next.add(group.patternKey);
                        }
                        return next;
                      });
                    }}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className="text-muted-foreground w-[140px] shrink-0 text-xs"
                          style={{ lineHeight: 1.1 }}
                        >
                          <div className="!font-mono text-[12px]">
                            {dayjs(group.representative.timestamp).format(timeFormat.format)}
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" sideOffset={4}>
                        {dayjs(group.representative.timestamp).fromNow()}
                      </TooltipContent>
                    </Tooltip>

                    <div className="w-[140px] shrink-0 !font-mono text-xs break-all">
                      {getServiceName(group.representative) ? (
                        <span className="text-foreground">
                          {getServiceName(group.representative)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </div>

                    <div className="w-[85px] shrink-0 !font-mono">
                      {renderLogLevel(group.representative.level)}
                    </div>

                    <div
                      className={`${showFields ? 'min-w-0 flex-1' : 'min-w-0 flex-[2]'} text-foreground !font-mono text-xs break-all`}
                    >
                      <span>{truncateText(group.representative.message, messageLength).text}</span>
                      <span className="bg-primary/10 text-primary ml-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold">
                        x{count} similar
                      </span>
                    </div>

                    {showFields && (
                      <>
                        <div className="w-[10px] shrink-0" />
                        <div className="min-w-0 flex-1">
                          {renderCustomFields(group.representative, false, messageLength)}
                        </div>
                      </>
                    )}

                    <button
                      className="text-muted-foreground hover:text-foreground mt-0.5 w-[28px] shrink-0 cursor-pointer opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        const allText = group.allLogs
                          .map((log) => {
                            const fieldsStr =
                              log.fields && Object.keys(log.fields).length > 0
                                ? '\n' + JSON.stringify(log.fields, null, 2)
                                : '';
                            return `[${dayjs(log.timestamp).format(timeFormat.format)}] [${log.level}] ${log.message}${fieldsStr}`;
                          })
                          .join('\n');
                        navigator.clipboard.writeText(allText);
                      }}
                      title="Copy all similar logs"
                    >
                      <Copy className="size-3" />
                    </button>
                  </div>

                  {isGroupExpanded && (
                    <div className="bg-accent/30">
                      {group.allLogs.map((log) => (
                        <LogRow
                          key={log.id}
                          log={log}
                          isExpanded={expandedRows.has(log.id)}
                          showFields={showFields}
                          messageLength={messageLength}
                          timeFormat={timeFormat}
                          onToggleExpand={() => toggleRowExpansion(log.id)}
                          renderLogLevel={renderLogLevel}
                          getServiceName={getServiceName}
                          renderCustomFields={renderCustomFields}
                          truncateText={truncateText}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Loading indicator for infinite scroll */}
            {isExecuting && queryResults.length > 0 && (
              <div className="flex justify-center py-2">
                <Spinner size="sm" />
                <span className="text-muted-foreground ml-2 text-xs">Loading more results...</span>
              </div>
            )}

            {/* End of results indicator */}
            {!isRealtimeStreaming && !hasMoreResults && queryResults.length > 0 && (
              <div className="text-muted-foreground py-2 text-center text-xs">
                All {totalResults.toLocaleString()} results loaded
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

interface LogRowProps {
  log: LogItem;
  isExpanded: boolean;
  showFields: boolean;
  messageLength: number;
  timeFormat: { format: string };
  onToggleExpand: () => void;
  renderLogLevel: (level: string) => React.JSX.Element;
  getServiceName: (log: LogItem) => string | undefined;
  renderCustomFields: (log: LogItem, isExpanded: boolean, maxLength: number) => React.JSX.Element;
  truncateText: (text: string, maxLength: number) => { text: string; isTruncated: boolean };
}

const LogRow = React.memo(function LogRow({
  log,
  isExpanded,
  showFields,
  messageLength,
  timeFormat,
  onToggleExpand,
  renderLogLevel,
  getServiceName,
  renderCustomFields,
  truncateText,
}: LogRowProps) {
  const serviceName = getServiceName(log);
  const { text: displayMessage, isTruncated: messageIsTruncated } = isExpanded
    ? { text: log.message, isTruncated: false }
    : truncateText(log.message, messageLength);

  return (
    <div
      className="border-border hover:bg-accent group flex cursor-pointer items-start gap-2 border-b py-1 !font-mono text-xs"
      onClick={onToggleExpand}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="text-muted-foreground w-[140px] shrink-0 text-xs"
            style={{ lineHeight: 1.1 }}
          >
            <div className="!font-mono text-[12px]">
              {dayjs(log.timestamp).format(timeFormat.format)}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          {dayjs(log.timestamp).fromNow()}
        </TooltipContent>
      </Tooltip>

      <div className="w-[140px] shrink-0 !font-mono text-xs break-all">
        {serviceName ? (
          <span className="text-foreground">{serviceName}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </div>

      <div className="w-[85px] shrink-0 !font-mono">{renderLogLevel(log.level)}</div>

      <div
        className={`${showFields ? 'min-w-0 flex-1' : 'min-w-0 flex-[2]'} text-foreground !font-mono text-xs break-all ${
          isExpanded && displayMessage.includes(' ') ? 'whitespace-pre-wrap' : ''
        }`}
      >
        {displayMessage}
        {messageIsTruncated && !isExpanded && (
          <span className="text-primary hover:text-primary/80 ml-1">(expand)</span>
        )}
      </div>

      {showFields && (
        <>
          <div className="w-[10px] shrink-0" />
          <div className="min-w-0 flex-1">{renderCustomFields(log, isExpanded, messageLength)}</div>
        </>
      )}

      <button
        className="text-muted-foreground hover:text-foreground mt-0.5 w-[28px] shrink-0 cursor-pointer opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          const fieldsStr =
            log.fields && Object.keys(log.fields).length > 0
              ? '\n' + JSON.stringify(log.fields, null, 2)
              : '';
          navigator.clipboard.writeText(
            `[${dayjs(log.timestamp).format(timeFormat.format)}] [${log.level}] ${log.message}${fieldsStr}`,
          );
        }}
        title="Copy log"
      >
        <Copy className="size-3" />
      </button>
    </div>
  );
});
