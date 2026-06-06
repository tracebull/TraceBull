import {
  ChevronLeft,
  ChevronRight,
  Code,
  FolderCog,
  Key,
  Menu,
  Search,
  Settings,
  User,
  UserCog,
  Users,
} from 'lucide-react';
import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { APP_VERSION } from '../../../constants';
import { type DiskUsage, diskApi } from '../../../entity/disk';
import { type ProjectResponse, projectApi } from '../../../entity/projects';
import {
  type UserProfile,
  UserRole,
  type UsersSettings,
  settingsApi,
  userApi,
} from '../../../entity/users';
import { ThemeToggle } from '../../../features/users/ui/ThemeToggle';
import { toastMessage } from '../../../shared/lib/toastMessage';
import { ProjectSelectionComponent } from './ProjectSelectionComponent';

const CreateProjectDialogComponent = lazy(() =>
  import('../../../features/projects/ui/CreateProjectDialogComponent').then((m) => ({
    default: m.CreateProjectDialogComponent,
  })),
);
const ProjectApiKeysComponent = lazy(() =>
  import('../../../features/projects/ui/ProjectApiKeysComponent').then((m) => ({
    default: m.ProjectApiKeysComponent,
  })),
);
const ProjectMembershipComponent = lazy(() =>
  import('../../../features/projects/ui/ProjectMembershipComponent').then((m) => ({
    default: m.ProjectMembershipComponent,
  })),
);
const ProjectSettingsComponent = lazy(() =>
  import('../../../features/projects/ui/ProjectSettingsComponent').then((m) => ({
    default: m.ProjectSettingsComponent,
  })),
);
const QueryComponentComponent = lazy(() =>
  import('../../../features/query/ui/QueryComponent').then((m) => ({
    default: m.QueryComponentComponent,
  })),
);
const SettingsComponent = lazy(() =>
  import('../../../features/settings/ui/SettingsComponent').then((m) => ({
    default: m.SettingsComponent,
  })),
);
const ProfileComponent = lazy(() =>
  import('../../../features/users/ui/ProfileComponent').then((m) => ({
    default: m.ProfileComponent,
  })),
);
const UsersComponent = lazy(() =>
  import('../../../features/users/ui/UsersComponent').then((m) => ({
    default: m.UsersComponent,
  })),
);

type TabId =
  | 'profile'
  | 'logbull-settings'
  | 'users'
  | 'search'
  | 'settings'
  | 'api-keys'
  | 'members';

const PAGE_TITLES: Record<TabId, string> = {
  search: 'Search',
  settings: 'Project Settings',
  members: 'Members',
  'api-keys': 'API Keys',
  profile: 'Profile',
  'logbull-settings': 'Settings',
  users: 'Users',
};

interface NavItemConfig {
  label: string;
  tab: TabId;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly: boolean;
  visible: boolean;
  hasSeparator: boolean;
}

export const MainScreenComponent = () => {
  const [selectedTab, setSelectedTab] = useState<TabId>('search');
  const [diskUsage, setDiskUsage] = useState<DiskUsage | undefined>(undefined);
  const [user, setUser] = useState<UserProfile | undefined>(undefined);
  const [globalSettings, setGlobalSettings] = useState<UsersSettings | undefined>(undefined);
  const showLogsDialogFn = useRef<(() => void) | null>(null);

  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectResponse | undefined>(undefined);

  const [isLoading, setIsLoading] = useState(false);
  const [showCreateProjectDialog, setShowCreateProjectDialog] = useState(false);

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 450);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('tracebull-sidebar-collapsed') !== 'false';
    } catch {
      return true;
    }
  });

  const loadData = async () => {
    setIsLoading(true);

    try {
      const [diskUsage, user, projects, settings] = await Promise.all([
        diskApi.getDiskUsage(),
        userApi.getCurrentUser(),
        projectApi.getProjects(),
        settingsApi.getSettings(),
      ]);

      setDiskUsage(diskUsage);
      setUser(user);
      setProjects(projects.projects);
      setGlobalSettings(settings);
    } catch (e) {
      toastMessage.error((e as Error).message);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedProject && projects.length > 0) {
      const previouslySelectedProjectId = localStorage.getItem('selected_project_id');
      const previouslySelectedProject = projects.find(
        (project) => project.id === previouslySelectedProjectId,
      );
      const projectToSelect = previouslySelectedProject || projects[0];
      setSelectedProject(projectToSelect);
    }
  }, [projects, selectedProject]);

  useEffect(() => {
    if (selectedProject) {
      localStorage.setItem('selected_project_id', selectedProject.id);
    }
  }, [selectedProject]);

  useEffect(() => {
    if (selectedTab === 'api-keys' && selectedProject?.isApiKeyRequired !== true) {
      setSelectedTab('search');
    }
  }, [selectedProject, selectedTab]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 450);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleCreateProject = () => {
    setShowCreateProjectDialog(true);
  };

  const handleProjectCreated = async (newProject: ProjectResponse) => {
    try {
      const projectsResponse = await projectApi.getProjects();
      setProjects(projectsResponse.projects);
      setSelectedProject(newProject);
      setSelectedTab('search');
    } catch (e) {
      toastMessage.error((e as Error).message);
    }
  };

  const handleNavClick = (tab: TabId) => {
    setSelectedTab(tab);
    setSheetOpen(false);
  };

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('tracebull-sidebar-collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const handleProjectUpdated = (updatedProject: ProjectResponse) => {
    setSelectedProject(updatedProject);
    setProjects((prev) =>
      prev.map((project) => (project.id === updatedProject.id ? updatedProject : project)),
    );

    if (!updatedProject.isApiKeyRequired && selectedTab === 'api-keys') {
      setSelectedTab('search');
    }
  };

  const isUsedMoreThan95Percent =
    diskUsage && diskUsage.usedSpaceBytes / diskUsage.totalSpaceBytes > 0.95;

  const allNavItems: NavItemConfig[] = [
    {
      label: 'Search',
      tab: 'search',
      icon: Search,
      adminOnly: false,
      visible: true,
      hasSeparator: false,
    },
    {
      label: 'Project Settings',
      tab: 'settings',
      icon: FolderCog,
      adminOnly: false,
      visible: !!selectedProject,
      hasSeparator: false,
    },
    {
      label: 'Members',
      tab: 'members',
      icon: Users,
      adminOnly: false,
      visible: !!selectedProject,
      hasSeparator: false,
    },
    {
      label: 'API Keys',
      tab: 'api-keys',
      icon: Key,
      adminOnly: false,
      visible: selectedProject?.isApiKeyRequired === true,
      hasSeparator: false,
    },
    {
      label: 'Profile',
      tab: 'profile',
      icon: User,
      adminOnly: false,
      visible: true,
      hasSeparator: false,
    },
    {
      label: 'Settings',
      tab: 'logbull-settings',
      icon: Settings,
      adminOnly: true,
      visible: true,
      hasSeparator: true,
    },
    {
      label: 'Users',
      tab: 'users',
      icon: UserCog,
      adminOnly: true,
      visible: true,
      hasSeparator: false,
    },
  ];

  const navItems = allNavItems
    .filter((item) => !item.adminOnly || user?.role === UserRole.ADMIN)
    .filter((item) => item.visible);

  const renderContent = () => {
    if (
      projects.length === 0 &&
      (selectedTab === 'search' ||
        selectedTab === 'settings' ||
        selectedTab === 'api-keys' ||
        selectedTab === 'members')
    ) {
      return (
        <div className="flex h-full items-center justify-center">
          {(user?.role === UserRole.ADMIN ||
            (user?.role === UserRole.MANAGER &&
              globalSettings?.isManagerAllowedToCreateProjects !== false)) && (
            <Button
              size="lg"
              onClick={handleCreateProject}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Create project
            </Button>
          )}
        </div>
      );
    }

    return (
      <>
        {selectedTab === 'profile' && <ProfileComponent />}
        {selectedTab === 'logbull-settings' && <SettingsComponent />}
        {selectedTab === 'users' && <UsersComponent globalSettings={globalSettings} user={user} />}
        {selectedTab === 'settings' && selectedProject && user && (
          <ProjectSettingsComponent
            projectResponse={selectedProject}
            user={user}
            onProjectUpdated={handleProjectUpdated}
          />
        )}
        {selectedTab === 'api-keys' && selectedProject?.isApiKeyRequired && user && (
          <ProjectApiKeysComponent projectResponse={selectedProject} user={user} />
        )}
        {selectedTab === 'members' && selectedProject && user && (
          <ProjectMembershipComponent projectResponse={selectedProject} user={user} />
        )}
        {selectedTab === 'search' && selectedProject && user && (
          <QueryComponentComponent
            projectId={selectedProject.id}
            user={user}
            onShowLogsDialogReady={(fn) => {
              showLogsDialogFn.current = fn;
            }}
          />
        )}
      </>
    );
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={`bg-background flex h-screen flex-col overflow-hidden ${isMobile ? '' : 'p-3'}`}
      >
        <div
          className={`bg-card flex flex-shrink-0 items-center ${
            isMobile ? 'px-3 py-1' : 'mb-3 rounded px-3 py-1'
          }`}
        >
          {isMobile && (
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="mr-2 flex-shrink-0">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="flex flex-col">
                <SheetHeader>
                  <SheetTitle>Navigation</SheetTitle>
                </SheetHeader>
                <nav className="mt-4 flex flex-col gap-1">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.tab}
                        onClick={() => handleNavClick(item.tab)}
                        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                          selectedTab === item.tab
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-accent'
                        } ${item.hasSeparator ? 'mt-3' : ''}`}
                      >
                        <Icon className="size-4" />
                        {item.label}
                      </button>
                    );
                  })}
                </nav>
                <div className="text-muted-foreground mt-auto pt-4 text-center text-xs">
                  v{APP_VERSION}
                </div>
              </SheetContent>
            </Sheet>
          )}

          <div className="flex items-center gap-3 hover:opacity-80">
            <a href="/">
              <img className="h-[28px] w-[28px] dark:invert" src="/logo.svg" alt="Logo" />
            </a>
          </div>

          <div className="ml-6">
            {!isLoading && (
              <ProjectSelectionComponent
                projects={projects}
                selectedProject={selectedProject}
                onCreateProject={handleCreateProject}
                onProjectSelect={setSelectedProject}
                user={user}
                globalSettings={globalSettings}
              />
            )}
          </div>

          <div className="mr-3 ml-auto flex items-center gap-5">
            <ThemeToggle />
            {isUsedMoreThan95Percent && diskUsage && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-destructive cursor-pointer text-center text-xs">
                    {(diskUsage.usedSpaceBytes / 1024 ** 3).toFixed(1)} of{' '}
                    {(diskUsage.totalSpaceBytes / 1024 ** 3).toFixed(1)} GB
                    <br />
                    storage used (
                    {((diskUsage.usedSpaceBytes / diskUsage.totalSpaceBytes) * 100).toFixed(1)}%)
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  To make backups locally and restore them, you need to have enough space on your
                  disk. For restore, you need to have same amount of space that the backup size.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {!isMobile && (
            <div
              className={`bg-card flex flex-shrink-0 flex-col rounded py-1.5 transition-all duration-200 ${
                sidebarCollapsed ? 'w-[48px] items-center' : 'w-[180px] px-2'
              }`}
            >
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.tab} className="flex flex-col items-center">
                    {item.hasSeparator && (
                      <div
                        className={`bg-border mb-2 h-px ${sidebarCollapsed ? 'w-6' : 'w-full'}`}
                      />
                    )}
                    {sidebarCollapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={`flex h-[36px] w-[36px] cursor-pointer items-center justify-center rounded ${
                              selectedTab === item.tab
                                ? 'bg-primary text-primary-foreground'
                                : 'hover:bg-accent'
                            }`}
                            onClick={() => handleNavClick(item.tab)}
                          >
                            <Icon className="size-4" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" sideOffset={8}>
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <div
                        className={`flex h-[36px] w-full cursor-pointer items-center gap-2.5 rounded px-2 ${
                          selectedTab === item.tab
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-accent'
                        }`}
                        onClick={() => handleNavClick(item.tab)}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="truncate text-sm">{item.label}</span>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="mt-auto flex flex-col items-center gap-1 pb-1">
                <button
                  onClick={toggleSidebar}
                  className="text-muted-foreground hover:text-foreground flex h-7 w-7 cursor-pointer items-center justify-center rounded transition-colors hover:bg-accent"
                >
                  {sidebarCollapsed ? (
                    <ChevronRight className="size-4" />
                  ) : (
                    <ChevronLeft className="size-4" />
                  )}
                </button>
                <div className="text-muted-foreground text-center text-xs">
                  v{APP_VERSION}
                </div>
              </div>
            </div>
          )}

          <div className={`flex flex-1 flex-col overflow-hidden ${isMobile ? '' : 'ml-3'}`}>
            <div className="flex flex-shrink-0 items-center justify-between px-4 py-2">
              <h1 className="text-muted-foreground text-sm font-semibold">
                {PAGE_TITLES[selectedTab]}
              </h1>
              {selectedTab === 'search' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground h-7 gap-1.5 text-xs"
                  onClick={() => showLogsDialogFn.current?.()}
                >
                  <Code className="size-3.5" />
                  How to send logs
                </Button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Spinner size="lg" />
                </div>
              ) : (
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center">
                      <Spinner size="lg" />
                    </div>
                  }
                >
                  {renderContent()}
                </Suspense>
              )}
            </div>
          </div>
        </div>

        <Suspense fallback={null}>
          {showCreateProjectDialog && user && globalSettings && (
            <CreateProjectDialogComponent
              user={user}
              globalSettings={globalSettings}
              onClose={() => setShowCreateProjectDialog(false)}
              onProjectCreated={handleProjectCreated}
            />
          )}
        </Suspense>
      </div>
    </TooltipProvider>
  );
};
