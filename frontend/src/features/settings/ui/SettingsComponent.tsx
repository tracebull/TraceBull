import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';

import { IS_CLOUD, getApplicationServer } from '../../../constants';
import { queryApi } from '../../../entity/query/api/queryApi';
import type { LogsStats } from '../../../entity/query/model/ProjectLogStats';
import { settingsApi } from '../../../entity/users/api/settingsApi';
import type { UsersSettings } from '../../../entity/users/model/UsersSettings';
import { toastMessage } from '../../../shared/lib/toastMessage';
import { AuditLogsComponent } from './AuditLogsComponent';
import { PlansSettingsComponent } from './PlansSettingsComponent';

export function SettingsComponent() {
  const [settings, setSettings] = useState<UsersSettings | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // System stats state
  const [systemStats, setSystemStats] = useState<LogsStats | undefined>(undefined);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Scroll container ref for audit logs lazy loading
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Form state to track changes
  const [formSettings, setFormSettings] = useState<UsersSettings>({
    isAllowExternalRegistrations: false,
    isAllowManagerInvitations: false,
    isManagerAllowedToCreateProjects: false,
  });

  useEffect(() => {
    loadSettings();
    loadSystemStats();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);

    try {
      const currentSettings = await settingsApi.getSettings();
      setSettings(currentSettings);
      setFormSettings(currentSettings);
      setHasChanges(false);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load settings';
      toastMessage.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSystemStats = async () => {
    setIsLoadingStats(true);

    try {
      const stats = await queryApi.getSystemStats();
      setSystemStats(stats);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load system statistics';
      toastMessage.error(errorMessage);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const handleSettingChange = (key: keyof UsersSettings, value: boolean) => {
    const newFormSettings = { ...formSettings, [key]: value };
    setFormSettings(newFormSettings);

    // Check if there are changes from the original settings
    if (settings) {
      const hasAnyChanges = Object.keys(newFormSettings).some(
        (settingKey) =>
          newFormSettings[settingKey as keyof UsersSettings] !==
          settings[settingKey as keyof UsersSettings],
      );
      setHasChanges(hasAnyChanges);
    }
  };

  const handleSave = async () => {
    if (!hasChanges) return;

    setIsSaving(true);
    try {
      const updatedSettings = await settingsApi.updateSettings(formSettings);
      setSettings(updatedSettings);
      setFormSettings(updatedSettings);
      setHasChanges(false);
      toastMessage.success('Settings updated successfully');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update settings';
      toastMessage.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (settings) {
      setFormSettings(settings);
      setHasChanges(false);
    }
  };

  return (
    <div className="flex h-full pl-3">
      <div className="h-full w-full">
        <div ref={scrollContainerRef} className="h-full overflow-y-auto p-6">
          <div className="mt-6">
            {isLoading ? (
              <div>
                <Spinner />
              </div>
            ) : (
              <div className="max-w-lg text-sm">
                <div className="space-y-6">
                  {/* External Registrations Setting */}
                  <div className="border-border flex items-start justify-between border-b pb-4">
                    <div className="flex-1 pr-20">
                      <div className="text-foreground font-medium">
                        Allow external registrations
                      </div>
                      <div className="text-muted-foreground mt-1">
                        When enabled, new users can register accounts in TraceBull. If disabled, new
                        users can only register via invitation
                      </div>
                    </div>

                    <div className="ml-4">
                      <Switch
                        checked={formSettings.isAllowExternalRegistrations}
                        onCheckedChange={(checked) =>
                          handleSettingChange('isAllowExternalRegistrations', checked)
                        }
                        className="data-[state=checked]:bg-primary"
                      />
                    </div>
                  </div>

                  {/* Manager Invitations Setting */}
                  {!formSettings.isAllowExternalRegistrations && (
                    <div className="border-border flex items-start justify-between border-b pb-4">
                      <div className="flex-1 pr-20">
                        <div className="text-foreground font-medium">Allow manager invitations</div>

                        <div className="text-muted-foreground mt-1">
                          When enabled, existing managers can invite new users to join TraceBull. If
                          not - only admins can invite users.
                        </div>
                      </div>

                      <div className="ml-4">
                        <Switch
                          checked={formSettings.isAllowManagerInvitations}
                          onCheckedChange={(checked) =>
                            handleSettingChange('isAllowManagerInvitations', checked)
                          }
                          className="data-[state=checked]:bg-primary"
                        />
                      </div>
                    </div>
                  )}

                  {/* Manager Project Creation Setting */}
                  <div className="border-border flex items-start justify-between border-b pb-4">
                    <div className="flex-1 pr-20">
                      <div className="text-foreground font-medium">Managers can create projects</div>

                      <div className="text-muted-foreground mt-1">
                        When enabled, managers can create new projects. If not - only admins can
                        create projects.
                      </div>
                    </div>
                    <div className="ml-4">
                      <Switch
                        checked={formSettings.isManagerAllowedToCreateProjects}
                        onCheckedChange={(checked) =>
                          handleSettingChange('isManagerAllowedToCreateProjects', checked)
                        }
                        className="data-[state=checked]:bg-primary"
                      />
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                {hasChanges && (
                  <div className="mt-8 flex space-x-2">
                    <Button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {isSaving && <Spinner size="sm" className="mr-2" />}
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </Button>

                    <Button variant="outline" onClick={handleReset} disabled={isSaving}>
                      Reset
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="text-muted-foreground mt-3 text-sm">
            Read more about settings you can{' '}
            <a href="#" target="_blank" rel="noreferrer" className="!text-primary">
              here
            </a>
          </div>

          {/* Health-check Information */}
          <div className="my-8 max-w-2xl">
            <h2 className="mb-3 text-base font-medium">Health-check</h2>

            <div className="group relative">
              <div className="border-input bg-muted text-foreground flex items-center rounded-md border px-3 py-2 !font-mono text-sm">
                <code
                  className="hover:text-primary flex-1 cursor-pointer transition-colors select-all"
                  onClick={() => {
                    window.open(
                      `${getApplicationServer()}/api/v1/downdetect/is-available`,
                      '_blank',
                    );
                  }}
                  title="Click to open in new tab"
                >
                  {getApplicationServer()}/api/v1/downdetect/is-available
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-2 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${getApplicationServer()}/api/v1/downdetect/is-available`,
                    );
                    toastMessage.success('Health-check endpoint copied to clipboard');
                  }}
                >
                  📋
                </Button>
              </div>
              <div className="text-muted-foreground mt-1 text-xs">
                Use this endpoint to monitor your TraceBull system&apos;s availability
              </div>
            </div>
          </div>

          {/* System statistics */}
          <div className="my-8 max-w-[300px]">
            <h2 className="text-foreground mb-4 text-base font-medium">System statistics</h2>
            {isLoadingStats ? (
              <div className="flex items-center py-2">
                <Spinner />
                <span className="text-muted-foreground ml-2 text-sm">Loading statistics...</span>
              </div>
            ) : systemStats ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total logs:</span>
                  <span className="font-medium">{systemStats.totalLogs.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Storage size:</span>
                  <span className="font-medium">{systemStats.totalSizeMb.toFixed(2)} MB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date range:</span>
                  <span className="font-medium">
                    {dayjs(systemStats.oldestLogTime).format('D MMM YYYY')} -{' '}
                    {dayjs(systemStats.newestLogTime).format('D MMM YYYY')}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">No statistics available</div>
            )}
          </div>

          {/* Plans settings */}
          {IS_CLOUD && <PlansSettingsComponent />}

          <AuditLogsComponent scrollContainerRef={scrollContainerRef} />
        </div>
      </div>
    </div>
  );
}
