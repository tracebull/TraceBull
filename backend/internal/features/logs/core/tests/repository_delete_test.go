package logs_core_tests

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	logs_core "logbull/internal/features/logs/core"
)

func Test_DeleteLogsByProject_WithNonExistentProject_DoesNotFail(t *testing.T) {
	repository := logs_core.GetLogStorage()
	nonExistentProjectID := uuid.New()

	err := repository.DeleteLogsByProject(nonExistentProjectID)
	assert.NoError(t, err, "Deleting logs for non-existent project should not fail")
}

func Test_DeleteOldLogs_WithNoOldLogs_DoesNotFail(t *testing.T) {
	repository := logs_core.GetLogStorage()
	projectID := uuid.New()
	uniqueTestSession := uuid.New().String()[:8]
	currentTime := time.Now().UTC()

	recentLogEntries := CreateTestLogEntriesWithUniqueFields(projectID, currentTime.Add(-1*time.Hour),
		"Recent log", map[string]any{
			"test_session": uniqueTestSession,
		})

	StoreTestLogsAndFlush(t, repository, recentLogEntries)

	cutoffTime := currentTime.Add(-48 * time.Hour)
	err := repository.DeleteOldLogs(projectID, cutoffTime)
	assert.NoError(t, err, "Deleting old logs when none exist should not fail")

	verificationQuery := &logs_core.LogQueryRequestDTO{
		Query: &logs_core.QueryNode{
			Type: logs_core.QueryNodeTypeCondition,
			Condition: &logs_core.ConditionNode{
				Field:    "test_session",
				Operator: logs_core.ConditionOperatorEquals,
				Value:    uniqueTestSession,
			},
		},
		Limit: 10,
	}

	verificationResult, err := repository.ExecuteQueryForProject(projectID, verificationQuery)
	assert.NoError(t, err)

	assert.GreaterOrEqual(t, verificationResult.Total, int64(1), "Recent logs should still exist")
}
