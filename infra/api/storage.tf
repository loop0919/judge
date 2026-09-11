resource "aws_s3_bucket" "artifacts" {
  bucket_prefix = "${substr(local.name, 0, 26)}-artifacts-"
  force_destroy = false
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_ownership_controls" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.artifacts.arn, "${aws_s3_bucket.artifacts.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    id     = "AbortIncompleteMultipartUploads"
    status = "Enabled"
    filter { prefix = "" }
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
  rule {
    id     = "DeleteOldObjectVersions"
    status = "Enabled"
    filter { prefix = "" }
    noncurrent_version_expiration { noncurrent_days = 30 }
  }
  depends_on = [aws_s3_bucket_versioning.artifacts]
}

resource "aws_s3_object" "api_package" {
  bucket      = aws_s3_bucket.artifacts.id
  key         = "${local.name}/api/api.zip"
  source      = local.lambda_package_path
  source_hash = filebase64sha256(local.lambda_package_path)
  depends_on = [
    aws_s3_bucket_versioning.artifacts,
    aws_s3_bucket_server_side_encryption_configuration.artifacts,
    aws_s3_bucket_policy.artifacts,
    aws_s3_bucket_public_access_block.artifacts,
    aws_s3_bucket_ownership_controls.artifacts,
  ]
}

resource "aws_s3_bucket" "test_data" {
  bucket_prefix = "${substr(local.name, 0, 20)}-test-data-"
  force_destroy = false
  lifecycle { prevent_destroy = true }
}
resource "aws_s3_bucket_versioning" "test_data" {
  bucket = aws_s3_bucket.test_data.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "test_data" {
  bucket = aws_s3_bucket.test_data.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
resource "aws_s3_bucket_ownership_controls" "test_data" {
  bucket = aws_s3_bucket.test_data.id
  rule { object_ownership = "BucketOwnerEnforced" }
}
resource "aws_s3_bucket_public_access_block" "test_data" {
  bucket                  = aws_s3_bucket.test_data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_policy" "test_data" {
  bucket = aws_s3_bucket.test_data.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport", Effect = "Deny", Principal = "*", Action = "s3:*"
      Resource  = [aws_s3_bucket.test_data.arn, "${aws_s3_bucket.test_data.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
  lifecycle { prevent_destroy = true }
}
resource "aws_s3_bucket_cors_configuration" "test_data" {
  bucket = aws_s3_bucket.test_data.id
  cors_rule {
    allowed_methods = ["GET", "PUT"]
    allowed_origins = var.public_site_url == "" ? ["*"] : [var.public_site_url]
    allowed_headers = ["content-type", "x-amz-checksum-sha256", "x-amz-tagging"]
    expose_headers  = ["etag", "x-amz-version-id"]
    max_age_seconds = 600
  }
}
resource "aws_s3_bucket_lifecycle_configuration" "test_data" {
  bucket = aws_s3_bucket.test_data.id
  rule {
    id     = "expire-incomplete-test-files"
    status = "Enabled"
    filter {
      tag {
        key   = "status"
        value = "pending"
      }
    }
    expiration { days = 1 }
    # Versioned-bucket expiration first creates a delete marker. Remove the
    # now-noncurrent pending bytes as well, while retaining ready versions.
    noncurrent_version_expiration { noncurrent_days = 1 }
  }
  rule {
    id     = "abort-incomplete-test-uploads"
    status = "Enabled"
    filter { prefix = "test-files/" }
    abort_incomplete_multipart_upload { days_after_initiation = 1 }
  }
  depends_on = [aws_s3_bucket_versioning.test_data]
}
