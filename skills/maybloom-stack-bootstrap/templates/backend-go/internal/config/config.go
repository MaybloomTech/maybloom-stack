// Package config is the backend's configuration: a struct filled from the
// environment and validated as a whole at boot, so a missing or malformed
// setting refuses the start instead of failing the first request. Every
// setting is a field here, a case in Validate and a line in .env.example.
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"net/url"

	"github.com/caarlos0/env/v11"
)

type Config struct {
	// Listen address.
	Addr string `env:"ADDR" envDefault:":8080"`
	// "production" or "development". Production refuses the dev shortcuts.
	Environment string `env:"ENVIRONMENT" envDefault:"development"`
	// Where browsers reach the app; https in production.
	PublicURL string `env:"PUBLIC_URL" envDefault:"http://localhost:8080"`
	// pgx pool URL. Migrations run against it on boot.
	DatabaseURL string `env:"DATABASE_URL,required"`
	// Development only: every request is this user, no identity provider
	// needed. Production refuses it; it needs a real auth.Authenticator, and
	// until one is wired (cmd/<slug>/main.go) Validate refuses to boot
	// without DEV_USER, so a deploy fails at config time, before the
	// database is opened or migrated.
	DevUser string `env:"DEV_USER"`
	// Browser origins allowed to call the API from another origin (the Expo
	// dev server). Empty means no CORS headers at all, which is production:
	// the web export is served from the API's own origin.
	CORSOrigins []string `env:"CORS_ORIGINS" envSeparator:","`
	// "json" or "text". Empty picks json in production, text otherwise.
	LogFormat string `env:"LOG_FORMAT"`
	// debug, info, warn or error. Successful RPCs log at debug; info is the
	// mutations, the refusals and the lifecycle.
	LogLevel string `env:"LOG_LEVEL" envDefault:"info"`
	// Cap on any request body, including Connect messages.
	MaxRequestBytes int64 `env:"MAX_REQUEST_BYTES" envDefault:"1048576"`
}

func Load() (Config, error) {
	cfg, err := env.ParseAs[Config]()
	if err != nil {
		return Config{}, fmt.Errorf("read environment: %w", err)
	}
	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func (c Config) Production() bool { return c.Environment == "production" }

// Validate checks every setting and the rules between them, and reports all
// the failures at once.
func (c Config) Validate() error {
	var errs []error
	if c.Environment != "production" && c.Environment != "development" {
		errs = append(errs, fmt.Errorf("ENVIRONMENT must be production or development, got %q", c.Environment))
	}
	if u, err := url.Parse(c.PublicURL); err != nil || u.Scheme == "" || u.Host == "" {
		errs = append(errs, fmt.Errorf("PUBLIC_URL must be an absolute URL, got %q", c.PublicURL))
	} else if c.Production() && u.Scheme != "https" {
		errs = append(errs, errors.New("PUBLIC_URL must be https in production"))
	}
	if c.MaxRequestBytes <= 0 {
		errs = append(errs, errors.New("MAX_REQUEST_BYTES must be positive"))
	}
	if c.LogFormat != "" && c.LogFormat != "json" && c.LogFormat != "text" {
		errs = append(errs, fmt.Errorf("LOG_FORMAT must be json or text, got %q", c.LogFormat))
	}
	if _, err := c.SlogLevel(); err != nil {
		errs = append(errs, err)
	}
	for _, origin := range c.CORSOrigins {
		u, err := url.Parse(origin)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.Path != "" {
			errs = append(errs, fmt.Errorf("CORS_ORIGINS entries are origins like http://localhost:8081, got %q", origin))
		}
	}
	// The authenticator rule. Replace this case, not the one above, when a
	// real auth.Authenticator is wired: production must never take DEV_USER.
	switch {
	case c.Production() && c.DevUser != "":
		errs = append(errs, errors.New("DEV_USER is not allowed in production"))
	case c.DevUser == "":
		errs = append(errs, errors.New("no authenticator: set DEV_USER in development, or wire an auth.Authenticator (config.Validate, cmd/<slug>/main.go)"))
	}
	return errors.Join(errs...)
}

// SlogLevel is LOG_LEVEL as slog reads it.
func (c Config) SlogLevel() (slog.Level, error) {
	switch c.LogLevel {
	case "debug":
		return slog.LevelDebug, nil
	case "info":
		return slog.LevelInfo, nil
	case "warn":
		return slog.LevelWarn, nil
	case "error":
		return slog.LevelError, nil
	}
	return 0, fmt.Errorf("LOG_LEVEL must be debug, info, warn or error, got %q", c.LogLevel)
}

// Summary is what the startup log prints. Mask every secret added here.
func (c Config) Summary() map[string]any {
	return map[string]any{
		"addr":              c.Addr,
		"environment":       c.Environment,
		"public_url":        c.PublicURL,
		"dev_user":          c.DevUser,
		"cors_origins":      c.CORSOrigins,
		"log_format":        c.LogFormat,
		"log_level":         c.LogLevel,
		"max_request_bytes": c.MaxRequestBytes,
	}
}
