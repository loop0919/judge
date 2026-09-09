.PHONY: dev

# Reuse the pinned toolchain even when direnv has not been enabled.
dev:
	@nix develop 'path:.' --command node scripts/dev.mjs
