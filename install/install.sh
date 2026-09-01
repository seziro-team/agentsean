#!/usr/bin/env bash
# Agent Sean installer. Idempotent. Provisions Node if missing.
# Does NOT use npm lifecycle scripts — npm v12 disables them by default.
# Read this file before piping to sh.
set -euo pipefail

PREFIX="${SEAN_PREFIX:-$HOME/.sean}"
CHANNEL="stable"
ONBOARD=1
FROM_SOURCE=""
VERSION=""
DRY_RUN=0
NODE_VERSION="22.19.0"

usage() {
  cat <<'EOF'
Agent Sean installer

  --no-onboard          skip sean onboard
  --version=X           pin a version (npm tag or semver)
  --prefix=DIR          install prefix (default ~/.sean)
  --channel=NAME        stable | extended-stable | dev
  --from-source=DIR     link the CLI from a git checkout
  --dry-run             print the plan and exit
  --help

npm 12+ note: this installer never relies on preinstall/install/postinstall.
Chromium is downloaded lazily on first JS render, not here.
EOF
}

log() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --no-onboard) ONBOARD=0 ;;
    --dry-run) DRY_RUN=1 ;;
    --help|-h) usage; exit 0 ;;
    --version=*) VERSION="${1#--version=}" ;;
    --version) VERSION="${2:?}"; shift ;;
    --prefix=*) PREFIX="${1#--prefix=}" ;;
    --prefix) PREFIX="${2:?}"; shift ;;
    --channel=*) CHANNEL="${1#--channel=}" ;;
    --channel) CHANNEL="${2:?}"; shift ;;
    --from-source=*) FROM_SOURCE="${1#--from-source=}" ;;
    --from-source) FROM_SOURCE="${2:?}"; shift ;;
    *) die "unknown flag $1" ;;
  esac
  shift
done

OS="$(uname -s)"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) NODE_ARCH="x64" ;;
  arm64|aarch64) NODE_ARCH="arm64" ;;
  *) die "unsupported arch $ARCH" ;;
esac

need_node=1
if command -v node >/dev/null 2>&1; then
  if node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>22||(a===22&&b>=19)?0:1)"; then
    need_node=0
  fi
fi

log "prefix=$PREFIX channel=$CHANNEL onboard=$ONBOARD dry-run=$DRY_RUN"

if [ "$DRY_RUN" -eq 1 ]; then
  if [ "$need_node" -eq 1 ]; then
    log "would download Node $NODE_VERSION ($OS/$NODE_ARCH) into $PREFIX/runtime"
  else
    log "would use Node $(node -v) on PATH"
  fi
  if [ -n "$FROM_SOURCE" ]; then
    log "would link CLI from source $FROM_SOURCE (no npm lifecycle scripts)"
  else
    log "would npm install -g agentsean${VERSION:+@$VERSION} --prefix $PREFIX (no postinstall)"
  fi
  log "would provision $PREFIX on first run, not at install"
  if [ "$ONBOARD" -eq 1 ]; then log "would run sean onboard"; else log "would skip onboard"; fi
  exit 0
fi

mkdir -p "$PREFIX/bin"

NODE_BIN="node"
if [ "$need_node" -eq 1 ]; then
  log "Node >= 22.19 not on PATH — downloading official $NODE_VERSION into $PREFIX/runtime"
  UNAME="$(printf '%s' "$OS" | tr '[:upper:]' '[:lower:]')"
  case "$UNAME" in
    linux) NODE_OS="linux" ;;
    darwin) NODE_OS="darwin" ;;
    *) die "unsupported OS $OS — use install.ps1 on Windows" ;;
  esac
  TARBALL="node-v${NODE_VERSION}-${NODE_OS}-${NODE_ARCH}.tar.gz"
  URL="https://nodejs.org/dist/v${NODE_VERSION}/${TARBALL}"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  curl -fsSL "$URL" -o "$TMP/$TARBALL"
  mkdir -p "$PREFIX/runtime"
  tar -xzf "$TMP/$TARBALL" -C "$PREFIX/runtime" --strip-components=1
  NODE_BIN="$PREFIX/runtime/bin/node"
  export PATH="$PREFIX/runtime/bin:$PATH"
fi

if [ -n "$FROM_SOURCE" ]; then
  [ -d "$FROM_SOURCE" ] || die "from-source dir missing: $FROM_SOURCE"
  SRC="$(cd "$FROM_SOURCE" && pwd)"
  CLI="$SRC/packages/cli/dist/bin.js"
  [ -f "$CLI" ] || die "build the repo first: pnpm build (looked for $CLI)"
  cat > "$PREFIX/bin/sean" <<EOF
#!/usr/bin/env bash
exec "$NODE_BIN" "$CLI" "\$@"
EOF
  chmod +x "$PREFIX/bin/sean"
  ln -sfn "$PREFIX/bin/sean" "$PREFIX/bin/agentsean"
else
  NPM_BIN="$(command -v npm || true)"
  [ -n "$NPM_BIN" ] || die "npm not on PATH after Node provision"
  TAG="${VERSION:-latest}"
  case "$CHANNEL" in
    stable) TAG="${VERSION:-latest}" ;;
    extended-stable) TAG="${VERSION:-extended-stable}" ;;
    dev) TAG="${VERSION:-beta}" ;;
  esac
  # No --ignore-scripts needed: the package has no install/postinstall.
  npm install -g "agentsean@${TAG}" --prefix "$PREFIX"
fi

export PATH="$PREFIX/bin:$PATH"
export SEAN_HOME="${SEAN_HOME:-$PREFIX}"
log "provisioning on first run (not as a postinstall)"
if [ "$ONBOARD" -eq 1 ]; then
  exec "$PREFIX/bin/sean" onboard
fi
log "done. Run: $PREFIX/bin/sean doctor"
