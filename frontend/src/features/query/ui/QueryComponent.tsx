import { ArrowDown, ArrowUp, Play, Radio, Search, Settings2, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import type { Project } from '../../../entity/projects';
import { projectApi } from '../../../entity/projects';
import {
  type GetQueryableFieldsRequest,
  type LogItem,
  type LogQueryRequest,
  type QueryNode,
  type QueryableField,
  queryApi,
} from '../../../entity/query';
import type { UserProfile } from '../../../entity/users/model/UserProfile';
import { toastMessage } from '../../../shared/lib/toastMessage';
import { FloatingTopButtonComponent } from './FloatingTopButtonComponent';
import { HowToSendLogsFromCodeComponent } from './HowToSendLogsFromCodeComponent';
import { OnboardingTooltipComponent } from './OnboardingTooltipComponent';
import { QueryBuilderComponent } from './QueryBuilderComponent';
import { QueryResultsComponent } from './QueryResultsComponent';
import { type TimeRange, TimeRangePickerComponent } from './TimeRangePickerComponent';

interface Props {
  projectId: string;
  user?: UserProfile;
  onShowLogsDialogReady?: (fn: () => void) => void;
}

/**
 * QueryComponent - A comprehensive log query builder and results viewer
 *
 * Features:
 * - Visual query builder supporting complex nested conditions
 * - Support for all query operators (equals, contains, in, exists, etc.)
 * - Logical operators (AND, OR, NOT) with unlimited nesting
 * - Dynamic field discovery from backend
 * - Time range filtering with date/time picker
 * - Sort order control (ascending/descending by timestamp)
 * - Results table with pagination
 * - Proper TypeScript typing throughout
 * - Responsive design with shadcn/ui components
 *
 * Query Structure:
 * - Simple conditions: field + operator + value
 * - Logical groups: operator + array of child conditions/groups
 * - Unlimited nesting depth (limited by backend validation)
 *
 * Supported Field Types:
 * - Standard fields: message, level, client_ip, timestamp
 * - Custom fields: any user-defined fields with flexible naming
 *
 * Backend Integration:
 * - Fetches available fields via /api/v1/logs/query/fields/{projectId}
 * - Executes queries via /api/v1/logs/query/execute/{projectId}
 * - Handles query validation and error responses
 */

interface SavedQuery {
  query: QueryNode | null;
  sortOrder: 'asc' | 'desc';
}

const MAX_LIVE_RESULTS = 5_000;

export const QueryComponentComponent = ({
  projectId,
  user,
  onShowLogsDialogReady,
}: Props): React.JSX.Element => {
  // States
  const [isShowHowToSendLogsFromCode, setIsShowHowToSendLogsFromCode] = useState(false);
  const [queryableFields, setQueryableFields] = useState<QueryableField[]>([]);
  const [currentQuery, setCurrentQuery] = useState<QueryNode | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isExecuting, setIsExecuting] = useState(false);
  const [queryResults, setQueryResults] = useState<LogItem[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [hasExecuted, setHasExecuted] = useState(false);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [frozenTimeRange, setFrozenTimeRange] = useState<TimeRange | null>(null);
  const [pageSize] = useState(200);
  const [hasSearched, setHasSearched] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [project, setProject] = useState<Project | undefined>();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isRealtimeStreaming, setIsRealtimeStreaming] = useState(false);
  const [messageSearch, setMessageSearch] = useState('');
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);

  // Refs
  const timeRangeRef = useRef<() => TimeRange | null>(null);
  const timeRangeHelpersRef = useRef<{
    isUntilNow: () => boolean;
    refreshRange: () => void;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryBuilderRef = useRef<HTMLDivElement>(null);
  const howToSendLogsButtonRef = useRef<HTMLDivElement>(null);
  const realtimeAbortControllerRef = useRef<AbortController | null>(null);

  // Onboarding functions
  const isUserNewlyRegistered = (user: UserProfile): boolean => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return new Date(user.createdAt) > fiveMinutesAgo;
  };

  const shouldShowOnboarding = (): boolean => {
    if (!user) return false;
    if (!isUserNewlyRegistered(user)) return false;
    const onboardingShown = localStorage.getItem('tracebull-onboarding-shown');
    return !onboardingShown;
  };

  const handleDismissOnboarding = () => {
    localStorage.setItem('tracebull-onboarding-shown', 'true');
    setShowOnboarding(false);
  };

  const handleHowToSendLogsClick = () => {
    if (showOnboarding) handleDismissOnboarding();
    setIsShowHowToSendLogsFromCode(true);
  };

  useEffect(() => {
    if (onShowLogsDialogReady) {
      onShowLogsDialogReady(handleHowToSendLogsClick);
    }
  }, [onShowLogsDialogReady, showOnboarding]);

  const getSavedQueryKey = (projectId: string): string => {
    return `tracebull-query-${projectId}`;
  };

  const saveQueryToStorage = (query: QueryNode | null, sortOrder: 'asc' | 'desc') => {
    try {
      const savedQuery: SavedQuery = {
        query,
        sortOrder,
      };
      localStorage.setItem(getSavedQueryKey(projectId), JSON.stringify(savedQuery));
    } catch (error) {
      console.warn('Failed to save query to localStorage:', error);
    }
  };

  const loadQueryFromStorage = (): SavedQuery | null => {
    try {
      const saved = localStorage.getItem(getSavedQueryKey(projectId));
      if (saved) {
        return JSON.parse(saved) as SavedQuery;
      }
    } catch (error) {
      console.warn('Failed to load query from localStorage:', error);
    }
    return null;
  };

  const loadProject = async () => {
    try {
      const projectData = await projectApi.getProject(projectId);
      setProject(projectData);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load project';
      toastMessage.error(errorMessage);
    }
  };

  const loadQueryableFields = async () => {
    try {
      const response = await queryApi.getQueryableFields(projectId);
      setQueryableFields(response.fields);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load queryable fields';
      toastMessage.error(errorMessage);
    }
  };

  const searchQueryableFields = async (searchTerm?: string): Promise<QueryableField[]> => {
    try {
      const request: GetQueryableFieldsRequest | undefined = searchTerm
        ? { query: searchTerm }
        : undefined;
      const response = await queryApi.getQueryableFields(projectId, request);
      return response.fields;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to search queryable fields';
      toastMessage.error(errorMessage);
      return [];
    }
  };

  // Helper function to check if operator needs value input
  const operatorNeedsValue = (operator: string): boolean => {
    return operator !== 'exists' && operator !== 'not_exists';
  };

  // Helper function to check if operator expects array input
  const operatorExpectsArray = (operator: string): boolean => {
    return operator === 'in' || operator === 'not_in';
  };

  // Validate query for empty fields and missing required values
  const validateQuery = (query: QueryNode | null): { isValid: boolean; error?: string } => {
    if (!query) {
      return { isValid: true }; // Empty query is valid (shows all logs)
    }

    const checkEmptyFields = (node: QueryNode): boolean => {
      if (node.type === 'condition' && node.condition) {
        const field = node.condition.field;
        return !field || field.trim() === '';
      }

      if (node.type === 'logical' && node.logic) {
        return node.logic.children.some(checkEmptyFields);
      }

      return false;
    };

    const checkMissingValues = (node: QueryNode): boolean => {
      if (node.type === 'condition' && node.condition) {
        const { operator, value } = node.condition;

        // Check if this operator needs a value
        if (operatorNeedsValue(operator)) {
          // For array operators (in, not_in), check if array is empty or undefined
          if (operatorExpectsArray(operator)) {
            return !Array.isArray(value) || value.length === 0;
          }

          // For non-array operators, check if value is empty, null, or undefined
          return value === null || value === undefined || value === '';
        }

        return false;
      }

      if (node.type === 'logical' && node.logic) {
        return node.logic.children.some(checkMissingValues);
      }

      return false;
    };

    if (checkEmptyFields(query)) {
      return {
        isValid: false,
        error: 'Please fill in all field names before executing the query.',
      };
    }

    if (checkMissingValues(query)) {
      return {
        isValid: false,
        error:
          'Please provide values for all conditions that require them before executing the query.',
      };
    }

    return { isValid: true };
  };

  const buildEffectiveQuery = (): QueryNode | null => {
    const messageCondition: QueryNode | null = messageSearch.trim()
      ? {
          type: 'condition',
          condition: { field: 'message', operator: 'contains' as const, value: messageSearch },
        }
      : null;

    if (!messageCondition && !currentQuery) return null;
    if (!messageCondition) return currentQuery;
    if (!currentQuery) return messageCondition;

    return {
      type: 'logical',
      logic: { operator: 'and' as const, children: [messageCondition, currentQuery] },
    };
  };

  const countConditions = (node: QueryNode | null): number => {
    if (!node) return 0;
    if (node.type === 'condition') return 1;
    if (node.type === 'logical' && node.logic) {
      return node.logic.children.reduce((sum, child) => sum + countConditions(child), 0);
    }
    return 0;
  };

  const executeQuery = async (isLoadMore = false) => {
    stopRealtimeStreaming();

    // Validate query before execution (only for new queries, not load more)
    if (!isLoadMore) {
      const validation = validateQuery(buildEffectiveQuery());
      if (!validation.isValid) {
        toastMessage.error(validation.error!);
        return;
      }
    }

    setIsExecuting(true);
    try {
      const effectiveQuery = buildEffectiveQuery();
      const request: LogQueryRequest = {
        query: effectiveQuery,
        limit: pageSize,
        offset: isLoadMore ? queryResults.length : 0,
        sortOrder,
      };

      // For new queries, get fresh time range. For load more, use frozen time range
      let timeRangeToUse: TimeRange | null = null;
      if (isLoadMore && frozenTimeRange) {
        timeRangeToUse = frozenTimeRange;
      } else {
        const currentTimeRange = timeRangeRef.current?.();
        timeRangeToUse = currentTimeRange || null;
        // Freeze the time range for subsequent load more operations
        if (timeRangeToUse) {
          setFrozenTimeRange(timeRangeToUse);
        }
      }

      if (timeRangeToUse) {
        request.timeRange = {
          from: timeRangeToUse.from.toISOString(),
          to: timeRangeToUse.to.toISOString(),
        };
      }

      const response = await queryApi.executeQuery(projectId, request);

      if (isLoadMore) {
        // Append new results to existing ones
        setQueryResults((prev) => [...prev, ...response.logs]);
      } else {
        // Replace results for new query
        setQueryResults(response.logs);
        setTotalResults(response.total);
        setHasExecuted(true);
      }

      // Check if there are more results to load
      const currentResultsCount = isLoadMore
        ? queryResults.length + response.logs.length
        : response.logs.length;
      setHasMoreResults(currentResultsCount < response.total);

      if (!isLoadMore) {
        const queryType = effectiveQuery ? 'matching your query' : '(showing all logs)';
        const executedInMs = Math.round(parseFloat(response.executedIn));
        toastMessage.success(
          `Found ${response.total} logs ${queryType} (${executedInMs.toLocaleString()} ms)`,
        );
        setHasSearched(true);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Query execution failed';
      toastMessage.error(errorMessage);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleLoadMore = () => {
    executeQuery(true);
  };

  const stopRealtimeStreaming = () => {
    realtimeAbortControllerRef.current?.abort();
    realtimeAbortControllerRef.current = null;
    setIsRealtimeStreaming(false);
  };

  const getNewestResultTimestamp = (): Date => {
    if (queryResults.length === 0) {
      return new Date();
    }

    return queryResults.reduce((newest, log) => {
      const timestamp = new Date(log.timestamp);
      return timestamp > newest ? timestamp : newest;
    }, new Date(queryResults[0].timestamp));
  };

  const mergeRealtimeLogs = (logs: LogItem[]) => {
    if (logs.length === 0) {
      return;
    }

    setQueryResults((previousLogs) => {
      const logsByID = new Map<string, LogItem>();
      for (const log of previousLogs) {
        logsByID.set(log.id, log);
      }

      let addedLogsCount = 0;
      for (const log of logs) {
        if (!logsByID.has(log.id)) {
          addedLogsCount++;
        }
        logsByID.set(log.id, log);
      }

      const mergedLogs = Array.from(logsByID.values()).sort((a, b) => {
        const left = new Date(a.timestamp).getTime();
        const right = new Date(b.timestamp).getTime();
        return sortOrder === 'asc' ? left - right : right - left;
      });

      setTotalResults((previousTotal) => previousTotal + addedLogsCount);

      return mergedLogs.slice(0, MAX_LIVE_RESULTS);
    });

    setHasMoreResults(false);
  };

  const startRealtimeStreaming = async () => {
    const effectiveQuery = buildEffectiveQuery();
    const validation = validateQuery(effectiveQuery);
    if (!validation.isValid) {
      toastMessage.error(validation.error!);
      return;
    }

    const controller = new AbortController();
    realtimeAbortControllerRef.current = controller;
    setIsRealtimeStreaming(true);
    setHasExecuted(true);
    setHasSearched(true);
    setHasMoreResults(false);

    const startFrom = getNewestResultTimestamp();
    const request: LogQueryRequest = {
      query: effectiveQuery,
      limit: pageSize,
      offset: 0,
      sortOrder: 'asc',
      timeRange: {
        from: startFrom.toISOString(),
        to: new Date().toISOString(),
      },
    };

    try {
      await queryApi.streamQuery(projectId, request, {
        signal: controller.signal,
        onLogs: (response) => mergeRealtimeLogs(response.logs),
      });
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      const errorMessage = error instanceof Error ? error.message : 'Realtime stream failed';
      toastMessage.error(errorMessage);
      setIsRealtimeStreaming(false);
    } finally {
      if (realtimeAbortControllerRef.current === controller) {
        realtimeAbortControllerRef.current = null;
      }
    }
  };

  const handleRealtimeToggle = (checked: boolean) => {
    if (!checked) {
      stopRealtimeStreaming();
      return;
    }

    void startRealtimeStreaming();
  };

  const handleAddFieldToQuery = (fieldName: string, fieldValue: string) => {
    const newCondition: QueryNode = {
      type: 'condition',
      condition: {
        field: fieldName,
        operator: 'contains',
        value: fieldValue,
      },
    };

    if (!currentQuery) {
      setCurrentQuery(newCondition);
      setHasSearched(false);
    } else if (currentQuery.type === 'condition') {
      setCurrentQuery({
        type: 'logical',
        logic: {
          operator: 'and',
          children: [currentQuery, newCondition],
        },
      });
      setHasSearched(false);
    } else if (currentQuery.type === 'logical' && currentQuery.logic) {
      const updatedQuery = {
        ...currentQuery,
        logic: {
          ...currentQuery.logic,
          children: [...currentQuery.logic.children, newCondition],
        },
      };
      setCurrentQuery(updatedQuery);
      setHasSearched(false);
    }

    toastMessage.success(`Field "${fieldName}" added to query`);
    setIsBuilderOpen(true);

    setTimeout(() => {
      queryBuilderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleExecuteOrRefresh = async () => {
    if (hasSearched) {
      // If we've already searched, check if we can refresh the time range
      const helpers = timeRangeHelpersRef.current;
      if (helpers?.isUntilNow()) {
        // Refresh the time range to update "now" and then execute query
        helpers.refreshRange();
        // Reset hasSearched to false so the new query execution will be treated as fresh
        setHasSearched(false);
        // Execute after a small delay to ensure the range has been updated
        setTimeout(() => executeQuery(false), 50);
      } else {
        // For custom ranges, just re-execute with the same range
        executeQuery(false);
      }
    } else {
      // First time execution
      executeQuery(false);
    }
  };

  // useEffect hooks
  useEffect(() => {
    const initializeProject = async () => {
      stopRealtimeStreaming();
      await Promise.all([loadProject(), loadQueryableFields()]);

      // Load saved query for this project
      const savedQuery = loadQueryFromStorage();
      if (savedQuery) {
        setCurrentQuery(savedQuery.query);
        setSortOrder(savedQuery.sortOrder);
      } else {
        // Reset to defaults for new project
        setCurrentQuery(null);
        setSortOrder('desc');
      }

      // Reset other states when switching projects
      setQueryResults([]);
      setTotalResults(0);
      setHasExecuted(false);
      setHasMoreResults(false);
      setFrozenTimeRange(null);
      setHasSearched(false);

      // Mark initial load as complete
      setIsInitialLoad(false);
    };

    initializeProject();

    return () => stopRealtimeStreaming();
  }, [projectId]);

  // Auto-execute query when project is initialized
  useEffect(() => {
    if (!isInitialLoad && queryableFields.length > 0) {
      // Small delay to ensure time range picker is ready
      const timer = setTimeout(() => {
        // Only execute if we can get a current time range
        if (timeRangeRef.current && timeRangeRef.current()) {
          executeQuery(false);
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [isInitialLoad, queryableFields.length]);

  // Save query and sort order whenever they change (but not on initial load)
  useEffect(() => {
    if (!isInitialLoad) {
      saveQueryToStorage(currentQuery, sortOrder);
    }
  }, [currentQuery, sortOrder, projectId, isInitialLoad]);

  // Trigger onboarding tooltip after 3 seconds for new users
  useEffect(() => {
    if (!isInitialLoad && user) {
      const timer = setTimeout(() => {
        if (shouldShowOnboarding()) {
          setShowOnboarding(true);
        }
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [isInitialLoad, user]);

  return (
    <div ref={containerRef} className="h-full w-full space-y-2 overflow-y-auto">
      <FloatingTopButtonComponent containerRef={containerRef} />

      <Collapsible open={isBuilderOpen} onOpenChange={setIsBuilderOpen}>
        <div className="bg-muted/50 flex items-center gap-2 rounded-lg px-3 py-2">
          <div className="relative max-w-[320px] min-w-[180px] flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              value={messageSearch}
              onChange={(e) => {
                setMessageSearch(e.target.value);
                if (hasSearched) setHasSearched(false);
                stopRealtimeStreaming();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleExecuteOrRefresh();
                }
              }}
              placeholder="Search logs..."
              className="h-8 pr-8 pl-9"
            />
            {messageSearch && (
              <button
                onClick={() => {
                  setMessageSearch('');
                  setHasSearched(false);
                  stopRealtimeStreaming();
                }}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <TimeRangePickerComponent
            onChange={() => {
              setHasSearched(false);
              stopRealtimeStreaming();
            }}
            onGetCurrentRange={(getCurrentRange: () => TimeRange | null) => {
              timeRangeRef.current = getCurrentRange;
            }}
            onGetRangeHelpers={(helpers) => {
              timeRangeHelpersRef.current = helpers;
            }}
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                  setHasSearched(false);
                  stopRealtimeStreaming();
                }}
                className="h-8 w-8 p-0"
              >
                {sortOrder === 'desc' ? (
                  <ArrowDown className="size-3.5" />
                ) : (
                  <ArrowUp className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1">
                <Radio
                  className={`size-3.5 ${isRealtimeStreaming ? 'text-primary animate-pulse' : 'text-muted-foreground'}`}
                />
                <Switch
                  checked={isRealtimeStreaming}
                  onCheckedChange={handleRealtimeToggle}
                  disabled={isExecuting}
                  size="sm"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">Realtime</TooltipContent>
          </Tooltip>

          {isExecuting ? (
            <Spinner className="size-5" />
          ) : (
            <Button
              onClick={handleExecuteOrRefresh}
              size="sm"
              variant={hasSearched ? 'outline' : 'default'}
              className={`h-8 gap-1.5 ${
                hasSearched
                  ? 'border-primary text-primary hover:border-primary/80 hover:text-primary/80'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }`}
            >
              <Play className="size-3.5" />
              {hasSearched ? 'Refresh' : 'Run'}
            </Button>
          )}

          <div className="ml-auto">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={`h-8 gap-1.5 ${isBuilderOpen ? 'text-foreground bg-accent' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Settings2 className="size-3.5" />
                <span className="text-xs">Filters</span>
                {currentQuery && (
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                    {countConditions(currentQuery)}
                  </Badge>
                )}
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        {project?.plan?.warningText && (
          <div className="text-orange-600 opacity-60">{project.plan.warningText}</div>
        )}

        <CollapsibleContent>
          <div ref={queryBuilderRef} className="bg-muted/30 rounded-lg border p-4">
            <QueryBuilderComponent
              fields={queryableFields}
              query={currentQuery}
              onChange={(query) => {
                setCurrentQuery(query);
                setHasSearched(false);
                stopRealtimeStreaming();
              }}
              onFieldSearch={searchQueryableFields}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Results Section */}
      <QueryResultsComponent
        queryResults={queryResults}
        totalResults={totalResults}
        hasExecuted={hasExecuted}
        isExecuting={isExecuting}
        hasMoreResults={hasMoreResults}
        onLoadMore={handleLoadMore}
        onAddFieldToQuery={handleAddFieldToQuery}
        isRealtimeStreaming={isRealtimeStreaming}
      />

      {isShowHowToSendLogsFromCode && (
        <HowToSendLogsFromCodeComponent
          projectId={projectId}
          onClose={() => setIsShowHowToSendLogsFromCode(false)}
        />
      )}

      <OnboardingTooltipComponent targetRef={howToSendLogsButtonRef} show={showOnboarding} />
    </div>
  );
};
