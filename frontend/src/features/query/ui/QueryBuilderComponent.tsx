import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import React, { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type {
  ConditionNode,
  LogicalOperator,
  QueryNode,
  QueryableField,
} from '../../../entity/query';
import { ConditionEditorComponent } from './ConditionEditorComponent';

interface Props {
  fields: QueryableField[];
  query: QueryNode | null;
  onChange: (query: QueryNode | null) => void;
  onFieldSearch?: (searchTerm?: string) => Promise<QueryableField[]>;
}

export const QueryBuilderComponent = ({
  fields,
  query,
  onChange,
  onFieldSearch,
}: Props): React.JSX.Element => {
  const [isGroupMenuOpen, setIsGroupMenuOpen] = useState(false);
  const createEmptyCondition = (): QueryNode => ({
    type: 'condition',
    condition: {
      field: '',
      operator: 'equals',
      value: '',
    },
  });

  const createLogicalGroup = (operator: LogicalOperator): QueryNode => ({
    type: 'logical',
    logic: {
      operator,
      children: [createEmptyCondition()],
    },
  });

  const handleAddCondition = () => {
    const newCondition = createEmptyCondition();

    if (!query) {
      onChange(newCondition);
      return;
    }

    // If current query is a single condition, wrap both in an AND group
    if (query.type === 'condition') {
      onChange({
        type: 'logical',
        logic: {
          operator: 'and',
          children: [query, newCondition],
        },
      });
      return;
    }

    // If current query is already logical, add to its children
    if (query.type === 'logical' && query.logic) {
      const updatedQuery = {
        ...query,
        logic: {
          ...query.logic,
          children: [...query.logic.children, newCondition],
        },
      };
      onChange(updatedQuery);
    }
  };

  const handleAddLogicalGroup = (operator: LogicalOperator) => {
    const newGroup = createLogicalGroup(operator);

    if (!query) {
      onChange(newGroup);
      return;
    }

    // Wrap current query and new group in an AND
    onChange({
      type: 'logical',
      logic: {
        operator: 'and',
        children: [query, newGroup],
      },
    });
  };

  const updateNode = (path: number[], updatedNode: QueryNode) => {
    if (!query) return;

    const updateNodeRecursive = (node: QueryNode, currentPath: number[]): QueryNode => {
      if (currentPath.length === 0) {
        return updatedNode;
      }

      if (node.type === 'logical' && node.logic) {
        const [index, ...restPath] = currentPath;
        const updatedChildren = [...node.logic.children];
        updatedChildren[index] = updateNodeRecursive(updatedChildren[index], restPath);

        return {
          ...node,
          logic: {
            ...node.logic,
            children: updatedChildren,
          },
        };
      }

      return node;
    };

    onChange(updateNodeRecursive(query, path));
  };

  const removeNode = (path: number[]) => {
    if (!query || path.length === 0) {
      onChange(null);
      return;
    }

    const removeNodeRecursive = (node: QueryNode, currentPath: number[]): QueryNode | null => {
      if (currentPath.length === 1) {
        if (node.type === 'logical' && node.logic) {
          const index = currentPath[0];
          const updatedChildren = node.logic.children.filter((_, i) => i !== index);

          // If only one child remains, return it directly
          if (updatedChildren.length === 1) {
            return updatedChildren[0];
          }

          // If no children remain, return null
          if (updatedChildren.length === 0) {
            return null;
          }

          return {
            ...node,
            logic: {
              ...node.logic,
              children: updatedChildren,
            },
          };
        }
        return null;
      }

      if (node.type === 'logical' && node.logic) {
        const [index, ...restPath] = currentPath;
        const updatedChildren = [...node.logic.children];
        const updatedChild = removeNodeRecursive(updatedChildren[index], restPath);

        if (updatedChild === null) {
          // Remove the child
          updatedChildren.splice(index, 1);

          // If only one child remains, return it directly
          if (updatedChildren.length === 1) {
            return updatedChildren[0];
          }

          // If no children remain, return null
          if (updatedChildren.length === 0) {
            return null;
          }
        } else {
          updatedChildren[index] = updatedChild;
        }

        return {
          ...node,
          logic: {
            ...node.logic,
            children: updatedChildren,
          },
        };
      }

      return node;
    };

    const result = removeNodeRecursive(query, path);
    onChange(result);
  };

  const renderQueryNode = (node: QueryNode, path: number[] = [], depth = 0): React.ReactElement => {
    const indentClass = depth > 0 ? `ml-${Math.min(depth * 4, 16)}` : '';

    if (node.type === 'condition') {
      return (
        <div
          key={`condition-${path.join('-')}`}
          className={`relative max-w-[800px] ${indentClass}`}
        >
          <div className="border-border bg-muted flex items-start space-x-2 rounded-lg border p-2">
            <div className="flex-1">
              <ConditionEditorComponent
                fields={fields}
                condition={node.condition}
                onChange={(updatedCondition: ConditionNode) =>
                  updateNode(path, { type: 'condition', condition: updatedCondition })
                }
                onFieldSearch={onFieldSearch}
              />
            </div>

            {path.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive size-8 flex-shrink-0"
                onClick={() => removeNode(path)}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        </div>
      );
    }

    if (node.type === 'logical' && node.logic) {
      return (
        <div
          key={`logical-${path.join('-')}`}
          className={`relative w-full max-w-[820px] ${indentClass} pr-4`}
        >
          <div className="bg-muted/50 rounded-lg">
            <div className="border-border border-b px-4 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Select
                    value={node.logic.operator}
                    onValueChange={(operator: LogicalOperator) => {
                      const updatedNode = {
                        ...node,
                        logic: { ...node.logic!, operator },
                      };
                      updateNode(path, updatedNode);
                    }}
                  >
                    <SelectTrigger className="h-7 w-20 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="and">AND</SelectItem>
                      <SelectItem value="or">OR</SelectItem>
                      <SelectItem value="not">NOT</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground text-xs">
                    ({node.logic.children.length} condition
                    {node.logic.children.length !== 1 ? 's' : ''})
                  </span>
                </div>

                {path.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive size-8"
                    onClick={() => removeNode(path)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </div>
            <div className="p-3">
              <div className="space-y-2">
                {node.logic.children.map((child, index) =>
                  renderQueryNode(child, [...path, index], depth + 1),
                )}

                {/* Add condition button - only show for non-NOT operators or if NOT has no children */}
                {(node.logic.operator !== 'not' || node.logic.children.length === 0) && (
                  <div className="flex justify-start pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newCondition = createEmptyCondition();
                        const updatedNode = {
                          ...node,
                          logic: {
                            ...node.logic!,
                            children: [...node.logic!.children, newCondition],
                          },
                        };
                        updateNode(path, updatedNode);
                      }}
                      disabled={node.logic.operator === 'not' && node.logic.children.length >= 1}
                    >
                      <Plus className="mr-1 size-3" />
                      Add Condition
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return <div key={`unknown-${path.join('-')}`}>Unknown node type</div>;
  };

  return (
    <div className="space-y-2">
      {query ? (
        renderQueryNode(query)
      ) : (
        <div className="border-input rounded-lg border-2 border-dashed py-8 text-center">
          <p className="text-muted-foreground mb-4">No query built yet</p>
          <p className="text-muted-foreground mb-6 text-sm">
            Start by adding a condition or logical group, or execute without a query to see all logs
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-center">
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleAddCondition}>
            <Plus className="mr-1 size-4" />
            Add Condition
          </Button>

          <DropdownMenu open={isGroupMenuOpen} onOpenChange={setIsGroupMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Plus className="mr-1 size-4" />
                Add Group
                <ChevronDown className="ml-1 size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={() => {
                  handleAddLogicalGroup('and');
                  setIsGroupMenuOpen(false);
                }}
              >
                AND Group
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  handleAddLogicalGroup('or');
                  setIsGroupMenuOpen(false);
                }}
              >
                OR Group
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  handleAddLogicalGroup('not');
                  setIsGroupMenuOpen(false);
                }}
              >
                NOT Group
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {query && (
            <Button variant="destructive" onClick={() => onChange(null)}>
              Clear All
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
