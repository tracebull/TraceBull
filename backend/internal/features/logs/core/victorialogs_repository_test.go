package logs_core

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func Test_BuildConditionFilter_WithContainsOperator_UsesSubstringRegex(t *testing.T) {
	repository := &VictoriaLogsRepository{}

	filter := repository.buildConditionFilter(&ConditionNode{
		Field:    "message",
		Operator: ConditionOperatorContains,
		Value:    "config",
	})

	assert.Equal(t, `_msg:~".*config.*"`, filter)
}

func Test_BuildConditionFilter_WithNotContainsOperator_UsesSubstringRegex(t *testing.T) {
	repository := &VictoriaLogsRepository{}

	filter := repository.buildConditionFilter(&ConditionNode{
		Field:    "message",
		Operator: ConditionOperatorNotContains,
		Value:    "config",
	})

	assert.Equal(t, `_msg:!~".*config.*"`, filter)
}

func Test_BuildConditionFilter_WithContainsOperator_SpecialCharsEscaped(t *testing.T) {
	repository := &VictoriaLogsRepository{}

	filter := repository.buildConditionFilter(&ConditionNode{
		Field:    "client_ip",
		Operator: ConditionOperatorContains,
		Value:    "192.168",
	})

	assert.Equal(t, `client_ip:~".*192\\.168.*"`, filter)
}

func Test_BuildConditionFilter_WithNotContainsOperator_SpecialCharsEscaped(t *testing.T) {
	repository := &VictoriaLogsRepository{}

	filter := repository.buildConditionFilter(&ConditionNode{
		Field:    "message",
		Operator: ConditionOperatorNotContains,
		Value:    "hello.world*",
	})

	assert.Equal(t, `_msg:!~".*hello\\.world\\*.*"`, filter)
}
