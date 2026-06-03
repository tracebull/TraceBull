package logs_querying

import (
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	logs_core "logbull/internal/features/logs/core"
	projects_services "logbull/internal/features/projects/services"
	users_models "logbull/internal/features/users/models"

	"github.com/google/uuid"
)

type LogQueryService struct {
	logRepository          logs_core.LogStorage
	projectService         *projects_services.ProjectService
	concurrentQueryLimiter *ConcurrentQueryLimiter
	queryValidator         *QueryValidator
	logger                 *slog.Logger
}

func (s *LogQueryService) ExecuteQuery(
	projectID uuid.UUID,
	request *logs_core.LogQueryRequestDTO,
	user *users_models.User,
) (*logs_core.LogQueryResponseDTO, error) {
	queryID := uuid.New().String()

	if err := s.concurrentQueryLimiter.AcquireQuerySlot(user.ID, queryID); err != nil {
		return nil, err
	}

	defer s.concurrentQueryLimiter.ReleaseQuerySlot(user.ID, queryID)

	// Global admins can access any project, regular users only projects they're members
	canAccess, _, err := s.projectService.CanUserAccessProject(projectID, user)
	if err != nil {
		return nil, fmt.Errorf("failed to verify project access: %w", err)
	}
	if !canAccess {
		return nil, errors.New("insufficient permissions to query project logs")
	}

	if err := s.queryValidator.ValidateQuery(request.Query); err != nil {
		return nil, fmt.Errorf("invalid query structure: %w", err)
	}

	if err := s.validateTimeRange(request.TimeRange); err != nil {
		return nil, err
	}

	response, err := s.logRepository.ExecuteQueryForProject(projectID, request)
	return response, err
}

func (s *LogQueryService) ExecuteStreamPoll(
	projectID uuid.UUID,
	request *logs_core.LogQueryRequestDTO,
	user *users_models.User,
) (*logs_core.LogQueryResponseDTO, error) {
	if err := s.validateQueryAccess(projectID, request.Query, user); err != nil {
		return nil, err
	}

	if err := s.validateTimeRange(request.TimeRange); err != nil {
		return nil, err
	}

	return s.logRepository.ExecuteQueryForProject(projectID, request)
}

func (s *LogQueryService) GetQueryableFields(
	projectID uuid.UUID,
	request *logs_core.GetQueryableFieldsRequestDTO,
	user *users_models.User,
) (*logs_core.GetQueryableFieldsResponseDTO, error) {
	canAccess, _, err := s.projectService.CanUserAccessProject(projectID, user)
	if err != nil {
		return nil, fmt.Errorf("failed to verify project access: %w", err)
	}
	if !canAccess {
		return nil, errors.New("insufficient permissions to view project fields")
	}

	discoveredFieldNames, err := s.logRepository.DiscoverFields(projectID)
	if err != nil {
		s.logger.Warn("Failed to discover fields from logs storage, using predefined fields only",
			slog.String("error", err.Error()),
			slog.String("projectId", projectID.String()))
		discoveredFieldNames = []string{} // Continue with predefined fields only
	}

	allFields := s.combineFields(discoveredFieldNames)

	// Filter fields based on query parameter (case-insensitive ILIKE behavior)
	filteredFields := s.filterFields(allFields, request.Query)

	// Limit to 50 fields
	const maxFields = 50
	if len(filteredFields) > maxFields {
		filteredFields = filteredFields[:maxFields]
	}

	return &logs_core.GetQueryableFieldsResponseDTO{
		Fields: filteredFields,
	}, nil
}

func (s *LogQueryService) GetProjectStats(
	projectID uuid.UUID,
	user *users_models.User,
) (*logs_core.LogsStatsDTO, error) {
	s.logger.Info("Starting project stats request",
		"projectId", projectID.String(),
		"userId", user.ID.String())

	canAccess, _, err := s.projectService.CanUserAccessProject(projectID, user)
	if err != nil {
		s.logger.Error("Failed to verify project access for stats",
			"projectId", projectID.String(),
			"userId", user.ID.String(),
			"error", err.Error())
		return nil, fmt.Errorf("failed to verify project access: %w", err)
	}
	if !canAccess {
		s.logger.Warn("User lacks permission to view project stats",
			"projectId", projectID.String(),
			"userId", user.ID.String())
		return nil, errors.New("insufficient permissions to view project stats")
	}

	s.logger.Info("User authorized to view project stats, calling repository",
		"projectId", projectID.String(),
		"userId", user.ID.String())

	stats, err := s.logRepository.GetProjectLogStats(projectID)
	if err != nil {
		s.logger.Error("Repository failed to get project stats",
			"projectId", projectID.String(),
			"userId", user.ID.String(),
			"error", err.Error())
		return nil, fmt.Errorf("failed to get project stats: %w", err)
	}

	s.logger.Info("Successfully retrieved project stats from repository",
		"projectId", projectID.String(),
		"userId", user.ID.String(),
		"totalLogs", stats.TotalLogs,
		"totalSizeMB", stats.TotalSizeMB,
		"oldestLogTime", stats.OldestLogTime.Format("2006-01-02T15:04:05.000Z07:00"),
		"newestLogTime", stats.NewestLogTime.Format("2006-01-02T15:04:05.000Z07:00"),
		"oldestLogTimeIsZero", stats.OldestLogTime.IsZero(),
		"newestLogTimeIsZero", stats.NewestLogTime.IsZero())

	return stats, nil
}

func (s *LogQueryService) GetSystemStats(
	user *users_models.User,
) (*logs_core.LogsStatsDTO, error) {
	if !user.CanManageUsers() {
		return nil, errors.New("insufficient permissions to view system stats")
	}

	s.logger.Info("Admin user requesting system-wide stats",
		"userId", user.ID.String(),
		"userEmail", user.Email)

	stats, err := s.logRepository.GetSystemLogStats()
	if err != nil {
		s.logger.Error("Repository failed to get system stats",
			"userId", user.ID.String(),
			"error", err.Error())
		return nil, fmt.Errorf("failed to get system stats: %w", err)
	}

	s.logger.Info("Successfully retrieved system stats",
		"userId", user.ID.String(),
		"totalLogs", stats.TotalLogs,
		"totalSizeMB", stats.TotalSizeMB)

	return stats, nil
}

func (s *LogQueryService) combineFields(discoveredFieldNames []string) []logs_core.QueryableField {
	fieldMap := make(map[string]logs_core.QueryableField)
	for _, field := range logs_core.PredefinedQueryableFields {
		fieldMap[field.Name] = field
	}

	for _, fieldName := range discoveredFieldNames {
		if _, exists := fieldMap[fieldName]; exists {
			continue
		}

		// Skip internal logs storage fields
		if s.isInternalField(fieldName) {
			continue
		}

		customField := logs_core.QueryableField{
			Name:     fieldName,
			Type:     logs_core.QueryableFieldTypeString, // Default to string for custom fields
			IsCustom: true,
			Operations: []logs_core.ConditionOperator{
				logs_core.ConditionOperatorEquals, logs_core.ConditionOperatorNotEquals,
				logs_core.ConditionOperatorContains, logs_core.ConditionOperatorNotContains,
				logs_core.ConditionOperatorExists, logs_core.ConditionOperatorNotExists,
			},
		}

		fieldMap[customField.Name] = customField
	}

	fields := make([]logs_core.QueryableField, 0, len(fieldMap))
	for _, field := range fieldMap {
		fields = append(fields, field)
	}

	return fields
}

func (s *LogQueryService) filterFields(fields []logs_core.QueryableField, query string) []logs_core.QueryableField {
	if query == "" {
		return fields // Return all fields if no query specified
	}

	query = strings.ToLower(query)
	filteredFields := make([]logs_core.QueryableField, 0)

	for _, field := range fields {
		// Check name (case-insensitive)
		if strings.Contains(strings.ToLower(field.Name), query) {
			filteredFields = append(filteredFields, field)
		}
	}

	return filteredFields
}

func (s *LogQueryService) isInternalField(fieldName string) bool {
	internalFields := map[string]bool{
		"_msg":    true,
		"_time":   true,
		"_stream": true,
		"project": true, // Our internal project field
	}
	return internalFields[fieldName]
}

func (s *LogQueryService) GetUserActiveQueryCount(userID uuid.UUID) (int, error) {
	return s.concurrentQueryLimiter.GetActiveQueryCount(userID)
}

func (s *LogQueryService) CleanupPendingQueries() error {
	if err := s.concurrentQueryLimiter.CleanupAllQuerySlots(); err != nil {
		return fmt.Errorf("failed to cleanup query slots on startup: %w", err)
	}

	return nil
}

func (s *LogQueryService) validateQueryAccess(
	projectID uuid.UUID,
	query *logs_core.QueryNode,
	user *users_models.User,
) error {
	canAccess, _, err := s.projectService.CanUserAccessProject(projectID, user)
	if err != nil {
		return fmt.Errorf("failed to verify project access: %w", err)
	}
	if !canAccess {
		return errors.New("insufficient permissions to query project logs")
	}

	if err := s.queryValidator.ValidateQuery(query); err != nil {
		return fmt.Errorf("invalid query structure: %w", err)
	}

	return nil
}

func normalizeStreamRequest(request *logs_core.LogQueryRequestDTO) time.Time {
	if request.Limit <= 0 || request.Limit > 500 {
		request.Limit = 200
	}

	request.Offset = 0
	request.SortOrder = "asc"

	now := time.Now().UTC()
	if request.TimeRange == nil {
		request.TimeRange = &logs_core.TimeRangeDTO{}
	}

	if request.TimeRange.From == nil {
		request.TimeRange.From = &now
	}

	request.TimeRange.To = &now

	return *request.TimeRange.From
}

func (s *LogQueryService) validateTimeRange(timeRange *logs_core.TimeRangeDTO) error {
	if timeRange == nil {
		return &ValidationError{
			Code:    logs_core.ErrorMissingTimeRangeTo,
			Message: "timeRange is required for pagination consistency",
		}
	}

	if timeRange.To == nil {
		return &ValidationError{
			Code:    logs_core.ErrorMissingTimeRangeTo,
			Message: "timeRange.to is required for pagination consistency to prevent issues when new logs are inserted",
		}
	}

	// Optional: validate that From is before To if both are provided
	if timeRange.From != nil && timeRange.To != nil {
		if timeRange.From.After(*timeRange.To) {
			return &ValidationError{
				Code:    logs_core.ErrorInvalidQueryStructure,
				Message: "timeRange.from must be before timeRange.to",
			}
		}
	}

	return nil
}
