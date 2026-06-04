package audit_logs

import (
	"testing"
	"time"

	audit_logs_dto "logbull/internal/features/audit_logs/dto"
	audit_logs_services "logbull/internal/features/audit_logs/services"
	user_enums "logbull/internal/features/users/enums"
	users_testing "logbull/internal/features/users/testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func Test_AuditLogs_ProjectSpecificLogs(t *testing.T) {
	service := GetAuditLogService()
	user1 := users_testing.CreateTestUser(user_enums.UserRoleManager)
	user2 := users_testing.CreateTestUser(user_enums.UserRoleManager)
	project1ID, project2ID := uuid.New(), uuid.New()

	createAuditLog(service, "Test project1 log first", &user1.UserID, &project1ID)
	createAuditLog(service, "Test project1 log second", &user2.UserID, &project1ID)
	createAuditLog(service, "Test project2 log first", &user1.UserID, &project2ID)
	createAuditLog(service, "Test project2 log second", &user2.UserID, &project2ID)
	createAuditLog(service, "Test no project log", &user1.UserID, nil)

	request := &audit_logs_dto.GetAuditLogsRequest{Limit: 10, Offset: 0}

	project1Response, err := service.GetProjectAuditLogs(project1ID, request)
	assert.NoError(t, err)
	assert.Equal(t, 2, len(project1Response.AuditLogs))

	messages := extractMessages(project1Response.AuditLogs)
	assert.Contains(t, messages, "Test project1 log first")
	assert.Contains(t, messages, "Test project1 log second")
	for _, log := range project1Response.AuditLogs {
		assert.Equal(t, &project1ID, log.ProjectID)
	}

	project2Response, err := service.GetProjectAuditLogs(project2ID, request)
	assert.NoError(t, err)
	assert.Equal(t, 2, len(project2Response.AuditLogs))

	messages2 := extractMessages(project2Response.AuditLogs)
	assert.Contains(t, messages2, "Test project2 log first")
	assert.Contains(t, messages2, "Test project2 log second")

	limitedResponse, err := service.GetProjectAuditLogs(project1ID,
		&audit_logs_dto.GetAuditLogsRequest{Limit: 1, Offset: 0})
	assert.NoError(t, err)
	assert.Equal(t, 1, len(limitedResponse.AuditLogs))
	assert.Equal(t, 1, limitedResponse.Limit)

	beforeTime := time.Now().UTC().Add(-1 * time.Minute)
	filteredResponse, err := service.GetProjectAuditLogs(project1ID,
		&audit_logs_dto.GetAuditLogsRequest{Limit: 10, BeforeDate: &beforeTime})
	assert.NoError(t, err)
	for _, log := range filteredResponse.AuditLogs {
		assert.True(t, log.CreatedAt.Before(beforeTime))
		assert.NotNil(t, log.UserEmail, "User email should be present for logs with user_id")
		assert.NotNil(t, log.ProjectName, "Project name should be present for logs with project_id")
	}
}

func createAuditLog(service *audit_logs_services.AuditLogService, message string, userID, projectID *uuid.UUID) {
	service.WriteAuditLog(message, userID, projectID)
}

func extractMessages(logs []*audit_logs_dto.AuditLogDTO) []string {
	messages := make([]string, len(logs))
	for i, log := range logs {
		messages[i] = log.Message
	}
	return messages
}
