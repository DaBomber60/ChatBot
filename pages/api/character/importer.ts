import type { NextApiRequest, NextApiResponse } from 'next';

// In-memory storage for the latest import (simple single-session approach)
let latestImport: {
  character?: any;
  imported: boolean;
  timestamp: number;
  logs: string[];
} | null = null;

function parseCharacterData(requestData: any) {
  const logs: string[] = [];
  
  try {
    logs.push('Starting character data parsing...');
    console.log('Parsing character data:', JSON.stringify(requestData, null, 2));
    
    if (!requestData.messages || !Array.isArray(requestData.messages)) {
      throw new Error('Invalid request format: missing messages array');
    }
    logs.push(`Found ${requestData.messages.length} messages in request`);
    
    // Find the system message
    const systemMessage = requestData.messages.find((msg: any) => msg.role === 'system');
    if (!systemMessage) {
      throw new Error('No system message found');
    }
    logs.push('Found system message');
    
    const systemContent = systemMessage.content;
    console.log('System content:', systemContent);
    logs.push(`System content length: ${systemContent.length} characters`);
    
    // Find the assistant's first message (initial message)
    const assistantMessage = requestData.messages.find((msg: any) => msg.role === 'assistant');
    const firstMessage = assistantMessage ? assistantMessage.content : '';
    logs.push(`Found assistant message: "${firstMessage.substring(0, 50)}..."`);
    
    // Extract persona name from user messages for {{user}} placeholder conversion
    let detectedPersonaName = '';
    const userMessages = requestData.messages.filter((msg: any) => msg.role === 'user');
    if (userMessages.length > 0) {
      // Get the most recent user message to extract persona name
      const lastUserMessage = userMessages[userMessages.length - 1];
      const userContent = lastUserMessage.content;
      const colonIndex = userContent.indexOf(': ');
      if (colonIndex > 0) {
        detectedPersonaName = userContent.substring(0, colonIndex);
        logs.push(`Detected persona name from user message: ${detectedPersonaName}`);
      }
    }
    
    if (!detectedPersonaName) {
      logs.push('No persona name detected from user messages');
    }
    // Parse the system content to extract character data
    // Look for the character import marker
    const importMarkerIndex = systemContent.indexOf('<character_to_import>');
    if (importMarkerIndex === -1) {
      throw new Error('No <character_to_import> marker found. Please set your custom prompt to "<character_to_import>" for import to work.');
    }
    logs.push('Found <character_to_import> marker');
    
    const contentAfterMarker = systemContent.substring(importMarkerIndex + 21); // 21 = length of '<character_to_import>'
    console.log('Content after marker:', contentAfterMarker);
    logs.push(`Content after marker: "${contentAfterMarker.substring(0, 100)}..."`);
    
    // Extract personality (everything until <scenario>, <example_dialogs>, or <UserPersona> tag, whichever comes first)
    const scenarioIndex = contentAfterMarker.indexOf('<scenario>');
    const exampleDialogsIndex = contentAfterMarker.indexOf('<example_dialogs>');
    const userPersonaIndex = contentAfterMarker.indexOf('<UserPersona>');
    
    // Find which tag comes first (or if only one exists)
    let personalityEndIndex = -1;
    const tagPositions = [
      { name: 'scenario', index: scenarioIndex },
      { name: 'example_dialogs', index: exampleDialogsIndex },
      { name: 'UserPersona', index: userPersonaIndex }
    ].filter(tag => tag.index !== -1).sort((a, b) => a.index - b.index);
    
    if (tagPositions.length === 0) {
      throw new Error('No <scenario>, <example_dialogs>, or <UserPersona> tag found');
    }
    
    const firstTag = tagPositions[0]!; // We know it exists because we checked length above
    personalityEndIndex = firstTag.index;
    logs.push(`Found ${firstTag.name} tag first at index ${personalityEndIndex}`);
    
    const personality = contentAfterMarker.substring(0, personalityEndIndex).trim();
    logs.push(`Extracted personality: "${personality.substring(0, 50)}..."`);
    
    // Extract scenario
    const scenarioMatch = contentAfterMarker.match(/<scenario>(.*?)<\/scenario>/s);
    const scenario = scenarioMatch ? scenarioMatch[1].trim() : '';
    logs.push(`Extracted scenario: "${scenario.substring(0, 50)}..."`);
    
    // Extract user persona
    const userPersonaMatch = contentAfterMarker.match(/<UserPersona>(.*?)<\/UserPersona>/s);
    const userPersona = userPersonaMatch ? userPersonaMatch[1].trim() : '';
    logs.push(`Extracted user persona: "${userPersona.substring(0, 50)}..."`);
    
    // Extract example dialogue
    const exampleDialogueMatch = contentAfterMarker.match(/<example_dialogs>(.*?)<\/example_dialogs>/s);
    const exampleDialogue = exampleDialogueMatch ? exampleDialogueMatch[1].trim() : '';
    logs.push(`Extracted example dialogue: "${exampleDialogue.substring(0, 50)}..."`);
    
    // Extract character name from the first message or personality text
    // Leave empty if no name is detected so user must fill it in
    let characterName = '';
    
    // Try to find a name in the personality text (look for patterns like "I am X" or "My name is X")
    const namePatterns = [
      /(?:I am|I'm|My name is|Call me)\s+([A-Z][a-zA-Z\s]+?)(?:\.|,|\n|$)/i,
      /^([A-Z][a-zA-Z\s]+?)(?:\s+is|,)/,
    ];
    
    for (const pattern of namePatterns) {
      const match = personality.match(pattern);
      if (match && match[1]) {
        characterName = match[1].trim();
        logs.push(`Detected character name from personality: ${characterName}`);
        break;
      }
    }
    
    if (!characterName) {
      logs.push('No character name detected - user will need to provide one');
    }
    
    // Apply persona name conversion to {{user}} if a persona name was detected
    let finalPersonality = personality;
    let finalScenario = scenario;
    let finalExampleDialogue = exampleDialogue;
    let finalFirstMessage = firstMessage.trim();
    
    if (detectedPersonaName && detectedPersonaName.trim()) {
      const personaNameRegex = new RegExp(detectedPersonaName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      
      finalPersonality = personality.replace(personaNameRegex, '{{user}}');
      finalScenario = scenario.replace(personaNameRegex, '{{user}}');
      finalExampleDialogue = exampleDialogue.replace(personaNameRegex, '{{user}}');
      finalFirstMessage = firstMessage.trim().replace(personaNameRegex, '{{user}}');
      
      logs.push(`Converted persona name "${detectedPersonaName}" to {{user}} in character data`);
    } else {
      logs.push('No persona name conversion applied - using original character data');
    }
    
    const parsedData = {
      name: characterName,
      personality: finalPersonality,
      scenario: finalScenario,
      exampleDialogue: finalExampleDialogue,
      firstMessage: finalFirstMessage
    };
    
    logs.push('Character data parsing completed successfully!');
    console.log('Parsed character data:', parsedData);
    return { data: parsedData, logs };
    
  } catch (error) {
    console.error('Error parsing character data:', error);
    logs.push(`ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw { error, logs };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  
  // Add CORS headers to allow cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method === 'POST') {
    try {
      console.log('[Character Import] Received POST data at /character/importer:', JSON.stringify(req.body, null, 2));
      
      // Parse the character data from the request
      const parseResult = parseCharacterData(req.body);
      
      // Store in memory for the client to pick up
      latestImport = {
        character: parseResult.data,
        imported: true,
        timestamp: Date.now(),
        logs: parseResult.logs
      };
      
      console.log('[Character Import] Successfully parsed and stored character data');
      
      // Return a simple success response
      return res.status(200).json({
        success: true,
        message: 'Character data received and parsed successfully',
        character: parseResult.data
      });
      
    } catch (errorObj: any) {
      console.error('[Character Import] Error processing character data:', errorObj);
      
      // Store error logs for the client to see
      const logs = errorObj.logs || [`Error: ${errorObj.error?.message || errorObj.message || 'Unknown error'}`];
      latestImport = {
        imported: false,
        timestamp: Date.now(),
        logs: logs
      };
      
      return res.status(400).json({
        success: false,
        error: 'Failed to parse character data',
        details: errorObj.error?.message || errorObj.message || 'Unknown error',
        logs: logs
      });
    }
  }
  
  if (req.method === 'GET') {
    // Client polling for import status
    if (!latestImport) {
      return res.status(200).json({ imported: false, logs: [] });
    }
    
    if (latestImport.imported && latestImport.character) {
      // Return the character data and clean up
      const characterData = latestImport.character;
      const logs = latestImport.logs || [];
      latestImport = null; // Clear after retrieval
      return res.status(200).json({ imported: true, character: characterData, logs: logs });
    }
    
    // Return any logs even if not yet imported (for error cases)
    return res.status(200).json({ imported: false, logs: latestImport.logs || [] });
  }
  
  res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
