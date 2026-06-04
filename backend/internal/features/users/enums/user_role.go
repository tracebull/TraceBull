package users_enums

type UserRole string

const (
	UserRoleAdmin   UserRole = "ADMIN"
	UserRoleManager UserRole = "MANAGER"
	UserRoleUser    UserRole = "USER"
)

func (r UserRole) IsValid() bool {
	switch r {
	case UserRoleAdmin, UserRoleManager, UserRoleUser:
		return true
	default:
		return false
	}
}
