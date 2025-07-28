import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/router';
import Head from 'next/head';

const fetcher = (url: string) => fetch(url).then(res => res.json());

type Persona = { id: number; name: string; profileName?: string };
type Character = { id: number; name: string; profileName?: string; firstMessage?: string; groupId?: number | null; group?: CharacterGroup | null };
type CharacterGroup = { id: number; name: string; color: string; isCollapsed: boolean; sortOrder: number };
type Session = { id: number; persona: Persona; character: Character; updatedAt: string; summary?: string; description?: string; messageCount: number };

export default function ChatIndexPage() {
  const router = useRouter();
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [expandedCharacters, setExpandedCharacters] = useState<Set<number>>(new Set());
  const [cloningSessionId, setCloningSessionId] = useState<number | null>(null);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [editingDescriptionId, setEditingDescriptionId] = useState<number | null>(null);
  const [descriptionText, setDescriptionText] = useState('');
  const [savingDescription, setSavingDescription] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const { data: personas } = useSWR<Persona[]>('/api/personas', fetcher);
  const { data: chars } = useSWR<Character[]>('/api/characters', fetcher);
  const { data: groups } = useSWR<CharacterGroup[]>('/api/character-groups', fetcher);
  const { data: sessions, mutate: mutateSessions } = useSWR<Session[]>('/api/sessions', fetcher);

  const [selectedPersona, setSelectedPersona] = useState<number>(0);
  const [selectedCharacter, setSelectedCharacter] = useState<number>(0);

  // Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [importedChatData, setImportedChatData] = useState<any>(null);
  const [showCharacterSelection, setShowCharacterSelection] = useState(false);
  const [matchingCharacters, setMatchingCharacters] = useState<Character[]>([]);
  const [selectedExistingCharacter, setSelectedExistingCharacter] = useState<number>(0);
  const [createNewCharacter, setCreateNewCharacter] = useState(false);
  const [newCharacterName, setNewCharacterName] = useState('');
  const [newCharacterProfileName, setNewCharacterProfileName] = useState('');
  const [selectedPersonaForImport, setSelectedPersonaForImport] = useState<number>(0);
  const [importError, setImportError] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [wasPollingBeforeClose, setWasPollingBeforeClose] = useState(false);
  
  // Import persona state
  const [importPersona, setImportPersona] = useState(false);
  const [newPersonaName, setNewPersonaName] = useState('');
  const [newPersonaProfileName, setNewPersonaProfileName] = useState('');

  const toggleCharacterExpansion = (characterId: number) => {
    setExpandedCharacters(prev => {
      const newSet = new Set(prev);
      if (newSet.has(characterId)) {
        newSet.delete(characterId);
      } else {
        newSet.add(characterId);
      }
      return newSet;
    });
  };

  const startSession = async () => {
    if (!selectedPersona || !selectedCharacter) return;
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personaId: selectedPersona, characterId: selectedCharacter })
    });
    const data = await res.json();
    router.push(`/chat/${data.id}`);
  };

  const cloneSession = async (sessionId: number) => {
    setCloningSessionId(sessionId);
    closeMenu();
    
    try {
      // Fetch the original session data with all messages
      const sessionResponse = await fetch(`/api/sessions/${sessionId}`);
      if (!sessionResponse.ok) {
        throw new Error('Failed to fetch session data');
      }
      
      const originalSession = await sessionResponse.json();
      
      // Create a new session with the same persona and character
      const newSessionResponse = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          personaId: originalSession.personaId, 
          characterId: originalSession.characterId 
        })
      });
      
      if (!newSessionResponse.ok) {
        throw new Error('Failed to create new session');
      }
      
      const newSession = await newSessionResponse.json();
      
      // Copy the summary if it exists
      if (originalSession.summary && originalSession.summary.trim()) {
        try {
          await fetch(`/api/sessions/${newSession.id}/summary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ summary: originalSession.summary.trim() })
          });
        } catch (error) {
          console.error('Failed to copy summary:', error);
          // Don't fail the clone if summary copying fails
        }
      }
      
      // Copy all messages except the automatically created first message
      // (since new sessions already get the first message automatically)
      const messagesToCopy = originalSession.messages.slice(1); // Skip first message
      
      for (const message of messagesToCopy) {
        await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: newSession.id,
            role: message.role,
            content: message.content
          })
        });
      }
      
      // Refresh the sessions list
      mutateSessions();
      
      // Navigate to the new cloned session
      router.push(`/chat/${newSession.id}`);
      
    } catch (error) {
      console.error('Error cloning session:', error);
      alert('Failed to clone chat session. Please try again.');
    } finally {
      setCloningSessionId(null);
    }
  };

  const openDescriptionModal = (sessionId: number, currentDescription: string = '') => {
    setEditingDescriptionId(sessionId);
    setDescriptionText(currentDescription);
    setShowDescriptionModal(true);
    closeMenu();
  };

  const closeDescriptionModal = () => {
    setShowDescriptionModal(false);
    setEditingDescriptionId(null);
    setDescriptionText('');
    setSavingDescription(false);
  };

  const saveDescription = async () => {
    if (!editingDescriptionId) return;
    
    setSavingDescription(true);
    
    try {
      const response = await fetch(`/api/sessions/${editingDescriptionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: descriptionText.trim() || null })
      });
      
      if (!response.ok) {
        throw new Error('Failed to save description');
      }
      
      // Refresh the sessions list
      mutateSessions();
      closeDescriptionModal();
      
    } catch (error) {
      console.error('Error saving description:', error);
      alert('Failed to save description. Please try again.');
      setSavingDescription(false);
    }
  };

  const toggleMenu = (sessionId: number) => {
    setOpenMenuId(openMenuId === sessionId ? null : sessionId);
  };

  const closeMenu = () => {
    setOpenMenuId(null);
  };

  // Import functions
  const startImport = () => {
    setShowImportModal(true);
    setIsPolling(false);
    setImportLogs([]);
    setImportedChatData(null);
    setShowCharacterSelection(false);
    setImportError('');
    setImportPersona(false);
    setNewPersonaName('');
    setNewPersonaProfileName('');
    
    // Auto-resume polling if we were polling before and haven't completed an import
    if (wasPollingBeforeClose && !importedChatData) {
      console.log('Auto-resuming polling from previous session');
      setTimeout(() => setIsPolling(true), 100); // Small delay to ensure modal is ready
    }
  };

  const checkForImport = async () => {
    try {
      const response = await fetch('/api/chat/importer');
      const data = await response.json();
      
      if (data.logs && data.logs.length > 0) {
        setImportLogs(data.logs);
      }
      
      if (data.imported && data.chat) {
        console.log('New chat import detected:', data.chat);
        setImportedChatData(data.chat);
        setIsPolling(false);
        
        // Set default persona name if userPersona data exists
        if (data.chat.userPersona && data.chat.userPersona.trim()) {
          setNewPersonaName(data.chat.detectedPersonaName || '');
          console.log('UserPersona data found, will offer import option');
        }
        
        // Check for existing characters with matching first message
        // Use modified first message (with persona name converted to {{user}}) for matching
        const firstMessage = data.chat.characterData.firstMessage;
        const detectedPersonaName = data.chat.detectedPersonaName;
        
        let modifiedFirstMessage = firstMessage;
        if (detectedPersonaName && detectedPersonaName.trim()) {
          const personaNameRegex = new RegExp(detectedPersonaName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          modifiedFirstMessage = firstMessage.replace(personaNameRegex, '{{user}}');
          console.log(`Modified first message for matching: "${modifiedFirstMessage.substring(0, 50)}..."`);
        }
        
        if (firstMessage && chars) {
          // Match against the modified first message to find multi-persona compatible characters
          const matching = chars.filter(c => c.firstMessage === modifiedFirstMessage);
          setMatchingCharacters(matching);
          setShowCharacterSelection(true);
          
          if (matching.length === 0) {
            // No matching characters, set up for new character creation
            setCreateNewCharacter(true);
            setNewCharacterName(data.chat.characterData.name || '');
          } else if (matching.length === 1) {
            // Single match, pre-select it
            setSelectedExistingCharacter(matching[0]!.id);
            setCreateNewCharacter(false);
          }
        }
        
        return true; // New import found and processed
      }
      
      return false; // No import found
    } catch (error) {
      console.error('Error checking for import:', error);
      return false;
    }
  };

  const handleImportComplete = async () => {
    if (!importedChatData) {
      setImportError('No imported chat data available');
      return;
    }

    // Validate persona selection/creation
    if (importPersona) {
      if (!newPersonaName.trim()) {
        setImportError('Please enter a persona name when importing persona');
        return;
      }
      
      // Check for name+profile uniqueness for personas
      const existingPersona = personas?.find(p => 
        p.name === newPersonaName.trim() && 
        (p.profileName || '') === (newPersonaProfileName.trim() || '')
      );
      
      if (existingPersona) {
        setImportError('A persona with this name and profile name combination already exists');
        return;
      }
    } else if (!selectedPersonaForImport) {
      setImportError('Please select a persona for the imported chat');
      return;
    }

    let characterId = selectedExistingCharacter;
    let personaId = selectedPersonaForImport;
    
    setIsImporting(true);
    setImportError('');

    try {
      // Create new persona if requested
      if (importPersona) {
        console.log('Creating new persona from imported data');
        const personaData = {
          name: newPersonaName.trim(),
          profileName: newPersonaProfileName.trim() || undefined,
          profile: importedChatData.userPersona
        };
        
        const personaResponse = await fetch('/api/personas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(personaData)
        });
        
        if (!personaResponse.ok) {
          throw new Error('Failed to create persona');
        }
        
        const newPersona = await personaResponse.json();
        personaId = newPersona.id;
        console.log('Created new persona with ID:', personaId);
      }
    
      if (createNewCharacter) {
        if (!newCharacterName.trim()) {
          setImportError('Please enter a character name');
          setIsImporting(false);
          return;
        }
        
        // Check for name+profile uniqueness
        const existingCharacter = chars?.find(c => 
          c.name === newCharacterName.trim() && 
          (c.profileName || '') === (newCharacterProfileName.trim() || '')
        );
        
        if (existingCharacter) {
          setImportError('A character with this name and profile name combination already exists');
          setIsImporting(false);
          return;
        }
        
        // Create new character with persona name converted to {{user}}
        const characterData = importedChatData.characterData;
        const detectedPersonaName = importedChatData.detectedPersonaName;
        
        // Create a modified copy of character data for multi-persona use
        let modifiedCharacterData = { ...characterData };
        
        // Replace detected persona name with {{user}} placeholder if a persona name was detected
        if (detectedPersonaName && detectedPersonaName.trim()) {
          const personaNameRegex = new RegExp(detectedPersonaName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          
          modifiedCharacterData = {
            ...characterData,
            personality: characterData.personality.replace(personaNameRegex, '{{user}}'),
            scenario: characterData.scenario.replace(personaNameRegex, '{{user}}'),
            exampleDialogue: characterData.exampleDialogue.replace(personaNameRegex, '{{user}}'),
            firstMessage: characterData.firstMessage.replace(personaNameRegex, '{{user}}')
          };
          
          console.log(`Replaced persona name "${detectedPersonaName}" with {{user}} in character data`);
        }
        
        const createResponse = await fetch('/api/characters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newCharacterName.trim(),
            profileName: newCharacterProfileName.trim() || undefined,
            personality: modifiedCharacterData.personality,
            scenario: modifiedCharacterData.scenario,
            exampleDialogue: modifiedCharacterData.exampleDialogue,
            firstMessage: modifiedCharacterData.firstMessage
          })
        });
        
        if (!createResponse.ok) {
          throw new Error('Failed to create character');
        }
        
        const newCharacter = await createResponse.json();
        characterId = newCharacter.id;
      }
      
      if (!characterId) {
        setImportError('Please select a character or create a new one');
        setIsImporting(false);
        return;
      }

      // Create new chat session
      const sessionResponse = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          personaId: personaId, 
          characterId: characterId 
        })
      });
      
      if (!sessionResponse.ok) {
        throw new Error('Failed to create chat session');
      }
      
      const session = await sessionResponse.json();
      
      // Set the summary if one was extracted from the system prompt
      if (importedChatData.summary && importedChatData.summary.trim()) {
        try {
          await fetch(`/api/sessions/${session.id}/summary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              summary: importedChatData.summary.trim() 
            })
          });
          console.log('Summary set from imported data');
        } catch (error) {
          console.error('Failed to set summary:', error);
          // Don't fail the import if summary setting fails
        }
      }
      
      // Import chat messages
      const messages = importedChatData.chatMessages;
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        let content = message.content;
        
        // Skip the first assistant message since it's already stored as character.firstMessage
        if (i === 0 && message.role === 'assistant') {
          continue;
        }
        
        // Skip the last user message if it's at the end (often just an API trigger)
        if (i === messages.length - 1 && message.role === 'user') {
          continue;
        }
        
        // For user messages, strip persona name prefix if present
        if (message.role === 'user' && content.includes(': ')) {
          const colonIndex = content.indexOf(': ');
          if (colonIndex > 0) {
            content = content.substring(colonIndex + 2);
          }
        }
        
        await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.id,
            role: message.role,
            content: content
          })
        });
      }
      
      // Clear polling state since import is complete
      setWasPollingBeforeClose(false);
      
      // Redirect to the new chat
      router.push(`/chat/${session.id}`);
      
    } catch (error) {
      console.error('Import error:', error);
      setImportError('Failed to import chat');
      setIsImporting(false);
    }
  };

  const resetImport = () => {
    // Remember if we were polling before closing
    setWasPollingBeforeClose(isPolling && !importedChatData);
    
    setShowImportModal(false);
    setIsPolling(false);
    setImportLogs([]);
    setImportedChatData(null);
    setShowCharacterSelection(false);
    setMatchingCharacters([]);
    setSelectedExistingCharacter(0);
    setCreateNewCharacter(false);
    setNewCharacterName('');
    setNewCharacterProfileName('');
    setSelectedPersonaForImport(0);
    setImportError('');
    setIsImporting(false);
    setImportPersona(false);
    setNewPersonaName('');
    setNewPersonaProfileName('');
  };

  useEffect(() => {
    return () => {
      setIsPolling(false);
    };
  }, []);

  // Polling effect for import detection
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    
    if (isPolling && showImportModal) {
      console.log('Starting continuous polling for chat import');
      
      // Immediate check when polling starts
      checkForImport().then(importFound => {
        if (importFound) {
          console.log('Import already waiting, detected immediately');
          return;
        }
        
        // Start interval polling if no immediate import found
        intervalId = setInterval(async () => {
          const importFound = await checkForImport();
          if (importFound) {
            console.log('Import detected, stopping poll');
            // polling will be stopped by setIsPolling(false) in checkForImport
          }
        }, 1000); // Poll every second
      });
    }
    
    return () => {
      if (intervalId) {
        console.log('Cleaning up polling interval');
        clearInterval(intervalId);
      }
    };
  }, [isPolling, showImportModal, chars]); // Include chars dependency for character matching

  // Handle escape key to close modal and click outside to close menu
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showImportModal) {
          resetImport();
        } else if (showDescriptionModal) {
          closeDescriptionModal();
        } else if (openMenuId) {
          closeMenu();
        }
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (openMenuId) {
        const target = event.target as HTMLElement;
        if (!target.closest('.menu-container')) {
          closeMenu();
        }
      }
    };

    if (showImportModal || showDescriptionModal) {
      document.addEventListener('keydown', handleKeyDown);
    }

    if (openMenuId) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showImportModal, showDescriptionModal, openMenuId]);

  // Function to organize characters by groups for display
  const organizeCharactersForDisplay = () => {
    if (!chars || !groups) return [];
    
    const organizedCharacters: Array<{ isGroup: boolean; group?: CharacterGroup; character?: Character; characters?: Character[] }> = [];
    
    // Create a map of grouped characters
    const grouped: { [key: number]: Character[] } = {};
    const ungrouped: Character[] = [];
    
    // Initialize group arrays
    groups.forEach(group => {
      grouped[group.id] = [];
    });
    
    // Sort characters into groups
    chars.forEach(char => {
      if (char.groupId && grouped[char.groupId]) {
        const groupArray = grouped[char.groupId];
        if (groupArray) {
          groupArray.push(char);
        }
      } else {
        ungrouped.push(char);
      }
    });
    
    // Add grouped characters
    groups.forEach(group => {
      const groupCharacters = grouped[group.id] || [];
      if (groupCharacters.length > 0) {
        // Sort characters within group by name
        groupCharacters.sort((a, b) => (a.profileName || a.name).localeCompare(b.profileName || b.name));
        organizedCharacters.push({ isGroup: true, group, characters: groupCharacters });
      }
    });
    
    // Add ungrouped characters
    if (ungrouped.length > 0) {
      ungrouped.sort((a, b) => (a.profileName || a.name).localeCompare(b.profileName || b.name));
      ungrouped.forEach(char => {
        organizedCharacters.push({ isGroup: false, character: char });
      });
    }
    
    return organizedCharacters;
  };

  if (!personas || !chars || !groups) {
    return (
      <div className="container text-center">
        <div className="card">
          <div className="status-indicator">
            <div className="status-dot status-loading"></div>
            Loading...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <Head>
        <title>Chat - Start New Conversation</title>
        <meta name="description" content="Choose a character and persona to start a new chat conversation." />
      </Head>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-semibold mb-0">Start New Chat</h1>
        <div className="flex gap-3">
          <button 
            className="btn btn-secondary" 
            onClick={startImport}
            title="Import chat from external tools"
          >
            📥 Import Chat
          </button>
          <button className="btn btn-secondary" onClick={() => router.push('/')}>
            🏠 Home
          </button>
        </div>
      </div>

      {/* New Chat Section */}
      <div className="card mb-8">
        <div className="card-header">
          <h3 className="card-title">Create New Conversation</h3>
          <p className="card-description">Choose a character and persona to start chatting</p>
        </div>
        
        {chars.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-secondary mb-4">No characters available.</p>
            <button 
              className="btn btn-primary" 
              onClick={() => router.push('/characters')}
            >
              Create Your First Character
            </button>
          </div>
        ) : personas.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-secondary mb-4">No personas available.</p>
            <button 
              className="btn btn-primary" 
              onClick={() => router.push('/personas')}
            >
              Create Your First Persona
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="form-group">
              <label className="form-label">Select Character</label>
              <select
                className="form-select"
                value={selectedCharacter}
                onChange={e => setSelectedCharacter(Number(e.target.value))}
              >
                <option value={0}>Choose a character...</option>
                {organizeCharactersForDisplay().map((item, index) => 
                  item.isGroup ? (
                    item.characters?.map(char => (
                      <option key={char.id} value={char.id}>
                        {item.group?.name}: {char.profileName || char.name}
                      </option>
                    ))
                  ) : (
                    <option key={item.character!.id} value={item.character!.id}>
                      {item.character!.profileName || item.character!.name}
                    </option>
                  )
                )}
              </select>
            </div>
            
            <div className="form-group">
              <label className="form-label">Select Persona</label>
              <select
                className="form-select"
                value={selectedPersona}
                onChange={e => setSelectedPersona(Number(e.target.value))}
              >
                <option value={0}>Choose a persona...</option>
                {personas.map(p => (
                  <option key={p.id} value={p.id}>{p.profileName || p.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}
        
        {chars.length > 0 && personas.length > 0 && (
          <div className="text-center">
            <button
              className="btn btn-primary btn-large"
              onClick={startSession}
              disabled={!selectedCharacter || !selectedPersona}
            >
              🚀 Start Conversation
            </button>
          </div>
        )}
      </div>

      {/* Existing Chats Section */}
      {sessions && sessions.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Continue Existing Conversations</h3>
            <p className="card-description">Resume your previous chats</p>
          </div>
          
          <div className="space-y-6">
            {(() => {
              // Group sessions by character and then by character group
              const sessionsByCharacter = sessions.reduce((groups, session) => {
                const characterId = session.character.id;
                if (!groups[characterId]) {
                  groups[characterId] = {
                    character: session.character,
                    sessions: [],
                    mostRecentUpdate: session.updatedAt
                  };
                }
                groups[characterId].sessions.push(session);
                // Update most recent date if this session is more recent
                if (new Date(session.updatedAt) > new Date(groups[characterId].mostRecentUpdate)) {
                  groups[characterId].mostRecentUpdate = session.updatedAt;
                }
                return groups;
              }, {} as Record<number, { character: Character; sessions: Session[]; mostRecentUpdate: string }>);

              // Now group these character sessions by character groups
              const groupedByCharacterGroup: Array<{
                isGroup: boolean;
                group?: CharacterGroup;
                characterSessions: Array<{ character: Character; sessions: Session[]; mostRecentUpdate: string }>;
              }> = [];

              const groupedCharacterSessions: { [key: number]: Array<{ character: Character; sessions: Session[]; mostRecentUpdate: string }> } = {};
              const ungroupedCharacterSessions: Array<{ character: Character; sessions: Session[]; mostRecentUpdate: string }> = [];

              // Initialize group arrays
              groups?.forEach(group => {
                groupedCharacterSessions[group.id] = [];
              });

              // Sort character sessions into groups
              Object.values(sessionsByCharacter).forEach(characterSession => {
                const groupId = characterSession.character.groupId;
                if (groupId && groupedCharacterSessions[groupId]) {
                  const groupArray = groupedCharacterSessions[groupId];
                  if (groupArray) {
                    groupArray.push(characterSession);
                  }
                } else {
                  ungroupedCharacterSessions.push(characterSession);
                }
              });

              // Add grouped character sessions
              groups?.forEach(group => {
                const groupCharacterSessions = groupedCharacterSessions[group.id] || [];
                if (groupCharacterSessions.length > 0) {
                  // Sort by most recent activity within group
                  groupCharacterSessions.sort((a, b) => new Date(b.mostRecentUpdate).getTime() - new Date(a.mostRecentUpdate).getTime());
                  groupedByCharacterGroup.push({ 
                    isGroup: true, 
                    group, 
                    characterSessions: groupCharacterSessions 
                  });
                }
              });

              // Add ungrouped character sessions
              if (ungroupedCharacterSessions.length > 0) {
                ungroupedCharacterSessions.sort((a, b) => new Date(b.mostRecentUpdate).getTime() - new Date(a.mostRecentUpdate).getTime());
                groupedByCharacterGroup.push({ 
                  isGroup: false, 
                  characterSessions: ungroupedCharacterSessions 
                });
              }

              // Sort groups by their most recent activity
              groupedByCharacterGroup.sort((a, b) => {
                const aMostRecent = Math.max(...a.characterSessions.map(cs => new Date(cs.mostRecentUpdate).getTime()));
                const bMostRecent = Math.max(...b.characterSessions.map(cs => new Date(cs.mostRecentUpdate).getTime()));
                return bMostRecent - aMostRecent;
              });

              return groupedByCharacterGroup.map((groupItem, groupIndex) => (
                <div key={groupIndex}>
                  {groupItem.isGroup && groupItem.group && (
                    <div className="mb-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div 
                          style={{ 
                            width: '12px', 
                            height: '12px', 
                            backgroundColor: groupItem.group.color, 
                            borderRadius: '2px' 
                          }}
                        ></div>
                        <h3 className="text-lg font-semibold text-primary">{groupItem.group.name}</h3>
                        <span className="text-sm text-muted">
                          ({groupItem.characterSessions.length} character{groupItem.characterSessions.length !== 1 ? 's' : ''})
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {groupItem.characterSessions.map(characterGroup => {
                    const isExpanded = expandedCharacters.has(characterGroup.character.id);
                    return (
                      <div key={characterGroup.character.id} className="mb-4">
                        <div className="chat-group-header bg-secondary border border-primary rounded-lg overflow-hidden cursor-pointer">
                          <div 
                            className="flex items-center justify-between p-4"
                            onClick={() => toggleCharacterExpansion(characterGroup.character.id)}
                          >
                            <div className="flex items-center gap-3">
                              <h4 className="text-lg font-semibold text-primary">
                                {groupItem.isGroup ? characterGroup.character.name : characterGroup.character.name}
                              </h4>
                              {characterGroup.character.profileName && (
                                <span className="text-sm text-secondary italic">({characterGroup.character.profileName})</span>
                              )}
                            </div>
                            <span className="text-xs text-muted">
                              {characterGroup.sessions.length} conversation{characterGroup.sessions.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          
                          {isExpanded && (
                            <div className="border-t border-primary p-4 space-y-3">
                              {characterGroup.sessions
                                .sort((a: Session, b: Session) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                                .map((s: Session) => (
                                  <div 
                                    key={s.id} 
                                    className="chat-list-item bg-secondary border border-primary rounded-lg p-4 cursor-pointer"
                                    onClick={() => router.push(`/chat/${s.id}`)}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-1">
                                          <h5 className="font-medium text-primary">{s.persona.name}</h5>
                                          {s.persona.profileName && (
                                            <span className="text-xs text-secondary italic">({s.persona.profileName})</span>
                                          )}
                                        </div>
                                        <p className="text-xs text-secondary italic mb-1">
                                          {s.description 
                                            ? (s.description.length > 120 ? `${s.description.substring(0, 120)}...` : s.description)
                                            : s.summary 
                                            ? (s.summary.length > 120 ? `${s.summary.substring(0, 120)}...` : s.summary)
                                            : "No description or summary yet :("
                                          }
                                        </p>
                                        <p className="text-xs text-muted mb-1">
                                          Last active: {new Date(s.updatedAt).toLocaleDateString()} at {new Date(s.updatedAt).toLocaleTimeString()}
                                        </p>
                                        <p className="text-xs text-muted mb-0">
                                          💬 {s.messageCount} message{s.messageCount !== 1 ? 's' : ''}
                                        </p>
                                      </div>
                                      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                        <div 
                                          className="menu-container relative"
                                          style={{
                                            height: openMenuId === s.id ? '2rem' : 'auto',
                                            minHeight: openMenuId === s.id ? '2rem' : 'auto',
                                            zIndex: openMenuId === s.id ? 999999 : 'auto'
                                          }}
                                        >
                                          {openMenuId !== s.id && (
                                            <button
                                              className="btn btn-secondary btn-small"
                                              onClick={() => toggleMenu(s.id)}
                                              title="More actions"
                                            >
                                              ⋯
                                            </button>
                                          )}
                                          
                                          {openMenuId === s.id && (
                                            <div 
                                              className="absolute right-0 min-w-48 overflow-hidden"
                                              style={{
                                                top: openMenuId === s.id ? '0' : 'calc(100% + 4px)',
                                                backgroundColor: 'var(--bg-secondary)',
                                                border: '1px solid var(--border-primary)',
                                                borderRadius: 'var(--radius-lg)',
                                                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
                                                zIndex: 999999
                                              }}
                                            >
                                              <div>
                                                <button
                                                  className="w-full text-left text-sm transition-colors duration-150 flex items-center gap-3"
                                                  style={{
                                                    color: 'var(--text-primary)',
                                                    backgroundColor: 'transparent',
                                                    border: 'none',
                                                    padding: '12px 20px'
                                                  }}
                                                  onMouseEnter={(e) => {
                                                    e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                                                  }}
                                                  onMouseLeave={(e) => {
                                                    e.currentTarget.style.backgroundColor = 'transparent';
                                                  }}
                                                  onClick={() => openDescriptionModal(s.id, s.description || '')}
                                                >
                                                  <span className="text-base">📝</span>
                                                  <span className="font-medium">{s.description ? 'Edit' : 'Add'} Description</span>
                                                </button>
                                                
                                                <button
                                                  className="w-full text-left text-sm transition-colors duration-150 flex items-center gap-3"
                                                  style={{
                                                    color: 'var(--text-primary)',
                                                    backgroundColor: 'transparent',
                                                    border: 'none',
                                                    padding: '12px 20px'
                                                  }}
                                                  onMouseEnter={(e) => {
                                                    if (!e.currentTarget.disabled) {
                                                      e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                                                    }
                                                  }}
                                                  onMouseLeave={(e) => {
                                                    e.currentTarget.style.backgroundColor = 'transparent';
                                                  }}
                                                  onClick={() => cloneSession(s.id)}
                                                  disabled={cloningSessionId === s.id}
                                                >
                                                  <span className="text-base">{cloningSessionId === s.id ? '⏳' : '📋'}</span>
                                                  <span className="font-medium">Clone Chat</span>
                                                </button>
                                                
                                                <div style={{ 
                                                  height: '1px', 
                                                  backgroundColor: 'var(--border-secondary)', 
                                                  margin: '8px 20px' 
                                                }}></div>
                                                
                                                {confirmDeleteId === s.id ? (
                                                  <>
                                                    <button
                                                      className="w-full text-left text-sm transition-colors duration-150 flex items-center gap-3 font-medium"
                                                      style={{
                                                        color: 'var(--error)',
                                                        backgroundColor: 'transparent',
                                                        border: 'none',
                                                        padding: '12px 20px'
                                                      }}
                                                      onMouseEnter={(e) => {
                                                        e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                                                      }}
                                                      onMouseLeave={(e) => {
                                                        e.currentTarget.style.backgroundColor = 'transparent';
                                                      }}
                                                      onClick={async () => {
                                                        await fetch(`/api/sessions/${s.id}`, { method: 'DELETE' });
                                                        setConfirmDeleteId(null);
                                                        mutateSessions();
                                                        closeMenu();
                                                      }}
                                                    >
                                                      <span className="text-base">✓</span>
                                                      <span>Confirm Delete</span>
                                                    </button>
                                                    <button
                                                      className="w-full text-left text-sm transition-colors duration-150 flex items-center gap-3"
                                                      style={{
                                                        color: 'var(--text-primary)',
                                                        backgroundColor: 'transparent',
                                                        border: 'none',
                                                        padding: '12px 20px'
                                                      }}
                                                      onMouseEnter={(e) => {
                                                        e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                                                      }}
                                                      onMouseLeave={(e) => {
                                                        e.currentTarget.style.backgroundColor = 'transparent';
                                                      }}
                                                      onClick={() => {
                                                        setConfirmDeleteId(null);
                                                        closeMenu();
                                                      }}
                                                    >
                                                      <span className="text-base">✕</span>
                                                      <span className="font-medium">Cancel</span>
                                                    </button>
                                                  </>
                                                ) : (
                                                  <button
                                                    className="w-full text-left text-sm transition-colors duration-150 flex items-center gap-3 font-medium"
                                                    style={{
                                                      color: 'var(--error)',
                                                      backgroundColor: 'transparent',
                                                      border: 'none',
                                                      padding: '12px 20px'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                      e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                      e.currentTarget.style.backgroundColor = 'transparent';
                                                    }}
                                                    onClick={() => {
                                                      setConfirmDeleteId(s.id);
                                                    }}
                                                  >
                                                    <span className="text-base">🗑️</span>
                                                    <span>Delete Chat</span>
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* Empty state for no sessions */}
      {sessions && sessions.length === 0 && (
        <div className="text-center py-12">
          <p className="text-secondary mb-4">No conversations yet.</p>
          <p className="text-muted text-sm">Start your first chat above!</p>
        </div>
      )}

      {/* Import Chat Modal */}
      {showImportModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && resetImport()}>
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="text-2xl font-semibold text-primary mb-0">Import Chat</h2>
            </div>
            
            <div className="modal-body">
              {!showCharacterSelection ? (
                <>
                  {!isPolling && (
                    <div className="space-y-4">
                      {wasPollingBeforeClose && (
                        <div className="bg-warning rounded-lg p-3 border-l-4 border-orange-400">
                          <p className="text-sm">
                            ℹ️ <strong>Auto-resume:</strong> You were listening for imports before. 
                            Click "Start Listening" to resume where you left off.
                          </p>
                        </div>
                      )}
                      
                      <div className="bg-info rounded-lg p-4">
                        <h4 className="font-semibold mb-2">Setup Instructions:</h4>
                        <ol className="text-sm space-y-1 mb-4">
                          <li>1. Set your custom prompt to: <code>&lt;chat_to_import&gt;</code></li>
                          <li>2. Make your API request from the external tool to the URL below</li>
                          <li>3. The chat will be automatically imported here</li>
                        </ol>
                        
                        <div className="space-y-3">
                          <div>
                            <label className="form-label text-sm">Import Marker (copy this):</label>
                            <div className="flex items-center gap-2">
                              <input 
                                type="text" 
                                className="form-input flex-1 text-sm font-mono" 
                                value="<chat_to_import>" 
                                readOnly 
                              />
                              <button 
                                className="btn btn-secondary btn-small"
                                onClick={() => navigator.clipboard.writeText('<chat_to_import>')}
                                title="Copy to clipboard"
                              >
                                📋 Copy
                              </button>
                            </div>
                          </div>
                          
                          <div>
                            <label className="form-label text-sm">API Endpoint URL (for external tools):</label>
                            <div className="flex items-center gap-2">
                              <input 
                                type="text" 
                                className="form-input flex-1 text-sm font-mono" 
                                value={`${window.location.origin}/api/chat/importer`}
                                readOnly 
                              />
                              <button 
                                className="btn btn-secondary btn-small"
                                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/chat/importer`)}
                                title="Copy URL to clipboard"
                              >
                                📋 Copy
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-center">
                        <button 
                          className="btn btn-primary btn-large"
                          onClick={() => {
                            setIsPolling(true);
                          }}
                        >
                          Start Listening for Import
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {isPolling && (
                    <div className="space-y-4">
                      <div className="bg-info rounded-lg p-4">
                        <h4 className="font-semibold mb-2">✅ Listening for Chat Import</h4>
                        <p className="text-sm mb-1">Continuously monitoring for incoming chat imports...</p>
                        <p className="text-sm mb-3">Make your API request from the external tool now.</p>
                        <div className="text-center">
                          <button 
                            className="btn btn-secondary"
                            onClick={() => setIsPolling(false)}
                          >
                            Stop Listening
                          </button>
                        </div>
                      </div>
                      
                      {importLogs.length > 0 && (
                        <div>
                          <h4 className="font-semibold mb-2">Import Status:</h4>
                          <div className="bg-secondary rounded-lg p-3 max-h-48 overflow-y-auto">
                            {importLogs.map((log, i) => (
                              <div key={i} className={`text-sm ${log.startsWith('ERROR:') ? 'text-error' : 'text-primary'}`}>
                                {log}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <div className="text-center py-4">
                        <div className="status-indicator">
                          <div className="status-dot status-loading"></div>
                          Waiting for chat import...
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="bg-success rounded-lg p-4 mb-4">
                    <h4 className="font-semibold mb-2">✅ Chat Imported Successfully!</h4>
                    <p className="text-sm">Found {importedChatData?.chatMessages?.length || 0} messages to import.</p>
                    {importedChatData?.summary && (
                      <p className="text-sm">📝 Summary will be set from imported data.</p>
                    )}
                    {importedChatData?.userPersona && importedChatData.userPersona.trim() && (
                      <p className="text-sm">👤 User persona data found - can be imported as new persona.</p>
                    )}
                  </div>
                  
                  <div className="space-y-4">
                    <div className="form-group">
                      <label className="form-label">Select Persona for this Chat</label>
                      <select
                        className="form-select"
                        value={selectedPersonaForImport}
                        onChange={e => setSelectedPersonaForImport(Number(e.target.value))}
                        disabled={importPersona}
                      >
                        <option value={0}>Choose a persona...</option>
                        {personas?.map(p => (
                          <option key={p.id} value={p.id}>{p.profileName || p.name}</option>
                        ))}
                      </select>
                      
                      {/* Import Persona Option */}
                      {importedChatData?.userPersona && importedChatData.userPersona.trim() && (
                        <div className="mt-3 space-y-3">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={importPersona}
                              onChange={e => {
                                setImportPersona(e.target.checked);
                                if (e.target.checked) {
                                  setSelectedPersonaForImport(0); // Clear existing persona selection
                                }
                              }}
                            />
                            <span className="text-sm">Import persona from chat data</span>
                          </label>
                          
                          {importPersona && (
                            <div className="bg-info rounded-lg p-4 space-y-3">
                              <h5 className="font-medium text-sm">Create New Persona</h5>
                              
                              <div className="form-group">
                                <label className="form-label text-sm">Persona Name *</label>
                                <input
                                  type="text"
                                  className="form-input"
                                  value={newPersonaName}
                                  onChange={e => setNewPersonaName(e.target.value)}
                                  placeholder="Enter persona name"
                                />
                              </div>
                              
                              <div className="form-group">
                                <label className="form-label text-sm">Profile Name (Optional)</label>
                                <input
                                  type="text"
                                  className="form-input"
                                  value={newPersonaProfileName}
                                  onChange={e => setNewPersonaProfileName(e.target.value)}
                                  placeholder="Enter profile name (optional)"
                                />
                                <p className="text-xs text-muted mt-1">
                                  Profile name helps distinguish personas with the same name
                                </p>
                              </div>
                              
                              <div className="bg-secondary rounded p-3">
                                <h6 className="text-xs font-medium text-accent mb-2">Imported Persona Data:</h6>
                                <p className="text-xs text-secondary">
                                  {importedChatData.userPersona.substring(0, 200)}
                                  {importedChatData.userPersona.length > 200 ? '...' : ''}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {matchingCharacters.length === 0 && (
                      <div className="bg-warning rounded-lg p-4">
                        <h4 className="font-semibold mb-2">No Matching Character Found</h4>
                        <p className="text-sm mb-3">We&apos;ll create a new character for this chat.</p>
                      </div>
                    )}
                    
                    {matchingCharacters.length === 1 && (
                      <div className="bg-info rounded-lg p-4">
                        <h4 className="font-semibold mb-2">Character Found</h4>
                        <p className="text-sm mb-3">Found matching character: <strong>{matchingCharacters[0]!.name}</strong></p>
                        <div className="flex gap-2">
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="characterChoice"
                              checked={!createNewCharacter}
                              onChange={() => setCreateNewCharacter(false)}
                            />
                            Use existing character
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="characterChoice"
                              checked={createNewCharacter}
                              onChange={() => setCreateNewCharacter(true)}
                            />
                            Create new character
                          </label>
                        </div>
                      </div>
                    )}
                    
                    {matchingCharacters.length > 1 && (
                      <div className="bg-info rounded-lg p-4">
                        <h4 className="font-semibold mb-2">Multiple Characters Found</h4>
                        <p className="text-sm mb-3">Found {matchingCharacters.length} characters with the same first message.</p>
                        
                        {!createNewCharacter ? (
                          <div className="form-group">
                            <label className="form-label">Select Character</label>
                            <select
                              className="form-select"
                              value={selectedExistingCharacter}
                              onChange={e => setSelectedExistingCharacter(Number(e.target.value))}
                            >
                              <option value={0}>Choose a character...</option>
                              {matchingCharacters.map(c => (
                                <option key={c.id} value={c.id}>{c.profileName || c.name}</option>
                              ))}
                            </select>
                          </div>
                        ) : null}
                        
                        <div className="flex gap-2 mt-3">
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="characterChoice"
                              checked={!createNewCharacter}
                              onChange={() => setCreateNewCharacter(false)}
                            />
                            Use existing character
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="characterChoice"
                              checked={createNewCharacter}
                              onChange={() => setCreateNewCharacter(true)}
                            />
                            Create new character
                          </label>
                        </div>
                      </div>
                    )}
                    
                    {createNewCharacter && (
                      <div className="space-y-3">
                        <div className="form-group">
                          <label className="form-label">Character Name *</label>
                          <input
                            type="text"
                            className="form-input"
                            value={newCharacterName}
                            onChange={e => setNewCharacterName(e.target.value)}
                            placeholder="Enter character name"
                          />
                        </div>
                        
                        <div className="form-group">
                          <label className="form-label">Profile Name (Optional)</label>
                          <input
                            type="text"
                            className="form-input"
                            value={newCharacterProfileName}
                            onChange={e => setNewCharacterProfileName(e.target.value)}
                            placeholder="Enter profile name (optional)"
                          />
                          <p className="text-xs text-muted mt-1">
                            Profile name helps distinguish characters with the same name
                          </p>
                        </div>
                      </div>
                    )}
                    
                    {importError && (
                      <div className="bg-error rounded-lg p-3">
                        <p className="text-sm text-white">{importError}</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            
            <div className="modal-footer">
              {showCharacterSelection ? (
                <div className="flex gap-3">
                  <button 
                    className="btn btn-secondary" 
                    onClick={resetImport}
                    disabled={isImporting}
                  >
                    Cancel
                  </button>
                  <button 
                    className="btn btn-primary" 
                    onClick={handleImportComplete}
                    disabled={isImporting}
                  >
                    {isImporting ? 'Importing...' : 'Import Chat'}
                  </button>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button className="btn btn-secondary" onClick={resetImport}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Description Modal */}
      {showDescriptionModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeDescriptionModal()}>
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="text-2xl font-semibold text-primary mb-0">
                {descriptionText.trim() ? 'Edit Description' : 'Add Description'}
              </h2>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Chat Description</label>
                <textarea
                  className="form-input"
                  rows={4}
                  value={descriptionText}
                  onChange={e => setDescriptionText(e.target.value)}
                  placeholder="Enter a description for this chat conversation..."
                  maxLength={500}
                />
                <p className="text-xs text-muted mt-1">
                  {descriptionText.length}/500 characters
                </p>
              </div>
              
              <div className="bg-info rounded-lg p-3 text-sm">
                <p className="mb-2">
                  💡 <strong>Tip:</strong> Descriptions help you quickly identify and organize your conversations.
                </p>
                <p className="mb-0">
                  They will be displayed instead of the auto-generated summary in the chat list.
                </p>
              </div>
            </div>
            
            <div className="modal-footer">
              <div className="flex gap-3">
                <button 
                  className="btn btn-secondary" 
                  onClick={closeDescriptionModal}
                  disabled={savingDescription}
                >
                  Cancel
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={saveDescription}
                  disabled={savingDescription}
                >
                  {savingDescription ? 'Saving...' : 'Save Description'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
