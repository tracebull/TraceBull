import { toastMessage } from '@/shared/lib/toastMessage';
import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

import { userApi } from '../../../entity/users/api/userApi';
import type { ChangePasswordRequest } from '../../../entity/users/model/ChangePasswordRequest';
import type { SignInRequest } from '../../../entity/users/model/SignInRequest';
import type { UpdateUserInfoRequest } from '../../../entity/users/model/UpdateUserInfoRequest';
import type { UserProfile } from '../../../entity/users/model/UserProfile';
import { UserRole } from '../../../entity/users/model/UserRole';

const getRoleDisplayText = (role: UserRole): string => {
  switch (role) {
    case UserRole.ADMIN:
      return 'Admin';
    case UserRole.MANAGER:
      return 'Manager';
    case UserRole.USER:
      return 'User';
    default:
      return role;
  }
};

export function ProfileComponent() {
  const [user, setUser] = useState<UserProfile | undefined>(undefined);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Profile edit state
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [editNameError, setEditNameError] = useState(false);
  const [editEmailError, setEditEmailError] = useState(false);

  // Password change form state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newPasswordVisible, setNewPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);

  // Error states
  const [newPasswordError, setNewPasswordError] = useState(false);
  const [confirmPasswordError, setConfirmPasswordError] = useState(false);

  useEffect(() => {
    loadUserProfile();
  }, []);

  const loadUserProfile = () => {
    userApi
      .getCurrentUser()
      .then((user) => {
        setUser(user);
        setEditName(user.name);
        setEditEmail(user.email);
      })
      .catch((error) => {
        toastMessage.error(error.message);
      });
  };

  const validatePasswordFields = (): boolean => {
    let isValid = true;

    if (!newPassword) {
      setNewPasswordError(true);
      isValid = false;
    } else if (newPassword.length < 6) {
      setNewPasswordError(true);
      toastMessage.error('Password must be at least 6 characters long');
      isValid = false;
    } else {
      setNewPasswordError(false);
    }

    if (!confirmPassword) {
      setConfirmPasswordError(true);
      isValid = false;
    } else if (newPassword !== confirmPassword) {
      setConfirmPasswordError(true);
      toastMessage.error('New passwords do not match');
      isValid = false;
    } else {
      setConfirmPasswordError(false);
    }

    return isValid;
  };

  const handlePasswordChange = async () => {
    if (!validatePasswordFields()) {
      return;
    }

    setIsChangingPassword(true);

    try {
      const request: ChangePasswordRequest = {
        newPassword,
      };

      await userApi.changePassword(request);

      // Reset form fields
      setNewPassword('');
      setConfirmPassword('');

      // Sign in again with new password
      if (user?.email) {
        try {
          const signInRequest: SignInRequest = {
            email: user.email,
            password: newPassword,
          };
          await userApi.signIn(signInRequest);
          toastMessage.success('Successfully signed in with new password');
        } catch (signInError: unknown) {
          const errorMessage =
            signInError instanceof Error
              ? signInError.message
              : 'Failed to sign in with new password';
          toastMessage.error(errorMessage);
          // If sign in fails, logout and redirect to login page
          await userApi.logout();
          userApi.notifyAuthListeners();
          window.location.reload();
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to change password';
      toastMessage.error(errorMessage);
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleProfileUpdate = async () => {
    // Validate name
    if (!editName || editName.trim() === '') {
      setEditNameError(true);
      toastMessage.error('Name is required');
      return;
    }
    setEditNameError(false);

    // Validate email (only if not admin)
    if (user?.email !== 'admin') {
      if (!editEmail || editEmail.trim() === '') {
        setEditEmailError(true);
        toastMessage.error('Email is required');
        return;
      }
      setEditEmailError(false);
    }

    setIsUpdatingProfile(true);

    try {
      const request: UpdateUserInfoRequest = {};

      // Only include fields that changed
      if (editName !== user?.name) {
        request.name = editName;
      }
      // Only include email if not admin and changed
      if (user?.email !== 'admin' && editEmail !== user?.email) {
        request.email = editEmail;
      }

      // If nothing changed, just show a message
      if (Object.keys(request).length === 0) {
        toastMessage.info('No changes to save');
        setIsUpdatingProfile(false);
        return;
      }

      await userApi.updateUserInfo(request);
      toastMessage.success('Profile updated successfully');

      // Reload user profile
      loadUserProfile();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update profile';
      toastMessage.error(errorMessage);
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleLogout = async () => {
    await userApi.logout();
    window.location.reload();
  };

  return (
    <div className="flex h-full pl-3">
      <div className="h-full w-full">
        <div className="h-full overflow-y-auto p-6">
          <div className="mt-5">
            {user ? (
              <>
                <div className="mb-6">
                  <h3 className="mb-4 text-base font-medium">Profile Information</h3>
                  <div className="max-w-md">
                    <div className="mb-2 text-xs font-semibold">User ID</div>
                    <div className="text-muted-foreground mb-4 text-sm">{user.id}</div>

                    <div className="mb-1 text-xs font-semibold">Name</div>
                    <Input
                      value={editName}
                      onChange={(e) => {
                        setEditNameError(false);
                        setEditName(e.currentTarget.value);
                      }}
                      placeholder="Enter your name"
                      className={`mb-4 ${editNameError ? 'border-destructive' : ''}`}
                    />

                    <div className="mt-2 mb-1 text-xs font-semibold">Email</div>
                    <Input
                      value={editEmail}
                      onChange={(e) => {
                        setEditEmailError(false);
                        setEditEmail(e.currentTarget.value.trim().toLowerCase());
                      }}
                      placeholder="Enter your email"
                      type="email"
                      className={`mb-4 ${editEmailError ? 'border-destructive' : ''}`}
                      disabled={user.email === 'admin'}
                    />
                    {user.email === 'admin' && (
                      <div className="text-muted-foreground mb-4 text-xs">
                        Admin email cannot be changed
                      </div>
                    )}

                    <div className="mt-2 mb-1 text-xs font-semibold">Role</div>
                    <div className="mb-4">
                      <span className="bg-secondary text-secondary-foreground inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium">
                        {getRoleDisplayText(user.role)}
                      </span>
                    </div>

                    {(editName !== user.name || editEmail !== user.email) && (
                      <Button onClick={handleProfileUpdate} disabled={isUpdatingProfile}>
                        {isUpdatingProfile ? (
                          <>
                            <Spinner size="sm" className="mr-2" />
                            Saving...
                          </>
                        ) : (
                          'Save changes'
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mb-8">
                  <Button variant="destructive" onClick={handleLogout}>
                    Logout
                  </Button>
                </div>

                <div className="max-w-xs pt-6">
                  <h3 className="mb-4 text-base font-medium">Change Password</h3>

                  <div className="max-w-sm">
                    <div className="my-1 text-xs font-semibold">New Password</div>
                    <div className="relative mb-2">
                      <Input
                        type={newPasswordVisible ? 'text' : 'password'}
                        placeholder="Enter new password"
                        value={newPassword}
                        onChange={(e) => {
                          setNewPasswordError(false);
                          setNewPassword(e.currentTarget.value);
                        }}
                        className={newPasswordError ? 'border-destructive pr-9' : 'pr-9'}
                      />
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
                        onClick={() => setNewPasswordVisible(!newPasswordVisible)}
                      >
                        {newPasswordVisible ? (
                          <Eye className="size-4" />
                        ) : (
                          <EyeOff className="size-4" />
                        )}
                      </button>
                    </div>

                    <div className="mt-2 mb-1 text-xs font-semibold">Confirm New Password</div>
                    <div className="relative mb-2">
                      <Input
                        type={confirmPasswordVisible ? 'text' : 'password'}
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPasswordError(false);
                          setConfirmPassword(e.currentTarget.value);
                        }}
                        className={confirmPasswordError ? 'border-destructive pr-9' : 'pr-9'}
                      />
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
                        onClick={() => setConfirmPasswordVisible(!confirmPasswordVisible)}
                      >
                        {confirmPasswordVisible ? (
                          <Eye className="size-4" />
                        ) : (
                          <EyeOff className="size-4" />
                        )}
                      </button>
                    </div>

                    <div className="mt-3" />

                    {(newPassword || confirmPassword) && (
                      <Button onClick={handlePasswordChange} disabled={isChangingPassword}>
                        {isChangingPassword ? (
                          <>
                            <Spinner size="sm" className="mr-2" />
                            Changing password...
                          </>
                        ) : (
                          'Change password'
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div>
                <Spinner />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
