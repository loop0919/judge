.PHONY: dev db-up db-down

# Reuse the pinned toolchain even when direnv has not been enabled.
dev:
	@nix develop . --command bun scripts/dev.mjs

db-up:
	@nix develop . --command bun scripts/db.mjs

db-down:
	@nix develop . --command bun scripts/db.mjs stop
