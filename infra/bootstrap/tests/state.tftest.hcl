mock_provider "aws" {
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::judge-test-state" }
  }
}

run "state_protection" {
  command = apply
  assert {
    condition = (
      aws_s3_bucket_versioning.state.versioning_configuration[0].status == "Enabled" &&
      aws_s3_bucket_public_access_block.state.block_public_acls &&
      aws_s3_bucket_public_access_block.state.block_public_policy &&
      aws_s3_bucket_public_access_block.state.ignore_public_acls &&
      aws_s3_bucket_public_access_block.state.restrict_public_buckets &&
      aws_s3_bucket_ownership_controls.state.rule[0].object_ownership == "BucketOwnerEnforced" &&
      !aws_s3_bucket.state.force_destroy &&
      jsondecode(aws_s3_bucket_policy.state.policy).Statement[0].Condition.Bool["aws:SecureTransport"] == "false"
    )
    error_message = "State storage must retain versions, reject public access and insecure transport, and prevent forced deletion."
  }
}
