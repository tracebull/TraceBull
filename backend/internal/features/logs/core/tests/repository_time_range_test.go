package logs_core_tests

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	logs_core "logbull/internal/features/logs/core"
)

func Test_ExecuteQueryForProject_WithSpecificTimeRange_ReturnsOnlyLogsInRange(t *testing.T) {
	repository := logs_core.GetLogStorage()
	projectID := uuid.New()
	uniqueTestSession := uuid.New().String()[:8]

	currentTime := time.Now().UTC()
	oldLogTime := currentTime.Add(-48 * time.Hour)
	recentLogTime := currentTime.Add(-2 * time.Hour)

	oldLogEntries := CreateTestLogEntriesWithMessageAndFields(projectID, oldLogTime, "Old log message",
		map[string]any{"test_session": uniqueTestSession})
	recentLogEntries := CreateTestLogEntriesWithMessageAndFields(projectID, recentLogTime, "Recent log message",
		map[string]any{"test_session": uniqueTestSession})

	oldStoreErr := repository.StoreLogsBatch(oldLogEntries)
	assert.NoError(t, oldStoreErr, "Failed to store old test data")

	recentStoreErr := repository.StoreLogsBatch(recentLogEntries)
	assert.NoError(t, recentStoreErr, "Failed to store recent test data")

	WaitForLogsToBeQueryable(t, repository, projectID, 2, 30_000)

	timeRangeStart := currentTime.Add(-4 * time.Hour)
	timeRangeEnd := currentTime

	timeRangeQuery := &logs_core.LogQueryRequestDTO{
		Query: &logs_core.QueryNode{
			Type: logs_core.QueryNodeTypeCondition,
			Condition: &logs_core.ConditionNode{
				Field:    "message",
				Operator: logs_core.ConditionOperatorContains,
				Value:    "log message",
			},
		},
		TimeRange: &logs_core.TimeRangeDTO{
			From: &timeRangeStart,
			To:   &timeRangeEnd,
		},
		Limit: 100,
	}

	timeRangeResult, timeRangeErr := repository.ExecuteQueryForProject(projectID, timeRangeQuery)
	assert.NoError(t, timeRangeErr, "Failed to execute time range query")
	assert.NotNil(t, timeRangeResult)

	for _, logEntry := range timeRangeResult.Logs {
		assert.True(t, logEntry.Timestamp.After(timeRangeStart) || logEntry.Timestamp.Equal(timeRangeStart),
			"Log timestamp %v should be after or equal to range start %v", logEntry.Timestamp, timeRangeStart)
		assert.True(t, logEntry.Timestamp.Before(timeRangeEnd) || logEntry.Timestamp.Equal(timeRangeEnd),
			"Log timestamp %v should be before or equal to range end %v", logEntry.Timestamp, timeRangeEnd)
	}
}
