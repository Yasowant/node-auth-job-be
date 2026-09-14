#!/usr/bin/env bash
#
# One-shot bootstrap for a fresh EC2 instance.
# Supports Ubuntu (apt) and Amazon Linux 2023 (dnf).
#
#   curl -fsSL https://raw.githubusercontent.com/Yasowant/node-auth-job-be/main/scripts/server-setup.sh | bash
#
# Safe to run more than once: it never overwrites an existing .env and skips
# anything already installed.

set -euo pipefail

APP_DIR="/opt/node-auth"
ENV_FILE="${APP_DIR}/.env"

log()  { printf '\n\033[1;32m==>\033[0m %s\n' "$1"; }
warn() { printf '\n\033[1;33m!!\033[0m %s\n' "$1"; }
die()  { printf '\n\033[1;31mxx\033[0m %s\n' "$1"; exit 1; }

# ------------------------------------------------------- detect the distro --
if command -v apt-get > /dev/null 2>&1; then
  PKG="apt"
elif command -v dnf > /dev/null 2>&1; then
  PKG="dnf"
else
  die "Neither apt nor dnf found. This script supports Ubuntu and Amazon Linux."
fi

log "Detected package manager: $PKG"

# ---------------------------------------------------------------- Docker ----
if command -v docker > /dev/null 2>&1; then
  log "Docker already installed - skipping"
else
  log "Installing Docker"

  if [ "$PKG" = "apt" ]; then
    sudo apt-get update -y
    sudo apt-get install -y ca-certificates curl gnupg

    # Docker's own repository: Ubuntu's bundled docker.io lags well behind.
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
      | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  else
    sudo dnf update -y
    sudo dnf install -y docker
  fi
fi

sudo systemctl enable --now docker

if ! id -nG "$USER" | grep -qw docker; then
  log "Adding $USER to the docker group"
  sudo usermod -aG docker "$USER"
  NEEDS_RELOGIN=1
fi

# ------------------------------------------------------------------ curl ----
command -v curl > /dev/null 2>&1 || {
  if [ "$PKG" = "apt" ]; then sudo apt-get install -y curl; else sudo dnf install -y curl; fi
}

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
# Atlas -> Connect -> Drivers. Swap <password> for the real one and name the
# database at the end of the path.
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

  if [ "$PKG" = "apt" ]; then
    sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
      | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
      | sudo tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
    sudo apt-get update -y
    sudo apt-get install -y caddy
  else
    sudo dnf install -y 'dnf-command(copr)'
    sudo dnf copr enable -y @caddy/caddy
    sudo dnf install -y caddy
  fi
fi

# ----------------------------------------------------------------- report ---
log "Bootstrap complete"

cat <<'NEXT'

Still to do, in this order:

  1. Put your Atlas connection string into the env file:
         sudo nano /opt/node-auth/.env
     Replace the MONGO_URI=REPLACE_ME line. Nothing starts until you do.

  2. Add this server's public IP to Atlas under Network Access.

  3. Point a DNS A record at this server, then:
         sudo nano /etc/caddy/Caddyfile

     Replace the contents with:

         api.your-domain.com {
             reverse_proxy 127.0.0.1:4000
         }

     Then: sudo systemctl restart caddy

  4. Run the container:
         docker run -d --name node-auth --restart unless-stopped \
           --env-file /opt/node-auth/.env -p 127.0.0.1:4000:4000 \
           ghcr.io/yasowant/node-auth-job-be:latest

HTTPS is not optional: production cookies are issued with `secure`, so browsers
silently discard them over plain HTTP and logins appear to fail for no reason.

NEXT

if [ "${NEEDS_RELOGIN:-0}" = "1" ]; then
  warn "Log out and back in before running docker without sudo."
fi
