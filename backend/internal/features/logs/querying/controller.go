package logs_querying

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	logs_core "logbull/internal/features/logs/core"
	users_models "logbull/internal/features/users/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type LogQueryController struct {
	logQueryService *LogQueryService
}

func (c *LogQueryController) RegisterRoutes(router *gin.RouterGroup) {
	queryRoutes := router.Group("/logs/query")

	queryRoutes.POST("/execute/:projectId", c.ExecuteQuery)
	queryRoutes.POST("/stream/:projectId", c.StreamQuery)
	queryRoutes.GET("/fields/:projectId", c.GetQueryableFields)
	queryRoutes.GET("/stats/:projectId", c.GetProjectStats)
	queryRoutes.GET("/system-stats", c.GetSystemStats)
}

// ExecuteQuery
// @Summary Execute log query
// @Description Execute a structured query against project logs. timeRange.to is required for pagination consistency.
// @Tags logs-query
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param projectId path string true "Project ID (UUID format)"
// @Param request body logs_core.LogQueryRequestDTO true "Query request"
// @Success 200 {object} logs_core.LogQueryResponseDTO
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Failure 408 {object} map[string]string
// @Failure 429 {object} map[string]string
// @Router /logs/query/execute/{projectId} [post]
func (c *LogQueryController) ExecuteQuery(ctx *gin.Context) {
	user, isOk := ctx.MustGet("user").(*users_models.User)
	if !isOk {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user type in context"})
		return
	}

	projectIDStr := ctx.Param("projectId")
	projectID, err := uuid.Parse(projectIDStr)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Invalid project ID format"})
		return
	}

	var request logs_core.LogQueryRequestDTO
	if err := ctx.ShouldBindJSON(&request); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	response, err := c.logQueryService.ExecuteQuery(projectID, &request, user)
	if err != nil {
		c.handleError(ctx, err)
		return
	}

	ctx.JSON(http.StatusOK, response)
}

// StreamQuery
// @Summary Stream realtime log query results
// @Description Stream new logs matching a structured query using Server-Sent Events.
// @Tags logs-query
// @Accept json
// @Produce text/event-stream
// @Security BearerAuth
// @Param projectId path string true "Project ID (UUID format)"
// @Param request body logs_core.LogQueryRequestDTO true "Query request"
// @Success 200 {string} string "SSE stream of logs_core.LogQueryResponseDTO payloads"
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Router /logs/query/stream/{projectId} [post]
func (c *LogQueryController) StreamQuery(ctx *gin.Context) {
	user, isOk := ctx.MustGet("user").(*users_models.User)
	if !isOk {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user type in context"})
		return
	}

	projectIDStr := ctx.Param("projectId")
	projectID, err := uuid.Parse(projectIDStr)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Invalid project ID format"})
		return
	}

	var request logs_core.LogQueryRequestDTO
	if err := ctx.ShouldBindJSON(&request); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	lastSeen := normalizeStreamRequest(&request)
	flusher, ok := ctx.Writer.(http.Flusher)
	if !ok {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Streaming is not supported"})
		return
	}

	ctx.Header("Content-Type", "text/event-stream")
	ctx.Header("Cache-Control", "no-cache")
	ctx.Header("Connection", "keep-alive")
	ctx.Header("X-Accel-Buffering", "no")

	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	writeSSEComment(ctx, "connected")
	flusher.Flush()

	for {
		select {
		case <-ctx.Request.Context().Done():
			return
		case <-ticker.C:
			now := time.Now().UTC()
			from := lastSeen.Add(time.Nanosecond)
			streamRequest := request
			streamRequest.TimeRange = &logs_core.TimeRangeDTO{
				From: &from,
				To:   &now,
			}

			response, err := c.logQueryService.ExecuteStreamPoll(projectID, &streamRequest, user)
			if err != nil {
				writeSSEError(ctx, err)
				flusher.Flush()
				return
			}

			if len(response.Logs) == 0 {
				writeSSEComment(ctx, "heartbeat")
				flusher.Flush()
				continue
			}

			for _, log := range response.Logs {
				if log.Timestamp.After(lastSeen) {
					lastSeen = log.Timestamp
				}
			}

			if err := writeSSEEvent(ctx, "logs", response); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

// GetQueryableFields
// @Summary Get available queryable fields
// @Description Get list of fields that can be queried for a project, with optional search query
// @Tags logs-query
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param projectId path string true "Project ID (UUID format)"
// @Param query query string false "Search query to filter field names"
// @Success 200 {object} logs_core.GetQueryableFieldsResponseDTO
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Router /logs/query/fields/{projectId} [get]
func (c *LogQueryController) GetQueryableFields(ctx *gin.Context) {
	user, isOk := ctx.MustGet("user").(*users_models.User)
	if !isOk {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user type in context"})
		return
	}

	projectIDStr := ctx.Param("projectId")
	projectID, err := uuid.Parse(projectIDStr)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Invalid project ID format"})
		return
	}

	var request logs_core.GetQueryableFieldsRequestDTO
	if err := ctx.ShouldBindQuery(&request); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Invalid query parameters"})
		return
	}

	response, err := c.logQueryService.GetQueryableFields(projectID, &request, user)
	if err != nil {
		if strings.Contains(err.Error(), "insufficient permissions") {
			ctx.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		} else {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get queryable fields"})
		}
		return
	}

	ctx.JSON(http.StatusOK, response)
}

// GetProjectStats
// @Summary Get project log statistics
// @Description Get statistics about logs for a project including total count, size, and time range
// @Tags logs-query
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param projectId path string true "Project ID (UUID format)"
// @Success 200 {object} logs_core.LogsStatsDTO
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Router /logs/query/stats/{projectId} [get]
func (c *LogQueryController) GetProjectStats(ctx *gin.Context) {
	user, isOk := ctx.MustGet("user").(*users_models.User)
	if !isOk {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user type in context"})
		return
	}

	projectIDStr := ctx.Param("projectId")
	projectID, err := uuid.Parse(projectIDStr)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Invalid project ID format"})
		return
	}

	response, err := c.logQueryService.GetProjectStats(projectID, user)
	if err != nil {
		if strings.Contains(err.Error(), "insufficient permissions") {
			ctx.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		} else {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get project stats"})
		}
		return
	}

	ctx.JSON(http.StatusOK, response)
}

// GetSystemStats
// @Summary Get system-wide log statistics (ADMIN only)
// @Description Get statistics about logs across all projects in the system
// @Tags logs-query
// @Accept json
// @Produce json
// @Security BearerAuth
// @Success 200 {object} logs_core.LogsStatsDTO
// @Failure 401 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Router /logs/query/system-stats [get]
func (c *LogQueryController) GetSystemStats(ctx *gin.Context) {
	user, isOk := ctx.MustGet("user").(*users_models.User)
	if !isOk {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user type in context"})
		return
	}

	response, err := c.logQueryService.GetSystemStats(user)
	if err != nil {
		if strings.Contains(err.Error(), "insufficient permissions") {
			ctx.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		} else {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get system stats"})
		}
		return
	}

	ctx.JSON(http.StatusOK, response)
}

func (c *LogQueryController) handleError(ctx *gin.Context, err error) {
	if validationErr, ok := err.(*ValidationError); ok {
		statusCode := c.getStatusCodeForQueryValidationError(validationErr.Code)
		ctx.JSON(statusCode, gin.H{
			"error": validationErr.Message,
			"code":  validationErr.Code,
		})
		return
	}

	if strings.Contains(err.Error(), "insufficient permissions") {
		ctx.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	if strings.Contains(err.Error(), "invalid query") {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if strings.Contains(err.Error(), "timeout") || strings.Contains(err.Error(), "context deadline") {
		ctx.JSON(http.StatusRequestTimeout, gin.H{"error": "Query execution timed out"})
		return
	}

	ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to execute query"})
}

func (c *LogQueryController) getStatusCodeForQueryValidationError(errorCode string) int {
	switch errorCode {
	case logs_core.ErrorTooManyConcurrentQueries:
		return http.StatusTooManyRequests
	case logs_core.ErrorInvalidQueryStructure, logs_core.ErrorQueryTooComplex, logs_core.ErrorMissingTimeRangeTo:
		return http.StatusBadRequest
	case logs_core.ErrorQueryTimeout:
		return http.StatusRequestTimeout
	default:
		return http.StatusBadRequest
	}
}

func writeSSEComment(ctx *gin.Context, message string) {
	_, _ = ctx.Writer.WriteString(": " + message + "\n\n")
}

func writeSSEError(ctx *gin.Context, err error) {
	payload := gin.H{"error": err.Error()}
	_ = writeSSEEvent(ctx, "error", payload)
}

func writeSSEEvent(ctx *gin.Context, event string, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	if _, err := ctx.Writer.WriteString("event: " + event + "\n"); err != nil {
		return err
	}
	if _, err := ctx.Writer.WriteString("data: " + string(data) + "\n\n"); err != nil {
		return err
	}

	return nil
}
