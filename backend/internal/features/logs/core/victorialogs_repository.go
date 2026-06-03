package logs_core

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"logbull/internal/config"
	"logbull/internal/util/logger"
)

var victoriaLogsSystemFields = map[string]bool{
	"_msg":       true,
	"_time":      true,
	"_stream":    true,
	"_stream_id": true,
}

type VictoriaLogsRepository struct {
	client   *http.Client
	baseURL  string
	timeout  time.Duration
	logger   *slog.Logger
}

func newVictoriaLogsStorage(env config.EnvVariables) *VictoriaLogsRepository {
	return &VictoriaLogsRepository{
		client: &http.Client{
			Timeout: 10 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 10,
				MaxConnsPerHost:     50,
				IdleConnTimeout:     90 * time.Second,
				DisableKeepAlives:   false,
				ForceAttemptHTTP2:   false,
			},
		},
		baseURL: strings.TrimRight(fmt.Sprintf("%s:%s", env.VictoriaLogsURL, env.VictoriaLogsPort), "/"),
		timeout: 5 * time.Minute,
		logger:  logger.GetLogger(),
	}
}

func (r *VictoriaLogsRepository) StoreLogsBatch(entries map[uuid.UUID][]*LogItem) error {
	if len(entries) == 0 {
		return nil
	}

	for projectID, logs := range entries {
		if err := r.storeLogsForProject(projectID, logs); err != nil {
			return err
		}
	}

	return nil
}

func (r *VictoriaLogsRepository) storeLogsForProject(projectID uuid.UUID, logs []*LogItem) error {
	if len(logs) == 0 {
		return nil
	}

	projectIDStr := projectID.String()
	var body strings.Builder

	for _, logItem := range logs {
		body.WriteString(`{"create":{}}`)
		body.WriteByte('\n')

		doc := map[string]any{
			"_msg":       logItem.Message,
			"_time":      logItem.Timestamp.UTC().Format(time.RFC3339Nano),
			"project_id": projectIDStr,
			"level":      string(logItem.Level),
			"id":         logItem.ID.String(),
		}

		if logItem.ClientIP != "" {
			doc["client_ip"] = logItem.ClientIP
		}

		for fieldName, fieldValue := range logItem.Fields {
			if fieldName == "project_id" || fieldName == "created_at" {
				continue
			}
			doc[fieldName] = fmt.Sprintf("%v", fieldValue)
		}

		docBytes, err := json.Marshal(doc)
		if err != nil {
			return fmt.Errorf("failed to marshal log document: %w", err)
		}
		body.Write(docBytes)
		body.WriteByte('\n')
	}

	req, err := http.NewRequest("POST", r.baseURL+"/insert/elasticsearch/_bulk?_stream_fields=project_id", strings.NewReader(body.String()))
	if err != nil {
		return fmt.Errorf("failed to create bulk request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-ndjson")

	resp, err := r.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send logs to VictoriaLogs: %w", err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			r.logger.Error("failed to close bulk response body", "error", closeErr)
		}
	}()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("VictoriaLogs bulk returned status %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

func (r *VictoriaLogsRepository) ExecuteQueryForProject(
	projectID uuid.UUID,
	request *LogQueryRequestDTO,
) (*LogQueryResponseDTO, error) {
	startTime := time.Now()

	logsql := r.buildLogsQL(projectID, request)

	sortOrder := "desc"
	if strings.ToLower(request.SortOrder) == "asc" {
		sortOrder = "asc"
	}
	logsql += fmt.Sprintf(" | sort by (_time %s)", sortOrder)

	if request.Offset > 0 {
		logsql += fmt.Sprintf(" | offset %d", request.Offset)
	}
	if request.Limit > 0 {
		logsql += fmt.Sprintf(" | limit %d", request.Limit)
	}

	queryResult, err := r.executeLogSQL(logsql)
	if err != nil {
		return nil, fmt.Errorf("failed to execute query: %w", err)
	}

	totalCount, err := r.queryTotalCount(projectID, request)
	if err != nil {
		r.logger.Warn("failed to get total count", "error", err)
		totalCount = 0
	}

	logItems := make([]LogItemDTO, 0, len(queryResult))
	for _, row := range queryResult {
		dto := r.parseLogRow(row)
		logItems = append(logItems, dto)
	}

	return &LogQueryResponseDTO{
		Logs:         logItems,
		Total:        totalCount,
		Limit:        request.Limit,
		Offset:       request.Offset,
		ExecutedInMs: time.Since(startTime).String(),
	}, nil
}

func (r *VictoriaLogsRepository) DiscoverFields(projectID uuid.UUID) ([]string, error) {
	form := url.Values{}
	form.Set("query", fmt.Sprintf(`{project_id="%s"}`, projectID.String()))

	req, err := http.NewRequest("POST", r.baseURL+"/select/logsql/field_names", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, fmt.Errorf("failed to create field names request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := r.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to discover fields: %w", err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			r.logger.Error("failed to close field names response body", "error", closeErr)
		}
	}()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("VictoriaLogs field_names returned status %d: %s", resp.StatusCode, string(respBody))
	}

	fieldSet := map[string]bool{}
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		var entry struct {
			Field string `json:"_field"`
		}
		if err := json.Unmarshal(scanner.Bytes(), &entry); err != nil {
			continue
		}
		if !victoriaLogsSystemFields[entry.Field] && !systemFields[entry.Field] {
			fieldSet[entry.Field] = true
		}
	}

	fields := make([]string, 0, len(fieldSet))
	for f := range fieldSet {
		fields = append(fields, f)
	}
	slices.Sort(fields)

	return fields, nil
}

func (r *VictoriaLogsRepository) ForceFlush() error {
	return nil
}

func (r *VictoriaLogsRepository) DeleteLogsByProject(projectID uuid.UUID) error {
	logsql := fmt.Sprintf(`{project_id="%s"}`, projectID.String())
	return r.executeDelete(logsql)
}

func (r *VictoriaLogsRepository) DeleteOldLogs(projectID uuid.UUID, olderThan time.Time) error {
	logsql := fmt.Sprintf(`{project_id="%s"} _time:<"%s"`, projectID.String(), olderThan.UTC().Format(time.RFC3339Nano))
	return r.executeDelete(logsql)
}

func (r *VictoriaLogsRepository) GetProjectLogStats(projectID uuid.UUID) (*LogsStatsDTO, error) {
	logsql := fmt.Sprintf(`{project_id="%s"} | stats count() as total, min(_time) as oldest, max(_time) as newest`, projectID.String())
	return r.queryStats(logsql)
}

func (r *VictoriaLogsRepository) GetSystemLogStats() (*LogsStatsDTO, error) {
	logsql := `* | stats count() as total, min(_time) as oldest, max(_time) as newest`
	return r.queryStats(logsql)
}

func (r *VictoriaLogsRepository) HealthCheck() error {
	req, err := http.NewRequest("GET", r.baseURL+"/health", nil)
	if err != nil {
		return fmt.Errorf("failed to create health check request: %w", err)
	}

	resp, err := r.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to connect to VictoriaLogs: %w", err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			r.logger.Error("failed to close health check response body", "error", closeErr)
		}
	}()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("VictoriaLogs health check returned status %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

func (r *VictoriaLogsRepository) executeLogSQL(logsql string) ([]map[string]any, error) {
	form := url.Values{}
	form.Set("query", logsql)

	req, err := http.NewRequest("POST", r.baseURL+"/select/logsql/query", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, fmt.Errorf("failed to create query request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := r.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute LogsQL query: %w", err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			r.logger.Error("failed to close query response body", "error", closeErr)
		}
	}()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("VictoriaLogs query returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var results []map[string]any
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		var row map[string]any
		if err := json.Unmarshal(line, &row); err != nil {
			continue
		}
		results = append(results, row)
	}

	return results, nil
}

func (r *VictoriaLogsRepository) executeDelete(logsql string) error {
	deleteURL := fmt.Sprintf("%s/delete/run_task?filter=%s", r.baseURL, url.QueryEscape(logsql))
	req, err := http.NewRequest("POST", deleteURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create delete request: %w", err)
	}

	resp, err := r.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to execute VictoriaLogs delete: %w", err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			r.logger.Error("failed to close delete response body", "error", closeErr)
		}
	}()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("VictoriaLogs delete returned status %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

func approximateLogSize(row map[string]any) int64 {
	var size int64 = 200 // Base overhead for system fields
	for k, v := range row {
		size += int64(len(k))
		size += int64(len(asString(v)))
	}
	return size
}

func (r *VictoriaLogsRepository) queryStats(logsql string) (*LogsStatsDTO, error) {
	rows, err := r.executeLogSQL(logsql)
	if err != nil {
		return nil, fmt.Errorf("failed to query stats: %w", err)
	}

	stats := &LogsStatsDTO{}

	if len(rows) == 0 {
		return stats, nil
	}

	row := rows[0]

	if total, ok := row["total"]; ok {
		stats.TotalLogs = toInt64(total)
	}

	if oldest, ok := row["oldest"]; ok {
		stats.OldestLogTime = parseTimeField(oldest)
	}

	if newest, ok := row["newest"]; ok {
		stats.NewestLogTime = parseTimeField(newest)
	}

	if stats.TotalLogs > 0 {
		baseQuery := logsql
		if idx := strings.Index(logsql, "| stats"); idx != -1 {
			baseQuery = logsql[:idx]
		}
		sampleQuery := baseQuery + " | limit 10"
		sampleRows, err := r.executeLogSQL(sampleQuery)
		if err == nil && len(sampleRows) > 0 {
			var totalSampleSize int64
			for _, sRow := range sampleRows {
				totalSampleSize += approximateLogSize(sRow)
			}
			avgSize := float64(totalSampleSize) / float64(len(sampleRows))
			stats.TotalSizeMB = (avgSize * float64(stats.TotalLogs)) / (1024 * 1024)
		}
	}

	return stats, nil
}


func (r *VictoriaLogsRepository) queryTotalCount(projectID uuid.UUID, request *LogQueryRequestDTO) (int64, error) {
	logsql := r.buildLogsQL(projectID, request)
	logsql += " | stats count() as total"

	rows, err := r.executeLogSQL(logsql)
	if err != nil {
		return 0, err
	}

	if len(rows) == 0 {
		return 0, nil
	}

	return toInt64(rows[0]["total"]), nil
}

func (r *VictoriaLogsRepository) buildLogsQL(projectID uuid.UUID, request *LogQueryRequestDTO) string {
	var parts []string

	parts = append(parts, fmt.Sprintf(`{project_id="%s"}`, projectID.String()))

	if request.TimeRange != nil {
		if request.TimeRange.From != nil {
			parts = append(parts, fmt.Sprintf(`_time:>=%s`, request.TimeRange.From.UTC().Format(time.RFC3339Nano)))
		}
		if request.TimeRange.To != nil {
			parts = append(parts, fmt.Sprintf(`_time:<=%s`, request.TimeRange.To.UTC().Format(time.RFC3339Nano)))
		}
	}

	if request.Query != nil {
		if queryFilter := r.buildQueryNodeFilter(request.Query); queryFilter != "" {
			parts = append(parts, queryFilter)
		}
	}

	return strings.Join(parts, " ")
}

func (r *VictoriaLogsRepository) buildQueryNodeFilter(node *QueryNode) string {
	if node == nil {
		return ""
	}

	switch node.Type {
	case QueryNodeTypeCondition:
		if node.Condition == nil {
			return ""
		}
		return r.buildConditionFilter(node.Condition)
	case QueryNodeTypeLogical:
		if node.Logic == nil || len(node.Logic.Children) == 0 {
			return ""
		}
		return r.buildLogicalFilter(node.Logic)
	default:
		return ""
	}
}

func (r *VictoriaLogsRepository) buildLogicalFilter(logic *LogicalNode) string {
	var childFilters []string
	for _, child := range logic.Children {
		if f := r.buildQueryNodeFilter(&child); f != "" {
			childFilters = append(childFilters, f)
		}
	}

	if len(childFilters) == 0 {
		return ""
	}

	switch logic.Operator {
	case LogicalOperatorAnd:
		if len(childFilters) == 1 {
			return childFilters[0]
		}
		return "(" + strings.Join(childFilters, ") AND (") + ")"
	case LogicalOperatorOr:
		return "(" + strings.Join(childFilters, ") OR (") + ")"
	case LogicalOperatorNot:
		if len(childFilters) == 1 {
			return "not " + childFilters[0]
		}
		return "not ((" + strings.Join(childFilters, ") AND (") + "))"
	default:
		return ""
	}
}

func (r *VictoriaLogsRepository) buildConditionFilter(condition *ConditionNode) string {
	fieldName := strings.TrimSpace(condition.Field)
	if fieldName == "" {
		return ""
	}

	logsQLField := r.mapFieldName(fieldName)
	valueStr := fmt.Sprintf("%v", condition.Value)

	switch condition.Operator {
	case ConditionOperatorEquals:
		if fieldName == "timestamp" {
			return fmt.Sprintf(`_time:<=%s AND _time:>=%s`, valueStr, valueStr)
		}
		return fmt.Sprintf(`%s:%s`, logsQLField, escapeLogsQLValue(valueStr))

	case ConditionOperatorNotEquals:
		if fieldName == "timestamp" {
			return fmt.Sprintf(`NOT (_time:<=%s AND _time:>=%s)`, valueStr, valueStr)
		}
		return fmt.Sprintf(`%s:!=%s`, logsQLField, escapeLogsQLValue(valueStr))

	case ConditionOperatorContains:
		return fmt.Sprintf(`%s:~".*%s.*"`, logsQLField, escapeLogsQLRegex(valueStr))

	case ConditionOperatorNotContains:
		return fmt.Sprintf(`%s:!~".*%s.*"`, logsQLField, escapeLogsQLRegex(valueStr))

	case ConditionOperatorIn:
		values := asStringSlice(condition.Value)
		if len(values) == 0 {
			return fmt.Sprintf(`%s:="__never_match__"`, logsQLField)
		}
		if fieldName == "timestamp" {
			var parts []string
			for _, v := range values {
				parts = append(parts, fmt.Sprintf(`(_time:<=%s AND _time:>=%s)`, v, v))
			}
			return "(" + strings.Join(parts, " or ") + ")"
		}
		escaped := make([]string, len(values))
		for i, v := range values {
			escaped[i] = escapeLogsQLRegex(v)
		}
		return fmt.Sprintf(`%s:~".*(%s).*"`, logsQLField, strings.Join(escaped, "|"))

	case ConditionOperatorNotIn:
		values := asStringSlice(condition.Value)
		if len(values) == 0 {
			return ""
		}
		escaped := make([]string, len(values))
		for i, v := range values {
			escaped[i] = escapeLogsQLRegex(v)
		}
		return fmt.Sprintf(`%s:!~".*(%s).*"`, logsQLField, strings.Join(escaped, "|"))

	case ConditionOperatorExists:
		if fieldName == "timestamp" {
			return `_time:>=0s`
		}
		return fmt.Sprintf(`%s:*`, logsQLField)

	case ConditionOperatorNotExists:
		if fieldName == "timestamp" {
			return `NOT (_time:>=0s)`
		}
		return fmt.Sprintf(`NOT (%s:*)`, logsQLField)

	case ConditionOperatorGreaterThan:
		if fieldName == "timestamp" {
			return fmt.Sprintf(`_time:>%s`, valueStr)
		}
		return fmt.Sprintf(`%s:>"%s"`, logsQLField, valueStr)

	case ConditionOperatorGreaterOrEqual:
		if fieldName == "timestamp" {
			return fmt.Sprintf(`_time:>=%s`, valueStr)
		}
		return fmt.Sprintf(`%s:>="%s"`, logsQLField, valueStr)

	case ConditionOperatorLessThan:
		if fieldName == "timestamp" {
			return fmt.Sprintf(`_time:<%s`, valueStr)
		}
		return fmt.Sprintf(`%s:<"%s"`, logsQLField, valueStr)

	case ConditionOperatorLessOrEqual:
		if fieldName == "timestamp" {
			return fmt.Sprintf(`_time:<=%s`, valueStr)
		}
		return fmt.Sprintf(`%s:<="%s"`, logsQLField, valueStr)

	default:
		return ""
	}
}

func (r *VictoriaLogsRepository) mapFieldName(field string) string {
	switch field {
	case "message":
		return "_msg"
	case "timestamp":
		return "_time"
	default:
		return field
	}
}

func (r *VictoriaLogsRepository) parseLogRow(row map[string]any) LogItemDTO {
	dto := LogItemDTO{
		ID:      asString(row["id"]),
		Level:   asString(row["level"]),
		Message: asString(row["_msg"]),
	}

	if clientIP, ok := row["client_ip"]; ok {
		dto.ClientIP = asString(clientIP)
	}

	if timeStr, ok := row["_time"]; ok {
		dto.Timestamp = parseTimeField(timeStr)
		dto.CreatedAt = dto.Timestamp
	}

	dto.Fields = make(map[string]any)
	var fieldNames []string
	for k := range row {
		if victoriaLogsSystemFields[k] {
			continue
		}
		if k == "id" || k == "level" || k == "client_ip" {
			continue
		}
		fieldNames = append(fieldNames, k)
	}

	if dto.ClientIP != "" {
		fieldNames = append(fieldNames, "client_ip")
	}

	slices.Sort(fieldNames)
	for _, k := range fieldNames {
		if k == "client_ip" {
			dto.Fields["client_ip"] = dto.ClientIP
		} else {
			dto.Fields[k] = row[k]
		}
	}

	return dto
}

func escapeLogsQLValue(value string) string {
	return strconv.Quote(value)
}

func escapeLogsQLRegex(value string) string {
	r := strings.NewReplacer(
		`\`, `\\`,
		`"`, `\"`,
		`.`, `\.`,
		`*`, `\*`,
		`+`, `\+`,
		`?`, `\?`,
		`(`, `\(`,
		`)`, `\)`,
		`[`, `\[`,
		`]`, `\]`,
		`{`, `\{`,
		`}`, `\}`,
		`|`, `\|`,
		`^`, `\^`,
		`$`, `\$`,
	)
	return r.Replace(value)
}

func parseTimeField(value any) time.Time {
	str := asString(value)
	for _, layout := range []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05.000Z",
		"2006-01-02T15:04:05Z",
	} {
		if t, err := time.Parse(layout, str); err == nil {
			return t.UTC()
		}
	}
	return time.Time{}
}

func toInt64(value any) int64 {
	switch v := value.(type) {
	case float64:
		return int64(v)
	case int64:
		return v
	case json.Number:
		n, err := v.Int64()
		if err != nil {
			return 0
		}
		return n
	case string:
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			return 0
		}
		return n
	default:
		return 0
	}
}

func asString(value any) string {
	switch v := value.(type) {
	case string:
		return v
	case fmt.Stringer:
		return v.String()
	default:
		return fmt.Sprintf("%v", v)
	}
}

func asStringSlice(value any) []string {
	switch v := value.(type) {
	case []string:
		return v
	case []any:
		result := make([]string, 0, len(v))
		for _, item := range v {
			result = append(result, asString(item))
		}
		return result
	default:
		return []string{asString(value)}
	}
}

var systemFields = map[string]bool{
	"id":         true,
	"level":      true,
	"message":    true,
	"client_ip":  true,
	"project_id": true,
	"timestamp":  true,
}
