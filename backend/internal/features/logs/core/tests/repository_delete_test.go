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

func Test_DeleteLogsByProject_WithValidProject_Succeeds(t *testing.T) {
	repository := logs_core.GetLogStorage()
	projectID := uuid.New()
	uniqueTestSession := uuid.New().String()[:8]
	currentTime := time.Now().UTC()

	testLogEntries := CreateTestLogEntriesWithUniqueFields(projectID, currentTime,
		"Log to be deleted", map[string]any{
			"test_session": uniqueTestSession,
		})

	StoreTestLogsAndFlush(t, repository, testLogEntries)
	WaitForLogsToBeQueryable(t, repository, projectID, 1, 30_000)

	err := repository.DeleteLogsByProject(projectID)
	assert.NoError(t, err, "Deleting logs for valid project should not fail")
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
	WaitForLogsToBeQueryable(t, repository, projectID, 1, 30_000)

	cutoffTime := currentTime.Add(-48 * time.Hour)
	err := repository.DeleteOldLogs(projectID, cutoffTime)
	assert.NoError(t, err, "Deleting old logs when none exist should not fail")
}
