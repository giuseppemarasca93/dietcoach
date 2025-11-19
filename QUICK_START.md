# DietCoach Backend - Quick Start Guide

## 🚀 Get Running in 5 Minutes

### 1. Push to GitHub (Required)
```bash
# You need to push the committed changes first
git push origin feature/ai-and-recipes-integration
```
**Note**: Authentication issue occurred during automated push. You'll need to:
- Configure Git credentials
- Or use GitHub CLI: `gh auth login`
- Or use SSH key authentication

### 2. Install Dependencies
```bash
npm install
```

### 3. Start Database
```bash
docker-compose up -d
```

### 4. Setup Environment
```bash
cp .env.example .env
```

Edit `.env` and add your API keys:
```
OPENAI_API_KEY=sk-proj-your-key-here
EDAMAM_APP_ID=your-app-id
EDAMAM_APP_KEY=your-app-key
```

### 5. Initialize Database
```bash
npx prisma generate
npx prisma migrate dev
```

### 6. Start Server
```bash
npm run dev
```

Server runs on: **http://localhost:3001**

## ✅ Test It Works

### Test #1: Generate AI Meal Plan
```bash
curl -X POST http://localhost:3001/api/ai/mealplan/generate \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "weekStart": "2025-01-13",
    "useExternalRecipes": true
  }'
```

### Test #2: Search Recipes
```bash
curl "http://localhost:3001/api/recipes/search?query=chicken&limit=5"
```

### Test #3: Health Check
```bash
curl http://localhost:3001/api
```

## 📝 What Changed

### New Features
- 🤖 **AI Meal Planning**: OpenAI GPT-4 generates personalized meal plans
- 🍽️ **Recipe Search**: Edamam API integration with 24h caching
- 📅 **Dynamic Scheduling**: 3-6 meals per day based on user config
- ✅ **Validation**: Zod schemas for all inputs
- 🔄 **Retry Logic**: Automatic retries with backoff
- 📚 **API Docs**: Complete Swagger/OpenAPI 3.0 spec

### File Summary
- **Modified**: 3 files (`.env.example`, `package.json`, `src/app.js`)
- **Created**: 10 files (services, controllers, routes, tests, docs)
- **Lines Added**: 7,434
- **Commit**: `6bcb671`

## 🎯 Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/mealplan/generate` | Generate AI meal plan |
| GET | `/api/ai/mealplan/:id` | Get meal plan by ID |
| GET | `/api/recipes/search` | Search external recipes |

## 🔧 Troubleshooting

### Database Connection Failed
```bash
# Check if Docker is running
docker ps

# Restart database
docker-compose restart
```

### OpenAI API Errors
- Check your API key in `.env`
- Verify you have credits: https://platform.openai.com/usage
- Check rate limits: https://platform.openai.com/account/limits

### Edamam API Errors
- Verify credentials: https://developer.edamam.com/
- Check monthly quota (free tier: 10,000 calls/month)

### Tests Failing
```bash
# Some Prisma tests may fail without database - this is expected
# Validation tests should pass (3/3)
npm test tests/unit/validation.test.js
```

## 📖 Full Documentation

See `IMPLEMENTATION_SUMMARY.md` for:
- Complete file changes
- Architecture details
- All API endpoints
- Testing guide
- Performance notes

## 🆘 Need Help?

1. Check Swagger docs: `docs/swagger.json`
2. Review code comments in service files
3. Check server logs for error details
4. Verify all environment variables are set

---

**Ready to Code!** 🎉

Next step: Push to GitHub and create a Pull Request to merge `feature/ai-and-recipes-integration` into `main`.
