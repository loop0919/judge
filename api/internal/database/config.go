package database

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	_ "embed"
	"encoding/json"
	"errors"
	"net/url"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/secretsmanager"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Public AWS RDS Tokyo CA bundle, fetched from
// https://truststore.pki.rds.amazonaws.com/ap-northeast-1/ap-northeast-1-bundle.pem
// Refresh this bundle when changing regions or when AWS replaces its root CAs.
//
//go:embed rds-ca-bundle.pem
var rdsCAs []byte

type secretReader interface {
	GetSecretValue(context.Context, *secretsmanager.GetSecretValueInput, ...func(*secretsmanager.Options)) (*secretsmanager.GetSecretValueOutput, error)
}

// OpenConfigured keeps local DATABASE_URL support; deployed Lambda uses its IAM
// role to read RDS-managed credentials without putting the password in its environment.
func OpenConfigured(ctx context.Context, getenv func(string) string) (*pgxpool.Pool, error) {
	if dsn := getenv("DATABASE_URL"); dsn != "" {
		if getenv("DATABASE_SECRET_ARN") != "" {
			return nil, errors.New("configure DATABASE_URL or DATABASE_SECRET_ARN, not both")
		}
		return Open(ctx, dsn)
	}
	host, name, arn := getenv("DATABASE_HOST"), getenv("DATABASE_NAME"), getenv("DATABASE_SECRET_ARN")
	if host == "" || name == "" || arn == "" {
		return nil, errors.New("DATABASE_HOST, DATABASE_NAME and DATABASE_SECRET_ARN are required")
	}
	sdk, err := config.LoadDefaultConfig(ctx, config.WithRegion(getenv("AWS_REGION")))
	if err != nil {
		return nil, errors.New("cannot configure database credentials")
	}
	cfg, err := secretPoolConfig(host, name, arn, secretsmanager.NewFromConfig(sdk))
	if err != nil {
		return nil, err
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, errors.New("cannot create database pool")
	}
	return pool, nil
}

func secretPoolConfig(host, name, arn string, reader secretReader) (*pgxpool.Config, error) {
	dsn := &url.URL{Scheme: "postgres", Host: host + ":5432", Path: "/" + name, RawQuery: "sslmode=verify-full"}
	cfg, err := pgxpool.ParseConfig(dsn.String())
	if err != nil {
		return nil, errors.New("invalid database configuration")
	}
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(rdsCAs) {
		return nil, errors.New("invalid RDS CA bundle")
	}
	cfg.ConnConfig.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS12, RootCAs: roots, ServerName: host}
	cfg.ConnConfig.Fallbacks = nil
	cfg.MaxConns = 4
	cfg.MinConns = 0
	cfg.MaxConnIdleTime = 5 * time.Minute
	cfg.ConnConfig.ConnectTimeout = 5 * time.Second
	// Fetch AWSCURRENT for every new physical connection, including after rotation.
	// Existing connections remain usable and do not require extra Secrets Manager calls.
	cfg.BeforeConnect = func(ctx context.Context, conn *pgx.ConnConfig) error {
		ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		result, err := reader.GetSecretValue(ctx, &secretsmanager.GetSecretValueInput{SecretId: aws.String(arn), VersionStage: aws.String("AWSCURRENT")})
		if err != nil || result == nil || result.SecretString == nil {
			return errors.New("cannot retrieve database credentials")
		}
		var credentials struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if json.Unmarshal([]byte(*result.SecretString), &credentials) != nil || credentials.Username == "" || credentials.Password == "" {
			return errors.New("invalid database credentials")
		}
		conn.User, conn.Password = credentials.Username, credentials.Password
		return nil
	}
	return cfg, nil
}
