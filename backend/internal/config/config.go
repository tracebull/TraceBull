package config

import (
	env_utils "logbull/internal/util/env"
	"logbull/internal/util/logger"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/ilyakaznacheev/cleanenv"
	"github.com/joho/godotenv"
)

var log = logger.GetLogger()

const (
	AppModeWeb        = "web"
	AppModeBackground = "background"
)

type EnvVariables struct {
	IsTesting       bool
	DatabaseDsn     string            `env:"DATABASE_DSN"              required:"true"`
	EnvMode         env_utils.EnvMode `env:"ENV_MODE"                  required:"true"`
	BackendRootPath string            `env:"BACKEND_ROOT_PATH"         required:"true"`
	// cache
	ValkeyHost     string `env:"VALKEY_HOST"               required:"true"`
	ValkeyPort     string `env:"VALKEY_PORT"               required:"true"`
	ValkeyUsername string `env:"VALKEY_USERNAME"           required:"false"`
	ValkeyPassword string `env:"VALKEY_PASSWORD"           required:"false"`
	ValkeyIsSsl    bool   `env:"VALKEY_IS_SSL"             required:"true"`
	// log storage backend
	LogStorageBackend string `env:"LOG_STORAGE_BACKEND" envDefault:"victorialogs"`
	// victorialogs
	VictoriaLogsURL  string `env:"VICTORIALOGS_URL"`
	VictoriaLogsPort string `env:"VICTORIALOGS_PORT"`
	// oauth
	GitHubClientID       string `env:"GITHUB_CLIENT_ID"`
	GitHubClientSecret   string `env:"GITHUB_CLIENT_SECRET"`
	GoogleClientID       string `env:"GOOGLE_CLIENT_ID"`
	GoogleClientSecret   string `env:"GOOGLE_CLIENT_SECRET"`
	MicrosoftClientID    string `env:"MICROSOFT_CLIENT_ID"`
	MicrosoftClientSecret string `env:"MICROSOFT_CLIENT_SECRET"`
}

var (
	env  EnvVariables
	once sync.Once
)

func GetEnv() EnvVariables {
	once.Do(loadEnvVariables)
	return env
}

func loadEnvVariables() {
	// Get current working directory
	cwd, err := os.Getwd()
	if err != nil {
		log.Warn("could not get current working directory", "error", err)
		cwd = "."
	}

	backendRoot := cwd
	for {
		if _, err := os.Stat(filepath.Join(backendRoot, "go.mod")); err == nil {
			break
		}

		parent := filepath.Dir(backendRoot)
		if parent == backendRoot {
			break
		}

		backendRoot = parent
	}

	env.BackendRootPath = backendRoot

	envPaths := []string{
		filepath.Join(cwd, ".env"),
		filepath.Join(backendRoot, ".env"),
	}

	var loaded bool
	for _, path := range envPaths {
		log.Info("Trying to load .env", "path", path)
		if err := godotenv.Load(path); err == nil {
			log.Info("Successfully loaded .env", "path", path)
			loaded = true
			break
		}
	}

	if !loaded {
		log.Error("Error loading .env file: could not find .env in any location")
		os.Exit(1)
	}

	err = cleanenv.ReadEnv(&env)
	if err != nil {
		log.Error("Configuration could not be loaded", "error", err)
		os.Exit(1)
	}

	for _, arg := range os.Args {
		if strings.Contains(arg, "test") {
			env.IsTesting = true
			break
		}
	}

	if env.DatabaseDsn == "" {
		log.Error("DATABASE_DSN is empty")
		os.Exit(1)
	}

	if env.EnvMode == "" {
		log.Error("ENV_MODE is empty")
		os.Exit(1)
	}
	if env.EnvMode != "development" && env.EnvMode != "production" {
		log.Error("ENV_MODE is invalid", "mode", env.EnvMode)
		os.Exit(1)
	}
	log.Info("ENV_MODE loaded", "mode", env.EnvMode)

	// Valkey
	if env.ValkeyHost == "" {
		log.Error("VALKEY_HOST is empty")
		os.Exit(1)
	}
	if env.ValkeyPort == "" {
		log.Error("VALKEY_PORT is empty")
		os.Exit(1)
	}

	// VictoriaLogs
	if env.VictoriaLogsURL == "" {
		log.Error("VICTORIALOGS_URL is empty")
		os.Exit(1)
	}
	if env.VictoriaLogsPort == "" {
		log.Error("VICTORIALOGS_PORT is empty")
		os.Exit(1)
	}

	log.Info("Environment variables loaded successfully!")
}
