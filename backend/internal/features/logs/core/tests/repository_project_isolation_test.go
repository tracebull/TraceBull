package logs_core_tests

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	logs_core "logbull/internal/features/logs/core"
)

func Test_ExecuteQueryForProject_MultipleProjects_OnlyReturnsRequestedProject(t *testing.T) {
	repository := logs_core.GetLogStorage()
	currentTime := time.Now().UTC()
	uniqueTestSession := uuid.New().String()[:8]

	project1 := uuid.New()
	project2 := uuid.New()
	project3 := uuid.New()

	project1Logs := CreateTestLogEntriesWithUniqueFields(project1, currentTime,
		"Project 1 log message", map[string]any{
			"test_session": uniqueTestSession,
			"project_name": "project_one",
			"priority":     "high",
		})

	project2Logs := CreateTestLogEntriesWithUniqueFields(project2, currentTime.Add(1*time.Second),
		"Project 2 log message", map[string]any{
			"test_session": uniqueTestSession,
			"project_name": "project_two",
			"priority":     "medium",
		})

	project3Logs := CreateTestLogEntriesWithUniqueFields(project3, currentTime.Add(2*time.Second),
		"Project 3 log message", map[string]any{
			"test_session": uniqueTestSession,
			"project_name": "project_three",
			"priority":     "low",
		})

	allLogs := MergeLogEntries(project1Logs, project2Logs)
	allLogs = MergeLogEntries(allLogs, project3Logs)
	StoreTestLogsAndFlush(t, repository, allLogs)

	WaitForLogsToBeQueryable(t, repository, project1, 1, 30_000)
	WaitForLogsToBeQueryable(t, repository, project2, 1, 30_000)
	WaitForLogsToBeQueryable(t, repository, project3, 1, 30_000)

	project1Query := &logs_core.LogQueryRequestDTO{
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

	project1Result, err := repository.ExecuteQueryForProject(project1, project1Query)
	assert.NoError(t, err)
	assert.Equal(t, int64(1), project1Result.Total)
	assert.Len(t, project1Result.Logs, 1)
	assert.Equal(t, "Project 1 log message", project1Result.Logs[0].Message)
	assert.Equal(t, "project_one", project1Result.Logs[0].Fields["project_name"])

	project2Result, err := repository.ExecuteQueryForProject(project2, project1Query)
	assert.NoError(t, err)
	assert.Equal(t, int64(1), project2Result.Total)
	assert.Len(t, project2Result.Logs, 1)
	assert.Equal(t, "Project 2 log message", project2Result.Logs[0].Message)
	assert.Equal(t, "project_two", project2Result.Logs[0].Fields["project_name"])

	project3Result, err := repository.ExecuteQueryForProject(project3, project1Query)
	assert.NoError(t, err)
	assert.Equal(t, int64(1), project3Result.Total)
	assert.Len(t, project3Result.Logs, 1)
	assert.Equal(t, "Project 3 log message", project3Result.Logs[0].Message)
	assert.Equal(t, "project_three", project3Result.Logs[0].Fields["project_name"])
}

func Test_ExecuteQueryForProject_SameLogContent_DifferentProjects_IsolatedCorrectly(t *testing.T) {
	repository := logs_core.GetLogStorage()
	currentTime := time.Now().UTC()
	uniqueTestSession := uuid.New().String()[:8]

	project1 := uuid.New()
	project2 := uuid.New()

	identicalMessage := "Identical log message for isolation test"
	identicalFields := map[string]any{
		"test_session": uniqueTestSession,
		"component":    "auth-service",
		"action":       "user_login",
		"status":       "success",
	}

	project1Logs := CreateTestLogEntriesWithUniqueFields(project1, currentTime, identicalMessage, identicalFields)
	project2Logs := CreateTestLogEntriesWithUniqueFields(project2, currentTime, identicalMessage, identicalFields)

	allLogs := MergeLogEntries(project1Logs, project2Logs)
	StoreTestLogsAndFlush(t, repository, allLogs)

	WaitForLogsToBeQueryable(t, repository, project1, 1, 30_000)
	WaitForLogsToBeQueryable(t, repository, project2, 1, 30_000)

	query := &logs_core.LogQueryRequestDTO{
		Query: &logs_core.QueryNode{
			Type: logs_core.QueryNodeTypeCondition,
			Condition: &logs_core.ConditionNode{
				Field:    "component",
				Operator: logs_core.ConditionOperatorEquals,
				Value:    "auth-service",
			},
		},
		Limit: 10,
	}

	project1Result, err := repository.ExecuteQueryForProject(project1, query)
	assert.NoError(t, err)
	assert.Equal(t, int64(1), project1Result.Total)
	assert.Len(t, project1Result.Logs, 1)

	project2Result, err := repository.ExecuteQueryForProject(project2, query)
	assert.NoError(t, err)
	assert.Equal(t, int64(1), project2Result.Total)
	assert.Len(t, project2Result.Logs, 1)

	assert.Equal(t, project1Result.Logs[0].Message, project2Result.Logs[0].Message)
	assert.Equal(t, project1Result.Logs[0].Fields["component"], project2Result.Logs[0].Fields["component"])
	assert.NotEqual(t, project1Result.Logs[0].ID, project2Result.Logs[0].ID, "Should have different log IDs")
}

func Test_ExecuteQueryForProject_CrossProjectQuery_NeverReturnsOtherProjectLogs(t *testing.T) {
	repository := logs_core.GetLogStorage()
	currentTime := time.Now().UTC()
	uniqueTestSession := uuid.New().String()[:8]

	project1 := uuid.New()
	project2 := uuid.New()

	project1Logs := CreateTestLogEntriesWithUniqueFields(project1, currentTime,
		"Payment processed successfully", map[string]any{
			"test_session": uniqueTestSession,
			"service":      "payment-api",
			"amount":       "100.00",
			"currency":     "USD",
		})

	project2Logs := CreateTestLogEntriesWithUniqueFields(project2, currentTime,
		"Payment failed with error", map[string]any{
			"test_session": uniqueTestSession,
			"service":      "payment-api",
			"amount":       "200.00",
			"currency":     "USD",
			"error":        "insufficient_funds",
		})

	allLogs := MergeLogEntries(project1Logs, project2Logs)
	StoreTestLogsAndFlush(t, repository, allLogs)

	WaitForLogsToBeQueryable(t, repository, project1, 1, 30_000)
	WaitForLogsToBeQueryable(t, repository, project2, 1, 30_000)

	broadQuery := &logs_core.LogQueryRequestDTO{
		Query: &logs_core.QueryNode{
			Type: logs_core.QueryNodeTypeCondition,
			Condition: &logs_core.ConditionNode{
				Field:    "service",
				Operator: logs_core.ConditionOperatorEquals,
				Value:    "payment-api",
			},
		},
		Limit: 10,
	}

	project1Result, err := repository.ExecuteQueryForProject(project1, broadQuery)
	assert.NoError(t, err)
	assert.Equal(t, int64(1), project1Result.Total)
	assert.Len(t, project1Result.Logs, 1)
	assert.Contains(t, project1Result.Logs[0].Message, "successfully")
	assert.Equal(t, "100.00", project1Result.Logs[0].Fields["amount"])
	assert.NotContains(t, project1Result.Logs[0].Message, "failed", "Should not contain project2's log")

	project2Result, err := repository.ExecuteQueryForProject(project2, broadQuery)
	assert.NoError(t, err)
	assert.Equal(t, int64(1), project2Result.Total)
	assert.Len(t, project2Result.Logs, 1)
	assert.Contains(t, project2Result.Logs[0].Message, "failed")
	assert.Equal(t, "200.00", project2Result.Logs[0].Fields["amount"])
	assert.NotContains(t, project2Result.Logs[0].Message, "successfully", "Should not contain project1's log")
}

func Test_ExecuteQueryForProject_NonExistentProject_ReturnsEmptyResults(t *testing.T) {
	repository := logs_core.GetLogStorage()
	nonExistentProject := uuid.New()

	query := &logs_core.LogQueryRequestDTO{
		Query: &logs_core.QueryNode{
			Type: logs_core.QueryNodeTypeCondition,
			Condition: &logs_core.ConditionNode{
				Field:    "level",
				Operator: logs_core.ConditionOperatorEquals,
				Value:    "info",
			},
		},
		Limit: 10,
	}

	result, err := repository.ExecuteQueryForProject(nonExistentProject, query)
	assert.NoError(t, err, "Querying non-existent project should not return error")
	assert.NotNil(t, result)
	assert.Equal(t, int64(0), result.Total, "Should return zero logs for non-existent project")
	assert.Empty(t, result.Logs, "Should return empty logs array for non-existent project")
}

func Test_ExecuteQueryForProject_ProjectIdFilter_AlwaysApplied(t *testing.T) {
	repository := logs_core.GetLogStorage()
	currentTime := time.Now().UTC()
	uniqueTestSession := uuid.New().String()[:8]

	project1 := uuid.New()
	project2 := uuid.New()

	project1Logs := CreateTestLogEntriesWithUniqueFields(project1, currentTime,
		"Test message", map[string]any{"test_session": uniqueTestSession})
	project2Logs := CreateTestLogEntriesWithUniqueFields(project2, currentTime,
		"Test message", map[string]any{"test_session": uniqueTestSession})

	allLogs := MergeLogEntries(project1Logs, project2Logs)
	StoreTestLogsAndFlush(t, repository, allLogs)

	WaitForLogsToBeQueryable(t, repository, project1, 1, 30_000)
	WaitForLogsToBeQueryable(t, repository, project2, 1, 30_000)

	emptyQuery := &logs_core.LogQueryRequestDTO{
		Query: &logs_core.QueryNode{},
		Limit: 10,
	}

	project1Result, err := repository.ExecuteQueryForProject(project1, emptyQuery)
	assert.NoError(t, err)
	assert.Equal(t, int64(1), project1Result.Total, "Empty query should still filter by project")
	assert.Len(t, project1Result.Logs, 1)

	project2Result, err := repository.ExecuteQueryForProject(project2, emptyQuery)
	assert.NoError(t, err)
	assert.Equal(t, int64(1), project2Result.Total, "Empty query should still filter by project")
	assert.Len(t, project2Result.Logs, 1)

	assert.NotEqual(t, project1Result.Logs[0].ID, project2Result.Logs[0].ID)
}

func Test_ExecuteQueryForProject_ProjectIdInQuery_DoesNotConflict(t *testing.T) {
	repository := logs_core.GetLogStorage()
	currentTime := time.Now().UTC()
	uniqueTestSession := uuid.New().String()[:8]

	project1 := uuid.New()
	project2 := uuid.New()

	project1Logs := CreateTestLogEntriesWithUniqueFields(project1, currentTime,
		"Test message project 1", map[string]any{"test_session": uniqueTestSession})
	project2Logs := CreateTestLogEntriesWithUniqueFields(project2, currentTime,
		"Test message project 2", map[string]any{"test_session": uniqueTestSession})

	allLogs := MergeLogEntries(project1Logs, project2Logs)
	StoreTestLogsAndFlush(t, repository, allLogs)

	WaitForLogsToBeQueryable(t, repository, project1, 1, 30_000)
	WaitForLogsToBeQueryable(t, repository, project2, 1, 30_000)

	queryTryingToAccessProject2 := &logs_core.LogQueryRequestDTO{
		Query: &logs_core.QueryNode{
			Type: logs_core.QueryNodeTypeCondition,
			Condition: &logs_core.ConditionNode{
				Field:    "project_id",
				Operator: logs_core.ConditionOperatorEquals,
				Value:    project2.String(),
			},
		},
		Limit: 10,
	}

	project1Result, err := repository.ExecuteQueryForProject(project1, queryTryingToAccessProject2)
	assert.NoError(t, err)
	assert.Equal(t, int64(0), project1Result.Total, "Should find no logs due to conflicting project filters")
	assert.Empty(t, project1Result.Logs)

	queryMatchingProject1 := &logs_core.LogQueryRequestDTO{
		Query: &logs_core.QueryNode{
			Type: logs_core.QueryNodeTypeCondition,
			Condition: &logs_core.ConditionNode{
				Field:    "project_id",
				Operator: logs_core.ConditionOperatorEquals,
				Value:    project1.String(),
			},
		},
		Limit: 10,
	}

	matchingResult, err := repository.ExecuteQueryForProject(project1, queryMatchingProject1)
	assert.NoError(t, err)
	assert.Equal(t, int64(1), matchingResult.Total, "Should find logs when project_id matches")
}

func Test_ExecuteQueryForProject_TotalCount_OnlyCountsProjectLogs(t *testing.T) {
	repository := logs_core.GetLogStorage()
	currentTime := time.Now().UTC()
	uniqueTestSession := uuid.New().String()[:8]

	project1 := uuid.New()
	project2 := uuid.New()

	project1Logs := CreateBatchLogEntries(project1, 3, currentTime, uniqueTestSession)
	project2Logs := CreateBatchLogEntries(project2, 2, currentTime.Add(1*time.Hour), uniqueTestSession)

	allLogs := MergeLogEntries(project1Logs, project2Logs)
	StoreTestLogsAndFlush(t, repository, allLogs)

	WaitForLogsToBeQueryable(t, repository, project1, 3, 30_000)
	WaitForLogsToBeQueryable(t, repository, project2, 2, 30_000)

	query := &logs_core.LogQueryRequestDTO{
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

	project1Result, err := repository.ExecuteQueryForProject(project1, query)
	assert.NoError(t, err)
	assert.Equal(t, int64(3), project1Result.Total, "Project1 total should only count project1 logs")

	project2Result, err := repository.ExecuteQueryForProject(project2, query)
	assert.NoError(t, err)
	assert.Equal(t, int64(2), project2Result.Total, "Project2 total should only count project2 logs")
}

func Test_ExecuteQueryForProject_Pagination_OnlyPaginatesProjectLogs(t *testing.T) {
	repository := logs_core.GetLogStorage()
	currentTime := time.Now().UTC()
	uniqueTestSession := uuid.New().String()[:8]

	project1 := uuid.New()
	project2 := uuid.New()

	project1Logs := CreateBatchLogEntries(project1, 5, currentTime, uniqueTestSession)
	project2Logs := CreateBatchLogEntries(project2, 3, currentTime.Add(1*time.Hour), uniqueTestSession)

	allLogs := MergeLogEntries(project1Logs, project2Logs)
	StoreTestLogsAndFlush(t, repository, allLogs)

	WaitForLogsToBeQueryable(t, repository, project1, 5, 30_000)
	WaitForLogsToBeQueryable(t, repository, project2, 3, 30_000)

	firstPageQuery := &logs_core.LogQueryRequestDTO{
		Query: &logs_core.QueryNode{
			Type: logs_core.QueryNodeTypeCondition,
			Condition: &logs_core.ConditionNode{
				Field:    "test_session",
				Operator: logs_core.ConditionOperatorEquals,
				Value:    uniqueTestSession,
			},
		},
		Limit:  2,
		Offset: 0,
	}

	firstPage, err := repository.ExecuteQueryForProject(project1, firstPageQuery)
	assert.NoError(t, err)
	assert.Equal(t, int64(5), firstPage.Total, "Total should reflect all project1 logs")
	assert.Len(t, firstPage.Logs, 2, "First page should have 2 logs")

	secondPageQuery := &logs_core.LogQueryRequestDTO{
		Query: &logs_core.QueryNode{
			Type: logs_core.QueryNodeTypeCondition,
			Condition: &logs_core.ConditionNode{
				Field:    "test_session",
				Operator: logs_core.ConditionOperatorEquals,
				Value:    uniqueTestSession,
			},
		},
		Limit:  2,
		Offset: 2,
	}

	secondPage, err := repository.ExecuteQueryForProject(project1, secondPageQuery)
	assert.NoError(t, err)
	assert.Equal(t, int64(5), secondPage.Total)
	assert.Len(t, secondPage.Logs, 2, "Second page should have 2 logs")

	thirdPageQuery := &logs_core.LogQueryRequestDTO{
		Query: &logs_core.QueryNode{
			Type: logs_core.QueryNodeTypeCondition,
			Condition: &logs_core.ConditionNode{
				Field:    "test_session",
				Operator: logs_core.ConditionOperatorEquals,
				Value:    uniqueTestSession,
			},
		},
		Limit:  2,
		Offset: 4,
	}

	thirdPage, err := repository.ExecuteQueryForProject(project1, thirdPageQuery)
	assert.NoError(t, err)
	assert.Equal(t, int64(5), thirdPage.Total)
	assert.Len(t, thirdPage.Logs, 1, "Third page should have 1 remaining log")

	allProject1Logs := append(firstPage.Logs, secondPage.Logs...)
	allProject1Logs = append(allProject1Logs, thirdPage.Logs...)

	for i, log := range allProject1Logs {
		assert.Equal(t, uniqueTestSession, log.Fields["test_session"],
			"Log %d should be from correct test session", i)
		assert.Equal(t, "api", log.Fields["service"],
			"Log %d should be from project1's batch", i)
	}
}

func Test_ExecuteQueryForProject_Sorting_OnlySortsProjectLogs(t *testing.T) {
	repository := logs_core.GetLogStorage()
	baseTime := time.Now().UTC()
	uniqueTestSession := uuid.New().String()[:8]

	project1 := uuid.New()
	project2 := uuid.New()

	project1Time1 := baseTime.Add(-3 * time.Hour)
	project1Time2 := baseTime.Add(-1 * time.Hour)
	project2Time1 := baseTime.Add(-2 * time.Hour)
	project2Time2 := baseTime.Add(-30 * time.Minute)

	project1Logs1 := CreateTestLogEntriesWithUniqueFields(project1, project1Time1,
		"Project1 oldest", map[string]any{"test_session": uniqueTestSession, "order": 1})
	project1Logs2 := CreateTestLogEntriesWithUniqueFields(project1, project1Time2,
		"Project1 newest", map[string]any{"test_session": uniqueTestSession, "order": 2})

	project2Logs1 := CreateTestLogEntriesWithUniqueFields(project2, project2Time1,
		"Project2 oldest", map[string]any{"test_session": uniqueTestSession, "order": 1})
	project2Logs2 := CreateTestLogEntriesWithUniqueFields(project2, project2Time2,
		"Project2 newest", map[string]any{"test_session": uniqueTestSession, "order": 2})

	allLogs := MergeLogEntries(project1Logs1, project1Logs2)
	allLogs = MergeLogEntries(allLogs, project2Logs1)
	allLogs = MergeLogEntries(allLogs, project2Logs2)
	StoreTestLogsAndFlush(t, repository, allLogs)

	WaitForLogsToBeQueryable(t, repository, project1, 2, 30_000)
	WaitForLogsToBeQueryable(t, repository, project2, 2, 30_000)

	descQuery := &logs_core.LogQueryRequestDTO{
		Query: &logs_core.QueryNode{
			Type: logs_core.QueryNodeTypeCondition,
			Condition: &logs_core.ConditionNode{
				Field:    "test_session",
				Operator: logs_core.ConditionOperatorEquals,
				Value:    uniqueTestSession,
			},
		},
		SortOrder: "desc",
		Limit:     10,
	}

	descResult, err := repository.ExecuteQueryForProject(project1, descQuery)
	assert.NoError(t, err)
	assert.Len(t, descResult.Logs, 2)
	assert.True(t, descResult.Logs[0].Timestamp.After(descResult.Logs[1].Timestamp) ||
		descResult.Logs[0].Timestamp.Equal(descResult.Logs[1].Timestamp),
		"Logs should be sorted in descending order")
	assert.Contains(t, descResult.Logs[0].Message, "Project1 newest")
	assert.Contains(t, descResult.Logs[1].Message, "Project1 oldest")

	ascQuery := &logs_core.LogQueryRequestDTO{
		Query: &logs_core.QueryNode{
			Type: logs_core.QueryNodeTypeCondition,
			Condition: &logs_core.ConditionNode{
				Field:    "test_session",
				Operator: logs_core.ConditionOperatorEquals,
				Value:    uniqueTestSession,
			},
		},
		SortOrder: "asc",
		Limit:     10,
	}

	ascResult, err := repository.ExecuteQueryForProject(project1, ascQuery)
	assert.NoError(t, err)
	assert.Len(t, ascResult.Logs, 2)
	assert.True(t, ascResult.Logs[0].Timestamp.Before(ascResult.Logs[1].Timestamp) ||
		ascResult.Logs[0].Timestamp.Equal(ascResult.Logs[1].Timestamp),
		"Logs should be sorted in ascending order")
	assert.Contains(t, ascResult.Logs[0].Message, "Project1 oldest")
	assert.Contains(t, ascResult.Logs[1].Message, "Project1 newest")

	project2Result, err := repository.ExecuteQueryForProject(project2, descQuery)
	assert.NoError(t, err)
	assert.Len(t, project2Result.Logs, 2)
	assert.Contains(t, project2Result.Logs[0].Message, "Project2")
	assert.Contains(t, project2Result.Logs[1].Message, "Project2")
}

func Test_ExecuteQueryForProject_CannotAccessOtherProjectViaQuery(t *testing.T) {
	repository := logs_core.GetLogStorage()
	currentTime := time.Now().UTC()
	uniqueTestSession := uuid.New().String()[:8]

	project1 := uuid.New()
	project2 := uuid.New()

	project1Logs := CreateTestLogEntriesWithUniqueFields(project1, currentTime,
		"Project1 normal log", map[string]any{
			"test_session": uniqueTestSession,
			"data":         "project1_data",
		})

	project2Logs := CreateTestLogEntriesWithUniqueFields(project2, currentTime,
		"Project2 sensitive log", map[string]any{
			"test_session": uniqueTestSession,
			"data":         "sensitive_project2_data",
			"secret":       "top_secret_key",
		})

	allLogs := MergeLogEntries(project1Logs, project2Logs)
	StoreTestLogsAndFlush(t, repository, allLogs)

	WaitForLogsToBeQueryable(t, repository, project1, 1, 30_000)
	WaitForLogsToBeQueryable(t, repository, project2, 1, 30_000)

	maliciousQueries := []*logs_core.LogQueryRequestDTO{
		{
			Query: &logs_core.QueryNode{
				Type: logs_core.QueryNodeTypeCondition,
				Condition: &logs_core.ConditionNode{
					Field:    "secret",
					Operator: logs_core.ConditionOperatorExists,
				},
			},
			Limit: 10,
		},
		{
			Query: &logs_core.QueryNode{
				Type: logs_core.QueryNodeTypeCondition,
				Condition: &logs_core.ConditionNode{
					Field:    "data",
					Operator: logs_core.ConditionOperatorContains,
					Value:    "sensitive",
				},
			},
			Limit: 10,
		},
		{
			Query: &logs_core.QueryNode{
				Type: logs_core.QueryNodeTypeCondition,
				Condition: &logs_core.ConditionNode{
					Field:    "message",
					Operator: logs_core.ConditionOperatorContains,
					Value:    "sensitive",
				},
			},
			Limit: 10,
		},
		{
			Query: &logs_core.QueryNode{
				Type: logs_core.QueryNodeTypeLogical,
				Logic: &logs_core.LogicalNode{
					Operator: logs_core.LogicalOperatorOr,
					Children: []logs_core.QueryNode{
						{
							Type: logs_core.QueryNodeTypeCondition,
							Condition: &logs_core.ConditionNode{
								Field:    "data",
								Operator: logs_core.ConditionOperatorEquals,
								Value:    "project1_data",
							},
						},
						{
							Type: logs_core.QueryNodeTypeCondition,
							Condition: &logs_core.ConditionNode{
								Field:    "data",
								Operator: logs_core.ConditionOperatorEquals,
								Value:    "sensitive_project2_data",
							},
						},
					},
				},
			},
			Limit: 10,
		},
	}

	for i, maliciousQuery := range maliciousQueries {
		result, err := repository.ExecuteQueryForProject(project1, maliciousQuery)
		assert.NoError(t, err, "Query %d should not error but should return isolated results", i)

		for j, log := range result.Logs {
			assert.NotContains(t, log.Message, "sensitive", "Query %d, log %d should not contain sensitive data", i, j)
			assert.NotContains(t, log.Message, "Project2", "Query %d, log %d should not contain Project2 data", i, j)

			if log.Fields != nil {
				assert.NotEqual(t, "sensitive_project2_data", log.Fields["data"],
					"Query %d, log %d should not contain project2's data", i, j)
				assert.Nil(t, log.Fields["secret"],
					"Query %d, log %d should not contain project2's secret field", i, j)
			}
		}
	}
}

func Test_ExecuteQueryForProject_ProjectIdManipulation_HasNoEffect(t *testing.T) {
	repository := logs_core.GetLogStorage()
	currentTime := time.Now().UTC()
	uniqueTestSession := uuid.New().String()[:8]

	project1 := uuid.New()
	project2 := uuid.New()

	project1Logs := CreateTestLogEntriesWithUniqueFields(project1, currentTime,
		"Project 1 message", map[string]any{"test_session": uniqueTestSession})
	project2Logs := CreateTestLogEntriesWithUniqueFields(project2, currentTime,
		"Project 2 message", map[string]any{"test_session": uniqueTestSession})

	allLogs := MergeLogEntries(project1Logs, project2Logs)
	StoreTestLogsAndFlush(t, repository, allLogs)

	WaitForLogsToBeQueryable(t, repository, project1, 1, 30_000)
	WaitForLogsToBeQueryable(t, repository, project2, 1, 30_000)

	manipulationAttempts := []*logs_core.LogQueryRequestDTO{
		{
			Query: &logs_core.QueryNode{
				Type: logs_core.QueryNodeTypeLogical,
				Logic: &logs_core.LogicalNode{
					Operator: logs_core.LogicalOperatorAnd,
					Children: []logs_core.QueryNode{
						{
							Type: logs_core.QueryNodeTypeCondition,
							Condition: &logs_core.ConditionNode{
								Field:    "project_id",
								Operator: logs_core.ConditionOperatorEquals,
								Value:    project2.String(),
							},
						},
						{
							Type: logs_core.QueryNodeTypeCondition,
							Condition: &logs_core.ConditionNode{
								Field:    "test_session",
								Operator: logs_core.ConditionOperatorEquals,
								Value:    uniqueTestSession,
							},
						},
					},
				},
			},
			Limit: 10,
		},
		{
			Query: &logs_core.QueryNode{
				Type: logs_core.QueryNodeTypeLogical,
				Logic: &logs_core.LogicalNode{
					Operator: logs_core.LogicalOperatorNot,
					Children: []logs_core.QueryNode{
						{
							Type: logs_core.QueryNodeTypeCondition,
							Condition: &logs_core.ConditionNode{
								Field:    "project_id",
								Operator: logs_core.ConditionOperatorEquals,
								Value:    project1.String(),
							},
						},
					},
				},
			},
			Limit: 10,
		},
		{
			Query: &logs_core.QueryNode{
				Type: logs_core.QueryNodeTypeLogical,
				Logic: &logs_core.LogicalNode{
					Operator: logs_core.LogicalOperatorOr,
					Children: []logs_core.QueryNode{
						{
							Type: logs_core.QueryNodeTypeCondition,
							Condition: &logs_core.ConditionNode{
								Field:    "project_id",
								Operator: logs_core.ConditionOperatorEquals,
								Value:    project1.String(),
							},
						},
						{
							Type: logs_core.QueryNodeTypeCondition,
							Condition: &logs_core.ConditionNode{
								Field:    "project_id",
								Operator: logs_core.ConditionOperatorEquals,
								Value:    project2.String(),
							},
						},
					},
				},
			},
			Limit: 10,
		},
	}

	for i, query := range manipulationAttempts {
		result, err := repository.ExecuteQueryForProject(project1, query)
		assert.NoError(t, err, "Manipulation attempt %d should not cause error", i)

		assert.LessOrEqual(t, result.Total, int64(1),
			"Manipulation attempt %d should not bypass project isolation", i)

		for j, log := range result.Logs {
			assert.Contains(t, log.Message, "Project 1",
				"Manipulation attempt %d, log %d should only return Project 1 data", i, j)
			assert.NotContains(t, log.Message, "Project 2",
				"Manipulation attempt %d, log %d should never return Project 2 data", i, j)
		}
	}
}
