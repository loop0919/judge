package database

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/secretsmanager"
)

type fakeSecrets struct {
	value string
	err   error
	calls int
}

func (f *fakeSecrets) GetSecretValue(_ context.Context, in *secretsmanager.GetSecretValueInput, _ ...func(*secretsmanager.Options)) (*secretsmanager.GetSecretValueOutput, error) {
	f.calls++
	if aws.ToString(in.SecretId) != "secret-arn" || aws.ToString(in.VersionStage) != "AWSCURRENT" {
		return nil, errors.New("unexpected secret request")
	}
	return &secretsmanager.GetSecretValueOutput{SecretString: aws.String(f.value)}, f.err
}
func TestRotatedDatabaseCredentialsAndTLS(t *testing.T) {
	reader := &fakeSecrets{value: `{"username":"db_user","password":"before"}`}
	cfg, err := secretPoolConfig("db.example", "openoj", "secret-arn", reader)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.ConnConfig.TLSConfig == nil || cfg.ConnConfig.TLSConfig.InsecureSkipVerify || cfg.ConnConfig.TLSConfig.ServerName != "db.example" || cfg.ConnConfig.TLSConfig.RootCAs == nil || len(cfg.ConnConfig.Fallbacks) != 0 {
		t.Fatal("database TLS must verify the RDS host without plaintext fallback")
	}
	conn := cfg.ConnConfig.Copy()
	if err := cfg.BeforeConnect(context.Background(), conn); err != nil {
		t.Fatal(err)
	}
	if conn.User != "db_user" || conn.Password != "before" {
		t.Fatal("initial credentials missing")
	}
	reader.value = `{"username":"db_user","password":"after"}`
	conn = cfg.ConnConfig.Copy()
	if err := cfg.BeforeConnect(context.Background(), conn); err != nil {
		t.Fatal(err)
	}
	if conn.Password != "after" || reader.calls != 2 {
		t.Fatal("new connections must use rotated credentials")
	}
}
func TestDatabaseSecretErrorsAreRedacted(t *testing.T) {
	for _, reader := range []*fakeSecrets{{value: "private-bad-json"}, {value: `{}`}, {err: errors.New("private-provider-details")}} {
		cfg, err := secretPoolConfig("db.example", "openoj", "secret-arn", reader)
		if err != nil {
			t.Fatal(err)
		}
		err = cfg.BeforeConnect(context.Background(), cfg.ConnConfig.Copy())
		if err == nil || strings.Contains(err.Error(), "private") {
			t.Fatalf("expected redacted error, got %v", err)
		}
	}
}
