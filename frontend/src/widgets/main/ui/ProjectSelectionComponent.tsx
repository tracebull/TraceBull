import { Check, ChevronDown, Copy } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { type ProjectResponse } from '../../../entity/projects';
import type { UsersSettings } from '../../../entity/users';
import type { UserProfile } from '../../../entity/users';
import { UserRole } from '../../../entity/users';

interface Props {
  projects: ProjectResponse[];
  selectedProject?: ProjectResponse;
  onCreateProject: () => void;
  onProjectSelect: (project: ProjectResponse) => void;
  user?: UserProfile;
  globalSettings?: UsersSettings;
}

export const ProjectSelectionComponent = ({
  projects,
  selectedProject,
  onCreateProject,
  onProjectSelect,
  user,
  globalSettings,
}: Props) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const copyProjectId = () => {
    if (selectedProject?.id) {
      navigator.clipboard.writeText(selectedProject.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const filteredProjects = useMemo(() => {
    if (!searchValue.trim()) return projects;
    const searchTerm = searchValue.toLowerCase();
    return projects.filter((project) => project.name.toLowerCase().includes(searchTerm));
  }, [projects, searchValue]);

  const openProject = (project: ProjectResponse) => {
    setIsDropdownOpen(false);
    setSearchValue('');
    onProjectSelect?.(project);
  };

  const canCreateProjects =
    user?.role === UserRole.ADMIN ||
    (user?.role === UserRole.MANAGER && globalSettings?.isManagerAllowedToCreateProjects !== false);

  // Handle click outside dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
        setSearchValue('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (projects.length === 0) {
    if (!canCreateProjects) {
      return (
        <div className="my-1 select-none">
          <div className="text-muted-foreground mb-1 text-xs leading-none">No projects</div>
        </div>
      );
    }

    return (
      <Button
        onClick={onCreateProject}
        className="bg-primary text-primary-foreground hover:bg-primary/90"
      >
        Create project
      </Button>
    );
  }

  return (
    <div className="select-none" ref={dropdownRef}>
      <div className="flex items-center gap-2">
        <div className="relative w-[250px]">
          <Button
            variant="ghost"
            className="bg-muted hover:bg-accent w-[250px] justify-between"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            <span className="truncate">{selectedProject?.name || 'Select a project'}</span>
            <ChevronDown
              className={`ml-1 size-4 shrink-0 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
            />
          </Button>

          {isDropdownOpen && (
            <div className="border-border bg-card absolute top-full left-0 z-50 mt-1 min-w-full rounded-md border shadow-lg">
              <div className="border-border border-b p-2">
                <Input
                  placeholder="Search projects..."
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  className="border-0 shadow-none"
                  autoFocus
                />
              </div>

              <div className="max-h-[400px] overflow-y-auto">
                {filteredProjects.map((project) => (
                  <div
                    key={project.id}
                    className="hover:bg-accent max-w-[250px] cursor-pointer truncate px-3 py-2 text-sm"
                    onClick={() => openProject(project)}
                  >
                    {project.name}
                  </div>
                ))}

                {filteredProjects.length === 0 && searchValue && (
                  <div className="text-muted-foreground px-3 py-2 text-sm">No projects found</div>
                )}
              </div>

              {canCreateProjects && (
                <div className="border-border border-t">
                  <div
                    className="text-primary hover:bg-accent hover:text-primary/80 cursor-pointer px-3 py-2 text-sm"
                    onClick={() => {
                      onCreateProject();
                      setIsDropdownOpen(false);
                      setSearchValue('');
                    }}
                  >
                    + Create new project
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {selectedProject?.id && (
          <div className="border-border flex h-9 items-center rounded-md border">
            <input
              readOnly
              value={selectedProject.id}
              className="text-muted-foreground h-full min-w-0 flex-1 truncate bg-transparent px-2 font-mono text-xs focus:outline-none"
            />
            <button
              onClick={copyProjectId}
              className="border-border text-muted-foreground hover:bg-accent hover:text-foreground flex h-full shrink-0 items-center justify-center border-l px-2.5 transition-colors"
              title="Copy project ID"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
