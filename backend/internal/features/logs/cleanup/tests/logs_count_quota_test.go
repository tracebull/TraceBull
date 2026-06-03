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

func Test_EnforceProjectQuotas_WhenLogCountIsWithinMaxLogsAmount_NoLogsDeleted(t *testing.T) {
	users_testing.CleanupPlans()

	router := projects_testing.CreateTestRouter(
		projects_controllers.GetProjectController(),
		projects_controllers.GetMembershipController(),
	)
	owner := users_testing.CreateTestUser(users_enums.UserRoleMember)
	uniqueID := uuid.New().String()[:8]

	// Create test project
	projectName := "Count Within Quota Test " + uniqueID
	project := projects_testing.CreateTestProject(projectName, owner, router)

	// Update project to set MaxLogsAmount to 50 logs (large enough to not trigger cleanup)
	updateData := &projects_models.Project{
		Name:          project.Name,
		MaxLogsAmount: 50, // 50 logs limit - large enough to not trigger cleanup
	}
	projects_testing.UpdateProject(project, updateData, owner.Token, router)

	// Get repository and cleanup service
	repository := logs_core.GetLogStorage()
	cleanupService := logs_cleanup.GetLogCleanupBackgroundService()

	// Create test timestamps
	now := time.Now().UTC()
	oldTime := now.Add(-2 * time.Hour)       // 2 hours ago
	recentTime := now.Add(-30 * time.Minute) // 30 minutes ago

	// Create only 20 logs (well below 50 limit)
	var allEntries map[uuid.UUID][]*logs_core.LogItem

	for i := range 10 {
		oldLogEntries := logs_core_tests.CreateTestLogEntriesWithUniqueFields(
			project.ID,
			oldTime.Add(time.Duration(i)*time.Second),
			"Old log for within quota test",
			map[string]any{
				"test_session": uniqueID,
				"log_type":     "old",
				"log_index":    i,
			},
		)
		if allEntries == nil {
			allEntries = oldLogEntries
		} else {
			allEntries = logs_core_tests.MergeLogEntries(allEntries, oldLogEntries)
		}
	}

	for i := range 10 {
		recentLogEntries := logs_core_tests.CreateTestLogEntriesWithUniqueFields(
			project.ID,
			recentTime.Add(time.Duration(i)*time.Second),
			"Recent log for within quota test",
			map[string]any{
				"test_session": uniqueID,
				"log_type":     "recent",
				"log_index":    10 + i,
			},
		)
		allEntries = logs_core_tests.MergeLogEntries(allEntries, recentLogEntries)
	}

	// Store all logs
	logs_core_tests.StoreTestLogsAndFlush(t, repository, allEntries)

	// Wait for logs to appear
	statsBeforeCleanup := WaitForLogsToAppear(t, repository, project.ID, 20, 30000)
	assert.Equal(t, int64(20), statsBeforeCleanup.TotalLogs, "Should have 20 logs before cleanup")
	assert.Less(t, statsBeforeCleanup.TotalLogs, int64(50), "Should be well below 50 logs quota before cleanup")

	t.Logf(
		"Before cleanup: TotalLogs=%d, OldestTime=%v, NewestTime=%v",
		statsBeforeCleanup.TotalLogs,
		statsBeforeCleanup.OldestLogTime,
		statsBeforeCleanup.NewestLogTime,
	)

	// Execute cleanup service
	err := cleanupService.ExecuteAllTasksForTest()
	assert.NoError(t, err, "Cleanup service should execute successfully")

	// Wait for any operations to complete (should remain 20)
	statsAfterCleanup := WaitForLogDeletion(t, repository, project.ID, 20, 30000)

	t.Logf("After cleanup: TotalLogs=%d, OldestTime=%v, NewestTime=%v",
		statsAfterCleanup.TotalLogs, statsAfterCleanup.OldestLogTime, statsAfterCleanup.NewestLogTime)

	assert.Equal(
		t,
		statsBeforeCleanup.TotalLogs,
		statsAfterCleanup.TotalLogs,
		"No logs should be deleted when within quota",
	)
}

func Test_EnforceProjectQuotas_WhenMaxLogsAmountIsZero_NoQuotaEnforcement(t *testing.T) {
	users_testing.CleanupPlans()

	router := projects_testing.CreateTestRouter(
		projects_controllers.GetProjectController(),
		projects_controllers.GetMembershipController(),
	)
	owner := users_testing.CreateTestUser(users_enums.UserRoleMember)
	uniqueID := uuid.New().String()[:8]

	// Create test project
	projectName := "Zero Count Quota Test " + uniqueID
	project := projects_testing.CreateTestProject(projectName, owner, router)

	// Update project to set MaxLogsAmount to 0 (no count-based quota)
	updateData := &projects_models.Project{
		Name:          project.Name,
		MaxLogsAmount: 0, // No count quota enforcement
	}
	projects_testing.UpdateProject(project, updateData, owner.Token, router)

	// Get repository and cleanup service
	repository := logs_core.GetLogStorage()
	cleanupService := logs_cleanup.GetLogCleanupBackgroundService()

	// Create test timestamps
	now := time.Now().UTC()
	oldTime := now.Add(-2 * time.Hour)       // 2 hours ago
	recentTime := now.Add(-30 * time.Minute) // 30 minutes ago

	// Create many logs that would normally trigger cleanup
	var allEntries map[uuid.UUID][]*logs_core.LogItem

	// Create 50 old logs (would trigger cleanup if quota was set)
	for i := range 50 {
		oldLogEntries := logs_core_tests.CreateTestLogEntriesWithUniqueFields(
			project.ID,
			oldTime.Add(time.Duration(i)*time.Second),
			"Old log for zero quota test",
			map[string]any{
				"test_session": uniqueID,
				"log_type":     "old",
				"log_index":    i,
			},
		)
		if allEntries == nil {
			allEntries = oldLogEntries
		} else {
			allEntries = logs_core_tests.MergeLogEntries(allEntries, oldLogEntries)
		}
	}

	// Create 25 recent logs (total: 75 logs)
	for i := range 25 {
		recentLogEntries := logs_core_tests.CreateTestLogEntriesWithUniqueFields(
			project.ID,
			recentTime.Add(time.Duration(i)*time.Second),
			"Recent log for zero quota test",
			map[string]any{
				"test_session": uniqueID,
				"log_type":     "recent",
				"log_index":    50 + i,
			},
		)
		allEntries = logs_core_tests.MergeLogEntries(allEntries, recentLogEntries)
	}

	// Store all logs
	logs_core_tests.StoreTestLogsAndFlush(t, repository, allEntries)

	// Wait for logs to appear
	statsBeforeCleanup := WaitForLogsToAppear(t, repository, project.ID, 75, 30000)
	assert.Equal(t, int64(75), statsBeforeCleanup.TotalLogs, "Should have 75 logs before cleanup")

	t.Logf(
		"Before cleanup: TotalLogs=%d, OldestTime=%v, NewestTime=%v",
		statsBeforeCleanup.TotalLogs,
		statsBeforeCleanup.OldestLogTime,
		statsBeforeCleanup.NewestLogTime,
	)

	// Execute cleanup service
	err := cleanupService.ExecuteAllTasksForTest()
	assert.NoError(t, err, "Cleanup service should execute successfully")

	// Wait for any operations to complete (should remain 75)
	statsAfterCleanup := WaitForLogDeletion(t, repository, project.ID, 75, 30000)

	t.Logf("After cleanup: TotalLogs=%d, OldestTime=%v, NewestTime=%v",
		statsAfterCleanup.TotalLogs, statsAfterCleanup.OldestLogTime, statsAfterCleanup.NewestLogTime)

	assert.Equal(
		t,
		statsBeforeCleanup.TotalLogs,
		statsAfterCleanup.TotalLogs,
		"No logs should be deleted with zero count quota",
	)
}

