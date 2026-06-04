import { toastMessage } from '@/shared/lib/toastMessage';
import dayjs from 'dayjs';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';

import { projectApi } from '../../../entity/projects/api/projectApi';
import type { Project } from '../../../entity/projects/model/Project';
import type { ProjectResponse } from '../../../entity/projects/model/ProjectResponse';
import { queryApi } from '../../../entity/query/api/queryApi';
import type { LogsStats } from '../../../entity/query/model/ProjectLogStats';
import { ProjectRole } from '../../../entity/users/model/ProjectRole';
import type { UserProfile } from '../../../entity/users/model/UserProfile';
import { UserRole } from '../../../entity/users/model/UserRole';
import { ProjectAuditLogsComponent } from './ProjectAuditLogsComponent';

interface Props {
  projectResponse: ProjectResponse;
  user: UserProfile;
  onProjectUpdated?: (project: ProjectResponse) => void;
}

export function ProjectSettingsComponent({ projectResponse, user, onProjectUpdated }: Props) {
  const [project, setProject] = useState<Project | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Project stats state
  const [projectStats, setProjectStats] = useState<LogsStats | undefined>(undefined);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Scroll container ref for audit logs lazy loading
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Form state to track changes
  const [formProject, setFormProject] = useState<Partial<Project>>({});
  const [nameError, setNameError] = useState(false);
  const [domainErrors, setDomainErrors] = useState<string[]>([]);
  const [ipErrors, setIpErrors] = useState<string[]>([]);

  // Section-specific change tracking
  const [basicInfoChanges, setBasicInfoChanges] = useState(false);
  const [securityPolicyChanges, setSecurityPolicyChanges] = useState(false);
  const [quotasChanges, setQuotasChanges] = useState(false);

  // Delete project dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Tags input state for domains and IPs
  const [domainInputValue, setDomainInputValue] = useState('');
  const [ipInputValue, setIpInputValue] = useState('');

  const canEdit =
    user.role === UserRole.ADMIN ||
    projectResponse.userRole === ProjectRole.OWNER ||
    projectResponse.userRole === ProjectRole.ADMIN;

  useEffect(() => {
    loadProject();
    loadProjectStats();
  }, [projectResponse.id]);

  // Helper functions to check section-specific changes
  const checkBasicInfoChanges = (newFormProject: Partial<Project>): boolean => {
    if (!project) return false;
    return newFormProject.name !== project.name;
  };

  const checkSecurityPolicyChanges = (newFormProject: Partial<Project>): boolean => {
    if (!project) return false;
    return (
      newFormProject.isApiKeyRequired !== project.isApiKeyRequired ||
      newFormProject.isFilterByDomain !== project.isFilterByDomain ||
      newFormProject.isFilterByIp !== project.isFilterByIp ||
      JSON.stringify(newFormProject.allowedDomains) !== JSON.stringify(project.allowedDomains) ||
      JSON.stringify(newFormProject.allowedIps) !== JSON.stringify(project.allowedIps)
    );
  };

  const checkQuotasChanges = (newFormProject: Partial<Project>): boolean => {
    if (!project) return false;
    return (
      newFormProject.logsPerSecondLimit !== project.logsPerSecondLimit ||
      newFormProject.maxLogsAmount !== project.maxLogsAmount ||
      newFormProject.maxLogsSizeMb !== project.maxLogsSizeMb ||
      newFormProject.maxLogsLifeDays !== project.maxLogsLifeDays ||
      newFormProject.maxLogSizeKb !== project.maxLogSizeKb
    );
  };

  // Validation functions
  const validateDomain = (domain: string): boolean => {
    const domainRegex =
      /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return domainRegex.test(domain.trim());
  };

  const validateIP = (ip: string): boolean => {
    // IPv4 validation
    const ipv4Regex = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$/;
    // IPv6 validation (simplified)
    const ipv6Regex =
      /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

    return ipv4Regex.test(ip.trim()) || ipv6Regex.test(ip.trim());
  };

  const validateDomains = (domains: string[]): string[] => {
    const errors: string[] = [];
    domains.forEach((domain, index) => {
      if (!domain.trim()) {
        errors[index] = 'Domain cannot be empty';
      } else if (!validateDomain(domain)) {
        errors[index] = 'Invalid domain format';
      }
    });
    return errors;
  };

  const validateIPs = (ips: string[]): string[] => {
    const errors: string[] = [];
    ips.forEach((ip, index) => {
      if (!ip.trim()) {
        errors[index] = 'IP address cannot be empty';
      } else if (!validateIP(ip)) {
        errors[index] = 'Invalid IP address format';
      }
    });
    return errors;
  };

  const loadProject = async () => {
    setIsLoading(true);

    try {
      const projectData = await projectApi.getProject(projectResponse.id);
      setProject(projectData);
      setFormProject(projectData);
      setNameError(false);
      setDomainErrors([]);
      setIpErrors([]);

      // Reset section-specific change states
      setBasicInfoChanges(false);
      setSecurityPolicyChanges(false);
      setQuotasChanges(false);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load project';
      toastMessage.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const loadProjectStats = async () => {
    setIsLoadingStats(true);

    try {
      const stats = await queryApi.getProjectStats(projectResponse.id);
      setProjectStats(stats);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load project statistics';
      toastMessage.error(errorMessage);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const handleFieldChange = <K extends keyof Project>(field: K, value: Project[K]) => {
    const newFormProject = { ...formProject, [field]: value };
    setFormProject(newFormProject);

    // Validate domains and IPs when they change
    if (field === 'allowedDomains' && Array.isArray(value)) {
      const errors = validateDomains(value as string[]);
      setDomainErrors(errors);
    }
    if (field === 'allowedIps' && Array.isArray(value)) {
      const errors = validateIPs(value as string[]);
      setIpErrors(errors);
    }

    // Check section-specific changes
    if (project) {
      setBasicInfoChanges(checkBasicInfoChanges(newFormProject));
      setSecurityPolicyChanges(checkSecurityPolicyChanges(newFormProject));
      setQuotasChanges(checkQuotasChanges(newFormProject));
    }
  };

  // Section-specific save functions
  const saveBasicInfo = async () => {
    if (!basicInfoChanges || !project || !canEdit) return;

    // Validate required fields
    if (!formProject.name?.trim()) {
      setNameError(true);
      toastMessage.error('Project name is required');
      return;
    }
    setNameError(false);

    setIsSaving(true);
    try {
      const updateData = {
        ...project,
        name: formProject.name,
      };
      const updatedProject = await projectApi.updateProject(project.id, updateData);
      setProject(updatedProject);
      setFormProject(updatedProject);

      // Only reset basic info changes since that's what we saved
      setBasicInfoChanges(false);

      setNameError(false);
      toastMessage.success('Basic information updated successfully');
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update basic information';
      toastMessage.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const saveSecurityPolicies = async () => {
    if (!securityPolicyChanges || !project || !canEdit) return;

    // Validate domains and IPs before saving
    if (formProject.isFilterByDomain && formProject.allowedDomains) {
      const domainValidationErrors = validateDomains(formProject.allowedDomains);
      if (domainValidationErrors.some((error) => error)) {
        setDomainErrors(domainValidationErrors);
        toastMessage.error('Please fix domain validation errors before saving');
        return;
      }
    }

    if (formProject.isFilterByIp && formProject.allowedIps) {
      const ipValidationErrors = validateIPs(formProject.allowedIps);
      if (ipValidationErrors.some((error) => error)) {
        setIpErrors(ipValidationErrors);
        toastMessage.error('Please fix IP address validation errors before saving');
        return;
      }
    }

    setIsSaving(true);
    try {
      const updateData = {
        ...project,
        isApiKeyRequired: formProject.isApiKeyRequired ?? project.isApiKeyRequired,
        isFilterByDomain: formProject.isFilterByDomain ?? project.isFilterByDomain,
        isFilterByIp: formProject.isFilterByIp ?? project.isFilterByIp,
        allowedDomains: formProject.allowedDomains ?? project.allowedDomains,
        allowedIps: formProject.allowedIps ?? project.allowedIps,
      };
      const updatedProject = await projectApi.updateProject(project.id, updateData);
      setProject(updatedProject);
      setFormProject(updatedProject);
      onProjectUpdated?.({
        id: updatedProject.id,
        name: updatedProject.name,
        createdAt: updatedProject.createdAt,
        isApiKeyRequired: updatedProject.isApiKeyRequired,
        userRole: projectResponse.userRole,
      });

      // Only reset security policy changes since that's what we saved
      setSecurityPolicyChanges(false);

      toastMessage.success('Security policies updated successfully');
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update security policies';
      toastMessage.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const saveQuotas = async () => {
    if (!quotasChanges || !project || !canEdit) return;

    setIsSaving(true);
    try {
      const updateData = {
        ...project,
        logsPerSecondLimit: formProject.logsPerSecondLimit ?? project.logsPerSecondLimit,
        maxLogsAmount: formProject.maxLogsAmount ?? project.maxLogsAmount,
        maxLogsSizeMb: formProject.maxLogsSizeMb ?? project.maxLogsSizeMb,
        maxLogsLifeDays: formProject.maxLogsLifeDays ?? project.maxLogsLifeDays,
        maxLogSizeKb: formProject.maxLogSizeKb ?? project.maxLogSizeKb,
      };
      const updatedProject = await projectApi.updateProject(project.id, updateData);
      setProject(updatedProject);
      setFormProject(updatedProject);

      // Only reset quotas changes since that's what we saved
      setQuotasChanges(false);

      toastMessage.success('Rate limiting & quotas updated successfully');
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update rate limiting & quotas';
      toastMessage.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!project) {
      toastMessage.error('Project not found');
      return;
    }

    if (!canEdit) {
      toastMessage.error('You do not have permission to delete this project');
      return;
    }

    setIsDeleting(true);
    try {
      await projectApi.deleteProject(project.id);
      toastMessage.success('Project deleted successfully');
      // Redirect to projects list or home page
      window.location.href = '/';
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete project';
      toastMessage.error(errorMessage);
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  // Tags input helpers
  const addDomainTag = () => {
    const value = domainInputValue.trim();
    if (!value) return;
    const newDomains = [...(formProject.allowedDomains || []), value];
    handleFieldChange('allowedDomains', newDomains);
    setDomainInputValue('');
  };

  const removeDomainTag = (index: number) => {
    const newDomains = (formProject.allowedDomains || []).filter((_, i) => i !== index);
    handleFieldChange('allowedDomains', newDomains);
  };

  const addIpTag = () => {
    const value = ipInputValue.trim();
    if (!value) return;
    const newIps = [...(formProject.allowedIps || []), value];
    handleFieldChange('allowedIps', newIps);
    setIpInputValue('');
  };

  const removeIpTag = (index: number) => {
    const newIps = (formProject.allowedIps || []).filter((_, i) => i !== index);
    handleFieldChange('allowedIps', newIps);
  };

  const formatNumber = (value: number | undefined): string => {
    if (value === undefined) return '';
    return value.toLocaleString();
  };

  const parseFormattedNumber = (value: string): number => {
    return Number(value.replace(/,/g, '')) || 0;
  };

  return (
    <div className="flex h-full pl-3">
      <div className="h-full w-full">
        <div ref={scrollContainerRef} className="h-full overflow-y-auto p-6">
          {isLoading || !project ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : (
            <>
              {!canEdit && (
                <div className="my-4 rounded-md bg-yellow-50 p-3">
                  <div className="text-sm text-yellow-800">
                    You don&apos;t have permission to modify these settings. Only project owners,
                    project admins and system administrators can change project settings.
                  </div>
                </div>
              )}

              <div className="space-y-6 text-sm">
                <div className="border-border max-w-2xl border-b pb-6">
                  <div className="max-w-md">
                    <div className="text-foreground mb-1 font-medium">Project name</div>
                    <Input
                      value={formProject.name || ''}
                      onChange={(e) => {
                        setNameError(false);
                        handleFieldChange('name', e.target.value);
                      }}
                      disabled={!canEdit}
                      placeholder="Enter project name"
                      maxLength={100}
                      className={nameError ? 'border-destructive' : undefined}
                    />
                  </div>

                  {/* Basic Info Save Button */}
                  {basicInfoChanges && canEdit && (
                    <div className="mt-4 flex space-x-2">
                      <Button onClick={saveBasicInfo} disabled={isSaving}>
                        {isSaving ? (
                          <>
                            <Spinner size="sm" className="mr-2" />
                            Saving...
                          </>
                        ) : (
                          'Save Changes'
                        )}
                      </Button>

                      <Button
                        variant="outline"
                        onClick={() => {
                          if (project) {
                            const updatedForm = { ...formProject, name: project.name };
                            setFormProject(updatedForm);
                            setBasicInfoChanges(false);
                            setNameError(false);
                          }
                        }}
                        disabled={isSaving}
                      >
                        Reset
                      </Button>
                    </div>
                  )}
                </div>

                {/* Security Policies */}
                <div className="border-border max-w-2xl border-b pb-6">
                  <h2 className="text-foreground mb-4 text-base font-medium">Security policies</h2>

                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 pr-20">
                        <div className="text-foreground font-medium">Require API key</div>
                        <div className="text-muted-foreground mt-1">
                          When enabled, all log ingestion requests must include a valid API key
                        </div>
                      </div>
                      <div className="ml-4">
                        <Switch
                          checked={formProject.isApiKeyRequired ?? false}
                          onCheckedChange={(checked) =>
                            handleFieldChange('isApiKeyRequired', checked)
                          }
                          disabled={!canEdit}
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 pr-20">
                          <div className="text-foreground font-medium">Filter by domain</div>
                          <div className="text-muted-foreground mt-1">
                            When enabled, only requests from allowed domains will be accepted
                          </div>
                        </div>
                        <div className="ml-4">
                          <Switch
                            checked={formProject.isFilterByDomain ?? false}
                            onCheckedChange={(checked) => {
                              const newFormProject = {
                                ...formProject,
                                isFilterByDomain: checked,
                                ...(checked ? {} : { allowedDomains: [] }),
                              };
                              setFormProject(newFormProject);

                              if (!checked) {
                                setDomainErrors([]);
                              }

                              // Check section-specific changes
                              if (project) {
                                setBasicInfoChanges(checkBasicInfoChanges(newFormProject));
                                setSecurityPolicyChanges(
                                  checkSecurityPolicyChanges(newFormProject),
                                );
                                setQuotasChanges(checkQuotasChanges(newFormProject));
                              }
                            }}
                            disabled={!canEdit}
                          />
                        </div>
                      </div>

                      {formProject.isFilterByDomain && (
                        <div className="ml-0">
                          <div className="text-foreground mb-2 text-sm font-medium">
                            Allowed domains
                          </div>
                          <div
                            className={`flex flex-wrap gap-1.5 rounded-md border p-2 ${domainErrors.some((error) => error) ? 'border-destructive' : 'border-input'}`}
                          >
                            {(formProject.allowedDomains || []).map((domain, index) => (
                              <span
                                key={index}
                                className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium"
                              >
                                {domain}
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => removeDomainTag(index)}
                                    className="text-primary hover:text-primary/80 ml-0.5"
                                  >
                                    <X className="size-3" />
                                  </button>
                                )}
                              </span>
                            ))}
                            {canEdit && (
                              <input
                                type="text"
                                value={domainInputValue}
                                onChange={(e) => setDomainInputValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ',') {
                                    e.preventDefault();
                                    addDomainTag();
                                  }
                                }}
                                placeholder="Type and press Enter"
                                className="placeholder:text-muted-foreground min-w-[120px] flex-1 border-none bg-transparent text-xs outline-none"
                              />
                            )}
                          </div>
                          {domainErrors.length > 0 && domainErrors.some((error) => error) && (
                            <div className="mt-1 text-xs text-red-600">
                              {domainErrors.map((error, index) =>
                                error ? (
                                  <div key={index}>
                                    Domain {index + 1}: {error}
                                  </div>
                                ) : null,
                              )}
                            </div>
                          )}
                          <div className="text-muted-foreground mt-1 text-xs">
                            Press Enter or comma to add multiple domains. Only requests from these
                            domains will be accepted.
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 pr-20">
                          <div className="text-foreground font-medium">Filter by IP address</div>
                          <div className="text-muted-foreground mt-1">
                            When enabled, only requests from allowed IP addresses will be accepted
                          </div>
                        </div>
                        <div className="ml-4">
                          <Switch
                            checked={formProject.isFilterByIp ?? false}
                            onCheckedChange={(checked) => {
                              const newFormProject = {
                                ...formProject,
                                isFilterByIp: checked,
                                ...(checked ? {} : { allowedIps: [] }),
                              };
                              setFormProject(newFormProject);

                              if (!checked) {
                                setIpErrors([]);
                              }

                              // Check section-specific changes
                              if (project) {
                                setBasicInfoChanges(checkBasicInfoChanges(newFormProject));
                                setSecurityPolicyChanges(
                                  checkSecurityPolicyChanges(newFormProject),
                                );
                                setQuotasChanges(checkQuotasChanges(newFormProject));
                              }
                            }}
                            disabled={!canEdit}
                          />
                        </div>
                      </div>

                      {formProject.isFilterByIp && (
                        <div className="ml-0">
                          <div className="text-foreground mb-2 text-sm font-medium">
                            Allowed IP addresses
                          </div>
                          <div
                            className={`flex flex-wrap gap-1.5 rounded-md border p-2 ${ipErrors.some((error) => error) ? 'border-destructive' : 'border-input'}`}
                          >
                            {(formProject.allowedIps || []).map((ip, index) => (
                              <span
                                key={index}
                                className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium"
                              >
                                {ip}
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => removeIpTag(index)}
                                    className="text-primary hover:text-primary/80 ml-0.5"
                                  >
                                    <X className="size-3" />
                                  </button>
                                )}
                              </span>
                            ))}
                            {canEdit && (
                              <input
                                type="text"
                                value={ipInputValue}
                                onChange={(e) => setIpInputValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ',') {
                                    e.preventDefault();
                                    addIpTag();
                                  }
                                }}
                                placeholder="Type and press Enter"
                                className="placeholder:text-muted-foreground min-w-[120px] flex-1 border-none bg-transparent text-xs outline-none"
                              />
                            )}
                          </div>
                          {ipErrors.length > 0 && ipErrors.some((error) => error) && (
                            <div className="mt-1 text-xs text-red-600">
                              {ipErrors.map((error, index) =>
                                error ? (
                                  <div key={index}>
                                    IP {index + 1}: {error}
                                  </div>
                                ) : null,
                              )}
                            </div>
                          )}
                          <div className="text-muted-foreground mt-1 text-xs">
                            Press Enter or comma to add multiple IP addresses. Supports both IPv4
                            and IPv6 formats.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Security Policies Save Button */}
                  {securityPolicyChanges && canEdit && (
                    <div className="mt-4 flex space-x-2">
                      <Button onClick={saveSecurityPolicies} disabled={isSaving}>
                        {isSaving ? (
                          <>
                            <Spinner size="sm" className="mr-2" />
                            Saving...
                          </>
                        ) : (
                          'Save Changes'
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (project) {
                            const updatedForm = {
                              ...formProject,
                              isApiKeyRequired: project.isApiKeyRequired,
                              isFilterByDomain: project.isFilterByDomain,
                              isFilterByIp: project.isFilterByIp,
                              allowedDomains: project.allowedDomains,
                              allowedIps: project.allowedIps,
                            };
                            setFormProject(updatedForm);
                            setSecurityPolicyChanges(false);
                            setDomainErrors([]);
                            setIpErrors([]);
                          }
                        }}
                        disabled={isSaving}
                      >
                        Reset
                      </Button>
                    </div>
                  )}
                </div>

                {/* Rate Limiting & Quotas */}
                <div className="border-border max-w-2xl border-b pb-6">
                  <h2 className="text-foreground text-base leading-1.5 font-medium">
                    Rate limiting & quotas
                  </h2>

                  <div className="text-muted-foreground mt-3 text-sm">
                    Read more about settings you can{' '}
                    <a
                      href="https://logbull.com/settings"
                      target="_blank"
                      rel="noreferrer"
                      className="!text-primary font-bold"
                    >
                      here
                    </a>
                  </div>

                  {project?.plan?.warningText && (
                    <div className="mt-1 text-orange-600 opacity-60">
                      {project.plan.warningText}
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <div className="text-foreground mb-1 font-medium">Logs per second limit</div>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={formatNumber(formProject.logsPerSecondLimit)}
                        onChange={(e) =>
                          handleFieldChange(
                            'logsPerSecondLimit',
                            parseFormattedNumber(e.target.value),
                          )
                        }
                        disabled={
                          !canEdit || (project.plan && project.plan.logsPerSecondLimit != 0)
                        }
                        className="w-[150px]"
                      />
                      <div className="text-muted-foreground mt-1 text-xs">
                        Maximum logs that can be ingested per second
                      </div>
                    </div>

                    <div>
                      <div className="text-foreground mb-1 font-medium">Maximum log size (KB)</div>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={formatNumber(formProject.maxLogSizeKb)}
                        onChange={(e) =>
                          handleFieldChange('maxLogSizeKb', parseFormattedNumber(e.target.value))
                        }
                        disabled={!canEdit || (project.plan && project.plan.maxLogSizeKb != 0)}
                        className="w-[150px]"
                      />
                      <div className="text-muted-foreground mt-1 text-xs">
                        Maximum size allowed for a single log entry
                      </div>
                    </div>

                    <div>
                      <div className="text-foreground mb-1 font-medium">Maximum logs amount</div>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={formatNumber(formProject.maxLogsAmount)}
                        onChange={(e) =>
                          handleFieldChange('maxLogsAmount', parseFormattedNumber(e.target.value))
                        }
                        disabled={!canEdit || (project.plan && project.plan.maxLogsAmount != 0)}
                        className="w-[150px]"
                      />
                      <div className="text-muted-foreground mt-1 text-xs">
                        Maximum total number of logs that can be stored
                      </div>
                    </div>

                    <div>
                      <div className="text-foreground mb-1 font-medium">
                        Maximum storage size (MB)
                      </div>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={formatNumber(formProject.maxLogsSizeMb)}
                        onChange={(e) =>
                          handleFieldChange('maxLogsSizeMb', parseFormattedNumber(e.target.value))
                        }
                        disabled={!canEdit || (project.plan && project.plan.maxLogsSizeMb != 0)}
                        className="w-[150px]"
                      />
                      <div className="text-muted-foreground mt-1 text-xs">
                        Maximum total storage size for all logs
                      </div>
                    </div>

                    <div>
                      <div className="text-foreground mb-1 font-medium">Log retention (days)</div>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={formatNumber(formProject.maxLogsLifeDays)}
                        onChange={(e) =>
                          handleFieldChange('maxLogsLifeDays', parseFormattedNumber(e.target.value))
                        }
                        disabled={!canEdit || (project.plan && project.plan.maxLogsLifeDays != 0)}
                        className="w-[150px]"
                      />
                      <div className="text-muted-foreground mt-1 text-xs">
                        How long logs should be kept before automatic deletion
                      </div>
                    </div>
                  </div>

                  {/* Rate Limiting & Quotas Save Button */}
                  {quotasChanges && canEdit && (
                    <div className="mt-4 flex space-x-2">
                      <Button onClick={saveQuotas} disabled={isSaving}>
                        {isSaving ? (
                          <>
                            <Spinner size="sm" className="mr-2" />
                            Saving...
                          </>
                        ) : (
                          'Save Changes'
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (project) {
                            const updatedForm = {
                              ...formProject,
                              logsPerSecondLimit: project.logsPerSecondLimit,
                              maxLogsAmount: project.maxLogsAmount,
                              maxLogsSizeMb: project.maxLogsSizeMb,
                              maxLogsLifeDays: project.maxLogsLifeDays,
                              maxLogSizeKb: project.maxLogSizeKb,
                            };
                            setFormProject(updatedForm);
                            setQuotasChanges(false);
                          }
                        }}
                        disabled={isSaving}
                      >
                        Reset
                      </Button>
                    </div>
                  )}
                </div>

                {/* Project Deletion */}
                <div className="border-border max-w-2xl border-b pb-6">
                  <h2 className="text-foreground mb-4 text-base font-medium">Danger Zone</h2>

                  <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-red-900">Delete this project</div>
                        <div className="mt-1 text-sm text-red-700">
                          Once you delete a project, there is no going back. All logs and data
                          associated with this project will be permanently removed.
                        </div>
                      </div>

                      <div className="ml-4">
                        <Button
                          variant="destructive"
                          onClick={() => setIsDeleteDialogOpen(true)}
                          disabled={!canEdit || isDeleting || isSaving}
                        >
                          {isDeleting ? (
                            <>
                              <Spinner size="sm" className="mr-2" />
                              Deleting...
                            </>
                          ) : (
                            'Delete project'
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Project</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div>
                            <p>
                              Are you sure you want to delete the project{' '}
                              <strong>{project.name}</strong>?
                            </p>
                            <p className="mt-2 text-red-600">
                              <strong>This action cannot be undone.</strong> All logs and associated
                              data will be permanently removed.
                            </p>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={handleDeleteProject}>
                          Delete Project
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                {/* Project statistics */}
                <div className="max-w-[300px]">
                  <h2 className="text-foreground mb-4 text-base font-medium">Project statistics</h2>
                  {isLoadingStats ? (
                    <div className="flex items-center py-2">
                      <Spinner size="sm" />
                      <span className="text-muted-foreground ml-2 text-sm">
                        Loading statistics...
                      </span>
                    </div>
                  ) : projectStats ? (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total logs:</span>
                        <span className="font-medium">
                          {projectStats.totalLogs.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Storage size:</span>
                        <span className="font-medium">
                          {projectStats.totalSizeMb.toFixed(2)} MB
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Date range:</span>
                        <span className="font-medium">
                          {dayjs(projectStats.oldestLogTime).format('D MMM YYYY')} -{' '}
                          {dayjs(projectStats.newestLogTime).format('D MMM YYYY')}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-sm">No statistics available</div>
                  )}
                </div>

                <ProjectAuditLogsComponent
                  projectId={project.id}
                  scrollContainerRef={scrollContainerRef}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
