package users_dto

import (
	"time"

	users_enums "logbull/internal/features/users/enums"

	"github.com/google/uuid"
)

type SignUpRequestDTO struct {
	Email    string `json:"email"    binding:"required"`
	Password string `json:"password" binding:"required,min=8"`
	Name     string `json:"name"     binding:"required"`
}

type SignInRequestDTO struct {
	Email    string `json:"email"    binding:"required"`
	Password string `json:"password" binding:"required"`
}

type SignInResponseDTO struct {
	UserID uuid.UUID `json:"userId"`
	Email  string    `json:"email"`
	Token  string    `json:"token"`
}

type SetAdminPasswordRequestDTO struct {
	Password string `json:"password" binding:"required,min=8"`
}

type IsAdminHasPasswordResponseDTO struct {
	HasPassword bool `json:"hasPassword"`
}

type ChangePasswordRequestDTO struct {
	NewPassword string `json:"newPassword" binding:"required,min=8"`
}

type UpdateUserInfoRequestDTO struct {
	Name  *string `json:"name"`
	Email *string `json:"email" binding:"omitempty,email"`
}

type InviteUserRequestDTO struct {
	Email               string                   `json:"email"               binding:"required,email"`
	IntendedProjectID   *uuid.UUID               `json:"intendedProjectId"`
	IntendedProjectRole *users_enums.ProjectRole `json:"intendedProjectRole"`
}

type InviteUserResponseDTO struct {
	ID                  uuid.UUID                `json:"id"`
	Email               string                   `json:"email"`
	IntendedProjectID   *uuid.UUID               `json:"intendedProjectId"`
	IntendedProjectRole *users_enums.ProjectRole `json:"intendedProjectRole"`
	CreatedAt           time.Time                `json:"createdAt"`
}

type UserProfileResponseDTO struct {
	ID        uuid.UUID            `json:"id"`
	Email     string               `json:"email"`
	Name      string               `json:"name"`
	Role      users_enums.UserRole `json:"role"`
	IsActive  bool                 `json:"isActive"`
	CreatedAt time.Time            `json:"createdAt"`
}

type ListUsersResponseDTO struct {
	Users []UserProfileResponseDTO `json:"users"`
	Total int64                    `json:"total"`
}

type ChangeUserRoleRequestDTO struct {
	Role users_enums.UserRole `json:"role" binding:"required"`
}

type ListUsersRequestDTO struct {
	Limit      int        `form:"limit"      json:"limit"`
	Offset     int        `form:"offset"     json:"offset"`
	BeforeDate *time.Time `form:"beforeDate" json:"beforeDate"`
	Query      string     `form:"query"      json:"query"`
}

type CreatePlanRequestDTO struct {
	Name                 string                   `json:"name"                 binding:"required"`
	Type                 users_enums.UserPlanType `json:"type"                 binding:"required"`
	IsPublic             bool                     `json:"isPublic"`
	WarningText          string                   `json:"warningText"`
	UpgradeText          string                   `json:"upgradeText"`
	LogsPerSecondLimit   int                      `json:"logsPerSecondLimit"   binding:"gte=0"`
	MaxLogsAmount        int64                    `json:"maxLogsAmount"        binding:"gte=0"`
	MaxLogsSizeMB        int                      `json:"maxLogsSizeMb"        binding:"gte=0"`
	MaxLogsLifeDays      int                      `json:"maxLogsLifeDays"      binding:"gte=0"`
	MaxLogSizeKB         int                      `json:"maxLogSizeKb"         binding:"gte=0"`
	AllowedProjectsCount int                      `json:"allowedProjectsCount" binding:"gte=0"`
}

type UpdatePlanRequestDTO struct {
	Name                 *string                   `json:"name"`
	Type                 *users_enums.UserPlanType `json:"type"`
	IsPublic             *bool                     `json:"isPublic"`
	WarningText          *string                   `json:"warningText"`
	UpgradeText          *string                   `json:"upgradeText"`
	LogsPerSecondLimit   *int                      `json:"logsPerSecondLimit"`
	MaxLogsAmount        *int64                    `json:"maxLogsAmount"`
	MaxLogsSizeMB        *int                      `json:"maxLogsSizeMb"`
	MaxLogsLifeDays      *int                      `json:"maxLogsLifeDays"`
	MaxLogSizeKB         *int                      `json:"maxLogSizeKb"`
	AllowedProjectsCount *int                      `json:"allowedProjectsCount"`
}

type CountByPlanResponseDTO struct {
	Count int64 `json:"count"`
}

type BulkInviteRequestDTO struct {
	Emails []string `json:"emails" binding:"required,min=1,dive,required,email"`
}

type BulkInviteResponseDTO struct {
	Invited []BulkInviteResultDTO `json:"invited"`
	Skipped []BulkInviteResultDTO `json:"skipped"`
}

type BulkInviteResultDTO struct {
	Email string    `json:"email"`
	ID    uuid.UUID `json:"id,omitempty"`
}

type OAuthCallbackRequestDTO struct {
	Code        string `json:"code"        binding:"required"`
	RedirectUri string `json:"redirectUri" binding:"required"`
}

type OAuthCallbackResponseDTO struct {
	UserID    uuid.UUID `json:"userId"`
	Email     string    `json:"email"`
	Token     string    `json:"token"`
	IsNewUser bool      `json:"isNewUser"`
}

type CreateUserRequestDTO struct {
	Name     string                  `json:"name"     binding:"required"`
	Email    string                  `json:"email"    binding:"required,email"`
	Password string                  `json:"password" binding:"required,min=8"`
	Role     users_enums.UserRole    `json:"role"     binding:"required"`
}
