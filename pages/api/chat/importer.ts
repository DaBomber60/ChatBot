import type { NextApiRequest, NextApiResponse } from 'next';

// In-memory storage for the latest import (simple single-session approach)
let latestImport: {
  chat?: any;
  imported: boolean;
  timestamp: number;
  logs: string[];
} | null = null;

function parseChatData(requestData: any) {
  const logs: string[] = [];
  
  try {
    logs.push('Starting chat data parsing...');
    console.log('Parsing chat data:', JSON.stringify(requestData, null, 2));
    
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
    
    // Check for chat import marker
    const importMarkerIndex = systemContent.indexOf('<chat_to_import>');
    if (importMarkerIndex === -1) {
      throw new Error('No <chat_to_import> marker found. Please set your custom prompt to "<chat_to_import>" for import to work.');
    }
    logs.push('Found <chat_to_import> marker');
    
    // Extract character data from system content (same as character importer)
    const contentAfterMarker = systemContent.substring(importMarkerIndex + 17); // 17 = length of '<chat_to_import>'
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
    
    const firstTag = tagPositions[0]!;
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
    
    // Extract summary if it exists
    const summaryMatch = contentAfterMarker.match(/<summary>(.*?)<\/summary>/s);
    const summary = summaryMatch ? summaryMatch[1].trim() : '';
    if (summary) {
      logs.push(`Found summary: "${summary.substring(0, 50)}..."`);
    } else {
      logs.push('No summary tag found');
    }
    let characterName = '';
    
    // For chat imports, preserve {{char}} and {{user}} placeholders
    // Skip name detection if these placeholders are present
    if (personality.includes('{{char}}') || personality.includes('{{user}}') || 
        scenario.includes('{{char}}') || scenario.includes('{{user}}') ||
        exampleDialogue.includes('{{char}}') || exampleDialogue.includes('{{user}}')) {
      logs.push('Found {{char}} or {{user}} placeholders - preserving for multi-persona use');
      characterName = ''; // Leave empty, user will provide name
    } else {
      // Only try to detect names if no placeholders are present
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
    }
    
    // Extract chat messages (skip system message and initial "." user message)
    const chatMessages = requestData.messages.slice(2); // Skip system and "." messages
    logs.push(`Found ${chatMessages.length} chat messages to import`);
    
    // Find the assistant's first message
    const firstAssistantMessage = chatMessages.find((msg: any) => msg.role === 'assistant');
    const assistantFirstMessage = firstAssistantMessage ? firstAssistantMessage.content : '';
    logs.push(`Assistant first message: "${assistantFirstMessage.substring(0, 50)}..."`);
    
    // Extract persona name from user messages
    let detectedPersonaName = '';
    const userMessages = chatMessages.filter((msg: any) => msg.role === 'user');
    if (userMessages.length > 0) {
      const firstUserContent = userMessages[0].content;
      const colonIndex = firstUserContent.indexOf(': ');
      if (colonIndex > 0) {
        detectedPersonaName = firstUserContent.substring(0, colonIndex);
        logs.push(`Detected persona name: ${detectedPersonaName}`);
      }
    }
    
    const parsedData = {
      characterData: {
        name: characterName,
        personality,
        scenario,
        exampleDialogue,
        firstMessage: assistantFirstMessage.trim()
      },
      chatMessages: chatMessages,
      detectedPersonaName,
      userPersona,
      summary: summary // Add the extracted summary
    };
    
    logs.push('Chat data parsing completed successfully!');
    console.log('Parsed chat data:', parsedData);
    return { data: parsedData, logs };
    
  } catch (error) {
    console.error('Error parsing chat data:', error);
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
      console.log('[Chat Import] Received POST data at /chat/importer:', JSON.stringify(req.body, null, 2));
      
      // Parse the chat data from the request
      const parseResult = parseChatData(req.body);
      
      // Store in memory for the client to pick up
      latestImport = {
        chat: parseResult.data,
        imported: true,
        timestamp: Date.now(),
        logs: parseResult.logs
      };
      
      console.log('[Chat Import] Successfully parsed and stored chat data');
      
      // Return a simple success response
      return res.status(200).json({
        success: true,
        message: 'Chat data received and parsed successfully',
        chat: parseResult.data
      });
      
    } catch (errorObj: any) {
      console.error('[Chat Import] Error processing chat data:', errorObj);
      
      // Store error logs for the client to see
      const logs = errorObj.logs || [`Error: ${errorObj.error?.message || errorObj.message || 'Unknown error'}`];
      latestImport = {
        imported: false,
        timestamp: Date.now(),
        logs: logs
      };
      
      return res.status(400).json({
        success: false,
        error: 'Failed to parse chat data',
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
    
    if (latestImport.imported && latestImport.chat) {
      // Return the chat data and clean up
      const chatData = latestImport.chat;
      const logs = latestImport.logs || [];
      const timestamp = latestImport.timestamp;
      latestImport = null; // Clear after retrieval
      return res.status(200).json({ 
        imported: true, 
        chat: chatData, 
        logs: logs, 
        timestamp: timestamp 
      });
    }
    
    // Return any logs even if not yet imported (for error cases)
    return res.status(200).json({ imported: false, logs: latestImport.logs || [] });
  }
  
  res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
