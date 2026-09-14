#!/usr/bin/env bash
#
# One-shot bootstrap for a fresh Amazon Linux 2023 EC2 instance.
#
#   curl -fsSL https://raw.githubusercontent.com/Yasowant/node-auth-job-be/main/scripts/server-setup.sh | bash
#
# or copy this file across and run: bash server-setup.sh
#
# Safe to run more than once: it never overwrites an existing .env and skips
# anything already installed.

set -euo pipefail

APP_DIR="/opt/node-auth"
ENV_FILE="${APP_DIR}/.env"

log() { printf '\n\033[1;32m==>\033[0m %s\n' "$1"; }
warn() { printf '\n\033[1;33m!!\033[0m %s\n' "$1"; }

# ---------------------------------------------------------------- Docker ----
if command -v docker > /dev/null 2>&1; then
  log "Docker already installed - skipping"
else
  log "Installing Docker"
  sudo dnf update -y
  sudo dnf install -y docker
fi

sudo systemctl enable --now docker

if ! id -nG "$USER" | grep -qw docker; then
  log "Adding $USER to the docker group"
  sudo usermod -aG docker "$USER"
  NEEDS_RELOGIN=1
fi

# ------------------------------------------------------------------ curl ----
command -v curl > /dev/null 2>&1 || sudo dnf install -y curl

# ------------------------------------------------------------- env file -----
sudo mkdir -p "$APP_DIR"

if sudo test -f "$ENV_FILE"; then
  warn "$ENV_FILE already exists - leaving it untouched"
else
  log "Creating $ENV_FILE with freshly generated JWT secrets"

  ACCESS_SECRET=$(openssl rand -hex 64)
  REFRESH_SECRET=$(openssl rand -hex 64)

  sudo tee "$ENV_FILE" > /dev/null <<ENVEOF
NODE_ENV=production
PORT=4000

# ---------------------------------------------------------------------------
# REPLACE THIS LINE with your MongoDB Atlas connection string.
# Atlas -> Connect -> Drivers. Remember to swap <password> for the real one
# and to name the database at the end of the path.
# ---------------------------------------------------------------------------
MONGO_URI=REPLACE_ME

JWT_ACCESS_SECRET=${ACCESS_SECRET}
JWT_REFRESH_SECRET=${REFRESH_SECRET}

ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# The origin of your frontend. Cannot be "*" because cookies are credentialed.
CLIENT_URL=https://your-frontend-domain.com
ENVEOF

  sudo chown "$USER":"$USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

# ----------------------------------------------------------------- Caddy ----
if command -v caddy > /dev/null 2>&1; then
  log "Caddy already installed - skipping"
else
  log "Installing Caddy for automatic HTTPS"
  sudo dnf install -y 'dnf-command(copr)'
  sudo dnf copr enable -y @caddy/caddy
  sudo dnf install -y caddy
fi

# ----------------------------------------------------------------- report ---
log "Bootstrap complete"

cat <<'NEXT'

Still to do, in this order:

  1. Put your Atlas connection string into the env file:
         sudo nano /opt/node-auth/.env
     Replace the MONGO_URI=REPLACE_ME line. Nothing will start until you do.

  2. Add this server's public IP to Atlas under Network Access.

  3. Point a DNS A record at this server, then:
         sudo nano /etc/caddy/Caddyfile
     Replace the contents with:

         api.your-domain.com {
             reverse_proxy 127.0.0.1:4000
         }

     Then: sudo systemctl enable --now caddy

  4. Add the four secrets to GitHub and push. The deploy job pulls the image
     and starts the container for you.

HTTPS is not optional here: production cookies are issued with `secure`, so
browsers silently discard them over plain HTTP and logins appear to fail for
no visible reason.

NEXT

if [ "${NEEDS_RELOGIN:-0}" = "1" ]; then
  warn "Log out and back in before running docker without sudo."
fi
