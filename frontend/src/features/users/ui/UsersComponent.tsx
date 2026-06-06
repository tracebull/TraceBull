import { toastMessage } from '@/shared/lib/toastMessage';
import dayjs from 'dayjs';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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

import { userManagementApi } from '../../../entity/users/api/userManagementApi';
import type { ChangeUserRoleRequest } from '../../../entity/users/model/ChangeUserRoleRequest';
import type { CreateUserRequest } from '../../../entity/users/model/CreateUserRequest';
import type { ListUsersRequest } from '../../../entity/users/model/ListUsersRequest';
import type { UserProfile } from '../../../entity/users/model/UserProfile';
import { UserRole } from '../../../entity/users/model/UserRole';
import type { UsersSettings } from '../../../entity/users/model/UsersSettings';
import { getUserShortTimeFormat } from '../../../shared/time';
import { BulkInviteComponent } from './BulkInviteComponent';
import { UserAuditLogsSidebarComponent } from './UserAuditLogsSidebarComponent';

interface Props {
  globalSettings?: UsersSettings;
  user?: UserProfile;
}

const getRoleColor = (role: UserRole): string => {
  switch (role) {
    case UserRole.ADMIN:
      return 'text-blue-500';
    case UserRole.MANAGER:
      return 'text-primary';
    case UserRole.USER:
      return 'text-muted-foreground';
    default:
      return 'text-muted-foreground';
  }
};

export function UsersComponent({ globalSettings, user }: Props) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [inputValue, setInputValue] = useState('');

  const pageSize = 20;

  const [processingUsers, setProcessingUsers] = useState<Set<string>>(new Set());
  const [changingRoleUsers, setChangingRoleUsers] = useState<Set<string>>(new Set());

  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isBulkInviteOpen, setIsBulkInviteOpen] = useState(false);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [addUserName, setAddUserName] = useState('');
  const [addUserEmail, setAddUserEmail] = useState('');
  const [addUserPassword, setAddUserPassword] = useState('');
  const [addUserRole, setAddUserRole] = useState<UserRole>(UserRole.USER);
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    loadUsers(true);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputValue !== searchQuery) {
        setSearchQuery(inputValue);
        setHasMore(true);
        loadUsers(true, inputValue);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [inputValue]);

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current || isLoadingMore || !hasMore || loadingRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const threshold = 100;

    if (scrollHeight - scrollTop - clientHeight < threshold) {
      loadUsers(false);
    }
  }, [isLoadingMore, hasMore]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
      return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  const loadUsers = async (isInitialLoad = false, query?: string) => {
    if (!isInitialLoad && loadingRef.current) {
      return;
    }

    loadingRef.current = true;

    if (isInitialLoad) {
      setIsLoading(true);
      setUsers([]);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const offset = isInitialLoad ? 0 : users.length;
      const currentQuery = query !== undefined ? query : searchQuery;
      const request: ListUsersRequest = {
        limit: pageSize,
        offset: offset,
        query: currentQuery || undefined,
      };

      const response = await userManagementApi.getUsers(request);

      const fetchedUsers = response.users ?? [];

      if (isInitialLoad) {
        setUsers(fetchedUsers);
      } else {
        setUsers((prev) => {
          const existingIds = new Set(prev.map((user) => user.id));
          const newUsers = fetchedUsers.filter((user) => !existingIds.has(user.id));
          return [...prev, ...newUsers];
        });
      }

      setTotal(response.total);
      setHasMore(fetchedUsers.length === pageSize);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load users';
      toastMessage.error(errorMessage);
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const handleActivationToggle = async (userId: string, isActive: boolean) => {
    setUsers((prev) =>
      prev.map((user) => (user.id === userId ? { ...user, isActive: !isActive } : user)),
    );

    setProcessingUsers((prev) => new Set(prev).add(userId));

    try {
      if (isActive) {
        await userManagementApi.deactivateUser(userId);
        toastMessage.success('User deactivated successfully');
      } else {
        await userManagementApi.activateUser(userId);
        toastMessage.success('User activated successfully');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Operation failed';
      toastMessage.error(errorMessage);

      setUsers((prev) =>
        prev.map((user) => (user.id === userId ? { ...user, isActive: isActive } : user)),
      );
    } finally {
      setProcessingUsers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    }
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    const currentUser = users.find((user) => user.id === userId);
    const originalRole = currentUser?.role;

    setUsers((prev) =>
      prev.map((user) => (user.id === userId ? { ...user, role: newRole } : user)),
    );

    setChangingRoleUsers((prev) => new Set(prev).add(userId));

    try {
      const request: ChangeUserRoleRequest = { role: newRole };
      await userManagementApi.changeUserRole(userId, request);
      toastMessage.success('User role changed successfully');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to change user role';
      toastMessage.error(errorMessage);

      if (originalRole) {
        setUsers((prev) =>
          prev.map((user) => (user.id === userId ? { ...user, role: originalRole } : user)),
        );
      }
    } finally {
      setChangingRoleUsers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    }
  };

  const handleRowClick = (user: UserProfile) => {
    setSelectedUser(user);
    setIsDrawerOpen(true);
  };

  const handleDrawerClose = () => {
    setSelectedUser(null);
    setIsDrawerOpen(false);
  };

  const resetAddUserForm = () => {
    setAddUserName('');
    setAddUserEmail('');
    setAddUserPassword('');
    setAddUserRole(UserRole.USER);
    setIsCreatingUser(false);
  };

  const handleCreateUser = async () => {
    if (!addUserName.trim() || !addUserEmail.trim() || !addUserPassword.trim()) {
      toastMessage.error('Please fill in all fields');
      return;
    }

    setIsCreatingUser(true);
    try {
      const request: CreateUserRequest = {
        name: addUserName.trim(),
        email: addUserEmail.trim().toLowerCase(),
        password: addUserPassword,
        role: addUserRole,
      };
      await userManagementApi.createUser(request);
      toastMessage.success('User created successfully');
      setIsAddUserOpen(false);
      resetAddUserForm();
      loadUsers(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create user';
      toastMessage.error(StringUtils.capitalizeFirstLetter(message));
    } finally {
      setIsCreatingUser(false);
    }
  };

  return (
    <div className="flex h-full pl-3">
      <div className="h-full w-full">
        <div ref={scrollContainerRef} className="h-full overflow-y-auto p-6">
          <div className="mb-4 flex items-center justify-end">
            <div className="flex items-center gap-3">
              {user?.role === UserRole.ADMIN && (
                <Button onClick={() => setIsAddUserOpen(true)}>Add User</Button>
              )}
              {(user?.role === UserRole.ADMIN ||
                globalSettings?.isAllowManagerInvitations !== false) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button onClick={() => setIsBulkInviteOpen(true)} disabled={total <= 1}>
                      Bulk Invite
                    </Button>
                  </TooltipTrigger>
                  {total <= 1 && <TooltipContent>Create more users first</TooltipContent>}
                </Tooltip>
              )}
              <div className="text-muted-foreground text-sm">
                {isLoading ? 'Loading...' : `${users.length} of ${total} users`}
              </div>
            </div>
          </div>

          <div className="mb-4">
            <Input
              placeholder="Search by email or name..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="max-w-md"
            />
          </div>

          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : (
            <>
              <Table className="mb-4">
                <TableHeader>
                  <TableRow>
                    <TableHead style={{ width: 350 }}>User</TableHead>
                    <TableHead style={{ width: 200 }}>System role</TableHead>
                    <TableHead style={{ width: 200 }}>Active</TableHead>
                    <TableHead style={{ width: 300 }}>Created</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <div>
                          {record.name} ({record.email})
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={record.role}
                          onValueChange={(value) => handleRoleChange(record.id, value as UserRole)}
                          disabled={changingRoleUsers.has(record.id)}
                        >
                          <SelectTrigger className="h-7 w-24 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UserRole.ADMIN}>
                              <span className={getRoleColor(UserRole.ADMIN)}>Admin</span>
                            </SelectItem>
                            <SelectItem value={UserRole.MANAGER}>
                              <span className={getRoleColor(UserRole.MANAGER)}>Manager</span>
                            </SelectItem>
                            <SelectItem value={UserRole.USER}>
                              <span className={getRoleColor(UserRole.USER)}>User</span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={record.isActive}
                          onCheckedChange={() => handleActivationToggle(record.id, record.isActive)}
                          disabled={processingUsers.has(record.id)}
                          size="sm"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="text-muted-foreground text-sm">
                          <div>
                            {dayjs(record.createdAt).format(getUserShortTimeFormat().format)}
                          </div>
                          <div className="text-muted-foreground/60 text-xs">
                            {dayjs(record.createdAt).fromNow()}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => handleRowClick(record)}>
                          View audit logs
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {isLoadingMore && (
                <div className="flex justify-center py-4">
                  <Spinner />
                </div>
              )}

              {!hasMore && users.length > 0 && (
                <div className="text-muted-foreground py-4 text-center text-sm">
                  All users loaded ({total} total)
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Audit logs drawer */}
      <Sheet open={isDrawerOpen} onOpenChange={(open) => !open && handleDrawerClose()}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[900px]">
          <SheetHeader>
            <SheetTitle>User Audit Logs</SheetTitle>
            <SheetDescription>{selectedUser?.email}</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {selectedUser && <UserAuditLogsSidebarComponent user={selectedUser} />}
          </div>
        </SheetContent>
      </Sheet>

      <BulkInviteComponent
        open={isBulkInviteOpen}
        onClose={() => setIsBulkInviteOpen(false)}
        onInviteComplete={() => loadUsers(true)}
      />

      <Dialog
        open={isAddUserOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddUserOpen(false);
            resetAddUserForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="add-user-name">Name</Label>
              <Input
                id="add-user-name"
                placeholder="Enter name"
                value={addUserName}
                onChange={(e) => setAddUserName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-user-email">Email</Label>
              <Input
                id="add-user-email"
                type="email"
                placeholder="Enter email"
                value={addUserEmail}
                onChange={(e) => setAddUserEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-user-password">Password</Label>
              <Input
                id="add-user-password"
                type="password"
                placeholder="Minimum 8 characters"
                value={addUserPassword}
                onChange={(e) => setAddUserPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={addUserRole} onValueChange={(v) => setAddUserRole(v as UserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UserRole.USER}>
                    <span className={getRoleColor(UserRole.USER)}>User</span>
                  </SelectItem>
                  <SelectItem value={UserRole.MANAGER}>
                    <span className={getRoleColor(UserRole.MANAGER)}>Manager</span>
                  </SelectItem>
                  <SelectItem value={UserRole.ADMIN}>
                    <span className={getRoleColor(UserRole.ADMIN)}>Admin</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddUserOpen(false);
                resetAddUserForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateUser} disabled={isCreatingUser}>
              {isCreatingUser ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Creating...
                </>
              ) : (
                'Create User'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
