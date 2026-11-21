{ pkgs, ... }:
let
  # Same rule as the Conventional Commits check in Penvire/.github.
  conventionalCommit = pkgs.writeShellApplication {
    name = "conventional-commit";
    text = ''
      subject=$(head -n 1 "$1")
      case $subject in
        "Merge "* | "Revert "* | "fixup! "* | "squash! "* | "amend! "*) exit 0 ;;
      esac
      pattern='^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([[:alnum:]._/-]+\))?!?: [^[:space:]].*$'
      if [[ ! "$subject" =~ $pattern ]]; then
        echo "Not a Conventional Commit: $subject" >&2
        echo "Use 'type(scope): description', e.g. 'feat(identity): add token exchange'." >&2
        echo "Types: build chore ci docs feat fix perf refactor revert style test." >&2
        exit 1
      fi
    '';
  };

  # Release binary pinned by SHA-256; CI downloads and verifies the same pin.
  openapiChangesPin = builtins.fromJSON (builtins.readFile ./generator/compat/openapi-changes.json);
  system = pkgs.stdenv.hostPlatform.system;
  openapiChangesAsset =
    {
      x86_64-linux = "linux_x86_64";
      aarch64-linux = "linux_arm64";
      x86_64-darwin = "darwin_x86_64";
      aarch64-darwin = "darwin_arm64";
    }
    .${system};
  openapiChanges = pkgs.stdenvNoCC.mkDerivation {
    pname = "openapi-changes";
    inherit (openapiChangesPin) version;
    src = pkgs.fetchurl {
      url = "https://github.com/pb33f/openapi-changes/releases/download/v${openapiChangesPin.version}/openapi-changes_${openapiChangesPin.version}_${openapiChangesAsset}.tar.gz";
      sha256 = openapiChangesPin.sha256.${system};
    };
    sourceRoot = ".";
    dontConfigure = true;
    dontBuild = true;
    installPhase = "install -Dm755 openapi-changes $out/bin/openapi-changes";
  };
in
{
  languages.java = {
    enable = true;
    jdk.package = pkgs.jdk25;
    # Bootstraps the Gradle wrapper; use ./gradlew once it exists.
    gradle = {
      enable = true;
      package = pkgs.gradle_9.override { java = pkgs.jdk25; };
    };
  };

  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_24;
    pnpm.enable = true;
  };

  packages = [ openapiChanges ];

  git-hooks.hooks = {
    conventional-commit = {
      enable = true;
      name = "Conventional Commits";
      entry = "${conventionalCommit}/bin/conventional-commit";
      stages = [ "commit-msg" ];
    };
    actionlint.enable = true;
  };
}
