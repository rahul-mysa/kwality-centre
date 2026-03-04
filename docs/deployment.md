# Kwality Centre — Deployment Guide

Deploy Kwality Centre on a Digital Ocean droplet with Docker.

## Prerequisites

- A Digital Ocean account
- A domain name (e.g., `kc.getmysa.com`) with DNS access
- Your SSH public key added to Digital Ocean
- The GitHub repo accessible from the server (HTTPS or deploy key)

## 1. Create the Droplet

- **Image**: Ubuntu 24.04 LTS
- **Size**: Basic, 1 vCPU / 2 GB RAM / 50 GB disk ($12/mo) — can start with 1 GB ($6/mo) for low usage
- **Region**: Toronto (or closest to your team)
- **Authentication**: SSH key
- **Hostname**: `kwality-centre`

## 2. Initial Server Setup

SSH into the droplet:

```bash
ssh root@YOUR_DROPLET_IP
```

Update system and install Docker:

```bash
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose plugin
apt install -y docker-compose-plugin

# Verify
docker --version
docker compose version
```

Create an app user (optional but recommended):

```bash
adduser --disabled-password kwality
usermod -aG docker kwality
```

## 3. Clone the Repo

```bash
cd /opt
git clone https://github.com/rahul-mysa/kwality-centre.git
cd kwality-centre
```

If the repo is private, either:
- Use a [deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys)
- Or clone via HTTPS with a personal access token

## 4. Configure Environment

```bash
cp .env.production.example .env.production
nano .env.production
```

Fill in all values:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `postgresql://kwality:YOUR_STRONG_PASSWORD@db:5432/kwality_centre` |
| `DB_PASSWORD` | Same password as above (used by docker-compose for Postgres) |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `GOOGLE_CALLBACK_URL` | `https://your-domain.com/auth/google/callback` |
| `ALLOWED_DOMAINS` | `getmysa.com` |
| `ADMIN_EMAILS` | Your email |
| `SESSION_SECRET` | Generate with: `openssl rand -hex 32` |

**Important**: Update the `GOOGLE_CALLBACK_URL` in Google Cloud Console to match your production domain.

## 5. Point Your Domain

Add a DNS A record:

| Type | Name | Value |
|------|------|-------|
| A | `kc` (or `@`) | `YOUR_DROPLET_IP` |

Wait for DNS propagation (can take a few minutes to hours).

## 6. Start the Application

```bash
cd /opt/kwality-centre

# Build and start all containers
docker compose up -d --build

# Check status
docker compose ps

# View logs
docker compose logs -f app
```

The app should now be accessible at `http://your-domain.com`.

## 7. Set Up SSL (HTTPS)

First, update `nginx/nginx.conf` to use your domain:

```bash
nano nginx/nginx.conf
```

Change `server_name _;` to `server_name your-domain.com;`

Add a location block for certbot validation (add before the main `location /` block):

```nginx
location /.well-known/acme-challenge/ {
    root /var/lib/letsencrypt;
}
```

Restart nginx:

```bash
docker compose restart nginx
```

Get the SSL certificate:

```bash
docker compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/lib/letsencrypt \
  -d your-domain.com \
  --email your-email@getmysa.com \
  --agree-tos \
  --no-eff-email
```

Now update `nginx/nginx.conf` for HTTPS — replace the entire file:

```nginx
upstream app {
    server app:3000;
}

server {
    listen 80;
    server_name your-domain.com;

    location /.well-known/acme-challenge/ {
        root /var/lib/letsencrypt;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    client_max_body_size 20M;

    location /assets/ {
        proxy_pass http://app;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Restart nginx:

```bash
docker compose restart nginx
```

SSL auto-renewal is handled by the certbot container.

## 8. Initialize the Database

On first deploy, push the schema:

```bash
cd /opt/kwality-centre
./scripts/init-db.sh
```

## 9. Import Local Data (Optional)

If you have data in your local Postgres that you want in production:

**On your local machine** — export:

```bash
pg_dump -U postgres kwality_centre > kc_dump.sql
```

**Copy to server**:

```bash
scp kc_dump.sql root@YOUR_DROPLET_IP:/opt/kwality-centre/
```

**On the server** — import:

```bash
cd /opt/kwality-centre
docker compose exec -T db psql -U kwality kwality_centre < kc_dump.sql
```

## 10. Set Up Automated Backups

```bash
chmod +x /opt/kwality-centre/scripts/backup-db.sh
mkdir -p /opt/kwality-centre/backups

# Add to crontab (daily at 2 AM)
crontab -e
```

Add this line:

```
0 2 * * * /opt/kwality-centre/scripts/backup-db.sh >> /opt/kwality-centre/backups/backup.log 2>&1
```

Backups are kept for 14 days.

## Updating the Application

When you push changes to the repo:

```bash
cd /opt/kwality-centre
git pull
docker compose up -d --build
```

This rebuilds the app container and restarts it. Database data persists in the `pgdata` volume.

## Useful Commands

```bash
# View logs
docker compose logs -f app
docker compose logs -f nginx

# Restart a service
docker compose restart app

# Stop everything
docker compose down

# Stop and remove volumes (DESTROYS DATA)
docker compose down -v

# Shell into the app container
docker compose exec app sh

# Shell into Postgres
docker compose exec db psql -U kwality kwality_centre

# Manual backup
./scripts/backup-db.sh

# Restore from backup
gunzip -c backups/kc_backup_TIMESTAMP.sql.gz | docker compose exec -T db psql -U kwality kwality_centre
```
