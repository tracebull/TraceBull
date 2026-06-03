package logs_cleanup_tests

import (
	"testing"
	"time"

	logs_cleanup "logbull/internal/features/logs/cleanup"
	logs_core "logbull/internal/features/logs/core"
	logs_core_tests "logbull/internal/features/logs/core/tests"
	projects_controllers "logbull/internal/features/projects/controllers"
	projects_models "logbull/internal/features/projects/models"
	projects_testing "logbull/internal/features/projects/testing"
	users_enums "logbull/internal/features/users/enums"
	users_testing "logbull/internal/features/users/testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func Test_EnforceLogRetention_WhenMaxLogsLifeDaysIsZero_NoRetentionEnforcement(t *testing.T) {
	users_testing.CleanupPlans()

	router := projects_testing.CreateTestRouter(
		projects_controllers.GetProjectController(),
		projects_controllers.GetMembershipController(),
	)
	owner := users_testing.CreateTestUser(users_enums.UserRoleMember)
	uniqueID := uuid.New().String()[:8]

	// Create test project
	projectName := "Zero Retention Test " + uniqueID
	project := projects_testing.CreateTestProject(projectName, owner, router)

	// Update project to set MaxLogsLifeDays to 0 (no retention)
	updateData := &projects_models.Project{
		Name:            project.Name,
		MaxLogsLifeDays: 0,
	}
	projects_testing.UpdateProject(project, updateData, owner.Token, router)

	// Get repository and cleanup service
	repository := logs_core.GetLogStorage()
	cleanupService := logs_cleanup.GetLogCleanupBackgroundService()

	// Create test timestamps
	now := time.Now().UTC()
	oldTime := now.AddDate(0, 0, -4)    // 4 days ago (would normally be deleted)
	recentTime := now.AddDate(0, 0, -1) // 1 day ago

	// Create old logs (should NOT be deleted when retention is 0)
	oldLogEntries := logs_core_tests.CreateTestLogEntriesWithUniqueFields(
		project.ID,
		oldTime,
		"Old log message for zero retention test",
		map[string]any{
			"test_session": uniqueID,
			"log_type":     "old",
		},
	)

	// Create recent logs (should remain)
	recentLogEntries := logs_core_tests.CreateTestLogEntriesWithUniqueFields(
		project.ID,
		recentTime,
		"Recent log message for zero retention test",
		map[string]any{
			"test_session": uniqueID,
			"log_type":     "recent",
		},
	)

	// Merge and store all logs
	allEntries := logs_core_tests.MergeLogEntries(oldLogEntries, recentLogEntries)
	logs_core_tests.StoreTestLogsAndFlush(t, repository, allEntries)

	// Wait for logs to appear
	statsBeforeCleanup := WaitForLogsToAppear(t, repository, project.ID, 2, 30000)
	assert.Equal(t, int64(2), statsBeforeCleanup.TotalLogs, "Should have 2 logs before cleanup")

	// Execute cleanup service
	err := cleanupService.ExecuteAllTasksForTest()
	assert.NoError(t, err, "Cleanup service should execute successfully")

	// Wait for any operations to complete (should remain 2)
	statsAfterCleanup := WaitForLogDeletion(t, repository, project.ID, 2, 30000)
	assert.Equal(t, int64(2), statsAfterCleanup.TotalLogs, "Should still have 2 logs after cleanup with zero retention")
}

func Test_EnforceLogRetention_WhenMaxLogsLifeDaysIsNegative_NoRetentionEnforcement(t *testing.T) {
	users_testing.CleanupPlans()

	router := projects_testing.CreateTestRouter(
		projects_controllers.GetProjectController(),
		projects_controllers.GetMembershipController(),
	)
	owner := users_testing.CreateTestUser(users_enums.UserRoleMember)
	uniqueID := uuid.New().String()[:8]

	// Create test project
	projectName := "Negative Retention Test " + uniqueID
	project := projects_testing.CreateTestProject(projectName, owner, router)

	// Update project to set MaxLogsLifeDays to -1 (no retention)
	updateData := &projects_models.Project{
		Name:            project.Name,
		MaxLogsLifeDays: -1,
	}
	projects_testing.UpdateProject(project, updateData, owner.Token, router)

	// Get repository and cleanup service
	repository := logs_core.GetLogStorage()
	cleanupService := logs_cleanup.GetLogCleanupBackgroundService()

	// Create test timestamps
	now := time.Now().UTC()
	oldTime := now.AddDate(0, 0, -4)    // 4 days ago (would normally be deleted)
	recentTime := now.AddDate(0, 0, -1) // 1 day ago

	// Create old logs (should NOT be deleted when retention is negative)
	oldLogEntries := logs_core_tests.CreateTestLogEntriesWithUniqueFields(
		project.ID,
		oldTime,
		"Old log message for negative retention test",
		map[string]any{
			"test_session": uniqueID,
			"log_type":     "old",
		},
	)

	// Create recent logs (should remain)
	recentLogEntries := logs_core_tests.CreateTestLogEntriesWithUniqueFields(
		project.ID,
		recentTime,
		"Recent log message for negative retention test",
		map[string]any{
			"test_session": uniqueID,
			"log_type":     "recent",
		},
	)

	// Merge and store all logs
	allEntries := logs_core_tests.MergeLogEntries(oldLogEntries, recentLogEntries)
	logs_core_tests.StoreTestLogsAndFlush(t, repository, allEntries)

	// Wait for logs to appear
	statsBeforeCleanup := WaitForLogsToAppear(t, repository, project.ID, 2, 30000)
	assert.Equal(t, int64(2), statsBeforeCleanup.TotalLogs, "Should have 2 logs before cleanup")

	// Execute cleanup service
	err := cleanupService.ExecuteAllTasksForTest()
	assert.NoError(t, err, "Cleanup service should execute successfully")

	// Wait for any operations to complete (should remain 2)
	statsAfterCleanup := WaitForLogDeletion(t, repository, project.ID, 2, 30000)
	assert.Equal(
		t,
		int64(2),
		statsAfterCleanup.TotalLogs,
		"Should still have 2 logs after cleanup with negative retention",
	)
}


