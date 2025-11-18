# DietCoach Backend - Raspberry Pi

Complete meal planning API backend for Raspberry Pi with Docker support.

## 🎯 Overview

This is a production-ready Node.js backend that provides REST API endpoints for:
- Macro profile management (meal-specific macro targets)
- User preferences and dietary constraints
- Weekly meal planning intentions
- Recipe database management
- Automatic weekly meal plan generation with recipe matching

## 📋 Requirements

- **Raspberry Pi** running Raspberry Pi OS Lite (arm64)
- **Docker** and **Docker Compose** installed
- **Node.js 20** (optional, only needed for local development)
- **PostgreSQL 16** (runs in Docker)

## 🚀 Quick Start

### 1. Copy Files to Raspberry Pi

Transfer this entire `dietcoach` directory to your Raspberry Pi:

```bash
scp -r dietcoach/ pi@raspberrypi.local:~/
```

### 2. Create Environment File

```bash
cd ~/dietcoach
cp .env.example .env
```

Edit `.env` if needed (default values work for Docker setup):

```env
DATABASE_URL="postgresql://dietcoach:supersecret@dietcoach-db:5432/dietcoach?connection_limit=10&pool_timeout=20"
PORT=3000
NODE_ENV=production
```

### 3. Build and Start Containers

```bash
docker compose up -d --build
```

This will:
- Build the Node.js API container (optimized for ARM64)
- Pull PostgreSQL 16 Alpine image
- Create persistent volume for database
- Start both containers with health checks

### 4. Run Database Migrations

**Option A: From host (requires Node.js)**
```bash
npm install
npx prisma migrate dev --name init
```

**Option B: Inside container**
```bash
docker compose exec dietcoach-api npx prisma migrate dev --name init
```

This creates all 6 database tables (MacroProfile, UserPreferences, WeeklyIntent, Recipe, MealPlan, Meal).

### 5. Verify Installation

Check container status:
```bash
docker compose ps
```

Both containers should show "healthy" status.

Test API:
```bash
curl http://localhost:3000/
```

Expected response:
```json
{"message":"DietCoach AI server is running 🚀"}
```

## 📡 API Endpoints

### Health Check
```bash
GET http://localhost:3000/
```

### Macro Profile
```bash
# Get current profile
GET http://localhost:3000/macro-profile

# Create profile
POST http://localhost:3000/macro-profile
Content-Type: application/json

{
  "breakfastProtein": 30,
  "breakfastCarbs": 50,
  "breakfastFat": 15,
  "lunchProtein": 40,
  "lunchCarbs": 60,
  "lunchFat": 20,
  "snackProtein": 15,
  "snackCarbs": 30,
  "snackFat": 10,
  "dinnerProtein": 35,
  "dinnerCarbs": 45,
  "dinnerFat": 18
}
```

### User Preferences
```bash
# Get preferences
GET http://localhost:3000/preferences

# Create/update preferences
POST http://localhost:3000/preferences
Content-Type: application/json

{
  "excludedIngredients": "liver,beans",
  "preferredCuisines": "italian,mediterranean",
  "cookingEffort": "normal",
  "satietyLevel": "high"
}
```

### Weekly Intent
```bash
# Get latest intent
GET http://localhost:3000/weekly-intent

# Create intent
POST http://localhost:3000/weekly-intent
Content-Type: application/json

{
  "weekStart": "2025-11-17",
  "goal": "high_satiety_low_ferritin",
  "notes": "Focus on iron-rich foods"
}
```

### Recipes
```bash
# Create recipe
POST http://localhost:3000/recipes
Content-Type: application/json

{
  "title": "Grilled Chicken Breast",
  "source": "manual",
  "servings": 1,
  "caloriesPerServing": 165,
  "proteinPerServing": 31.0,
  "carbsPerServing": 0.0,
  "fatPerServing": 3.6
}

# Get all recipes
GET http://localhost:3000/recipes

# Get single recipe
GET http://localhost:3000/recipes/1
```

### Meal Plans
```bash
# Create empty meal plan
POST http://localhost:3000/meal-plans
Content-Type: application/json

{
  "weekStart": "2025-11-17",
  "weekEnd": "2025-11-23",
  "goal": "normal"
}

# List meal plans
GET http://localhost:3000/meal-plans

# Get full meal plan with meals
GET http://localhost:3000/meal-plans/1

# Add meal to plan
POST http://localhost:3000/meal-plans/1/meals
Content-Type: application/json

{
  "date": "2025-11-17",
  "type": "breakfast",
  "protein": 30,
  "carbs": 50,
  "fat": 15,
  "recipeId": 1
}
```

### Generate Weekly Plan
```bash
# Generate complete week (28 meals)
POST http://localhost:3000/generate-week
Content-Type: application/json

{
  "weekStart": "2025-11-17"
}
```

This automatically:
1. Creates a MealPlan for the week
2. Generates 28 meals (7 days × 4 meal types)
3. Matches recipes to each meal based on macro targets
4. Returns complete plan with all meals and recipes

## 🗄️ Database Schema

- **MacroProfile**: Target macros for each meal type
- **UserPreferences**: Dietary preferences and constraints
- **WeeklyIntent**: Weekly goals and intentions
- **Recipe**: Recipe database (local or from APIs)
- **MealPlan**: Weekly meal plan header
- **Meal**: Individual meal entries with macro targets

## 🔧 Management Commands

### View Logs
```bash
# All containers
docker compose logs -f

# API only
docker compose logs -f dietcoach-api

# Database only
docker compose logs -f dietcoach-db
```

### Stop Containers
```bash
docker compose stop
```

### Restart Containers
```bash
docker compose restart
```

### Rebuild After Code Changes
```bash
docker compose up -d --build
```

### Access Database
```bash
docker compose exec dietcoach-db psql -U dietcoach -d dietcoach
```

### Backup Database
```bash
docker compose exec dietcoach-db pg_dump -U dietcoach dietcoach > backup.sql
```

### Reset Everything
```bash
docker compose down -v
docker compose up -d --build
npx prisma migrate dev --name init
```

## 🐛 Troubleshooting

### Container won't start
Check logs:
```bash
docker compose logs dietcoach-api
```

### Database connection errors
Ensure database is healthy:
```bash
docker compose ps
```

Wait for health check to pass (~10 seconds after start).

### Out of memory errors
Raspberry Pi has limited RAM. The API is configured with 512MB heap limit. If you have < 2GB RAM, consider:
```bash
# Edit docker-compose.yml, add to dietcoach-api:
deploy:
  resources:
    limits:
      memory: 512M
```

### Port already in use
Change port in `.env`:
```env
PORT=3001
```

And update docker-compose.yml port mapping:
```yaml
ports:
  - "3001:3001"
```

## 📚 Development

### Local Development (without Docker)

```bash
# Install dependencies
npm install

# Create .env
cp .env.example .env

# Edit DATABASE_URL to use localhost
DATABASE_URL="postgresql://dietcoach:supersecret@localhost:5432/dietcoach?connection_limit=10&pool_timeout=20"

# Start PostgreSQL (Docker or local)
docker run -d -p 5432:5432 \
  -e POSTGRES_USER=dietcoach \
  -e POSTGRES_PASSWORD=supersecret \
  -e POSTGRES_DB=dietcoach \
  postgres:16-alpine

# Run migrations
npx prisma migrate dev

# Start dev server
npm run dev
```

## 📝 Notes

- **ARM64 Compatibility**: All images are multi-arch or Alpine-based for Raspberry Pi
- **Memory Optimization**: Node heap limited to 512MB, connection pool limited to 10
- **Health Checks**: Both containers have health checks for automatic restart
- **Persistence**: Database data persists in Docker volume `dietcoach-db-data`
- **Graceful Shutdown**: API handles SIGTERM/SIGINT properly

## 🔒 Security

⚠️ **Production Deployment Notes:**
- Change default database password in `.env` and `docker-compose.yml`
- Use HTTPS reverse proxy (nginx, Caddy)
- Implement authentication/authorization
- Enable CORS only for trusted origins
- Set up automatic backups

## 📄 License

MIT
