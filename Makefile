.PHONY: dev db-up db-down

# Reuse the pinned toolchain even when direnv has not been enabled.
dev:
	@nix develop . --command node scripts/dev.mjs

db-up:
	@nix develop . --command node scripts/db.mjs

db-down:
	@nix develop . --command node scripts/db.mjs stop
