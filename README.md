# 🚀 Morph Template

A modern, type-safe full-stack monorepo template featuring end-to-end type safety, built with the latest tools and best practices.

[![GitHub](https://img.shields.io/badge/GitHub-Howell5%2Fmorph--template-blue?logo=github)](https://github.com/Howell5/morph-template)

## ✨ Features

- **🔒 End-to-End Type Safety**: Hono's `AppType` + `hono/client` for seamless frontend-backend type inference
- **📦 Monorepo Architecture**: pnpm workspaces + Turborepo for efficient builds and caching
- **🔐 Built-in Authentication**: Better Auth with Google & GitHub OAuth (social login only)
- **💳 Credits & Payments**: Stripe integration with checkout sessions, webhooks, and order history
- **🗄️ Modern Database**: PostgreSQL + Drizzle ORM with type-safe queries
- **⚡ Fast Development**: Vite + Hot Module Replacement + TypeScript strict mode
- **🎨 Beautiful UI**: shadcn/ui + Tailwind CSS for rapid UI development
- **📡 Smart Data Fetching**: TanStack Query with optimized caching and error handling
- **🧹 Code Quality**: Biome for linting and formatting (faster than ESLint + Prettier)
- **✅ Schema Validation**: Zod schemas shared between frontend and backend

## 📁 Project Structure

```
morph-template/
├── apps/
│   ├── api/              # Backend (Hono + Drizzle + Better Auth + Stripe)
│   │   ├── src/
│   │   │   ├── db/       # Database schemas and connection
│   │   │   ├── routes/   # API routes (posts, checkout, orders, webhooks)
│   │   │   ├── lib/      # Utilities (response helpers, stripe client)
│   │   │   ├── auth.ts   # Better Auth configuration
│   │   │   ├── env.ts    # Environment variable validation
│   │   │   └── index.ts  # Main app (exports AppType)
│   │   └── drizzle.config.ts
│   └── web/              # Frontend (React + Vite + TanStack Query)
│       ├── src/
│       │   ├── components/  # UI components (shadcn/ui)
│       │   ├── lib/         # API client, auth client, utils
│       │   ├── pages/       # Page components (orders, etc.)
│       │   ├── env.ts       # Frontend env validation
│       │   └── main.tsx
│       └── vite.config.ts
└── packages/
    └── shared/           # Shared Zod schemas and types
        └── src/
            ├── schemas/  # Validation schemas (posts, orders, common)
            └── config/   # Credit packages & pricing
```

## 🚀 Quick Start

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Docker (for PostgreSQL)

### 1. Clone and Install

```bash
# Clone the repository
git clone git@github.com:Howell5/morph-template.git
cd morph-template

# Install dependencies
pnpm install
```

### 2. Set Up Environment Variables

```bash
# Copy environment files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Edit `apps/api/.env` with your values:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Yes | Secure random string (min 32 chars) |
| `GOOGLE_CLIENT_ID` | No* | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No* | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | No* | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | No* | GitHub OAuth client secret |
| `STRIPE_SECRET_KEY` | No | Stripe API key (for payments) |
| `STRIPE_WEBHOOK_SECRET` | No | Stripe webhook secret |

*OAuth providers are optional in development. If not configured, the corresponding social login button won't work. At least one OAuth provider should be configured for authentication to function.

Generate a secure secret:
```bash
openssl rand -base64 32
```

### 2.1 Configure OAuth Providers (Optional in Development)

This template uses **social login only** (no email/password). OAuth providers are optional in development - the server will start without them, but login won't work until at least one is configured.

#### Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project or select existing
3. Enable "Google+ API" or "Google Identity"
4. Create **OAuth 2.0 Client ID** (Web application)
5. Add Authorized redirect URI:
   - Development: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://your-api-domain.com/api/auth/callback/google`
6. Copy Client ID and Client Secret to `.env`

#### GitHub OAuth

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:
   - Application name: Your app name
   - Homepage URL: `http://localhost:5173` (or production URL)
   - Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
4. Copy Client ID and generate Client Secret
5. Add to `.env`

### 3. Start Database

```bash
# Start PostgreSQL with Docker Compose
pnpm docker:up

# Verify it's running
docker ps
```

### 4. Initialize Database

```bash
# Push schema to database (creates tables)
pnpm db:push

# Optional: Open Drizzle Studio to view your database
pnpm db:studio
```

### 5. Start Development Servers

```bash
# Start both API and Web in parallel
pnpm dev

# API will run on http://localhost:3000
# Web will run on http://localhost:5173
```

## 📚 Common Commands

```bash
# Development
pnpm dev              # Start all apps in development mode
pnpm build            # Build all apps for production
pnpm lint             # Lint all packages
pnpm format           # Format code with Biome
pnpm check            # Check and fix code issues

# Database
pnpm db:push          # Push schema changes to database
pnpm db:studio        # Open Drizzle Studio (database UI)
pnpm docker:up        # Start PostgreSQL
pnpm docker:down      # Stop PostgreSQL
```

## 🏗️ Architecture Principles

### RPC-Style API Calls

**❌ Don't** write manual fetch calls:
```typescript
// Bad: Manual typing, prone to errors
const response = await fetch('/api/posts');
const posts: Post[] = await response.json();
```

**✅ Do** use the typed Hono client:
```typescript
// Good: Full type safety, auto-completion
const response = await api.api.posts.$get();
const data = await response.json(); // Typed automatically!
```

### Single Source of Truth for Validation

1. Define Zod schema in `packages/shared`:
```typescript
// packages/shared/src/schemas/post.ts
export const createPostSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
});
```

2. Use in backend validation:
```typescript
// apps/api/src/routes/posts.ts
.post('/', zValidator('json', createPostSchema), async (c) => {
  const data = c.req.valid('json'); // Typed!
  // ...
})
```

3. Use in frontend forms:
```typescript
// apps/web/src/pages/create-post.tsx
const form = useForm({
  resolver: zodResolver(createPostSchema), // Same schema!
});
```

### Error Handling

All API errors follow a consistent structure (defined in `@repo/shared`):

```typescript
type ApiError = {
  message: string;
  code?: string;
  issues?: any[]; // For Zod validation errors
};
```

Frontend automatically handles errors globally via React Query:
- Mutations show toast notifications
- Queries can be handled per-component or globally

## 🔐 Authentication

This template uses [Better Auth](https://www.better-auth.com/) for authentication:

- **Email/Password** authentication out of the box
- **Session-based** with secure cookies
- **Type-safe** auth methods on frontend and backend

### Example: Protected Route

Backend:
```typescript
.post('/', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return errorResponse(c, 401, 'Unauthorized');
  }
  // User is authenticated, proceed...
})
```

Frontend:
```typescript
function Component() {
  const { data: session } = useSession();

  if (!session) {
    return <div>Please sign in</div>;
  }

  return <div>Welcome, {session.user.name}!</div>;
}
```

## 💳 Credits & Payments

This template includes a complete credits-based payment system using Stripe.

### Credit Packages

Defined in `packages/shared/src/config/pricing.ts`:
- **Starter**: 100 credits for $9.99
- **Professional**: 500 credits for $39.99 (most popular)
- **Enterprise**: 1500 credits for $99.99

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/checkout` | POST | Create Stripe Checkout session |
| `/api/orders` | GET | Get user's order history |
| `/api/webhooks/stripe` | POST | Handle Stripe webhook events |
| `/api/user/credits` | GET | Get user's current credit balance |

### Setting Up Stripe

1. Create a [Stripe account](https://dashboard.stripe.com/register)
2. Get your API keys from the Dashboard
3. Set environment variables:
```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Local Webhook Testing

Use the [Stripe CLI](https://stripe.com/docs/stripe-cli) to forward webhooks locally:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login to your Stripe account
stripe login

# Forward webhooks to your local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Copy the webhook signing secret (whsec_...) to apps/api/.env
```

### Example: Purchase Credits

```typescript
// Frontend: Create checkout session
const { mutate } = useMutation({
  mutationFn: async (packageId: string) => {
    const res = await api.api.checkout.$post({
      json: { packageId }
    });
    const { checkoutUrl } = await res.json();
    window.location.href = checkoutUrl; // Redirect to Stripe
  }
});

// Trigger purchase
mutate('professional');
```

### Webhook Flow

1. User completes Stripe Checkout
2. Stripe sends `checkout.session.completed` webhook
3. Backend verifies signature and processes payment:
   - Creates order record in database
   - Increments user's credit balance
   - Uses transaction for atomicity
   - Idempotency check prevents duplicate processing

## 🗄️ Database Management

### Schema Changes

1. Modify schema in `apps/api/src/db/schema.ts`
2. Push changes: `pnpm db:push`
3. Changes are applied immediately (use migrations in production)

### Migrations (Production)

```bash
# Generate migration files
cd apps/api
pnpm db:generate

# Apply migrations
pnpm drizzle-kit migrate
```

## 🎨 Adding UI Components

This template uses [shadcn/ui](https://ui.shadcn.com/). To add components:

1. Create component files in `apps/web/src/components/ui/`
2. Copy code from shadcn/ui documentation
3. Adjust imports if needed (use `@/lib/utils` for `cn()`)

Included components:
- Button
- Card
- (Add more as needed)

## 📝 Adding New Features

### Example: Adding a "Comments" Feature

1. **Define schema** (`packages/shared/src/schemas/comment.ts`):
```typescript
export const createCommentSchema = z.object({
  postId: z.string().uuid(),
  content: z.string().min(1),
});
```

2. **Add database table** (`apps/api/src/db/schema.ts`):
```typescript
export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id').references(() => posts.id),
  content: text('content').notNull(),
  // ...
});
```

3. **Create API route** (`apps/api/src/routes/comments.ts`):
```typescript
const commentsRoute = new Hono()
  .post('/', zValidator('json', createCommentSchema), async (c) => {
    // Implementation
  });
```

4. **Use in frontend** (`apps/web/src/pages/post-detail.tsx`):
```typescript
const { mutate } = useMutation({
  mutationFn: async (data: CreateComment) => {
    const res = await api.api.comments.$post({ json: data });
    return res.json();
  },
});
```

## 🐛 Troubleshooting

### Port Already in Use

```bash
# Kill process on port 3000 (API)
lsof -ti:3000 | xargs kill -9

# Kill process on port 5173 (Web)
lsof -ti:5173 | xargs kill -9
```

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker ps

# View logs
docker logs morph-db

# Restart database
pnpm docker:down && pnpm docker:up
```

### Type Errors After Schema Changes

```bash
# Rebuild all packages
pnpm build

# Or restart your IDE/TypeScript server
```

## 🚀 Production Deployment

<details>
<summary><strong>📦 Deploy to Zeabur (Recommended)</strong></summary>

<br>

[![Deploy on Zeabur](https://zeabur.com/button.svg)](https://zeabur.com)

Zeabur provides a one-stop solution for deploying the entire stack (Database + API + Web) with automatic HTTPS and zero configuration.

### Why Zeabur?

- ✅ **All-in-One Platform**: Database, Backend, and Frontend in one place
- ✅ **China-Friendly**: Fast access for users in China
- ✅ **Monorepo Native**: Built-in support for pnpm workspaces
- ✅ **Cost-Effective**: ~$10/month for the full stack
- ✅ **Auto HTTPS**: Free SSL certificates
- ✅ **Internal Networking**: Services communicate over private network

### Quick Deploy Steps

#### 1. Prerequisites

- A Zeabur account ([sign up here](https://zeabur.com))
- Your GitHub repository forked or cloned

#### 2. Create a New Project

1. Log in to [Zeabur Dashboard](https://dash.zeabur.com)
2. Click "Create Project"
3. Connect your GitHub repository

#### 3. Add PostgreSQL Service

1. In your project, click "Create Service"
2. Select "PostgreSQL" from the service catalog
3. Zeabur will automatically provision and start the database
4. Copy the connection string or use `${postgres.DATABASE_URL}` for variable reference

#### 4. Deploy API Service

1. Click "Create Service" → "Git"
2. Select your repository and the `apps/api` directory
3. Configure environment variables:
   ```bash
   DATABASE_URL=${postgres.DATABASE_URL}
   BETTER_AUTH_SECRET=your-secret-32-characters-minimum
   BETTER_AUTH_URL=https://your-api-domain.zeabur.app
   NODE_ENV=production
   PORT=3000
   FRONTEND_URL=https://your-web-domain.zeabur.app
   ```
4. Click "Deploy"

#### 5. Run Database Migrations

From your local machine:

```bash
# Set the production database URL
export DATABASE_URL="your-zeabur-postgres-url"

# Run migrations
cd apps/api
pnpm drizzle-kit push
```

Or use Zeabur's Console:

1. Open your API service
2. Go to "Console" tab
3. Run: `cd apps/api && pnpm drizzle-kit push`

#### 6. Deploy Web Service

1. Click "Create Service" → "Git"
2. Select your repository and the `apps/web` directory
3. Configure environment variables:
   ```bash
   VITE_API_URL=https://your-api-domain.zeabur.app
   ```
4. Click "Deploy"

#### 7. Custom Domains (Optional)

For each service:

1. Go to service "Settings" → "Domain"
2. Add your custom domain:
   - API: `api.yourdomain.com`
   - Web: `yourdomain.com`
3. Configure DNS as instructed
4. HTTPS is automatically configured

### Environment Variables Reference

**API Service:**
| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `${postgres.DATABASE_URL}` |
| `BETTER_AUTH_SECRET` | Auth encryption key (min 32 chars) | Generate with: `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Your API URL | `https://api.yourdomain.com` |
| `NODE_ENV` | Environment | `production` |
| `FRONTEND_URL` | Your web URL for CORS | `https://yourdomain.com` |
| `STRIPE_SECRET_KEY` | Stripe secret key | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | `whsec_...` |

**Web Service:**
| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `https://api.yourdomain.com` |

### Monitoring & Logs

Zeabur provides built-in:

- **Real-time Logs**: View application logs in the dashboard
- **Resource Monitoring**: CPU, memory, and network usage
- **Auto Restart**: Automatic recovery from crashes
- **Deployment History**: Easy rollback to previous versions

### Cost Estimate

| Service | Configuration | Monthly Cost |
|---------|--------------|--------------|
| PostgreSQL | 1GB storage + auto backup | ~$5 |
| API Service | 512MB RAM + 0.5 vCPU | ~$5 |
| Web Service | Static hosting + CDN | Free |
| **Total** | | **~$10** |

### Troubleshooting

**CORS Issues:**
- Ensure `FRONTEND_URL` is set correctly in API service
- Check that your web domain matches exactly (including https://)

**Database Connection:**
- Use `${postgres.DATABASE_URL}` to reference the internal database
- Internal networking is faster and more secure

**Build Failures:**
- Check build logs in Zeabur dashboard
- Ensure all dependencies are in `package.json`
- Verify `zeabur.json` configuration

</details>

## 📖 Tech Stack Documentation

- [Hono](https://hono.dev/) - Web framework
- [Drizzle ORM](https://orm.drizzle.team/) - Database ORM
- [Better Auth](https://www.better-auth.com/) - Authentication
- [Stripe](https://stripe.com/docs) - Payment processing
- [TanStack Query](https://tanstack.com/query) - Data fetching
- [shadcn/ui](https://ui.shadcn.com/) - UI components
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Biome](https://biomejs.dev/) - Linting and formatting
- [Turborepo](https://turbo.build/) - Monorepo build system

## 📄 License

MIT

---

Built with ❤️ using modern web technologies
