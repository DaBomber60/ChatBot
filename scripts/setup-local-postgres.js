#!/usr/bin/env node

/**
 * Local PostgreSQL Setup Script
 * 
 * This script helps set up PostgreSQL for local development.
 * It can either use Docker Compose or help connect to an existing PostgreSQL instance.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'POSTGRES_DB',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_PORT'
];

function checkEnvFile() {
  const envPath = path.join(__dirname, '..', '.env.local');
  
  if (!fs.existsSync(envPath)) {
    console.log('❌ .env.local file not found');
    console.log('📋 Please copy .env.example to .env.local and configure your environment variables');
    process.exit(1);
  }

  // Read and parse env file
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const envVars = {};
  
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, value] = trimmed.split('=');
      if (key && value) {
        envVars[key] = value.replace(/"/g, '');
      }
    }
  });

  const missing = REQUIRED_ENV_VARS.filter(varName => !envVars[varName]);
  
  if (missing.length > 0) {
    console.log('❌ Missing required environment variables:');
    missing.forEach(varName => console.log(`  - ${varName}`));
    console.log('\n📋 Please update your .env.local file');
    process.exit(1);
  }

  console.log('✅ Environment variables configured');
  return envVars;
}

function checkDocker() {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    console.log('✅ Docker is available');
    return true;
  } catch (error) {
    console.log('❌ Docker is not available or not installed');
    return false;
  }
}

function startPostgreSQL() {
  console.log('🐳 Starting PostgreSQL with Docker Compose...');
  
  try {
    // Start only the PostgreSQL service
    execSync('docker-compose up -d postgres', { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    console.log('⏳ Waiting for PostgreSQL to be ready...');
    
    // Wait for PostgreSQL to be healthy
    let attempts = 0;
    const maxAttempts = 30;
    
    const checkReady = () => {
      try {
        execSync('docker-compose exec postgres pg_isready -U homechatbot -d homechatbot', { 
          stdio: 'ignore',
          cwd: path.join(__dirname, '..')
        });
        console.log('✅ PostgreSQL is ready!');
        return true;
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) {
          console.log('❌ PostgreSQL failed to start within expected time');
          process.exit(1);
        }
        console.log(`⏳ Waiting... (${attempts}/${maxAttempts})`);
        return false;
      }
    };
    
    // Poll until ready
    while (!checkReady() && attempts < maxAttempts) {
      // Use cross-platform sleep
      const sleepCmd = process.platform === 'win32' ? 'timeout /t 2 /nobreak >nul' : 'sleep 2';
      try {
        execSync(sleepCmd, { stdio: 'ignore' });
      } catch (error) {
        // Ignore sleep command errors, just continue
      }
    }
    
  } catch (error) {
    console.log('❌ Failed to start PostgreSQL:', error.message);
    process.exit(1);
  }
}

function runMigrations() {
  console.log('🔄 Running Prisma migrations...');
  
  try {
    // Generate Prisma client
    console.log('📦 Generating Prisma client...');
    execSync('npx prisma generate', { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    // Run migrations
    console.log('🗃️  Running database migrations...');
    execSync('npx prisma migrate dev --name init', { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    console.log('✅ Database setup complete!');
    
  } catch (error) {
    console.log('❌ Failed to run migrations:', error.message);
    process.exit(1);
  }
}

async function main() {
  console.log('🏠 HomeChatBot - PostgreSQL Setup\n');
  
  // Check environment configuration
  checkEnvFile();
  
  // Check if Docker is available
  const dockerAvailable = checkDocker();
  
  if (dockerAvailable) {
    console.log('\n🚀 Setting up local development environment...\n');
    
    // Start PostgreSQL
    startPostgreSQL();
    
    // Run migrations
    runMigrations();
    
    console.log('\n✅ Setup complete!');
    console.log('\nNext steps:');
    console.log('1. Run `npm run dev` to start the development server');
    console.log('2. Visit http://localhost:3000 to access the application');
    console.log('3. Use `npx prisma studio` to view/edit data');
    console.log('\nTo stop PostgreSQL: `docker-compose down`');
    
  } else {
    console.log('\n📋 Docker not available. Manual PostgreSQL setup required:');
    console.log('1. Install PostgreSQL locally');
    console.log('2. Create a database with the credentials in .env.local');
    console.log('3. Run `npx prisma migrate dev --name init`');
    console.log('4. Run `npm run dev` to start the application');
  }
}

// Add a sleep helper for the waiting logic
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  });
}

module.exports = { main, checkEnvFile, checkDocker, startPostgreSQL, runMigrations };
