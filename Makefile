.PHONY: dev db-up db-down install-hooks

# Reuse the pinned toolchain even when direnv has not been enabled.
dev:
	@nix develop . --command node scripts/dev.mjs

db-up:
	@nix develop . --command node scripts/db.mjs

db-down:
	@nix develop . --command node scripts/db.mjs stop

install-hooks:
	git config --local core.hooksPath .githooks
