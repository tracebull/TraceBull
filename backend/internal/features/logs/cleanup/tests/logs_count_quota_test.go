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
	"logbull/internal/storage"

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

func Test_EnforceProjectQuotas_WhenLogsCreatedWithNanosecondPrecision_KeepsNewestLogs(t *testing.T) {
	users_testing.CleanupPlans()

	router := projects_testing.CreateTestRouter(
		projects_controllers.GetProjectController(),
		projects_controllers.GetMembershipController(),
	)
	owner := users_testing.CreateTestUser(users_enums.UserRoleMember)
	uniqueID := uuid.New().String()[:8]

	projectName := "Nanosecond Precision Test " + uniqueID
	project := projects_testing.CreateTestProject(projectName, owner, router)

	updateData := &projects_models.Project{
		Name:          project.Name,
		MaxLogsAmount: 10,
	}
	updatedProject := projects_testing.UpdateProject(project, updateData, owner.Token, router)
	project = updatedProject
	// Plan overrides prevent the API update from taking effect, so set directly
	storage.GetDb().Exec("UPDATE projects SET max_logs_amount = 10 WHERE id = ?", project.ID)

	t.Logf("Project MaxLogsAmount after update: %d", project.MaxLogsAmount)

	repository := logs_core.GetLogStorage()
	cleanupService := logs_cleanup.GetLogCleanupBackgroundService()

	now := time.Now().UTC()
	var allEntries map[uuid.UUID][]*logs_core.LogItem

	for i := range 15 {
		logEntries := logs_core_tests.CreateTestLogEntriesWithUniqueFields(
			project.ID,
			now.Add(time.Duration(i)*10*time.Nanosecond),
			"Log with nanosecond precision",
			map[string]any{
				"test_session": uniqueID,
				"log_index":    i,
			},
		)
		if allEntries == nil {
			allEntries = logEntries
		} else {
			allEntries = logs_core_tests.MergeLogEntries(allEntries, logEntries)
		}
	}

	logs_core_tests.StoreTestLogsAndFlush(t, repository, allEntries)

	statsBeforeCleanup := WaitForLogsToAppear(t, repository, project.ID, 15, 30000)
	assert.Equal(t, int64(15), statsBeforeCleanup.TotalLogs, "Should have 15 logs before cleanup")

	t.Logf(
		"Before cleanup: TotalLogs=%d, OldestTime=%v, NewestTime=%v",
		statsBeforeCleanup.TotalLogs,
		statsBeforeCleanup.OldestLogTime,
		statsBeforeCleanup.NewestLogTime,
	)

	err := cleanupService.ExecuteAllTasksForTest()
	assert.NoError(t, err, "Cleanup service should execute successfully")

	targetLogs := int64(10)
	statsAfterCleanup := WaitForLogDeletion(t, repository, project.ID, targetLogs, 30000)

	t.Logf("After cleanup: TotalLogs=%d, OldestTime=%v, NewestTime=%v",
		statsAfterCleanup.TotalLogs, statsAfterCleanup.OldestLogTime, statsAfterCleanup.NewestLogTime)

	assert.Equal(
		t,
		targetLogs,
		statsAfterCleanup.TotalLogs,
		"Should have exactly 10 logs after cleanup - exactly 5 logs deleted (indices 0-4)",
	)

	expectedOldestRemainingTime := now.Add(time.Duration(5) * 10 * time.Nanosecond)
	expectedNewestTime := now.Add(time.Duration(14) * 10 * time.Nanosecond)

	assert.True(
		t,
		statsAfterCleanup.OldestLogTime.Sub(expectedOldestRemainingTime).Abs() < 1*time.Microsecond,
		"Oldest remaining log should be around index 5 (time: %v, expected: %v)",
		statsAfterCleanup.OldestLogTime,
		expectedOldestRemainingTime,
	)

	assert.True(
		t,
		statsAfterCleanup.NewestLogTime.Sub(expectedNewestTime).Abs() < 1*time.Microsecond,
		"Newest log should be around index 14 (time: %v, expected: %v)",
		statsAfterCleanup.NewestLogTime,
		expectedNewestTime,
	)
}

func Test_EnforceProjectQuotas_WhenLogsCreatedWithinSameNanosecond_CannotDeleteLogs(t *testing.T) {
	users_testing.CleanupPlans()

	router := projects_testing.CreateTestRouter(
		projects_controllers.GetProjectController(),
		projects_controllers.GetMembershipController(),
	)
	owner := users_testing.CreateTestUser(users_enums.UserRoleMember)
	uniqueID := uuid.New().String()[:8]

	projectName := "Same Nanosecond Test " + uniqueID
	project := projects_testing.CreateTestProject(projectName, owner, router)

	updateData := &projects_models.Project{
		Name:          project.Name,
		MaxLogsAmount: 10,
	}
	updatedProject := projects_testing.UpdateProject(project, updateData, owner.Token, router)
	project = updatedProject
	// Plan overrides prevent the API update from taking effect, so set directly
	storage.GetDb().Exec("UPDATE projects SET max_logs_amount = 10 WHERE id = ?", project.ID)

	t.Logf("Project MaxLogsAmount after update: %d", project.MaxLogsAmount)

	repository := logs_core.GetLogStorage()
	cleanupService := logs_cleanup.GetLogCleanupBackgroundService()

	now := time.Now().UTC()
	var allEntries map[uuid.UUID][]*logs_core.LogItem

	for i := range 15 {
		logEntries := logs_core_tests.CreateTestLogEntriesWithUniqueFields(
			project.ID,
			now,
			"Log within same nanosecond",
			map[string]any{
				"test_session": uniqueID,
				"log_index":    i,
			},
		)
		if allEntries == nil {
			allEntries = logEntries
		} else {
			allEntries = logs_core_tests.MergeLogEntries(allEntries, logEntries)
		}
	}

	logs_core_tests.StoreTestLogsAndFlush(t, repository, allEntries)

	statsBeforeCleanup := WaitForLogsToAppear(t, repository, project.ID, 15, 30000)
	assert.Equal(t, int64(15), statsBeforeCleanup.TotalLogs, "Should have 15 logs before cleanup")
	assert.Equal(
		t,
		statsBeforeCleanup.OldestLogTime,
		statsBeforeCleanup.NewestLogTime,
		"All logs should have the same timestamp",
	)

	t.Logf(
		"Before cleanup: TotalLogs=%d, OldestTime=%v, NewestTime=%v (all same)",
		statsBeforeCleanup.TotalLogs,
		statsBeforeCleanup.OldestLogTime,
		statsBeforeCleanup.NewestLogTime,
	)

	err := cleanupService.ExecuteAllTasksForTest()
	assert.NoError(t, err, "Cleanup service should execute successfully")

	statsAfterCleanup := WaitForLogDeletion(t, repository, project.ID, 15, 5000)

	t.Logf("After cleanup: TotalLogs=%d, OldestTime=%v, NewestTime=%v",
		statsAfterCleanup.TotalLogs, statsAfterCleanup.OldestLogTime, statsAfterCleanup.NewestLogTime)

	assert.Equal(
		t,
		statsBeforeCleanup.TotalLogs,
		statsAfterCleanup.TotalLogs,
		"No logs should be deleted when all logs have identical timestamps - cleanup algorithm cannot calculate proper cutoff time",
	)

	t.Logf(
		"Edge case confirmed: When all logs share the same timestamp, the cleanup algorithm cannot calculate a proper cutoff time, so no logs are deleted despite exceeding the quota",
	)
}
