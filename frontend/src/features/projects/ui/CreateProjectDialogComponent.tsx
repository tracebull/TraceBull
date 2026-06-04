import { toastMessage } from '@/shared/lib/toastMessage';
import { useState } from 'react';

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

import type { ProjectResponse } from '../../../entity/projects';
import { projectApi } from '../../../entity/projects';
import { type UserProfile, UserRole, type UsersSettings } from '../../../entity/users';

interface Props {
  user: UserProfile;
  globalSettings: UsersSettings;

  onClose: () => void;
  onProjectCreated: (project: ProjectResponse) => void;
}

export const CreateProjectDialogComponent = ({
  user,
  globalSettings,
  onClose,
  onProjectCreated,
}: Props) => {
  const [isCreating, setIsCreating] = useState(false);
  const [projectName, setProjectName] = useState('');

  const isAllowedToCreateProjects =
    globalSettings.isManagerAllowedToCreateProjects || user.role === UserRole.ADMIN;

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      toastMessage.error('Please enter a project name');
      return;
    }

    setIsCreating(true);

    try {
      const newProject = await projectApi.createProject({
        name: projectName.trim(),
      });

      toastMessage.success('Project created successfully');
      onProjectCreated(newProject);
      onClose();
    } catch (error) {
      toastMessage.error((error as Error).message || 'Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  if (!isAllowedToCreateProjects) {
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permission denied</DialogTitle>
          </DialogHeader>
          <p>
            You don&apos;t have permission to create projects. Please ask the administrator to
            create the project for you.
          </p>
          <DialogFooter>
            <Button onClick={onClose}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
        </DialogHeader>
        <div className="mb-4">
          <label className="text-foreground mb-2 block text-sm font-medium">Project name</label>
          <Input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Enter project name"
            disabled={isCreating}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateProject();
            }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreateProject} disabled={isCreating || !projectName.trim()}>
            {isCreating ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Creating...
              </>
            ) : (
              'Create project'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
