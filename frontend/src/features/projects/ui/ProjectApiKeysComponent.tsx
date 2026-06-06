import { toastMessage } from '@/shared/lib/toastMessage';
import dayjs from 'dayjs';
import { Copy, Edit, Info, Loader2, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

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
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import {
  type ApiKey,
  type CreateApiKeyRequest,
  type UpdateApiKeyRequest,
  apiKeyApi,
} from '../../../entity/api-keys';
import { ApiKeyStatus } from '../../../entity/api-keys/model/ApiKeyStatus';
import type { ProjectResponse } from '../../../entity/projects';
import { projectApi } from '../../../entity/projects/api/projectApi';
import type { Project } from '../../../entity/projects/model/Project';
import type { UserProfile } from '../../../entity/users';
import { ProjectRole } from '../../../entity/users/model/ProjectRole';
import { UserRole } from '../../../entity/users/model/UserRole';
import { copyToClipboard } from '../../../shared/lib';

interface Props {
  projectResponse: ProjectResponse;
  user: UserProfile;
}

export function ProjectApiKeysComponent({ projectResponse, user }: Props) {
  const [project, setProject] = useState<Project | undefined>(undefined);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const [isLoadingApiKeys, setIsLoadingApiKeys] = useState(true);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '' });
  const [isCreating, setIsCreating] = useState(false);
  const [createNameError, setCreateNameError] = useState(false);

  const [editingKey, setEditingKey] = useState<{ id: string; name: string } | null>(null);
  const [editForm, setEditForm] = useState({ name: '' });
  const [isUpdating, setIsUpdating] = useState(false);
  const [editNameError, setEditNameError] = useState(false);

  const [processingKeys, setProcessingKeys] = useState<Set<string>>(new Set());
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(new Set());

  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [createdApiKey, setCreatedApiKey] = useState<ApiKey | null>(null);

  const canManageKeys =
    user.role === UserRole.ADMIN ||
    projectResponse.userRole === ProjectRole.OWNER ||
    projectResponse.userRole === ProjectRole.ADMIN;

  useEffect(() => {
    loadProjectSettings();
    loadApiKeys();
  }, [projectResponse.id]);

  const loadProjectSettings = async () => {
    setIsLoadingProject(true);
    try {
      const projectData = await projectApi.getProject(projectResponse.id);
      setProject(projectData);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load project settings';
      toastMessage.error(errorMessage);
    } finally {
      setIsLoadingProject(false);
    }
  };

  const loadApiKeys = async () => {
    setIsLoadingApiKeys(true);
    try {
      const response = await apiKeyApi.getApiKeys(projectResponse.id);
      setApiKeys(response.apiKeys);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load API keys';
      toastMessage.error(errorMessage);
    } finally {
      setIsLoadingApiKeys(false);
    }
  };

  const handleCreateApiKey = async () => {
    if (!createForm.name.trim()) {
      setCreateNameError(true);
      toastMessage.error('API key name is required');
      return;
    }
    setCreateNameError(false);
    setIsCreating(true);

    try {
      const request: CreateApiKeyRequest = { name: createForm.name.trim() };
      const newApiKey = await apiKeyApi.createApiKey(projectResponse.id, request);

      setCreateForm({ name: '' });
      setIsCreateModalOpen(false);

      if (newApiKey.token) {
        setCreatedApiKey(newApiKey);
        setTimeout(() => {
          setIsTokenModalOpen(true);
        }, 100);
      } else {
        toastMessage.error(
          'The API key was created but no token was returned. Please contact support.',
        );
      }

      setApiKeys((prev) => [newApiKey, ...prev]);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create API key';
      toastMessage.error(errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateApiKey = async () => {
    if (!editingKey || !editForm.name.trim()) {
      setEditNameError(true);
      toastMessage.error('API key name is required');
      return;
    }
    setEditNameError(false);
    setIsUpdating(true);

    try {
      const request: UpdateApiKeyRequest = { name: editForm.name.trim() };
      await apiKeyApi.updateApiKey(projectResponse.id, editingKey.id, request);

      setApiKeys((prev) =>
        prev.map((key) =>
          key.id === editingKey.id ? { ...key, name: editForm.name.trim() } : key,
        ),
      );

      setEditingKey(null);
      setEditForm({ name: '' });
      toastMessage.success('API key updated successfully');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update API key';
      toastMessage.error(errorMessage);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleStatus = async (apiKeyId: string, currentStatus: ApiKeyStatus) => {
    const newStatus =
      currentStatus === ApiKeyStatus.ACTIVE ? ApiKeyStatus.DISABLED : ApiKeyStatus.ACTIVE;

    setApiKeys((prev) =>
      prev.map((key) => (key.id === apiKeyId ? { ...key, status: newStatus } : key)),
    );
    setProcessingKeys((prev) => new Set(prev).add(apiKeyId));

    try {
      const request: UpdateApiKeyRequest = { status: newStatus };
      await apiKeyApi.updateApiKey(projectResponse.id, apiKeyId, request);

      const statusText = newStatus === ApiKeyStatus.ACTIVE ? 'enabled' : 'disabled';
      toastMessage.success(`API key ${statusText} successfully`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update API key status';
      toastMessage.error(errorMessage);

      const revertStatus =
        newStatus === ApiKeyStatus.ACTIVE ? ApiKeyStatus.DISABLED : ApiKeyStatus.ACTIVE;
      setApiKeys((prev) =>
        prev.map((key) => (key.id === apiKeyId ? { ...key, status: revertStatus } : key)),
      );
    } finally {
      setProcessingKeys((prev) => {
        const newSet = new Set(prev);
        newSet.delete(apiKeyId);
        return newSet;
      });
    }
  };

  const handleDeleteApiKey = async (apiKeyId: string, apiKeyName: string) => {
    setDeletingKeys((prev) => new Set(prev).add(apiKeyId));

    try {
      await apiKeyApi.deleteApiKey(projectResponse.id, apiKeyId);
      setApiKeys((prev) => prev.filter((key) => key.id !== apiKeyId));
      toastMessage.success(`API key "${apiKeyName}" deleted successfully`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete API key';
      toastMessage.error(errorMessage);
    } finally {
      setDeletingKeys((prev) => {
        const newSet = new Set(prev);
        newSet.delete(apiKeyId);
        return newSet;
      });
    }
  };

  const startEditing = (apiKey: ApiKey) => {
    setEditingKey({ id: apiKey.id, name: apiKey.name });
    setEditForm({ name: apiKey.name });
    setEditNameError(false);
  };

  const cancelEditing = () => {
    setEditingKey(null);
    setEditForm({ name: '' });
    setEditNameError(false);
  };

  const isLoading = isLoadingProject || isLoadingApiKeys;

  return (
    <div className="flex h-full pl-3">
      <div className="h-full w-full">
        <div className="h-full overflow-y-auto p-6">
          <div className="max-w-[850px]">
            <div className="mb-6 flex items-center justify-end">
              {canManageKeys && (
                <Button onClick={() => setIsCreateModalOpen(true)} disabled={isLoading}>
                  <Plus className="mr-2 size-4" />
                  Create API key
                </Button>
              )}
            </div>

            {project && !project.isApiKeyRequired && (
              <div className="text-muted-foreground mb-4 flex items-center gap-1.5 text-xs">
                <Info className="size-3.5" />
                <span>API key validation is disabled. Enable it in project settings.</span>
              </div>
            )}

            {isLoading ? (
              <div className="flex h-64 items-center justify-center">
                <Spinner size="lg" />
              </div>
            ) : (
              <div>
                <div className="text-muted-foreground mb-4 text-sm">
                  {apiKeys.length === 0
                    ? 'No API keys found'
                    : `${apiKeys.length} API key${apiKeys.length !== 1 ? 's' : ''}`}
                </div>

                {apiKeys.length === 0 ? (
                  <div className="text-muted-foreground py-8 text-center">
                    <div className="mb-2">No API keys created yet</div>
                    {canManageKeys && (
                      <div className="text-sm">Click &quot;Create API key&quot; to get started</div>
                    )}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[300px]">Name</TableHead>
                        <TableHead className="w-[150px]">Token prefix</TableHead>
                        <TableHead className="w-[120px]">Status</TableHead>
                        <TableHead className="w-[200px]">Created</TableHead>
                        <TableHead className="w-[120px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {apiKeys.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell>
                            {editingKey && editingKey.id === record.id ? (
                              <div>
                                <div className="mb-1">
                                  <Input
                                    value={editForm.name}
                                    onChange={(e) => {
                                      setEditNameError(false);
                                      setEditForm({ name: e.target.value });
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleUpdateApiKey();
                                    }}
                                    className={`h-8 w-[200px] text-sm ${editNameError ? 'border-destructive' : ''}`}
                                    placeholder="Enter API key name"
                                    maxLength={100}
                                  />
                                </div>
                                <Button
                                  size="sm"
                                  onClick={handleUpdateApiKey}
                                  disabled={isUpdating}
                                >
                                  {isUpdating ? (
                                    <Loader2 className="mr-1 size-3 animate-spin" />
                                  ) : null}
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={cancelEditing}
                                  disabled={isUpdating}
                                  className="ml-1"
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <span className="font-medium">{record.name}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <code className="bg-muted text-foreground rounded px-2 py-1 !font-mono text-sm">
                              {record.tokenPrefix}...
                            </code>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              {canManageKeys && (
                                <Switch
                                  size="sm"
                                  checked={record.status === ApiKeyStatus.ACTIVE}
                                  onCheckedChange={() =>
                                    handleToggleStatus(record.id, record.status)
                                  }
                                  disabled={processingKeys.has(record.id)}
                                />
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-muted-foreground text-sm">
                              <div>{dayjs(record.createdAt).format('MMM D, YYYY')}</div>
                              <div className="text-muted-foreground text-xs">
                                {dayjs(record.createdAt).format('HH:mm')} (
                                {dayjs(record.createdAt).fromNow()})
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {canManageKeys ? (
                              <div className="flex items-center space-x-2">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => startEditing(record)}
                                      disabled={!!editingKey || processingKeys.has(record.id)}
                                    >
                                      <Edit className="size-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit name</TooltipContent>
                                </Tooltip>

                                <AlertDialog>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          disabled={
                                            deletingKeys.has(record.id) ||
                                            processingKeys.has(record.id)
                                          }
                                        >
                                          {deletingKeys.has(record.id) ? (
                                            <Loader2 className="size-4 animate-spin" />
                                          ) : (
                                            <Trash2 className="text-destructive size-4" />
                                          )}
                                        </Button>
                                      </AlertDialogTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent>Delete API key</TooltipContent>
                                  </Tooltip>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete API key</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to delete &quot;{record.name}&quot;?
                                        This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        variant="destructive"
                                        onClick={() => handleDeleteApiKey(record.id, record.name)}
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}

            {!canManageKeys && (
              <div className="mt-6 rounded-md bg-yellow-50 p-3">
                <div className="text-sm text-yellow-800">
                  You don&apos;t have permission to manage API keys. Only project owners, project
                  admins, and system administrators can create, edit, or delete API keys.
                </div>
              </div>
            )}

            <Dialog
              open={isCreateModalOpen}
              onOpenChange={(open) => {
                if (!open) {
                  setIsCreateModalOpen(false);
                  setCreateForm({ name: '' });
                  setCreateNameError(false);
                }
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create new API key</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                  <div className="mb-4">
                    <div className="text-foreground mb-2 font-medium">API key name</div>
                    <Input
                      value={createForm.name}
                      onChange={(e) => {
                        setCreateNameError(false);
                        setCreateForm({ name: e.target.value });
                      }}
                      placeholder="Enter a descriptive name for this API key"
                      maxLength={100}
                      className={createNameError ? 'border-destructive' : undefined}
                    />
                    <div className="text-muted-foreground mt-1 text-xs">
                      Choose a name that helps you identify this key&apos;s purpose (e.g.,
                      &quot;Production&quot;, &quot;Development&quot;)
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreateApiKey} disabled={isCreating}>
                    {isCreating ? (
                      <>
                        <Spinner size="sm" className="mr-2" />
                        Creating...
                      </>
                    ) : (
                      'Create API key'
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog
              open={isTokenModalOpen}
              onOpenChange={(open) => {
                if (!open) {
                  setIsTokenModalOpen(false);
                  setCreatedApiKey(null);
                }
              }}
            >
              <DialogContent className="sm:max-w-[700px]">
                <DialogHeader>
                  <DialogTitle>
                    <div className="flex items-center">
                      <span className="mr-2 text-green-600">✓</span>
                      API key created successfully
                    </div>
                  </DialogTitle>
                </DialogHeader>
                {createdApiKey && (
                  <div className="mt-2">
                    <div className="mb-4">
                      <div className="text-foreground mb-2 font-medium">API key name:</div>
                      <div className="text-foreground">{createdApiKey.name}</div>
                    </div>

                    <div className="mb-4">
                      <div className="text-foreground mb-2 font-medium">Full API token:</div>
                      <div className="border-border bg-muted rounded-lg border-2 p-4">
                        <div className="flex items-center justify-between">
                          <code className="text-foreground !font-mono text-sm break-all select-all">
                            {createdApiKey.token}
                          </code>
                          <Button
                            onClick={async () => {
                              if (createdApiKey.token) {
                                const success = await copyToClipboard(createdApiKey.token);
                                if (success) {
                                  toastMessage.success('API token copied to clipboard!');
                                } else {
                                  toastMessage.error(
                                    'Failed to copy token to clipboard. Please select and copy the token manually.',
                                  );
                                }
                              }
                            }}
                            className="ml-3"
                          >
                            <Copy className="mr-2 size-4" />
                            Copy token
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <DialogFooter>
                  <Button
                    onClick={() => {
                      setIsTokenModalOpen(false);
                      setCreatedApiKey(null);
                    }}
                  >
                    I have saved the token
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
}
