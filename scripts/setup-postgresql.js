#!/usr/bin/env node

/**
 * HomeChatBot PostgreSQL Setup Helper
 * 
 * This script helps you set up PostgreSQL for HomeChatBot development.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔄 HomeChatBot PostgreSQL Setup Helper');
console.log('======================================\n');

// Check if .env file exists
const envPath = '.env';
if (!fs.existsSync(envPath)) {
  console.log('📄 Creating .env file from .env.example...');
  try {
    fs.copyFileSync('.env.example', '.env');
    console.log('✅ .env file created successfully');
  } catch (error) {
    console.error('❌ Failed to create .env file:', error.message);
    process.exit(1);
  }
} else {
  console.log('✅ .env file already exists');
}

// Check if Docker is available
console.log('\n🐳 Checking Docker availability...');
try {
  execSync('docker --version', { stdio: 'ignore' });
  console.log('✅ Docker is available');
} catch (error) {
  console.error('❌ Docker is not available or not running');
  console.log('   Please install Docker Desktop and make sure it\'s running');
  process.exit(1);
}

// Check if docker-compose is available
try {
  execSync('docker-compose --version', { stdio: 'ignore' });
  console.log('✅ Docker Compose is available');
} catch (error) {
  console.error('❌ Docker Compose is not available');
  console.log('   Please make sure Docker Compose is installed');
  process.exit(1);
}

// Start PostgreSQL
console.log('\n🚀 Starting PostgreSQL database...');
try {
  execSync('docker-compose -f docker-compose.dev.yml up -d postgres', { 
    stdio: 'inherit',
    cwd: process.cwd()
  });
  console.log('✅ PostgreSQL started successfully');
} catch (error) {
  console.error('❌ Failed to start PostgreSQL:', error.message);
  process.exit(1);
}

// Wait for PostgreSQL to be ready
console.log('\n⏳ Waiting for PostgreSQL to be ready...');
let attempts = 0;
const maxAttempts = 30;

while (attempts < maxAttempts) {
  try {
    execSync('docker-compose -f docker-compose.dev.yml exec -T postgres pg_isready -U homechatbot -d homechatbot', { 
      stdio: 'ignore',
      cwd: process.cwd()
    });
    console.log('✅ PostgreSQL is ready');
    break;
  } catch (error) {
    attempts++;
    if (attempts >= maxAttempts) {
      console.error('❌ PostgreSQL failed to become ready within 60 seconds');
      process.exit(1);
    }
    process.stdout.write('.');
    execSync('timeout 2 > nul 2>&1 || sleep 2', { stdio: 'ignore' });
  }
}

// Install dependencies
console.log('\n📦 Installing dependencies...');
try {
  execSync('npm install --ignore-scripts', { stdio: 'inherit' });
  console.log('✅ Dependencies installed successfully');
} catch (error) {
  console.error('❌ Failed to install dependencies:', error.message);
  process.exit(1);
}

// Generate Prisma client
console.log('\n🔧 Generating Prisma client...');
try {
  execSync('npx prisma generate', { stdio: 'inherit' });
  console.log('✅ Prisma client generated successfully');
} catch (error) {
  console.error('❌ Failed to generate Prisma client:', error.message);
  console.log('   This might be a Windows permission issue. Try running as Administrator.');
}

// Run migrations
console.log('\n📊 Running database migrations...');
try {
  execSync('npx prisma migrate dev --name init_postgresql', { stdio: 'inherit' });
  console.log('✅ Database migrations completed successfully');
} catch (error) {
  console.error('❌ Failed to run migrations:', error.message);
  console.log('   You can try running "npx prisma migrate dev" manually later.');
}

console.log('\n🎉 Setup completed successfully!');
console.log('\nNext steps:');
console.log('1. Run "npm run dev" to start the development server');
console.log('2. Access your application at http://localhost:3000');
console.log('3. If you have existing SQLite data, use the migration script:');
console.log('   npm run db:migrate:sqlite-to-postgres');
console.log('\nTo stop PostgreSQL: docker-compose -f docker-compose.dev.yml down');
console.log('To view logs: docker-compose -f docker-compose.dev.yml logs postgres');
