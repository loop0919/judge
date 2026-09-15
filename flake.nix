{
  description = "Development environment for the judge API, web, and infrastructure";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "aarch64-darwin"
        "aarch64-linux"
        "x86_64-darwin"
        "x86_64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs {
            inherit system;
            config.allowUnfreePredicate = pkg: nixpkgs.lib.getName pkg == "terraform";
          };
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              go
              gofumpt
              golangci-lint
              gopls
              bun
              nodejs_22 # Playwright test runner; Nuxt runs on Bun.
              postgresql_17
              gnumake
              awscli2
              terraform
              zip
            ];

            GOTOOLCHAIN = "local";
          };
        }
      );

      formatter = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        pkgs.nixfmt
      );
    };
}
