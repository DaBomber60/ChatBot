#!/usr/bin/env node

/**
 * PostgreSQL Migration Test Script
 * 
 * This script tests that the PostgreSQL migration is working correctly.
 * It should be run after setting up PostgreSQL and running migrations.
 */

const { execSync } = require('child_process');
const path = require('path');

async function testPrismaClient() {
  console.log('🧪 Testing Prisma Client...');
  
  try {
    // Import Prisma client
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    // Test connection
    await prisma.$connect();
    console.log('✅ Prisma client connected successfully');
    
    // Test each model exists
    const models = ['persona', 'character', 'chatSession', 'chatMessage', 'messageVersion', 'userPrompt', 'setting'];
    
    for (const model of models) {
      try {
        await prisma[model].findMany({ take: 1 });
        console.log(`✅ Model '${model}' is accessible`);
      } catch (error) {
        console.log(`❌ Model '${model}' failed: ${error.message}`);
        return false;
      }
    }
    
    await prisma.$disconnect();
    console.log('✅ All models are working correctly');
    return true;
    
  } catch (error) {
    console.log('❌ Prisma client test failed:', error.message);
    return false;
  }
}

function testMigrationStatus() {
  console.log('🧪 Testing migration status...');
  
  try {
    const output = execSync('npx prisma migrate status', { 
      stdio: 'pipe',
      cwd: path.join(__dirname, '..')
    }).toString();
    
    if (output.includes('Database schema is up to date')) {
      console.log('✅ All migrations are applied');
      return true;
    } else if (output.includes('Following migration have not yet been applied')) {
      console.log('❌ There are pending migrations');
      console.log('Run: npx prisma migrate dev');
      return false;
    } else {
      console.log('⚠️  Migration status unclear:', output);
      return false;
    }
  } catch (error) {
    console.log('❌ Migration status check failed:', error.message);
    return false;
  }
}

function testEnvironmentVariables() {
  console.log('🧪 Testing environment variables...');
  
  const required = ['DATABASE_URL'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.log('❌ Missing required environment variables:', missing.join(', '));
    return false;
  }
  
  // Check if DATABASE_URL is PostgreSQL format
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
    console.log('❌ DATABASE_URL is not in PostgreSQL format');
    console.log('Expected: postgresql://user:pass@host:port/db');
    console.log('Got:', dbUrl);
    return false;
  }
  
  console.log('✅ Environment variables are correctly configured');
  return true;
}

async function main() {
  console.log('🏠 HomeChatBot - PostgreSQL Migration Test\\n');
  
  let allTestsPassed = true;
  
  // Test environment variables
  if (!testEnvironmentVariables()) {
    allTestsPassed = false;
  }
  
  console.log('');
  
  // Test migration status
  if (!testMigrationStatus()) {
    allTestsPassed = false;
  }
  
  console.log('');
  
  // Test Prisma client
  if (!(await testPrismaClient())) {
    allTestsPassed = false;
  }
  
  console.log('\\n' + '='.repeat(50));
  
  if (allTestsPassed) {
    console.log('🎉 All tests passed! PostgreSQL migration is working correctly.');
    console.log('\\nNext steps:');
    console.log('1. Start the development server: npm run dev');
    console.log('2. Access the application at http://localhost:3000');
    console.log('3. Complete the setup wizard and add your API key');
  } else {
    console.log('❌ Some tests failed. Please check the issues above.');
    console.log('\\nCommon solutions:');
    console.log('1. Make sure PostgreSQL is running');
    console.log('2. Check your .env.local file configuration');
    console.log('3. Run migrations: npx prisma migrate dev --name init');
    console.log('4. Generate Prisma client: npx prisma generate');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
}

module.exports = { testPrismaClient, testMigrationStatus, testEnvironmentVariables };
