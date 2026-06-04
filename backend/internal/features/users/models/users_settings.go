package users_models

import "github.com/google/uuid"

type UsersSettings struct {
	ID uuid.UUID `json:"id"                              gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	// means that any user can register via sign up form without invitation
	IsAllowExternalRegistrations bool `json:"isAllowExternalRegistrations"    gorm:"column:is_allow_external_registrations"`
	// means that any user with role MANAGER can invite other users
	IsAllowManagerInvitations bool `json:"isAllowManagerInvitations"        gorm:"column:is_allow_manager_invitations"`
	// means that any user with role MANAGER can create their own projects
	IsManagerAllowedToCreateProjects bool `json:"isManagerAllowedToCreateProjects" gorm:"column:is_manager_allowed_to_create_projects"`
}

func (UsersSettings) TableName() string {
	return "users_settings"
}
