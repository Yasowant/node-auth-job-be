# Deployment guide

How to get `node-auth-job-be` running on a server and wired to the CD pipeline, staying inside free tiers wherever possible.

Target in this guide: a single **AWS EC2** instance in `eu-north-1` (Stockholm), with the database on **MongoDB Atlas M0**, which is free indefinitely.

---

## Before you start: protect yourself from a bill

Do this *first*, before launching anything. It takes two minutes and is the difference between a surprise invoice and a quiet month.

1. **Billing console → Budgets → Create budget → Zero spend budget.** Enter your email. AWS then alerts you the moment any charge appears.
2. **Billing console → Free tier.** This page shows your current free-tier usage and what your account is actually entitled to. AWS has changed free-tier terms more than once, and what a new account gets today may differ from older guides — trust this page over any tutorial, including this one.
3. **Billing preferences → turn on "Receive AWS Free Tier alerts."**

Two rules that keep the bill at zero:

- **Anything with a public IPv4 address now costs money**, even on a stopped instance and even in the free tier — a small hourly charge per address. One instance is fine and is normally covered; ten forgotten ones are not.
- **Terminate, do not just stop, anything you were experimenting with.** A stopped instance still holds its EBS volume and its IP.

---

## 1. Database — MongoDB Atlas M0 (free)

Do not run MongoDB on the same small instance as the API. A free-tier instance has about 1 GB of RAM, and Mongo plus Node will fight over it until the kernel kills one of them.

1. Sign up at [mongodb.com/atlas](https://www.mongodb.com/atlas) and create an **M0** cluster. It is free with no time limit.
2. Choose a region physically near your EC2 region — for `eu-north-1`, pick Stockholm or Frankfurt. Cross-region latency shows up on every query.
3. **Database Access →** create a user with a strong generated password. Save it.
4. **Network Access →** add your EC2 instance's public IP once you have it. Avoid `0.0.0.0/0`; it exposes the database to the whole internet and the only thing standing between it and an attacker is that password.
5. Copy the connection string. It looks like:

   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/node_auth?retryWrites=true&w=majority
   ```

---

## 2. Launch the EC2 instance

EC2 console → **Launch instance**.

| Field | Value |
| ----- | ----- |
| Name | `node-auth-api` |
| AMI | Amazon Linux 2023 (look for the **Free tier eligible** label) |
| Instance type | The type the wizard labels **Free tier eligible** — usually `t3.micro` in `eu-north-1` |
| Key pair | **Create a new key pair**, type RSA, format `.pem`. Download it — you get exactly one chance |
| Network | Allow SSH (22), HTTP (80), HTTPS (443) |
| Storage | 8–20 GB gp3 |

On the security group, restrict **SSH to your own IP** rather than `0.0.0.0/0`. Port 22 open to the world collects automated login attempts within minutes.

Do **not** open port 4000. The container binds to `127.0.0.1:4000` and traffic reaches it through the reverse proxy on 443.

Keep the downloaded `.pem` safe and lock its permissions:

```bash
chmod 400 ~/Downloads/node-auth-api.pem
```

---

## 3. Prepare the server

SSH in:

```bash
ssh -i ~/Downloads/node-auth-api.pem ec2-user@<EC2_PUBLIC_IP>
```

Install Docker and let your user drive it:

```bash
sudo dnf update -y
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
```

Log out and back in so the group change applies, then confirm:

```bash
docker run --rm hello-world
```

Create the production environment file the deploy script expects:

```bash
sudo mkdir -p /opt/node-auth
sudo nano /opt/node-auth/.env
```

```env
NODE_ENV=production
PORT=4000
MONGO_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/node_auth?retryWrites=true&w=majority
JWT_ACCESS_SECRET=<paste output of: openssl rand -hex 64>
JWT_REFRESH_SECRET=<paste a different one>
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d
CLIENT_URL=https://your-frontend-domain.com
```

Lock it down — it holds your database credentials:

```bash
sudo chown ec2-user:ec2-user /opt/node-auth/.env
sudo chmod 600 /opt/node-auth/.env
```

These secrets live **only** on the server. They are never committed and never passed through GitHub Actions.

---

## 4. Reverse proxy and HTTPS

Production cookies are issued with `secure: true`, which means browsers discard them over plain HTTP. **The app will appear to log in and then immediately forget you until TLS is in place.** This step is not optional.

Caddy is the shortest path, because it obtains and renews certificates on its own:

```bash
sudo dnf install -y 'dnf-command(copr)'
sudo dnf copr enable -y @caddy/caddy
sudo dnf install -y caddy
```

```bash
sudo nano /etc/caddy/Caddyfile
```

```
api.your-domain.com {
    reverse_proxy 127.0.0.1:4000
}
```

```bash
sudo systemctl enable --now caddy
```

Point an `A` record for `api.your-domain.com` at the instance's public IP first — Caddy needs to answer a challenge on port 80 to issue the certificate.

No domain yet? You can test over plain HTTP by temporarily opening port 4000 and setting `NODE_ENV=development`, but do not leave it that way: development mode also returns stack traces in error responses.

---

## 5. Connect GitHub Actions

In the repository: **Settings → Secrets and variables → Actions → New repository secret**.

| Secret | Value |
| ------ | ----- |
| `EC2_HOST` | The instance's public IP or DNS name |
| `EC2_USER` | `ec2-user` |
| `EC2_SSH_KEY` | The **entire contents** of the `.pem` file, including `-----BEGIN…` and `-----END…` |
| `GHCR_TOKEN` | A GitHub PAT with the `read:packages` scope — the server uses it to pull the image |

To create `GHCR_TOKEN`: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate, tick **`read:packages`** only.

If the package is private, grant the token access to it under the package's own settings. Making the package public removes that requirement — the image contains no secrets, since all configuration is injected at runtime from `/opt/node-auth/.env`.

---

## 6. Deploy

Push to `main`. The pipeline will:

1. Run lint and tests on Node 20 and 22 against a real MongoDB.
2. Build the Docker image and verify it serves `/health`.
3. Push it to GHCR tagged `latest` and with the commit SHA.
4. SSH in, pull, restart the container, and poll `/health`.
5. Roll back to the previous image if health never comes up.

Watch it under the **Actions** tab. Then confirm from your laptop:

```bash
curl https://api.your-domain.com/health
```

You want `{"status":"ok","database":"connected",...}`. If it says `degraded`, the app is running but cannot reach Atlas — check that the instance's IP is in the Atlas Network Access list.

---

## Troubleshooting

**`Permission denied (publickey)` in the deploy job.** `EC2_SSH_KEY` is usually missing its first or last line. Paste the whole file, unaltered.

**`denied: denied` when the server pulls.** `GHCR_TOKEN` lacks `read:packages`, or the token's owner cannot see a private package.

**Health check fails and the job rolls back.** Read the container's own account of it:

```bash
docker logs --tail 100 node-auth
```

Almost always `MONGO_URI` — a wrong password, or an IP that Atlas is not allowing.

**Cookies do not persist in the browser.** HTTPS is not terminating correctly. `secure` cookies are dropped silently over HTTP, with no error anywhere.

**The instance becomes unresponsive under load.** 1 GB of RAM is genuinely small. Add swap:

```bash
sudo dd if=/dev/zero of=/swapfile bs=1M count=1024
sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## Deploying somewhere other than AWS

The CD workflow only needs a Linux host with Docker, SSH access, and `/opt/node-auth/.env`. Any VPS works unchanged — only `EC2_HOST` and `EC2_USER` change.

If you would rather not manage a server at all, Render's free tier runs this image directly from a deploy hook and needs no SSH keys. The trade-off is that free instances sleep when idle, so the first request after a quiet period takes a few seconds.
