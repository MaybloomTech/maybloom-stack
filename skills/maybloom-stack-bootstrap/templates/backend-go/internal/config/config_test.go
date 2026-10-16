package config

import (
	"strings"
	"testing"
)

func valid() Config {
	return Config{
		Addr:            ":8080",
		Environment:     "development",
		PublicURL:       "http://localhost:8080",
		DatabaseURL:     "postgres://localhost:5432/app",
		DevUser:         "dev",
		MaxRequestBytes: 1 << 20,
	}
}

func TestValidate(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		edit func(*Config)
		want string // a fragment of the error; "" means valid
	}{
		{name: "development defaults", edit: func(*Config) {}, want: ""},
		{name: "unknown environment", edit: func(c *Config) { c.Environment = "staging" }, want: "ENVIRONMENT"},
		{name: "relative public url", edit: func(c *Config) { c.PublicURL = "/app" }, want: "PUBLIC_URL"},
		{name: "production over http", edit: func(c *Config) {
			c.Environment = "production"
			c.DevUser = ""
		}, want: "https"},
		{name: "production with a dev user", edit: func(c *Config) {
			c.Environment = "production"
			c.PublicURL = "https://app.example.com"
		}, want: "DEV_USER"},
		{name: "bad cors origin", edit: func(c *Config) { c.CORSOrigins = []string{"localhost:8081"} }, want: "CORS_ORIGINS"},
		{name: "zero body cap", edit: func(c *Config) { c.MaxRequestBytes = 0 }, want: "MAX_REQUEST_BYTES"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			cfg := valid()
			tc.edit(&cfg)
			err := cfg.Validate()
			switch {
			case tc.want == "" && err != nil:
				t.Fatalf("want valid, got %v", err)
			case tc.want != "" && err == nil:
				t.Fatalf("want an error mentioning %q, got none", tc.want)
			case tc.want != "" && !strings.Contains(err.Error(), tc.want):
				t.Fatalf("want an error mentioning %q, got %v", tc.want, err)
			}
		})
	}
}
