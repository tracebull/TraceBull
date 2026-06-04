package logs_cleanup_tests

import (
	"fmt"
	"strings"
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

func Test_EnforceProjectQuotas_WhenStorageSizeIsWithinMaxLogsSizeMB_NoLogsDeleted(t *testing.T) {
	users_testing.CleanupPlans()

	router := projects_testing.CreateTestRouter(
		projects_controllers.GetProjectController(),
		projects_controllers.GetMembershipController(),
	)
	owner := users_testing.CreateTestUser(users_enums.UserRoleManager)
	uniqueID := uuid.New().String()[:8]

	// Create test project
	projectName := "Size Within Quota Test " + uniqueID
	project := projects_testing.CreateTestProject(projectName, owner, router)

	// Update project to set MaxLogsSizeMB to a large value (10 MB)
	updateData := &projects_models.Project{
		Name:          project.Name,
		MaxLogsSizeMB: 10, // 10 MB limit - large enough to not trigger cleanup
	}
	projects_testing.UpdateProject(project, updateData, owner.Token, router)

	// Get repository and cleanup service
	repository := logs_core.GetLogStorage()
	cleanupService := logs_cleanup.GetLogCleanupBackgroundService()

	// Create test timestamps
	now := time.Now().UTC()
	oldTime := now.Add(-2 * time.Hour)       // 2 hours ago
	recentTime := now.Add(-30 * time.Minute) // 30 minutes ago

	// Create small logs that won't exceed quota
	smallMessage := strings.Repeat("Small log message. ", 10) // ~200 bytes per message

	// Create only 50 logs (~10KB total, well below 10MB limit)
	var allEntries map[uuid.UUID][]*logs_core.LogItem

	for i := range 25 {
		oldLogEntries := logs_core_tests.CreateTestLogEntriesWithUniqueFields(
			project.ID,
			oldTime.Add(time.Duration(i)*time.Second),
			smallMessage+fmt.Sprintf(" Old Log #%d", i),
			map[string]any{
				"test_session": uniqueID,
				"log_type":     "old",
				"size_test":    true,
				"log_index":    i,
			},
		)
		if allEntries == nil {
			allEntries = oldLogEntries
		} else {
			allEntries = logs_core_tests.MergeLogEntries(allEntries, oldLogEntries)
		}
	}

	for i := range 25 {
		recentLogEntries := logs_core_tests.CreateTestLogEntriesWithUniqueFields(
			project.ID,
			recentTime.Add(time.Duration(i)*time.Second),
			smallMessage+fmt.Sprintf(" Recent Log #%d", i),
			map[string]any{
				"test_session": uniqueID,
				"log_type":     "recent",
				"size_test":    true,
				"log_index":    25 + i,
			},
		)
		allEntries = logs_core_tests.MergeLogEntries(allEntries, recentLogEntries)
	}

	// Store all logs
	logs_core_tests.StoreTestLogsAndFlush(t, repository, allEntries)

	// Wait for logs to appear
	statsBeforeCleanup := WaitForLogsToAppear(t, repository, project.ID, 50, 30000)
	assert.Equal(t, int64(50), statsBeforeCleanup.TotalLogs, "Should have 50 logs before cleanup")
	assert.Less(t, statsBeforeCleanup.TotalSizeMB, 1.0, "Should be well below 10MB quota before cleanup")

	t.Logf(
		"Before cleanup: TotalLogs=%d, TotalSizeMB=%.3f",
		statsBeforeCleanup.TotalLogs,
		statsBeforeCleanup.TotalSizeMB,
	)

	// Execute cleanup service
	err := cleanupService.ExecuteAllTasksForTest()
	assert.NoError(t, err, "Cleanup service should execute successfully")

	// Wait for any operations to complete (should remain 50)
	statsAfterCleanup := WaitForLogDeletion(t, repository, project.ID, 50, 30000)

	t.Logf("After cleanup: TotalLogs=%d, TotalSizeMB=%.3f", statsAfterCleanup.TotalLogs, statsAfterCleanup.TotalSizeMB)

	assert.Equal(
		t,
		statsBeforeCleanup.TotalLogs,
		statsAfterCleanup.TotalLogs,
		"No logs should be deleted when within quota",
	)
	assert.Equal(
		t,
		statsBeforeCleanup.TotalSizeMB,
		statsAfterCleanup.TotalSizeMB,
		"Size should remain the same when within quota",
	)
}

func Test_EnforceProjectQuotas_WhenMaxLogsSizeMBIsZero_NoSizeQuotaEnforcement(t *testing.T) {
	users_testing.CleanupPlans()

	router := projects_testing.CreateTestRouter(
		projects_controllers.GetProjectController(),
		projects_controllers.GetMembershipController(),
	)
	owner := users_testing.CreateTestUser(users_enums.UserRoleManager)
	uniqueID := uuid.New().String()[:8]

	// Create test project
	projectName := "Zero Size Quota Test " + uniqueID
	project := projects_testing.CreateTestProject(projectName, owner, router)

	// Update project to set MaxLogsSizeMB to 0 (no size-based quota)
	updateData := &projects_models.Project{
		Name:          project.Name,
		MaxLogsSizeMB: 0, // No size quota enforcement
	}
	projects_testing.UpdateProject(project, updateData, owner.Token, router)

	// Get repository and cleanup service
	repository := logs_core.GetLogStorage()
	cleanupService := logs_cleanup.GetLogCleanupBackgroundService()

	// Create test timestamps
	now := time.Now().UTC()
	oldTime := now.Add(-2 * time.Hour)       // 2 hours ago
	recentTime := now.Add(-30 * time.Minute) // 30 minutes ago

	// Create large logs that would normally trigger cleanup
	largeMessage := strings.Repeat(
		"This is a large log message to test zero size quota enforcement. ",
		100,
	) // ~6KB per message

	// Create many logs that would exceed any reasonable size limit
	var allEntries map[uuid.UUID][]*logs_core.LogItem

	// Create 100 old logs (~600KB total - would trigger cleanup if quota was set)
	for i := range 100 {
		oldLogEntries := logs_core_tests.CreateTestLogEntriesWithUniqueFields(
			project.ID,
			oldTime.Add(time.Duration(i)*time.Second),
			largeMessage+fmt.Sprintf(" Old Log #%d", i),
			map[string]any{
				"test_session": uniqueID,
				"log_type":     "old",
				"size_test":    true,
				"log_index":    i,
			},
		)
		if allEntries == nil {
			allEntries = oldLogEntries
		} else {
			allEntries = logs_core_tests.MergeLogEntries(allEntries, oldLogEntries)
		}
	}

	// Create 50 recent logs (~300KB total)
	for i := range 50 {
		recentLogEntries := logs_core_tests.CreateTestLogEntriesWithUniqueFields(
			project.ID,
			recentTime.Add(time.Duration(i)*time.Second),
			largeMessage+fmt.Sprintf(" Recent Log #%d", i),
			map[string]any{
				"test_session": uniqueID,
				"log_type":     "recent",
				"size_test":    true,
				"log_index":    100 + i,
			},
		)
		allEntries = logs_core_tests.MergeLogEntries(allEntries, recentLogEntries)
	}

	// Store all logs
	logs_core_tests.StoreTestLogsAndFlush(t, repository, allEntries)

	// Wait for logs to appear
	statsBeforeCleanup := WaitForLogsToAppear(t, repository, project.ID, 150, 30000)
	assert.Equal(t, int64(150), statsBeforeCleanup.TotalLogs, "Should have 150 logs before cleanup")

	t.Logf(
		"Before cleanup: TotalLogs=%d, TotalSizeMB=%.3f",
		statsBeforeCleanup.TotalLogs,
		statsBeforeCleanup.TotalSizeMB,
	)

	// Execute cleanup service
	err := cleanupService.ExecuteAllTasksForTest()
	assert.NoError(t, err, "Cleanup service should execute successfully")

	// Wait for any operations to complete (should remain 150)
	statsAfterCleanup := WaitForLogDeletion(t, repository, project.ID, 150, 30000)

	t.Logf("After cleanup: TotalLogs=%d, TotalSizeMB=%.3f", statsAfterCleanup.TotalLogs, statsAfterCleanup.TotalSizeMB)

	assert.Equal(
		t,
		statsBeforeCleanup.TotalLogs,
		statsAfterCleanup.TotalLogs,
		"No logs should be deleted with zero size quota",
	)
	assert.Equal(
		t,
		statsBeforeCleanup.TotalSizeMB,
		statsAfterCleanup.TotalSizeMB,
		"Size should remain the same with zero size quota",
	)
}
