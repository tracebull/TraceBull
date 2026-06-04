package users_services

import (
	"fmt"

	users_interfaces "logbull/internal/features/users/interfaces"
	users_models "logbull/internal/features/users/models"
	users_repositories "logbull/internal/features/users/repositories"
)

type SettingsService struct {
	userSettingsRepository *users_repositories.UsersSettingsRepository
	auditLogWriter         users_interfaces.AuditLogWriter
}

func (s *SettingsService) SetAuditLogWriter(writer users_interfaces.AuditLogWriter) {
	s.auditLogWriter = writer
}

func (s *SettingsService) GetSettings() (*users_models.UsersSettings, error) {
	return s.userSettingsRepository.GetSettings()
}

func (s *SettingsService) UpdateSettings(
	request users_models.UsersSettings,
	updatedBy *users_models.User,
) (*users_models.UsersSettings, error) {
	if !updatedBy.CanUpdateSettings() {
		return nil, fmt.Errorf("insufficient permissions to update settings")
	}

	existingSettings, err := s.userSettingsRepository.GetSettings()
	if err != nil {
		return nil, fmt.Errorf("failed to get current settings: %w", err)
	}

	auditLogMessages := []string{}

	if request.IsAllowExternalRegistrations != existingSettings.IsAllowExternalRegistrations {
		oldValue := existingSettings.IsAllowExternalRegistrations
		auditLogMessages = append(
			auditLogMessages,
			fmt.Sprintf(
				"isAllowExternalRegistrations: %t -> %t",
				oldValue,
				request.IsAllowExternalRegistrations,
			),
		)
		existingSettings.IsAllowExternalRegistrations = request.IsAllowExternalRegistrations
	}

	if request.IsAllowManagerInvitations != existingSettings.IsAllowManagerInvitations {
		oldValue := existingSettings.IsAllowManagerInvitations
		auditLogMessages = append(
			auditLogMessages,
			fmt.Sprintf(
				"isAllowManagerInvitations: %t -> %t",
				oldValue,
				request.IsAllowManagerInvitations,
			),
		)
		existingSettings.IsAllowManagerInvitations = request.IsAllowManagerInvitations
	}

	if request.IsManagerAllowedToCreateProjects != existingSettings.IsManagerAllowedToCreateProjects {
		oldValue := existingSettings.IsManagerAllowedToCreateProjects
		auditLogMessages = append(
			auditLogMessages,
			fmt.Sprintf(
				"isManagerAllowedToCreateProjects: %t -> %t",
				oldValue,
				request.IsManagerAllowedToCreateProjects,
			),
		)
		existingSettings.IsManagerAllowedToCreateProjects = request.IsManagerAllowedToCreateProjects
	}

	if err := s.userSettingsRepository.UpdateSettings(existingSettings); err != nil {
		return nil, fmt.Errorf("failed to update settings: %w", err)
	}

	for _, message := range auditLogMessages {
		s.auditLogWriter.WriteAuditLog(
			message,
			&updatedBy.ID,
			nil,
		)
	}

	return existingSettings, nil
}
