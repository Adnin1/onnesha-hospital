# ==============================================================================
# ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS) — ENTERPRISE MULTI-STAGE DOCKERFILE
# Stage 1: Dependency resolution & caching (Node 22 Alpine)
# Stage 2: Production static build & asset compile
# Stage 3: High-performance hardened unprivileged Nginx edge web server
# ==============================================================================

# --- Stage 1: Dependencies ---
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# --- Stage 2: Builder ---
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Pass build-time environment arguments (with safe defaults)
ARG NEXT_PUBLIC_SUPABASE_URL=https://onnesha-hospital.supabase.co
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_placeholder
ARG NEXT_PUBLIC_SITE_URL=https://onnesha-hospital.pages.dev

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Compile static output to /app/out
RUN npm run build

# --- Stage 3: Production Web Server ---
FROM nginx:alpine AS runner
LABEL maintainer="Onnesha Hospital Engineering Team <tech@onneshahospital.com>"
LABEL version="1.1.12"
LABEL description="Onnesha Hospital & Diagnostic Complex - High Availability Production Web Container"

# Create unprivileged nginx user directories
RUN mkdir -p /var/cache/nginx /var/run /var/log/nginx && \
    chown -R nginx:nginx /var/cache/nginx /var/run /var/log/nginx /usr/share/nginx/html

# Copy custom Nginx security & routing configuration
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled production artifacts
COPY --from=builder /app/out /usr/share/nginx/html

# Expose standard HTTP port
EXPOSE 80

# Healthcheck probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost/healthz || exit 1

# Run unprivileged
USER nginx

STOPSIGNAL SIGQUIT

CMD ["nginx", "-g", "daemon off;"]
