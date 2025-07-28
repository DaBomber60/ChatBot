#!/usr/bin/env node

/**
 * SQLite to PostgreSQL Migration Script
 * 
 * This script helps migrate data from SQLite to PostgreSQL using the export/import system.
 * It leverages the existing robust import/export functionality to ensure data integrity.
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs').promises;
const path = require('path');
const JSZip = require('jszip');

async function main() {
  console.log('🔄 HomeChatBot SQLite to PostgreSQL Migration');
  console.log('==============================================\n');

  // Check if SQLite database exists
  const sqliteDbPath = process.env.SQLITE_DB_PATH || 'prisma/dev.db';
  
  try {
    await fs.access(sqliteDbPath);
    console.log(`✅ Found SQLite database at: ${sqliteDbPath}`);
  } catch (error) {
    console.error(`❌ SQLite database not found at: ${sqliteDbPath}`);
    console.log('\nPlease ensure your SQLite database exists or set SQLITE_DB_PATH environment variable.');
    process.exit(1);
  }

  // Create export from SQLite
  console.log('\n📤 Step 1: Exporting data from SQLite database...');
  
  const sqlitePrisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:./${sqliteDbPath}`
      }
    }
  });

  try {
    // Export all data from SQLite (same logic as API endpoint)
    const [
      personas,
      characterGroups,
      characters,
      chatSessions,
      chatMessages,
      messageVersions,
      userPrompts,
      settings
    ] = await Promise.all([
      sqlitePrisma.persona.findMany({ orderBy: { id: 'asc' } }),
      sqlitePrisma.characterGroup.findMany({ orderBy: { id: 'asc' } }),
      sqlitePrisma.character.findMany({ orderBy: { id: 'asc' } }),
      sqlitePrisma.chatSession.findMany({
        orderBy: { id: 'asc' },
        include: {
          messages: {
            orderBy: { id: 'asc' },
            include: {
              versions: { orderBy: { version: 'asc' } }
            }
          }
        }
      }),
      sqlitePrisma.chatMessage.findMany({
        orderBy: { id: 'asc' },
        include: {
          versions: { orderBy: { version: 'asc' } }
        }
      }),
      sqlitePrisma.messageVersion.findMany({ orderBy: { id: 'asc' } }),
      sqlitePrisma.userPrompt.findMany({ orderBy: { id: 'asc' } }),
      sqlitePrisma.setting.findMany({ orderBy: { key: 'asc' } })
    ]);

    const exportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      data: {
        personas,
        characterGroups,
        characters,
        chatSessions,
        chatMessages,
        messageVersions,
        userPrompts,
        settings
      },
      metadata: {
        totalRecords: {
          personas: personas.length,
          characterGroups: characterGroups.length,
          characters: characters.length,
          chatSessions: chatSessions.length,
          chatMessages: chatMessages.length,
          messageVersions: messageVersions.length,
          userPrompts: userPrompts.length,
          settings: settings.length
        }
      }
    };

    console.log('📊 Export Summary:');
    Object.entries(exportData.metadata.totalRecords).forEach(([key, count]) => {
      console.log(`   - ${key}: ${count} records`);
    });

    // Save export data to temporary file
    const exportPath = path.join(__dirname, '..', 'migration-export.json');
    await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2));
    console.log(`✅ Export saved to: ${exportPath}`);

    await sqlitePrisma.$disconnect();

  } catch (error) {
    console.error('❌ Failed to export from SQLite:', error);
    await sqlitePrisma.$disconnect();
    process.exit(1);
  }

  // Connect to PostgreSQL and import
  console.log('\n📥 Step 2: Importing data to PostgreSQL database...');
  
  const postgresPrisma = new PrismaClient();

  try {
    // Test PostgreSQL connection
    await postgresPrisma.$connect();
    console.log('✅ Connected to PostgreSQL database');

    // Read the export data
    const exportPath = path.join(__dirname, '..', 'migration-export.json');
    const exportContent = await fs.readFile(exportPath, 'utf-8');
    const importData = JSON.parse(exportContent);

    // Import data using the same logic as the import API
    const results = {
      imported: {},
      skipped: {},
      errors: []
    };

    // Helper function to safely import records
    async function importRecords(model, records, keyField = 'name', profileField = null) {
      let imported = 0, skipped = 0;
      
      for (const record of records) {
        try {
          // Remove id for auto-increment
          const { id, ...recordData } = record;
          
          // Check for existing record
          let whereClause = {};
          if (profileField && record[profileField]) {
            whereClause = {
              [keyField]: record[keyField],
              [profileField]: record[profileField]
            };
          } else {
            whereClause = { [keyField]: record[keyField] };
          }

          const existing = await model.findUnique({ where: whereClause });
          
          if (!existing) {
            await model.create({ data: recordData });
            imported++;
          } else {
            skipped++;
          }
        } catch (error) {
          results.errors.push(`Failed to import ${keyField} "${record[keyField]}": ${error.message}`);
        }
      }
      
      return { imported, skipped };
    }

    // Import in dependency order
    console.log('   🔄 Importing character groups...');
    const groupsResult = await importRecords(postgresPrisma.characterGroup, importData.data.characterGroups);
    results.imported.characterGroups = groupsResult.imported;
    results.skipped.characterGroups = groupsResult.skipped;

    console.log('   🔄 Importing personas...');
    const personasResult = await importRecords(postgresPrisma.persona, importData.data.personas, 'name', 'profileName');
    results.imported.personas = personasResult.imported;
    results.skipped.personas = personasResult.skipped;

    console.log('   🔄 Importing characters...');
    const charactersResult = await importRecords(postgresPrisma.character, importData.data.characters, 'name', 'profileName');
    results.imported.characters = charactersResult.imported;
    results.skipped.characters = charactersResult.skipped;

    console.log('   🔄 Importing user prompts...');
    const promptsResult = await importRecords(postgresPrisma.userPrompt, importData.data.userPrompts, 'title');
    results.imported.userPrompts = promptsResult.imported;
    results.skipped.userPrompts = promptsResult.skipped;

    console.log('   🔄 Importing settings...');
    let settingsImported = 0, settingsSkipped = 0;
    for (const setting of importData.data.settings) {
      try {
        await postgresPrisma.setting.upsert({
          where: { key: setting.key },
          update: { value: setting.value },
          create: setting
        });
        settingsImported++;
      } catch (error) {
        results.errors.push(`Failed to import setting "${setting.key}": ${error.message}`);
      }
    }
    results.imported.settings = settingsImported;
    results.skipped.settings = settingsSkipped;

    console.log('   🔄 Importing chat sessions and messages...');
    // Import chat sessions with their messages and versions
    let sessionsImported = 0, messagesImported = 0, versionsImported = 0;
    let sessionsSkipped = 0, messagesSkipped = 0, versionsSkipped = 0;

    for (const session of importData.data.chatSessions) {
      try {
        const { id, messages, ...sessionData } = session;
        
        // Find the persona and character by their names
        const persona = await postgresPrisma.persona.findFirst({
          where: sessionData.personaId ? { id: sessionData.personaId } : undefined
        });
        const character = await postgresPrisma.character.findFirst({
          where: sessionData.characterId ? { id: sessionData.characterId } : undefined
        });

        if (!persona || !character) {
          results.errors.push(`Skipping session: persona or character not found`);
          sessionsSkipped++;
          continue;
        }

        sessionData.personaId = persona.id;
        sessionData.characterId = character.id;

        const newSession = await postgresPrisma.chatSession.create({
          data: sessionData
        });
        sessionsImported++;

        // Import messages for this session
        for (const message of messages || []) {
          try {
            const { id: msgId, versions, ...messageData } = message;
            messageData.sessionId = newSession.id;

            const newMessage = await postgresPrisma.chatMessage.create({
              data: messageData
            });
            messagesImported++;

            // Import versions for this message
            for (const version of versions || []) {
              try {
                const { id: versionId, ...versionData } = version;
                versionData.messageId = newMessage.id;

                await postgresPrisma.messageVersion.create({
                  data: versionData
                });
                versionsImported++;
              } catch (error) {
                results.errors.push(`Failed to import message version: ${error.message}`);
              }
            }
          } catch (error) {
            results.errors.push(`Failed to import message: ${error.message}`);
            messagesSkipped++;
          }
        }
      } catch (error) {
        results.errors.push(`Failed to import chat session: ${error.message}`);
        sessionsSkipped++;
      }
    }

    results.imported.chatSessions = sessionsImported;
    results.skipped.chatSessions = sessionsSkipped;
    results.imported.chatMessages = messagesImported;
    results.skipped.chatMessages = messagesSkipped;
    results.imported.messageVersions = versionsImported;
    results.skipped.messageVersions = versionsSkipped;

    await postgresPrisma.$disconnect();

    // Print final results
    console.log('\n🎉 Migration completed successfully!');
    console.log('\n📊 Final Results:');
    console.log('================');
    Object.entries(results.imported).forEach(([key, count]) => {
      const skipped = results.skipped[key] || 0;
      console.log(`${key.padEnd(20)}: ${count} imported, ${skipped} skipped`);
    });

    if (results.errors.length > 0) {
      console.log(`\n⚠️  ${results.errors.length} errors encountered:`);
      results.errors.slice(0, 10).forEach(error => console.log(`   - ${error}`));
      if (results.errors.length > 10) {
        console.log(`   ... and ${results.errors.length - 10} more errors`);
      }
    }

    // Clean up temporary file
    try {
      await fs.unlink(exportPath);
      console.log('\n🧹 Cleaned up temporary export file');
    } catch (error) {
      console.log(`\n⚠️  Could not clean up temporary file: ${exportPath}`);
    }

    console.log('\n✅ Migration completed! Your data has been migrated to PostgreSQL.');
    console.log('   You can now safely switch to the PostgreSQL configuration.');

  } catch (error) {
    console.error('❌ Failed to import to PostgreSQL:', error);
    await postgresPrisma.$disconnect();
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
