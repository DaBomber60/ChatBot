import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import Head from 'next/head';

// message shape for UI only
type ChatMessage = { role: 'user' | 'assistant'; content: string; messageId?: number; };
type Message = { id: number; role: string; content: string; versions?: MessageVersion[] };
type MessageVersion = { id: number; content: string; version: number; isActive: boolean };
type SessionData = {
  id: number;
  personaId: number;
  characterId: number;
  summary?: string;
  lastSummary?: number;
  persona: { id: number; name: string; profileName?: string };
  character: { id: number; name: string; profileName?: string };
  messages: Message[];
};

const fetcher = (url: string) => fetch(url).then(res => res.json());

// Utility to format message content with newlines, italics, bold, and monospace code
function formatMessage(content: string) {
  // Handle empty content
  if (!content) return '';
  
  // Replace horizontal dividers first (before other formatting)
  // Handle --- and ___ as horizontal dividers (either standalone or on their own line)
  const html = content
    // Replace standalone dividers on their own lines
    .replace(/^---+\s*$/gm, '<div class="message-divider"></div>')
    .replace(/^___+\s*$/gm, '<div class="message-divider"></div>')
    // Replace inline dividers surrounded by whitespace or line breaks
    .replace(/(\s|^)---+(\s|$)/g, '$1<div class="message-divider"></div>$2')
    .replace(/(\s|^)___+(\s|$)/g, '$1<div class="message-divider"></div>$2')
    // Now handle text formatting
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // Normalize multiple consecutive newlines to double breaks for proper spacing
    .replace(/\n\s*\n+/g, '\n\n') // Replace multiple newlines with double newline
    .replace(/\n\n/g, '</div><div class="line-break-spacer"></div><div>') // Double breaks get spacing
    .replace(/\n/g, '</div><div>'); // Single breaks become new divs
  
  // Wrap the entire content in a div structure for better iOS compatibility
  return `<div>${html}</div>`;
}

export default function ChatSessionPage() {
  const router = useRouter();
  const { id } = router.query;
  const { data: session, error, mutate } = useSWR<SessionData>(id ? `/api/sessions/${id}` : null, fetcher);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [justFinishedStreaming, setJustFinishedStreaming] = useState(false);
  const [skipNextMessageUpdate, setSkipNextMessageUpdate] = useState(false);
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState<string>('');
  const [messageVariants, setMessageVariants] = useState<Map<number, MessageVersion[]>>(new Map());
  const [currentVariantIndex, setCurrentVariantIndex] = useState<Map<number, number>>(new Map());
  const [generatingVariant, setGeneratingVariant] = useState<number | null>(null);
  const [variantDisplayContent, setVariantDisplayContent] = useState<Map<number, string>>(new Map());
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryContent, setSummaryContent] = useState('');
  const [savingSummary, setSavingSummary] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [updatingSummary, setUpdatingSummary] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [notesContent, setNotesContent] = useState('');
  const [originalNotesContent, setOriginalNotesContent] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteMessageIndex, setDeleteMessageIndex] = useState<number | null>(null);
  const [isWideScreen, setIsWideScreen] = useState(false);
  const [isBurgerMenuOpen, setIsBurgerMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(112); // Initial estimate: 80px header + 32px gap
  const streamingMessageRef = useRef<string>('');
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const lastScrollTime = useRef<number>(0);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const skipNextScroll = useRef<boolean>(false);
  const streamingAbortController = useRef<AbortController | null>(null);
  const variantAbortController = useRef<AbortController | null>(null);

  // Function to stop streaming (both chat and variant generation)
  const stopStreaming = useCallback(() => {
    if (streamingAbortController.current) {
      streamingAbortController.current.abort();
      streamingAbortController.current = null;
      setIsStreaming(false);
      setLoading(false);
    }
    
    if (variantAbortController.current) {
      // If we're generating a variant, immediately switch to the previous variant before aborting
      const currentlyGeneratingVariant = generatingVariant;
      if (currentlyGeneratingVariant) {
        // Get current variants for the message being generated
        const variants = messageVariants.get(currentlyGeneratingVariant) || [];
        const currentIndex = currentVariantIndex.get(currentlyGeneratingVariant) || 0;
        
        // Calculate where to switch to (previous variant or original)
        let targetIndex = 0; // Default to original message
        let displayContent = '';
        
        if (variants.length > 0) {
          // If we have variants, switch to the last real variant
          targetIndex = variants.length; // This is correct - it's the 1-based index
          const lastVariant = variants[variants.length - 1]; // Get last variant (0-based)
          if (lastVariant && lastVariant.content) {
            displayContent = lastVariant.content;
          } else {
            // If last variant has no content, try to find any variant with content
            for (let i = variants.length - 1; i >= 0; i--) {
              const variant = variants[i];
              if (variant && variant.content) {
                displayContent = variant.content;
                targetIndex = i + 1; // Convert to 1-based index
                break;
              }
            }
          }
        }
        
        // Only fallback to original message if we have no variants or no variant content
        if (!displayContent && variants.length === 0) {
          targetIndex = 0;
          const originalMessage = messages.find(m => m.messageId === currentlyGeneratingVariant);
          if (originalMessage && originalMessage.content) {
            displayContent = originalMessage.content;
          }
        }
        
        // Only proceed if we have valid content
        if (displayContent) {
          // Immediately switch display content and index
          setVariantDisplayContent(prev => {
            const newMap = new Map(prev);
            newMap.set(currentlyGeneratingVariant, displayContent);
            return newMap;
          });
          
          // Update variant index
          setCurrentVariantIndex(prev => {
            const newMap = new Map(prev);
            newMap.set(currentlyGeneratingVariant, targetIndex);
            return newMap;
          });
          
          // Save selection to localStorage
          saveVariantSelection(currentlyGeneratingVariant, targetIndex);
          
          // Force a refresh to ensure UI updates properly
          setTimeout(() => {
            // Force React to re-render by triggering a small state update
            setVariantDisplayContent(prev => {
              const newMap = new Map(prev);
              // Re-set the same content to trigger a re-render
              if (newMap.has(currentlyGeneratingVariant)) {
                const currentContent = newMap.get(currentlyGeneratingVariant)!;
                newMap.set(currentlyGeneratingVariant, currentContent);
              }
              return newMap;
            });
          }, 50);
        }
      }
      
      // Now abort the variant generation
      variantAbortController.current.abort();
      variantAbortController.current = null;
      setGeneratingVariant(null);
    }
  }, [generatingVariant, messageVariants, currentVariantIndex, messages]);

  // Commit the currently displayed variant for a message
  const commitDisplayedVariant = async (messageId: number) => {
    const variants = messageVariants.get(messageId) || [];
    const currentIndex = currentVariantIndex.get(messageId) || 0;
    
    // If we're showing the original (index 0), no need to commit
    if (currentIndex === 0) {
      return;
    }
    
    const selectedVariant = variants[currentIndex - 1];
    if (!selectedVariant) return;
    
    try {
      const response = await fetch(`/api/messages/${messageId}/variants`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantId: selectedVariant.id })
      });
      
      if (!response.ok) {
        throw new Error('Failed to commit variant');
      }
      
      // Update the message content in the UI
      setMessages(prev => prev.map(msg => {
        if (msg.messageId === messageId) {
          return { ...msg, content: selectedVariant.content };
        }
        return msg;
      }));
      
    } catch (error) {
      console.error('Failed to commit variant:', error);
    }
  };

  // Clean up variants when user responds to a message
  const cleanupVariants = async (messageId: number) => {
    try {
      await fetch(`/api/messages/${messageId}/variants`, {
        method: 'DELETE'
      });
      
      // Clear from state immediately to update UI
      setMessageVariants(prev => {
        const newMap = new Map(prev);
        newMap.delete(messageId);
        return newMap;
      });
      setCurrentVariantIndex(prev => {
        const newMap = new Map(prev);
        newMap.delete(messageId);
        return newMap;
      });
      setVariantDisplayContent(prev => {
        const newMap = new Map(prev);
        newMap.delete(messageId);
        return newMap;
      });
      
      // Clean up localStorage for this message's variant selection
      if (id) {
        const storageKey = getVariantStorageKey(id, messageId);
        localStorage.removeItem(storageKey);
      }
    } catch (error) {
      console.error('Failed to cleanup variants:', error);
    }
  };

  // Generate a new variant for a message
  const generateVariant = async (messageId: number) => {
    if (generatingVariant || loading || isStreaming) return;
    
    setGeneratingVariant(messageId);
    
    try {
      // Get current settings for streaming
      const settingsRes = await fetch('/api/settings');
      const settings = await settingsRes.json();
      const streamSetting = settings.stream === 'true';
      
      // Get current variants to calculate the new index
      const currentVariants = messageVariants.get(messageId) || [];
      const newVariantIndex = currentVariants.length + 1; // +1 for the new variant we're about to add
      
      // Create a placeholder variant immediately and switch to it
      const placeholderVariant = {
        id: -1, // Temporary ID
        content: '',
        version: newVariantIndex,
        isActive: false,
        messageId: messageId
      };
      
      // Batch all state updates together for immediate UI response
      // This ensures that no old content is shown when switching to the new variant
      flushSync(() => {
        setMessageVariants(prev => {
          const newMap = new Map(prev);
          const existing = newMap.get(messageId) || [];
          newMap.set(messageId, [...existing, placeholderVariant]);
          return newMap;
        });
        
        setCurrentVariantIndex(prev => {
          const newMap = new Map(prev);
          newMap.set(messageId, newVariantIndex);
          return newMap;
        });
        
        // Save the new variant selection to localStorage
        saveVariantSelection(messageId, newVariantIndex);
        
        setVariantDisplayContent(prev => {
          const newMap = new Map(prev);
          newMap.set(messageId, ''); // Immediately show blank content
          return newMap;
        });
      });
      
      // Scroll immediately after DOM update
      setTimeout(() => scrollToBottom(false), 5);
      
      // Now start generating the variant
      let abortController: AbortController | undefined;
      if (streamSetting) {
        abortController = new AbortController();
        variantAbortController.current = abortController;
      }
      
      const response = await fetch(`/api/messages/${messageId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream: streamSetting }),
        ...(streamSetting && abortController ? { signal: abortController.signal } : {})
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate variant');
      }
      
      if (streamSetting && response.body) {
        // Streaming response
        let streamingContent = '';
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let done = false;
        
        try {
          while (!done) {
            const { value, done: doneReading } = await reader.read();
            if (doneReading) {
              done = true;
              break;
            }
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split(/\r?\n/).filter(l => l.startsWith('data: '));
            
            for (const line of lines) {
              const payload = line.replace(/^data: /, '').trim();
              
              if (payload === '[DONE]') {
                done = true;
                break;
              }
              
              try {
                const parsed = JSON.parse(payload);
                const content = parsed.content || '';
                
                if (content) {
                  streamingContent += content;
                  // Update display content in real-time
                  setVariantDisplayContent(prev => {
                    const newMap = new Map(prev);
                    newMap.set(messageId, streamingContent);
                    return newMap;
                  });
                  // Trigger scroll during streaming
                  scrollToBottom(true);
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }
          
          // After streaming is complete, get the final variant data from the response
          // We need to make another request to get the actual variant record
          const finalResponse = await fetch(`/api/messages/${messageId}/variants/latest`);
          const newVariant = await finalResponse.json();
          
          // Update state with the real variant, but preserve the streamed content
          setMessageVariants(prev => {
            const newMap = new Map(prev);
            const existing = newMap.get(messageId) || [];
            // Replace the placeholder with the real variant
            const updated = [...existing];
            updated[updated.length - 1] = newVariant;
            newMap.set(messageId, updated);
            return newMap;
          });
          
          // Don't update variantDisplayContent here since it already has the streamed content
          // This prevents any UI jumps after streaming completes
          
        } catch (err: any) {
          if (err.name === 'AbortError') {
            // Variant generation was stopped by user - treat the partial content as completed
            console.log('Variant generation stopped by user, keeping partial content as completed variant');
            
            // Get the final variant data from the response (it should be saved by the API)
            try {
              const finalResponse = await fetch(`/api/messages/${messageId}/variants/latest`);
              if (finalResponse.ok) {
                const newVariant = await finalResponse.json();
                
                // Update state with the real variant data, keeping the current display content
                setMessageVariants(prev => {
                  const newMap = new Map(prev);
                  const existing = newMap.get(messageId) || [];
                  // Replace the placeholder with the real variant
                  const updated = [...existing];
                  updated[updated.length - 1] = newVariant;
                  newMap.set(messageId, updated);
                  return newMap;
                });
                
                // The current index and display content should already be correct
                // since we set them when we started generating and have been updating display content during streaming
                
              } else if (finalResponse.status === 404) {
                // No variant was saved (stopped variant - backend correctly didn't save it)
                console.log('No variant saved after abort - backend correctly prevented saving stopped variant');
                
                // Simple approach: just force a refresh of session data to get clean state
                console.log('Forcing session refresh to restore clean variant state');
                setTimeout(() => {
                  mutate();
                }, 100);
                
                return;
              } else {
                // Other HTTP error - just force session refresh to get clean state
                console.log('Latest variant request returned', finalResponse.status, '- forcing session refresh');
                setTimeout(() => {
                  mutate();
                }, 100);
                
                return;
              }
            } catch (fetchError) {
              console.error('Failed to fetch latest variant after abort:', fetchError);
              // Fallback: force session refresh to restore clean state
              console.log('Forcing session refresh due to fetch error after abort');
              setTimeout(() => {
                mutate();
              }, 100);
            }
            
            return;
          } else {
            // Other error - handle normally
            throw err;
          }
        } finally {
          variantAbortController.current = null;
        }
        
      } else {
        // Non-streaming response
        const newVariant = await response.json();
        
        // Update state with new variant
        setMessageVariants(prev => {
          const newMap = new Map(prev);
          const existing = newMap.get(messageId) || [];
          // Replace the placeholder with the real variant
          const updated = [...existing];
          updated[updated.length - 1] = newVariant;
          newMap.set(messageId, updated);
          return newMap;
        });
        
        // Update display content
        setVariantDisplayContent(prev => {
          const newMap = new Map(prev);
          newMap.set(messageId, newVariant.content);
          return newMap;
        });
      }
      
    } catch (error) {
      console.error('Failed to generate variant:', error);
      alert('Failed to generate new variant. Please try again.');
      
      // Remove the placeholder variant on error and reset index atomically
      setMessageVariants(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(messageId) || [];
        const updatedVariants = existing.slice(0, -1); // Remove last item
        newMap.set(messageId, updatedVariants);
        
        // Update the current variant index to match the new variant count
        setCurrentVariantIndex(prevIndex => {
          const indexMap = new Map(prevIndex);
          indexMap.set(messageId, Math.max(0, updatedVariants.length));
          return indexMap;
        });
        
        return newMap;
      });
      
    } finally {
      // Don't clear generating state yet - this prevents variant counter from showing wrong values
      variantAbortController.current = null;
      
      // Simple approach: just refresh the data without complex preservation
      // The variant counter will remain hidden during this process
      setTimeout(async () => {
        skipNextScroll.current = true;
        await mutate(); // Direct mutate instead of complex preservation logic
        
        // Clear generating state after refresh completes to show the counter again
        setTimeout(() => {
          setGeneratingVariant(null);
        }, 100); // Longer delay to ensure all state is updated
      }, 100);
    }
  };

  // Get localStorage key for variant selection
  const getVariantStorageKey = (sessionId: string | string[] | number, messageId: number) => {
    const sessionIdStr = Array.isArray(sessionId) ? sessionId[0] : sessionId;
    return `variant-selection-${sessionIdStr}-${messageId}`;
  };

  // Save variant selection to localStorage
  const saveVariantSelection = (messageId: number, variantIndex: number) => {
    if (!id) return;
    const key = getVariantStorageKey(id, messageId);
    localStorage.setItem(key, variantIndex.toString());
  };

  // Load variant selection from localStorage
  const loadVariantSelection = (messageId: number): number | null => {
    if (!id) return null;
    const key = getVariantStorageKey(id, messageId);
    const stored = localStorage.getItem(key);
    return stored ? parseInt(stored, 10) : null;
  };

  // Navigate between variants
  const navigateVariant = (messageId: number, direction: 'prev' | 'next') => {
    const variants = messageVariants.get(messageId) || [];
    const totalOptions = variants.length + 1; // +1 for original message
    
    // Guard against empty state
    if (totalOptions <= 1) return;
    
    const currentIndex = currentVariantIndex.get(messageId) || 0;
    let newIndex = currentIndex;
    
    if (direction === 'prev') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : totalOptions - 1;
    } else {
      newIndex = currentIndex < totalOptions - 1 ? currentIndex + 1 : 0;
    }
    
    // Ensure the new index is valid
    newIndex = Math.max(0, Math.min(newIndex, totalOptions - 1));
    
    setCurrentVariantIndex(prev => {
      const newMap = new Map(prev);
      newMap.set(messageId, newIndex);
      return newMap;
    });
    
    // Save selection to localStorage
    saveVariantSelection(messageId, newIndex);
    
    // Update display content
    if (newIndex === 0) {
      // Show original message content
      const originalMessage = messages.find(m => m.messageId === messageId);
      if (originalMessage) {
        setVariantDisplayContent(prev => {
          const newMap = new Map(prev);
          newMap.set(messageId, originalMessage.content);
          return newMap;
        });
      }
    } else {
      // Show variant content
      const selectedVariant = variants[newIndex - 1];
      if (selectedVariant) {
        setVariantDisplayContent(prev => {
          const newMap = new Map(prev);
          newMap.set(messageId, selectedVariant.content);
          return newMap;
        });
      }
    }
    
    // Scroll to show the updated content after a brief delay (but not during edit mode)
    setTimeout(() => {
      if (editingMessageIndex === null) {
        scrollToBottom(false);
      }
    }, 50);
  };

  // Load variants for assistant messages
  const loadVariants = async (messageId: number) => {
    try {
      const response = await fetch(`/api/messages/${messageId}/variants`);
      if (response.ok) {
        const variants = await response.json();
        if (variants.length > 0) {
          setMessageVariants(prev => {
            const newMap = new Map(prev);
            newMap.set(messageId, variants);
            return newMap;
          });
          
          // Check for saved variant selection first, then fall back to active variant
          const savedIndex = loadVariantSelection(messageId);
          let selectedIndex = 0;
          
          if (savedIndex !== null && savedIndex >= 0 && savedIndex <= variants.length) {
            // Use saved selection if valid
            selectedIndex = savedIndex;
          } else {
            // Fall back to active variant or first one
            const activeVariant = variants.find((v: MessageVersion) => v.isActive);
            selectedIndex = activeVariant ? variants.indexOf(activeVariant) + 1 : 1; // +1 because 0 is original
          }
          
          setCurrentVariantIndex(prev => {
            const newMap = new Map(prev);
            newMap.set(messageId, selectedIndex);
            return newMap;
          });
          
          // Set display content based on selected index
          if (selectedIndex === 0) {
            // Show original message content
            const originalMessage = messages.find(m => m.messageId === messageId);
            if (originalMessage) {
              setVariantDisplayContent(prev => {
                const newMap = new Map(prev);
                newMap.set(messageId, originalMessage.content);
                return newMap;
              });
            }
          } else {
            // Show selected variant content
            const displayVariant = variants[selectedIndex - 1];
            if (displayVariant) {
              setVariantDisplayContent(prev => {
                const newMap = new Map(prev);
                newMap.set(messageId, displayVariant.content);
                return newMap;
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load variants:', error);
    }
  };

  const lastProcessedMessagesRef = useRef<ChatMessage[]>([]);
  const variantLoadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Load persisted messages (but not during streaming or right after streaming)
  useEffect(() => {
    if (!session || isStreaming || justFinishedStreaming || generatingVariant !== null) return;
    
    // Skip this update if we're explicitly told to (e.g., right after streaming)
    if (skipNextMessageUpdate) {
      setSkipNextMessageUpdate(false);
      return;
    }
    
    const allMessages = session.messages.map(m => ({ 
      role: m.role as 'user' | 'assistant', 
      content: m.content, 
      messageId: m.id 
    }));
    
    // Filter out continue system messages and combine responses visually
    const processedMessages: ChatMessage[] = [];
    const CONTINUE_MESSAGE = '[SYSTEM NOTE: Ignore this message, and continue on from the previous response]';
    
    for (let i = 0; i < allMessages.length; i++) {
      const msg = allMessages[i];
      if (!msg) continue;
      
      // If this is a continue system message, skip it
      if (msg.role === 'user' && msg.content === CONTINUE_MESSAGE) {
        continue;
      }
      
      // If this is an assistant message that follows a continue system message
      if (msg.role === 'assistant' && i > 0) {
        const prevMsg = allMessages[i - 1];
        if (prevMsg && prevMsg.role === 'user' && prevMsg.content === CONTINUE_MESSAGE) {
          // Find the previous assistant message and combine them visually
          const lastAssistantIndex = processedMessages.findLastIndex(m => m.role === 'assistant');
          if (lastAssistantIndex !== -1) {
            const prevAssistant = processedMessages[lastAssistantIndex];
            if (prevAssistant) {
              processedMessages[lastAssistantIndex] = {
                role: 'assistant',
                content: prevAssistant.content + '\n\n' + msg.content,
                messageId: prevAssistant.messageId
              };
              continue;
            }
          }
        }
      }
      
      // Add normal messages
      processedMessages.push(msg as ChatMessage);
    }
    
    // Compare with last processed messages to avoid unnecessary updates
    const lastProcessed = lastProcessedMessagesRef.current;
    const hasChanges = processedMessages.length !== lastProcessed.length ||
      processedMessages.some((msg, index) => {
        const lastMsg = lastProcessed[index];
        return !lastMsg || 
               lastMsg.role !== msg.role || 
               lastMsg.content !== msg.content || 
               lastMsg.messageId !== msg.messageId;
      });
    
    if (hasChanges) {
      lastProcessedMessagesRef.current = processedMessages;
      setMessages(processedMessages);
    }
    
    // Debounce variant loading to prevent rapid successive calls
    if (variantLoadingTimeoutRef.current) {
      clearTimeout(variantLoadingTimeoutRef.current);
    }
    
    variantLoadingTimeoutRef.current = setTimeout(() => {
      // Only load variants if we don't already have variants for the last assistant message
      // This prevents reloading variants after streaming completes
      const lastAssistantMessage = processedMessages.filter(m => m.role === 'assistant').pop();
      if (lastAssistantMessage?.messageId && !messageVariants.has(lastAssistantMessage.messageId)) {
        loadVariants(lastAssistantMessage.messageId);
      }
    }, 100); // Small delay to prevent rapid successive calls
    
  }, [session, isStreaming, justFinishedStreaming, generatingVariant, skipNextMessageUpdate]);
  // Load devMode from database
  useEffect(() => {
    const loadDevMode = async () => {
      try {
        const settingsRes = await fetch('/api/settings');
        const settings = await settingsRes.json();
        const dm = settings.devMode === 'true';
        setDevMode(dm);
      } catch (error) {
        console.error('Failed to load devMode from settings:', error);
        setDevMode(false);
      }
    };
    loadDevMode();
  }, []);

  // Load devMode setting
  useEffect(() => {
    const stored = localStorage.getItem('devMode');
    if (stored === 'true') {
      setDevMode(true);
    }
  }, []);

  // Initialize summary content when session data loads
  useEffect(() => {
    if (session?.summary) {
      setSummaryContent(session.summary);
    }
  }, [session?.summary]);

  // Load session data when id changes
  useEffect(() => {
    // Skip this update if we're streaming, just finished streaming, or generating variants
    if (isStreaming || justFinishedStreaming || generatingVariant !== null) {
      console.log('Skipping session update due to streaming state');
      return;
    }
    
    // Skip this update if we're explicitly told to (e.g., right after streaming)
    if (skipNextMessageUpdate) {
      console.log('Skipping session update due to skipNextMessageUpdate flag');
      setSkipNextMessageUpdate(false);
      return;
    }
    
    console.log('Session useEffect triggered, editingMessageIndex:', editingMessageIndex);
    if (session?.messages) {
      // Only update messages if we're not currently editing a message
      // This prevents overriding local edits when session refreshes
      if (editingMessageIndex === null) {
        console.log('Updating messages from session data');
        setMessages(session.messages.map(m => ({ 
          role: m.role as 'user' | 'assistant', 
          content: m.content,
          messageId: m.id
        })));
      } else {
        console.log('Skipping message update due to active editing');
      }
      
      // Load variants for each message from server data - but only if not in streaming state
      if (!isStreaming && !justFinishedStreaming && generatingVariant === null) {
        session.messages.forEach(msg => {
          if (msg.versions && msg.versions.length > 0) {
            const variants = msg.versions.filter(v => !v.isActive);
            if (variants.length > 0) {
              console.log('Loading variants for message', msg.id, 'variants:', variants.length);
              
              setMessageVariants(prev => {
                const newMap = new Map(prev);
                newMap.set(msg.id, variants);
                return newMap;
              });
              
              // Initialize current variant index - check localStorage first
              setCurrentVariantIndex(prev => {
                const newMap = new Map(prev);
                const currentIndex = newMap.get(msg.id);
                
                if (currentIndex === undefined) {
                  // First time loading - try to restore from localStorage
                  const savedIndex = loadVariantSelection(msg.id);
                  if (savedIndex !== null && savedIndex >= 0 && savedIndex <= variants.length) {
                    newMap.set(msg.id, savedIndex);
                  } else {
                    newMap.set(msg.id, 0); // Start with original message if no valid saved selection
                  }
                } else {
                  // We already have an index - check if we need to adjust for new variants
                  const wasOnLastVariant = currentIndex === (messageVariants.get(msg.id)?.length || 0);
                  if (wasOnLastVariant && variants.length > (messageVariants.get(msg.id)?.length || 0)) {
                    // We were on the last variant and new variants were added - move to the new last variant
                    const newLastIndex = variants.length;
                    newMap.set(msg.id, newLastIndex);
                    // Also save to localStorage
                    saveVariantSelection(msg.id, newLastIndex);
                  }
                }
                return newMap;
              });
              
              // Initialize variant display content based on the current index
              setVariantDisplayContent(prev => {
                const newMap = new Map(prev);
                if (!newMap.has(msg.id)) {
                  const currentIndex = loadVariantSelection(msg.id);
                  if (currentIndex !== null && currentIndex > 0 && currentIndex <= variants.length) {
                    // Show the selected variant
                    const selectedVariant = variants[currentIndex - 1];
                    if (selectedVariant) {
                      newMap.set(msg.id, selectedVariant.content);
                    } else {
                      newMap.set(msg.id, msg.content); // Fallback to original
                    }
                  } else {
                    // Show original message content
                    newMap.set(msg.id, msg.content);
                  }
                }
                return newMap;
              });
            }
          }
        });
      }
    }
    
    if (session?.summary) {
      setSummaryContent(session.summary);
    }
    
    // Load notes when session loads
    if (session?.id) {
      loadNotes();
    }
  }, [session, editingMessageIndex, isStreaming, justFinishedStreaming, generatingVariant, skipNextMessageUpdate]);

  // Add body class for chat page styling
  useEffect(() => {
    document.body.classList.add('chat-page-active');
    return () => {
      document.body.classList.remove('chat-page-active');
    };
  }, []);

  // Detect screen width for responsive modal behavior
  useEffect(() => {
    const checkScreenWidth = () => {
      setIsWideScreen(window.innerWidth >= 1500);
    };
    
    // Check initially
    checkScreenWidth();
    
    // Add event listener for window resize
    window.addEventListener('resize', checkScreenWidth);
    
    // Cleanup
    return () => window.removeEventListener('resize', checkScreenWidth);
  }, []);

  // Track header height for dynamic chat container positioning
  useLayoutEffect(() => {
    const updateHeaderHeight = () => {
      if (headerRef.current) {
        // Force a reflow to ensure we get accurate measurements
        void headerRef.current.offsetHeight;
        
        const height = headerRef.current.offsetHeight;
        // Add the mb-8 gap (32px) that provides natural spacing between header and chat container
        // Use consistent height calculation that matches the post-interaction position
        const adjustedHeight = height + 32;
        setHeaderHeight(adjustedHeight);
        // Set CSS custom property for use in sidecar modal
        document.documentElement.style.setProperty('--dynamic-header-height', `${adjustedHeight}px`);
      }
    };

    // Update immediately on mount
    updateHeaderHeight();
    
    // Use requestAnimationFrame to ensure DOM is fully rendered
    const rafId = requestAnimationFrame(() => {
      updateHeaderHeight();
      // Additional update after a brief delay to catch any delayed renders
      setTimeout(updateHeaderHeight, 50);
    });
    
    // Update on window resize
    window.addEventListener('resize', updateHeaderHeight);
    
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateHeaderHeight);
      // Clean up CSS custom property
      document.documentElement.style.removeProperty('--dynamic-header-height');
    };
  }, [isBurgerMenuOpen]);

  // Additional effect to recalculate height after session data loads
  useLayoutEffect(() => {
    const updateHeaderHeight = () => {
      if (headerRef.current) {
        // Force a reflow to ensure we get accurate measurements
        void headerRef.current.offsetHeight;
        
        const height = headerRef.current.offsetHeight;
        const adjustedHeight = height + 32;
        setHeaderHeight(adjustedHeight);
        document.documentElement.style.setProperty('--dynamic-header-height', `${adjustedHeight}px`);
      }
    };

    // Update after session loads to ensure proper calculation with all content rendered
    if (session) {
      updateHeaderHeight();
      
      // Additional updates to catch any delayed content rendering
      const timeouts = [
        setTimeout(updateHeaderHeight, 0),
        setTimeout(updateHeaderHeight, 100),
        setTimeout(updateHeaderHeight, 200)
      ];
      
      return () => {
        timeouts.forEach(clearTimeout);
      };
    }
  }, [session]);

  // Close burger menu on outside click and handle escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isBurgerMenuOpen && headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setIsBurgerMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isBurgerMenuOpen) {
          setIsBurgerMenuOpen(false);
          return;
        }
        // Only close modals when they're in overlay mode (narrow screens)
        // Don't close sidecar modals (wide screens) as they're less intrusive
        if (showNotesModal && !isWideScreen) {
          setShowNotesModal(false);
        } else if (showSummaryModal) {
          // Summary modal is always overlay, so always close on Escape
          setShowSummaryModal(false);
        }
      }
    };

    if (isBurgerMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    // Add event listener when any modal is open or burger menu is open
    if (isBurgerMenuOpen || showNotesModal || showSummaryModal || showDeleteModal) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isBurgerMenuOpen, showNotesModal, showSummaryModal, showDeleteModal, isWideScreen]);

  // Handle Escape key to close modals (only overlay modals, not sidecar)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Only close modals when they're in overlay mode (narrow screens)
        // Don't close sidecar modals (wide screens) as they're less intrusive
        if (showNotesModal && !isWideScreen) {
          setShowNotesModal(false);
        } else if (showSummaryModal) {
          // Summary modal is always overlay, so always close on Escape
          setShowSummaryModal(false);
        } else if (showDeleteModal) {
          // Delete modal is always overlay, so always close on Escape
          setShowDeleteModal(false);
          setDeleteMessageIndex(null);
        }
      }
    };

    // Add event listener when any modal is open
    if (showNotesModal || showSummaryModal || showDeleteModal) {
      document.addEventListener('keydown', handleKeyDown);
    }

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showNotesModal, showSummaryModal, showDeleteModal, isWideScreen]);

  // Auto-resize textarea function
  const autoResizeTextarea = useCallback(() => {
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current;
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    // Set height to scrollHeight, constrained by CSS min/max-height
    textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`;
  }, []);

  // Summary functions
  const saveSummary = async () => {
    if (!id) return;
    
    setSavingSummary(true);
    try {
      const response = await fetch(`/api/sessions/${id}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: summaryContent })
      });
      
      if (!response.ok) {
        throw new Error('Failed to save summary');
      }
      
      // Update session data while preserving variants
      await mutateWithVariantPreservation();
      setShowSummaryModal(false);
    } catch (error) {
      console.error('Failed to save summary:', error);
      alert('Failed to save summary. Please try again.');
    } finally {
      setSavingSummary(false);
    }
  };

  const generateSummary = async () => {
    if (!id) return;
    
    setGeneratingSummary(true);
    try {
      const response = await fetch(`/api/sessions/${id}/generate-summary`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate summary');
      }
      
      const data = await response.json();
      setSummaryContent(data.summary);
      
      // Update session data while preserving variants
      await mutateWithVariantPreservation();
    } catch (error) {
      console.error('Failed to generate summary:', error);
      alert('Failed to generate summary. Please try again.');
    } finally {
      setGeneratingSummary(false);
    }
  };

  const updateSummary = async () => {
    if (!id) return;
    
    setUpdatingSummary(true);
    try {
      const response = await fetch(`/api/sessions/${id}/update-summary`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update summary');
      }
      
      const data = await response.json();
      setSummaryContent(data.summary);
      
      // Update session data while preserving variants
      await mutateWithVariantPreservation();
    } catch (error) {
      console.error('Failed to update summary:', error);
      alert(`Failed to update summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setUpdatingSummary(false);
    }
  };

  // Check if update summary should be enabled
  const canUpdateSummary = () => {
    if (!session || !session.summary) return false;
    
    const lastSummaryId = session.lastSummary;
    
    if (!lastSummaryId) return false;
    
    // Check if there are new messages after lastSummary
    const hasNewMessages = session.messages.some(msg => msg.id > lastSummaryId);
    return hasNewMessages;
  };

  // Commit any displayed variants before sending
  const commitVariantsBeforeSend = async () => {
    if (!session) return;
    const assistantMessages = session.messages.filter(m => m.role === 'assistant');
    for (const msg of assistantMessages) {
      if (messageVariants.has(msg.id)) {
        await commitDisplayedVariant(msg.id);
      }
    }
  };

  // Clean up variants for all assistant messages after committing
  const cleanupVariantsAfterCommit = async () => {
    if (!session) return;
    const assistantMessages = session.messages.filter(m => m.role === 'assistant');
    for (const msg of assistantMessages) {
      if (messageVariants.has(msg.id)) {
        await cleanupVariants(msg.id);
      }
    }
  };

  // Load devMode setting
  useEffect(() => {
    const loadDevMode = async () => {
      try {
        const settingsRes = await fetch('/api/settings');
        const settings = await settingsRes.json();
        const dm = settings.devMode === 'true';
        setDevMode(dm);
      } catch (error) {
        console.error('Failed to load devMode from settings:', error);
        setDevMode(false);
      }
    };
    loadDevMode();
  }, []);

  // Initialize summary content
  useEffect(() => {
    if (session?.summary) {
      setSummaryContent(session.summary);
    }
  }, [session?.summary]);

  // Auto-resize edit textarea function
  const autoResizeEditTextarea = useCallback(() => {
    if (!editTextareaRef.current) return;
    
    const textarea = editTextareaRef.current;
    const container = containerRef.current;
    
    // Save current scroll position to prevent jumping
    const currentScrollTop = container ? container.scrollTop : 0;
    
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    // Set height to scrollHeight with some reasonable constraints
    const newHeight = Math.max(60, Math.min(textarea.scrollHeight, 400)); // Min 60px, max 400px
    textarea.style.height = `${newHeight}px`;
    
    // Restore scroll position to prevent the textarea from jumping around
    if (container) {
      container.scrollTop = currentScrollTop;
    }
  }, []);

  // Start editing a message
  const startEditingMessage = (index: number) => {
    if (loading || isStreaming || !messages[index]) return; // Don't allow editing during loading
    
    const message = messages[index];
    const messageId = message.messageId;
    
    // For assistant messages with variants, edit the currently displayed content
    let contentToEdit = message.content;
    if (messageId && variantDisplayContent.has(messageId)) {
      contentToEdit = variantDisplayContent.get(messageId)!;
    }
    
    // Preserve current scroll position
    const container = containerRef.current;
    const currentScrollTop = container ? container.scrollTop : 0;
    
    // Pre-calculate the height needed for the content to prevent visual jump
    const calculateTextareaHeight = (text: string) => {
      // Create a temporary textarea to measure the required height
      const tempTextarea = document.createElement('textarea');
      tempTextarea.style.position = 'absolute';
      tempTextarea.style.visibility = 'hidden';
      tempTextarea.style.width = '100%';
      tempTextarea.style.padding = '12px'; // Same as CSS --space-3
      tempTextarea.style.fontSize = '16px'; // Same as CSS --font-size-base
      tempTextarea.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
      tempTextarea.style.lineHeight = '1.5';
      tempTextarea.style.border = '1px solid transparent';
      tempTextarea.style.boxSizing = 'border-box';
      tempTextarea.style.resize = 'none';
      tempTextarea.value = text;
      
      document.body.appendChild(tempTextarea);
      const height = Math.max(60, Math.min(tempTextarea.scrollHeight, 400));
      document.body.removeChild(tempTextarea);
      
      return height;
    };
    
    const preCalculatedHeight = calculateTextareaHeight(contentToEdit);
    
    setEditingMessageIndex(index);
    setEditingContent(contentToEdit);
    
    // Set the height immediately when the textarea becomes available
    setTimeout(() => {
      if (editTextareaRef.current) {
        // Set the calculated height before it becomes visible to prevent jump
        editTextareaRef.current.style.height = `${preCalculatedHeight}px`;
        
        // Restore scroll position before focusing to prevent auto-scroll
        if (container) {
          container.scrollTop = currentScrollTop;
        }
        
        editTextareaRef.current.focus();
        
        // Restore scroll position again after focus
        setTimeout(() => {
          if (container) {
            container.scrollTop = currentScrollTop;
          }
        }, 10);
      }
    }, 10); // Much shorter delay since we pre-calculated the height
  };

  // Save edited message
  const saveEditedMessage = async () => {
    if (editingMessageIndex === null || !session) return;
    
    const messageToEdit = messages[editingMessageIndex];
    if (!messageToEdit) return;
    
    const trimmedContent = editingContent.trim();
    if (!trimmedContent) {
      // Don't allow empty messages
      return;
    }

    const messageId = messageToEdit.messageId;
    const isAssistantMessage = messageToEdit.role === 'assistant';
    
    // Preserve scroll position before editing
    const container = containerRef.current;
    const savedScrollTop = container ? container.scrollTop : 0;
    
    // Skip all scrolling during and after editing
    skipNextScroll.current = true;
    
    // Also prevent scrolling after state updates
    const preventScrollForDuration = () => {
      skipNextScroll.current = true;
      setTimeout(() => {
        skipNextScroll.current = true;
      }, 100);
      setTimeout(() => {
        skipNextScroll.current = true;
      }, 200);
      setTimeout(() => {
        skipNextScroll.current = true;
      }, 500);
    };
    
    preventScrollForDuration();
    
    // Check if we're editing a variant vs the original message
    const currentIndex = messageId ? currentVariantIndex.get(messageId) : undefined;
    const isEditingVariant = isAssistantMessage && messageId && currentIndex !== undefined && currentIndex > 0;
    
    if (isEditingVariant) {
      // We're editing a variant - update the specific variant
      const variants = messageVariants.get(messageId!) || [];
      const variantToEdit = variants[currentIndex - 1]; // -1 because index 0 is original message
      
      if (variantToEdit) {
        try {
          // Update the variant in the database
          const response = await fetch(`/api/messages/${messageId}/variants`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              variantId: variantToEdit.id,
              content: trimmedContent 
            })
          });
          
          if (!response.ok) {
            throw new Error('Failed to save variant');
          }
          
          // Update the variant in local state
          setMessageVariants(prev => {
            const newMap = new Map(prev);
            const existingVariants = newMap.get(messageId!) || [];
            const updatedVariants = [...existingVariants];
            updatedVariants[currentIndex - 1] = { ...variantToEdit, content: trimmedContent };
            newMap.set(messageId!, updatedVariants);
            return newMap;
          });
          
          // Update the variant display content
          setVariantDisplayContent(prev => {
            const newMap = new Map(prev);
            newMap.set(messageId!, trimmedContent);
            return newMap;
          });
          
          // Refresh variants from server to ensure consistency
          // This ensures that when we navigate between variants, we have the latest content
          setTimeout(async () => {
            try {
              const variantsResponse = await fetch(`/api/messages/${messageId}/variants`);
              if (variantsResponse.ok) {
                const refreshedVariants = await variantsResponse.json();
                setMessageVariants(prev => {
                  const newMap = new Map(prev);
                  newMap.set(messageId!, refreshedVariants);
                  return newMap;
                });
              }
            } catch (refreshError) {
              console.error('Failed to refresh variants after edit:', refreshError);
            }
          }, 100);
          
          console.log('Variant edit saved successfully');
          
        } catch (error) {
          console.error('Failed to save edited variant:', error);
          alert('Failed to save variant changes. Please try again.');
          return;
        }
      }
    } else {
      // We're editing the original message - use existing logic
      
      // Update local state immediately
      const updatedMessages = [...messages];
      updatedMessages[editingMessageIndex] = { ...messageToEdit, content: trimmedContent };
      setMessages(updatedMessages);
      
      // For assistant messages with variants, update the variant display content if we're showing original
      if (isAssistantMessage && messageId && variantDisplayContent.has(messageId) && currentIndex === 0) {
        setVariantDisplayContent(prev => {
          const newMap = new Map(prev);
          newMap.set(messageId, trimmedContent);
          return newMap;
        });
      }
      
      // Update in database
      try {
        if (messageId) {
          // Use the dedicated message edit API for individual message updates
          const response = await fetch(`/api/messages/${messageId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: trimmedContent })
          });
          
          if (!response.ok) {
            throw new Error('Failed to save message');
          }
          
          console.log('Message edit saved successfully, preserving local state and variants');
          
          // Refresh session data to ensure UI is in sync with server, while preserving variants
          await mutateWithVariantPreservation();
        } else {
          // Fallback to updating the entire session if messageId is not available
          const response = await fetch(`/api/sessions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: updatedMessages })
          });
          
          if (!response.ok) {
            throw new Error('Failed to save message');
          }
          
          console.log('Message edit saved via session update, preserving local state');
          
          // Refresh session data to ensure UI is in sync with server, while preserving variants  
          await mutateWithVariantPreservation();
        }
      } catch (error) {
        console.error('Failed to save edited message:', error);
        // Skip scrolling when reverting changes
        skipNextScroll.current = true;
        // Revert the local changes if API call failed
        const revertedMessages = [...messages];
        revertedMessages[editingMessageIndex] = messageToEdit; // Revert to original
        setMessages(revertedMessages);
        
        // Revert variant display content if it was updated
        if (isAssistantMessage && messageId && variantDisplayContent.has(messageId)) {
          setVariantDisplayContent(prev => {
            const newMap = new Map(prev);
            // Restore the previous content (we need to get it from the original message or variant)
            const originalContent = messageToEdit.content;
            newMap.set(messageId, originalContent);
            return newMap;
          });
        }
        
        // Show error to user (you could use a toast notification here)
        alert('Failed to save changes. Please try again.');
        return;
      }
    }
    
    // Prevent scrolling after editing completes
    preventScrollForDuration();
    
    setEditingMessageIndex(null);
    setEditingContent('');
    
    // Restore scroll position after editing completes
    setTimeout(() => {
      if (containerRef.current && savedScrollTop !== undefined) {
        containerRef.current.scrollTop = savedScrollTop;
      }
    }, 50);
  };

  // Cancel editing
  const cancelEditingMessage = () => {
    // Preserve scroll position when canceling edit
    const container = containerRef.current;
    const savedScrollTop = container ? container.scrollTop : 0;
    
    setEditingMessageIndex(null);
    setEditingContent('');
    
    // Restore scroll position after canceling
    setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop = savedScrollTop;
      }
    }, 10);
  };

  // Handle summary save
  const handleSaveSummary = async () => {
    if (!session || savingSummary) return;
    
    setSavingSummary(true);
    try {
      const response = await fetch(`/api/sessions/${session.id}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: summaryContent })
      });
      
      if (!response.ok) {
        throw new Error('Failed to save summary');
      }
      
      // Refresh session data to get updated summary while preserving variants
      await mutateWithVariantPreservation();
      setShowSummaryModal(false);
    } catch (error) {
      console.error('Failed to save summary:', error);
      alert('Failed to save summary. Please try again.');
    } finally {
      setSavingSummary(false);
    }
  };

  // Handle summary generation
  const handleGenerateSummary = async () => {
    if (!session || generatingSummary) return;
    
    setGeneratingSummary(true);
    try {
      const response = await fetch(`/api/sessions/${session.id}/generate-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate summary');
      }
      
      const data = await response.json();
      
      // Update the summary content in the UI
      setSummaryContent(data.summary);
      
      // Refresh session data to get updated summary while preserving variants
      await mutateWithVariantPreservation();
      
    } catch (error) {
      console.error('Failed to generate summary:', error);
      alert('Failed to generate summary. Please try again.');
    } finally {
      setGeneratingSummary(false);
    }
  };

  // Redo the most recent assistant message
  const redoLastAssistantMessage = async () => {
    if (loading || isStreaming || !session) return;
    
    // Find the last assistant message
    const lastAssistantIndex = messages.findLastIndex(m => m.role === 'assistant');
    if (lastAssistantIndex === -1) return;
    
    // Find the user message that prompted this assistant response
    const userMessageIndex = lastAssistantIndex - 1;
    if (userMessageIndex < 0) return;
    
    const userMessageObj = messages[userMessageIndex];
    if (!userMessageObj || userMessageObj.role !== 'user') return;
    
    const userMessage = userMessageObj.content;
    
    // Remove the last assistant message
    const messagesWithoutLastResponse = messages.slice(0, lastAssistantIndex);
    setMessages(messagesWithoutLastResponse);
    
    // Update database with the truncated messages
    try {
      const updateResponse = await fetch(`/api/sessions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messagesWithoutLastResponse })
      });
      
      if (!updateResponse.ok) {
        throw new Error('Failed to update messages');
      }
    } catch (error) {
      console.error('Failed to update messages:', error);
      setMessages(messages); // Revert on error
      alert('Failed to regenerate response. Please try again.');
      return;
    }
    
    setLoading(true);

    // Get settings from database
    const settingsRes = await fetch('/api/settings');
    const settings = await settingsRes.json();
    
    const streamSetting = settings.stream === 'true';
    const defaultPromptId = settings.defaultPromptId ? Number(settings.defaultPromptId) : undefined;
    const tempSetting = settings.temperature ? parseFloat(settings.temperature) : 0.7;
    
    setIsStreaming(streamSetting);
    
    // Generate new response using the API without userMessage (to avoid duplicating)
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        sessionId: Number(id), 
        stream: streamSetting, 
        userPromptId: defaultPromptId,
        temperature: tempSetting
        // Note: No userMessage here since we just want to generate response to existing messages
      })
    });

    if (streamSetting && res.body) {
      // Streaming response
      streamingMessageRef.current = '';
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        if (doneReading) {
          done = true;
          break;
        }
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split(/\r?\n/).filter(l => l.startsWith('data: '));
        
        for (const line of lines) {
          const payload = line.replace(/^data: /, '').trim();
          
          if (payload === '[DONE]') {
            done = true;
            break;
          }
          
          try {
            const parsed = JSON.parse(payload);
            const content = parsed.content || '';
            
            if (content) {
              streamingMessageRef.current += content;
              setMessages(prev => {
                const copy = [...prev];
                const lastMessage = copy[copy.length - 1];
                if (lastMessage && lastMessage.role === 'assistant') {
                  lastMessage.content = streamingMessageRef.current;
                }
                return copy;
              });
            }
          } catch (error) {
            console.error('Failed to parse response chunk:', error);
          }
        }
      }
    } else {
      // Non-streaming response
      try {
        const data = await res.json();
        if (data.choices && data.choices[0]?.message?.content) {
          const assistantMsg: ChatMessage = { 
            role: 'assistant', 
            content: data.choices[0].message.content 
          };
          setMessages(prev => [...prev, assistantMsg]);
        } else if (data.error) {
          console.error('API Error:', data.error);
          const errorMsg: ChatMessage = { 
            role: 'assistant', 
            content: `Error: ${data.error}` 
          };
          setMessages(prev => [...prev, errorMsg]);
        }
      } catch (error) {
        console.error('Failed to parse response:', error);
        const errorMsg: ChatMessage = { 
          role: 'assistant', 
          content: 'Error: Failed to get response from AI' 
        };
        setMessages(prev => [...prev, errorMsg]);
      }
    }
    
    setLoading(false);
    setIsStreaming(false);
    setJustFinishedStreaming(true);
    setSkipNextMessageUpdate(true);
    streamingMessageRef.current = '';
    
    // Final smooth scroll after streaming completes
    setTimeout(() => scrollToBottom(false), 100);
    
    // Reload database state
    setTimeout(async () => {
      skipNextScroll.current = true;
      await mutateWithVariantPreservation();
      setJustFinishedStreaming(false);
    }, 500);
  };

  // Continue the conversation - prompt AI to continue without user input
  const continueConversation = async () => {
    if (loading || isStreaming || !session) return;
    
    // Commit any displayed variants before continuing
    const assistantMessages = session.messages.filter(m => m.role === 'assistant');
    for (const msg of assistantMessages) {
      if (messageVariants.has(msg.id)) {
        await commitDisplayedVariant(msg.id);
      }
    }
    
    // Clean up variants for all assistant messages after committing
    for (const msg of assistantMessages) {
      if (messageVariants.has(msg.id)) {
        await cleanupVariants(msg.id);
      }
    }
    
    setLoading(true);

    // Get settings from database
    const settingsRes = await fetch('/api/settings');
    const settings = await settingsRes.json();
    
    const streamSetting = settings.stream === 'true';
    const defaultPromptId = settings.defaultPromptId ? Number(settings.defaultPromptId) : undefined;
    const tempSetting = settings.temperature ? parseFloat(settings.temperature) : 0.7;
    
    setIsStreaming(streamSetting);

    let abortController: AbortController | undefined;
    if (streamSetting) {
      abortController = new AbortController();
      streamingAbortController.current = abortController;
    }
    
    // Generate new response using a continue prompt
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        sessionId: Number(id), 
        userMessage: '[SYSTEM NOTE: Ignore this message, and continue on from the previous response]', // Special system prompt
        stream: streamSetting, 
        userPromptId: defaultPromptId,
        temperature: tempSetting
      }),
      ...(streamSetting && abortController ? { signal: abortController.signal } : {})
    });

    if (streamSetting && res.body) {
      // Streaming response - append to the last assistant message instead of creating a new one
      streamingMessageRef.current = '';
      
      // Capture the original content before streaming starts
      let originalContent = '';
      setMessages(prev => {
        const lastAssistantIndex = prev.findLastIndex(m => m.role === 'assistant');
        if (lastAssistantIndex !== -1) {
          const lastMessage = prev[lastAssistantIndex];
          if (lastMessage) {
            // Capture the original content
            originalContent = lastMessage.content;
            return prev;
          }
        }
        // Fallback: add new message if no previous assistant message found
        return [...prev, { role: 'assistant', content: '' }];
      });
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      
      try {
        while (!done) {
          const { value, done: doneReading } = await reader.read();
          if (doneReading) {
            done = true;
            break;
          }
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split(/\r?\n/).filter(l => l.startsWith('data: '));
          
          for (const line of lines) {
            const payload = line.replace(/^data: /, '').trim();
            
            if (payload === '[DONE]') {
              done = true;
              break;
            }
            
            try {
              const parsed = JSON.parse(payload);
              const content = parsed.content || '';
              
              if (content) {
                streamingMessageRef.current += content;
                setMessages(prev => {
                  const copy = [...prev];
                  const lastAssistantIndex = copy.findLastIndex(m => m.role === 'assistant');
                  if (lastAssistantIndex !== -1) {
                    const lastMessage = copy[lastAssistantIndex];
                    if (lastMessage) {
                      // Use the captured original content and append the streaming content
                      if (streamingMessageRef.current) {
                        lastMessage.content = originalContent + '\n\n' + streamingMessageRef.current;
                      } else {
                        lastMessage.content = originalContent;
                      }
                    }
                  }
                  return copy;
                });
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          // Continue conversation was stopped by user
          console.log('Continue conversation stopped by user');
          setLoading(false);
          setIsStreaming(false);
          setJustFinishedStreaming(true);
          streamingMessageRef.current = '';
          
          // Exit early, skip database refresh to preserve the partial content in UI
          return;
        } else {
          // Other error
          console.error('Continue conversation streaming error:', err);
          setLoading(false);
          setIsStreaming(false);
        }
      } finally {
        streamingAbortController.current = null;
      }
    } else {
      // Non-streaming response - append to the last assistant message
      try {
        const data = await res.json();
        if (data.choices && data.choices[0]?.message?.content) {
          const continuationContent = data.choices[0].message.content;
          setMessages(prev => {
            const lastAssistantIndex = prev.findLastIndex(m => m.role === 'assistant');
            if (lastAssistantIndex !== -1) {
              const lastMessage = prev[lastAssistantIndex];
              if (lastMessage) {
                const updatedMessages = [...prev];
                updatedMessages[lastAssistantIndex] = {
                  role: 'assistant',
                  content: lastMessage.content + '\n\n' + continuationContent
                };
                return updatedMessages;
              }
            }
            // Fallback: add new message if no previous assistant message found
            return [...prev, { role: 'assistant', content: continuationContent }];
          });
        } else if (data.error) {
          console.error('API Error:', data.error);
          const errorMsg: ChatMessage = { 
            role: 'assistant', 
            content: `Error: ${data.error}` 
          };
          setMessages(prev => [...prev, errorMsg]);
        }
      } catch (error) {
        console.error('Failed to parse response:', error);
        const errorMsg: ChatMessage = { 
          role: 'assistant', 
          content: 'Error: Failed to get response from AI' 
        };
        setMessages(prev => [...prev, errorMsg]);
      }
    }
    
    setLoading(false);
    setIsStreaming(false);
    setJustFinishedStreaming(true);
    setSkipNextMessageUpdate(true);
    streamingMessageRef.current = '';
    
    // Final smooth scroll after streaming completes (but not during edit mode)
    setTimeout(() => {
      if (editingMessageIndex === null) {
        scrollToBottom(false);
      }
    }, 100);
    
    // Reload database state
    setTimeout(async () => {
      skipNextScroll.current = true;
      await mutateWithVariantPreservation();
      setJustFinishedStreaming(false);
    }, 500);
  };

  // Delete message and all subsequent messages
  const deleteMessage = async (index: number) => {
    if (loading || isStreaming || !session) return;
    
    // Show custom delete confirmation modal
    setDeleteMessageIndex(index);
    setShowDeleteModal(true);
  };
  
  // Confirm and execute the message deletion
  const confirmDeleteMessage = async () => {
    if (deleteMessageIndex === null || loading || isStreaming || !session) return;
    
    const index = deleteMessageIndex;
    
    // Remove messages from the specified index onwards
    const updatedMessages = messages.slice(0, index);
    setMessages(updatedMessages);
    
    // Close modal and reset state
    setShowDeleteModal(false);
    setDeleteMessageIndex(null);
    
    // Update in database
    try {
      const response = await fetch(`/api/sessions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages })
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete messages');
      }
      
      // Refresh the session data to ensure consistency
      await mutateWithVariantPreservation();
    } catch (error) {
      console.error('Failed to delete messages:', error);
      // Revert the local change if API call failed
      setMessages(messages);
      
      alert('Failed to delete messages. Please try again.');
      return;
    }
  };
  
  // Cancel message deletion
  const cancelDeleteMessage = () => {
    setShowDeleteModal(false);
    setDeleteMessageIndex(null);
  };

  // Redo the last assistant response
  const redoLastResponse = async () => {
    if (loading || isStreaming || !session) return;
    
    // Find the last assistant message
    const lastAssistantIndex = messages.findLastIndex(m => m.role === 'assistant');
    if (lastAssistantIndex === -1) return;
    
    // Find the user message that prompted this assistant response
    const userMessageIndex = lastAssistantIndex - 1;
    if (userMessageIndex < 0) return;
    
    const userMessageObj = messages[userMessageIndex];
    if (!userMessageObj || userMessageObj.role !== 'user') return;
    
    const userMessage = userMessageObj.content;
    
    // Remove the last assistant message
    const messagesWithoutLastResponse = messages.slice(0, lastAssistantIndex);
    setMessages(messagesWithoutLastResponse);
    
    // Update database with the truncated messages
    try {
      const updateResponse = await fetch(`/api/sessions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messagesWithoutLastResponse })
      });
      
      if (!updateResponse.ok) {
        throw new Error('Failed to update messages');
      }
    } catch (error) {
      console.error('Failed to update messages:', error);
      setMessages(messages); // Revert on error
      alert('Failed to regenerate response. Please try again.');
      return;
    }
    
    setLoading(true);

    // Get settings from database
    const settingsRes = await fetch('/api/settings');
    const settings = await settingsRes.json();
    
    const streamSetting = settings.stream === 'true';
    const defaultPromptId = settings.defaultPromptId ? Number(settings.defaultPromptId) : undefined;
    const tempSetting = settings.temperature ? parseFloat(settings.temperature) : 0.7;
    
    setIsStreaming(streamSetting);
    
    let abortController: AbortController | undefined;
    if (streamSetting) {
      abortController = new AbortController();
      streamingAbortController.current = abortController;
    }

    // Generate new response
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        sessionId: Number(id), 
        userMessage: userMessage, 
        stream: streamSetting, 
        userPromptId: defaultPromptId,
        temperature: tempSetting
      }),
      ...(streamSetting && abortController ? { signal: abortController.signal } : {})
    });

    if (streamSetting && res.body) {
      // Streaming response
      streamingMessageRef.current = '';
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      
      try {
        while (!done) {
          const { value, done: doneReading } = await reader.read();
          if (doneReading) {
            done = true;
            break;
          }
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split(/\r?\n/).filter(l => l.startsWith('data: '));
          
          for (const line of lines) {
            const payload = line.replace(/^data: /, '').trim();
            
            if (payload === '[DONE]') {
              done = true;
              break;
            }
            
            try {
              const parsed = JSON.parse(payload);
              const content = parsed.content || '';
              
              if (content) {
                streamingMessageRef.current += content;
                setMessages(prev => {
                  const copy = [...prev];
                  const lastMessage = copy[copy.length - 1];
                  if (lastMessage && lastMessage.role === 'assistant') {
                    lastMessage.content = streamingMessageRef.current;
                  }
                  return copy;
                });
              }
            } catch (err: any) {
              if (err.name === 'AbortError') {
                // Streaming was stopped by user
                setLoading(false);
                setIsStreaming(false);
              } else {
                // Other error
                setLoading(false);
                setIsStreaming(false);
              }
            } finally {
              streamingAbortController.current = null;
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          // Streaming was stopped by user
          setLoading(false);
          setIsStreaming(false);
        } else {
          // Other error
          setLoading(false);
          setIsStreaming(false);
        }
      } finally {
        streamingAbortController.current = null;
      }
    } else {
      // Non-streaming response
      try {
        const data = await res.json();
        if (data.choices && data.choices[0]?.message?.content) {
          const assistantMsg: ChatMessage = { 
            role: 'assistant', 
            content: data.choices[0].message.content 
          };
          setMessages(prev => [...prev, assistantMsg]);
        } else if (data.error) {
          console.error('API Error:', data.error);
          const errorMsg: ChatMessage = { 
            role: 'assistant', 
            content: `Error: ${data.error}` 
          };
          setMessages(prev => [...prev, errorMsg]);
        }
      } catch (error) {
        console.error('Failed to parse response:', error);
        const errorMsg: ChatMessage = { 
          role: 'assistant', 
          content: 'Error: Failed to get response from AI' 
        };
        setMessages(prev => [...prev, errorMsg]);
      }
    }
    
    setLoading(false);
    setIsStreaming(false);
    setJustFinishedStreaming(true);
    streamingMessageRef.current = '';
    setTimeout(() => {
      if (editingMessageIndex === null) {
        scrollToBottom(false);
      }
    }, 100);
    if (streamSetting) {
      setTimeout(async () => {
        skipNextScroll.current = true;
        await mutate();
        setJustFinishedStreaming(false);
      }, 1000);
    } else {
      await mutate();
      setJustFinishedStreaming(false);
    }
  };

  // Helper function to preserve variants when refreshing session data
  const mutateWithVariantPreservation = async () => {
    // Preserve current variant state before refreshing session
    const preservedVariants = new Map(messageVariants);
    const preservedVariantDisplay = new Map(variantDisplayContent);
    const preservedCurrentVariant = new Map(currentVariantIndex);
    
    console.log('Preserving variants before mutate:', preservedVariants.size, 'display:', preservedVariantDisplay.size);
    
    // Refresh session data
    await mutate();
    
    // The session useEffect will run and load variants from server data
    // We need to merge server variants with our preserved local state
    
    // Use setTimeout to ensure state updates happen after session useEffect has run
    setTimeout(() => {
      console.log('Merging preserved variants with server data');
      
      // Restore display content for messages that have variants
      setVariantDisplayContent(prev => {
        const newMap = new Map(prev);
        
        // For each preserved display content, restore it if we still have variants for that message
        preservedVariantDisplay.forEach((content, messageId) => {
          if (preservedVariants.has(messageId)) {
            newMap.set(messageId, content);
          }
        });
        
        return newMap;
      });
      
      // Restore current variant indices
      setCurrentVariantIndex(prev => {
        const newMap = new Map(prev);
        
        // For each preserved variant index, restore it if we still have variants for that message
        preservedCurrentVariant.forEach((index, messageId) => {
          if (preservedVariants.has(messageId)) {
            newMap.set(messageId, index);
          }
        });
        
        return newMap;
      });
    }, 20); // Slightly longer delay to ensure session useEffect completes
  };



  const handleSend = async (retryMessage?: string) => {
    // If retryMessage is provided, use it; otherwise use input
    const messageContent = retryMessage || input.trim();
    
    if (!messageContent || !session) return;
    
    // Commit any displayed variants before sending
    await commitVariantsBeforeSend();
    
    const formattedInput = messageContent.replace(/\r?\n/g, '\n');
    
    // Only add the user message to the conversation if we're not retrying
    if (!retryMessage) {
      const userMsg: ChatMessage = { role: 'user', content: formattedInput };
      setMessages(prev => [...prev, userMsg]);
      setInput('');
      // Reset textarea height after clearing input
      if (textareaRef.current) {
        textareaRef.current.style.height = '60px';
      }
    }
    
    setLoading(true);
    const settingsRes = await fetch('/api/settings');
    const settings = await settingsRes.json();
    const streamSetting = settings.stream === 'true';
    const defaultPromptId = settings.defaultPromptId ? Number(settings.defaultPromptId) : undefined;
    const tempSetting = settings.temperature ? parseFloat(settings.temperature) : 0.7;
    setIsStreaming(streamSetting);

    let abortController: AbortController | undefined;
    if (streamSetting) {
      abortController = new AbortController();
      streamingAbortController.current = abortController;
    }

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        sessionId: Number(id), 
        userMessage: formattedInput, 
        stream: streamSetting, 
        userPromptId: defaultPromptId,
        temperature: tempSetting,
        retry: !!retryMessage // Pass retry flag when retrying
      }),
      ...(streamSetting && abortController ? { signal: abortController.signal } : {})
    });
    if (streamSetting && res.body) {
      // add empty assistant placeholder
      streamingMessageRef.current = '';
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      
      try {
        while (!done) {
          const { value, done: doneReading } = await reader.read();
          if (doneReading) {
            done = true;
            break;
          }
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split(/\r?\n/).filter(l => l.startsWith('data: '));
          
          for (const line of lines) {
            const payload = line.replace(/^data: /, '').trim();
            
            if (payload === '[DONE]') {
              done = true;
              break;
            }
            
            try {
              const parsed = JSON.parse(payload);
              const content = parsed.content || '';
              
              if (content) {
                streamingMessageRef.current += content;
                setMessages(prev => {
                  const copy = [...prev];
                  const lastMessage = copy[copy.length - 1];
                  if (lastMessage && lastMessage.role === 'assistant') {
                    lastMessage.content = streamingMessageRef.current;
                  }
                  return copy;
                });
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          // Streaming was stopped by user
          setLoading(false);
          setIsStreaming(false);
        } else {
          // Other error
          setLoading(false);
          setIsStreaming(false);
        }
      } finally {
        streamingAbortController.current = null;
      }
    } else {
      // non-stream: parse the response and add assistant message
      try {
        const data = await res.json();
        if (data.choices && data.choices[0]?.message?.content) {
          const assistantMsg: ChatMessage = { 
            role: 'assistant', 
            content: data.choices[0].message.content 
          };
          setMessages(prev => [...prev, assistantMsg]);
        } else if (data.error) {
          console.error('API Error:', data.error);
          // Show error message to user

          const errorMsg: ChatMessage = { 
            role: 'assistant', 
            content: `Error: ${data.error}` 
          };
          setMessages(prev => [...prev, errorMsg]);
        }
      } catch (error) {
        console.error('Failed to parse response:', error);
        const errorMsg: ChatMessage = { 
          role: 'assistant', 
          content: 'Error: Failed to get response from AI' 
        };
        setMessages(prev => [...prev, errorMsg]);
      }
    }
    setLoading(false);
    setIsStreaming(false);
    setJustFinishedStreaming(true);
    setSkipNextMessageUpdate(true);
    streamingMessageRef.current = '';
    
    // Final smooth scroll after streaming completes (but not during edit mode)
    setTimeout(() => {
      if (editingMessageIndex === null) {
        scrollToBottom(false);
      }
    }, 100);
    
    // For streaming: delay the database reload to avoid scroll stutter
    // For non-streaming: immediate reload
    // For retry: longer delay to avoid UI jump
    if (streamSetting) {
      setTimeout(async () => {
        skipNextScroll.current = true;
        await mutateWithVariantPreservation();
        setJustFinishedStreaming(false);
      }, retryMessage ? 1500 : 1000); // Longer delay for retry to let UI settle
    } else {
      // For non-streaming retry, also add a small delay
      if (retryMessage) {
        setTimeout(async () => {
          skipNextScroll.current = true;
          await mutateWithVariantPreservation();
          setJustFinishedStreaming(false);
        }, 500);
      } else {
        await mutateWithVariantPreservation();
        setJustFinishedStreaming(false);
      }
    }
  };
  // debug: download current messages to a text file
  const handleDownloadLog = () => {
    const text = messages.map(m => `${m.role}: ${m.content}`).join(`\n\n`);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-debug-${id || 'session'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
  // download the stored API request payload as JSON
  const handleDownloadRequest = async () => {
    if (!id) {
      console.error('No session ID available for request download');
      alert('No session ID available');
      return;
    }
    
    try {
      console.log(`Attempting to fetch request log for session ${id}`);
      const res = await fetch(`/api/chat/request-log/${id}`);
      
      if (!res.ok) {
        console.error(`Request failed with status ${res.status}`);
        const errorText = await res.text();
        console.error('Error response:', errorText);
        alert(`Failed to download request log: ${res.status} ${errorText}`);
        return;
      }
      
      const payload = await res.json();
      console.log('Request payload retrieved:', payload);
      
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-request-${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      console.log('Request log downloaded successfully');
    } catch (error) {
      console.error('Error downloading request log:', error);
      alert(`Error downloading request log: ${error}`);
    }
  };

  // Load notes for the current session
  const loadNotes = async () => {
    if (!id) return;
    
    try {
      const response = await fetch(`/api/sessions/${id}/notes`);
      if (response.ok) {
        const data = await response.json();
        const notes = data.notes || '';
        setNotesContent(notes);
        setOriginalNotesContent(notes);
      } else if (response.status !== 404) {
        // 404 is expected if no notes exist yet
        console.error('Failed to load notes:', response.status);
      }
    } catch (error) {
      console.error('Failed to load notes:', error);
    }
  };

  // Save notes for the current session
  const saveNotes = async () => {
    if (!id) return;
    
    setSavingNotes(true);
    try {
      const response = await fetch(`/api/sessions/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesContent })
      });
      
      if (!response.ok) {
        throw new Error('Failed to save notes');
      }
      
      // Update original content to current content after successful save
      // Don't close the modal - let user continue editing
      setOriginalNotesContent(notesContent);
    } catch (error) {
      console.error('Failed to save notes:', error);
      alert('Failed to save notes. Please try again.');
    } finally {
      setSavingNotes(false);
    }
  };

  // Cancel notes changes and revert to original content
  const cancelNotesChanges = () => {
    setNotesContent(originalNotesContent);
  };

  // Check if notes have been modified
  const hasNotesChanges = () => {
    return notesContent !== originalNotesContent;
  };

  // Smart scroll function that throttles during streaming
  const scrollToBottom = useCallback((immediate = false) => {
    if (!containerRef.current) return;
    
    // Don't auto-scroll when editing a message to prevent the textarea from jumping around
    if (editingMessageIndex !== null) return;
    
    const now = Date.now();
    const timeSinceLastScroll = now - lastScrollTime.current;
    
    // Clear any pending scroll timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }
    
    if (immediate || !isStreaming) {
      // Immediate scroll for non-streaming or explicit immediate requests
      containerRef.current.scrollTo({ 
        top: containerRef.current.scrollHeight, 
        behavior: immediate ? 'auto' : 'smooth' 
      });
      lastScrollTime.current = now;
    } else if (timeSinceLastScroll > 100) {
      // Throttle scrolling during streaming (max once per 100ms)
      containerRef.current.scrollTo({ 
        top: containerRef.current.scrollHeight, 
        behavior: 'auto' // Use auto during streaming to avoid stutter
      });
      lastScrollTime.current = now;
    } else {
      // Debounce - schedule a scroll for later
      scrollTimeoutRef.current = setTimeout(() => {
        if (containerRef.current) {
          containerRef.current.scrollTo({ 
            top: containerRef.current.scrollHeight, 
            behavior: 'auto' 
          });
          lastScrollTime.current = Date.now();
        }
        scrollTimeoutRef.current = null;
      }, 100 - timeSinceLastScroll);
    }
  }, [isStreaming, editingMessageIndex]);
  
  // scroll to bottom whenever messages change
  useEffect(() => {
    if (skipNextScroll.current) {
      skipNextScroll.current = false;
      return;
    }
    
    // Don't auto-scroll when editing a message to prevent the textarea from jumping around
    if (editingMessageIndex !== null) {
      return;
    }
    
    scrollToBottom();
  }, [messages, scrollToBottom, editingMessageIndex]);
  
  if (error) return (
    <div className="container text-center">
      <div className="card">
        <h2 className="text-error">Error loading session</h2>
        <p className="text-secondary">Please try again or go back to the home page.</p>
        <button className="btn btn-primary" onClick={() => router.push('/')}>
          Go Home
        </button>
      </div>
    </div>
  );
  
  if (!session) return (
    <div className="container text-center">
      <div className="card">
        <div className="status-indicator">
          <div className="status-dot status-loading"></div>
          Loading conversation...
        </div>
      </div>
    </div>
  );

  return (
    <div className="container-narrow chat-page">
      <Head>
        <title>{session.persona.name} chats with {session.character.name}</title>
        <meta name="description" content={`Chat conversation between ${session.persona.name} and ${session.character.name}`} />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      
      {/* Header */}
      <header className="chat-header" ref={headerRef}>
        <div className="chat-header-compact">
          {/* Burger Menu Button */}
          <button 
            className="btn btn-secondary burger-menu-btn" 
            onClick={() => setIsBurgerMenuOpen(prev => !prev)}
            aria-label="Toggle nav menu"
          >
            {isBurgerMenuOpen ? '✖️' : '☰'}
          </button>
          
          {/* Chat Title */}
          <div className="chat-title-section">
            <h1 className="chat-title mb-2">
              <span className="persona-name">{session.persona.name}</span>
              <span className="title-separator">&</span>
              <span className="character-name">{session.character.name}</span>
            </h1>
          </div>
          
          {/* Invisible spacer to balance the burger button */}
          <div className="burger-menu-spacer" aria-hidden="true"></div>
        </div>
        
        {/* Burger Menu Content */}
        {isBurgerMenuOpen && (
          <div className="burger-menu-content">
            <div className="burger-menu-section">
              <div className="burger-menu-label">Navigation</div>
              <div className="burger-menu-buttons">
                <button 
                  className="btn btn-secondary btn-menu-item" 
                  onClick={() => {
                    router.push('/chat');
                    setIsBurgerMenuOpen(false);
                  }}
                >
                  💬 Chats
                </button>
                
                <button 
                  className="btn btn-secondary btn-menu-item" 
                  onClick={() => {
                    router.push('/');
                    setIsBurgerMenuOpen(false);
                  }}
                >
                  🏠 Home
                </button>
              </div>
            </div>
            
            <div className="burger-menu-section">
              <div className="burger-menu-label">Actions</div>
              <div className="burger-menu-buttons">
                <button 
                  className="btn btn-secondary btn-menu-item" 
                  onClick={() => {
                    setShowNotesModal(true);
                    setOriginalNotesContent(notesContent);
                    setIsBurgerMenuOpen(false);
                  }}
                >
                  📝 Notes
                </button>
                
                <button 
                  className="btn btn-secondary btn-menu-item" 
                  onClick={() => {
                    setShowSummaryModal(true);
                    setIsBurgerMenuOpen(false);
                  }}
                >
                  📄 Summary
                </button>
              </div>
            </div>
            
            {devMode && (
              <div className="burger-menu-section">
                <div className="burger-menu-label">Debug</div>
                <div className="burger-menu-buttons">
                  <button 
                    className="btn btn-secondary btn-small btn-menu-item" 
                    onClick={() => {
                      handleDownloadLog();
                      setIsBurgerMenuOpen(false);
                    }}
                  >
                    📁 Log
                  </button>
                  <button 
                    className="btn btn-secondary btn-small btn-menu-item" 
                    onClick={() => {
                      handleDownloadRequest();
                      setIsBurgerMenuOpen(false);
                    }}
                  >
                    🔧 Request
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Chat Messages */}
      <div 
        className="chat-container-fullscreen" 
        style={{ top: `${headerHeight}px` }}
      >
        <div ref={containerRef} className="chat-messages">
          {messages.map((m, i) => {
            const isUser = m.role === 'user';
            const showSender = i === 0 || (messages[i - 1] && messages[i - 1]?.role !== m.role);
            const isEditing = editingMessageIndex === i;
            const messageId = m.messageId;
            const isLastAssistantMessage = !isUser && i === messages.length - 1;
            const hasVariants = messageId && messageVariants.has(messageId) && messageVariants.get(messageId)!.length > 0;
            const shouldShowVariants = hasVariants && isLastAssistantMessage; // Only show variants for the last assistant message
            const variants = messageId ? messageVariants.get(messageId) : undefined;
            const currentIndex = messageId ? currentVariantIndex.get(messageId) : undefined;
            // Use variant display content if it exists (including empty string for new variants)
            // Only fall back to m.content if no variant display content is set
            const displayContent = messageId && variantDisplayContent.has(messageId) 
              ? variantDisplayContent.get(messageId)! 
              : m.content;
            
            return (
              <div key={i} className={`chat-message ${isUser ? 'user' : 'assistant'} ${isEditing ? 'editing' : ''}`}>
                {showSender && (
                  <div className={`chat-sender ${isUser ? 'user' : 'assistant'}`}>
                    {isUser ? session.persona.name : session.character.name}
                  </div>
                )}
                
                {isEditing ? (
                  <div className="message-edit-container">
                    <textarea
                      ref={editTextareaRef}
                      className="form-textarea message-edit-input"
                      value={editingContent}
                      onChange={e => {
                        setEditingContent(e.target.value);
                        // Auto-resize with scroll position preservation
                        requestAnimationFrame(() => {
                          const container = containerRef.current;
                          if (container) {
                            const scrollTop = container.scrollTop;
                            autoResizeEditTextarea();
                            container.scrollTop = scrollTop;
                          }
                        });
                      }}
                      onFocus={(e) => {
                        // Prevent browser from scrolling to focus
                        e.preventDefault();
                        const container = containerRef.current;
                        if (container) {
                          const scrollTop = container.scrollTop;
                          // Restore scroll position after focus
                          requestAnimationFrame(() => {
                            container.scrollTop = scrollTop;
                          });
                        }
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && e.ctrlKey) {
                          e.preventDefault();
                          saveEditedMessage();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelEditingMessage();
                        }
                      }}
                    />
                    <div className="message-edit-actions">
                      <button 
                        className="btn btn-primary btn-small" 
                        onClick={saveEditedMessage}
                        title="Save changes (Ctrl+Enter)"
                      >
                        ✓ Save
                      </button>
                      <button 
                        className="btn btn-secondary btn-small" 
                        onClick={cancelEditingMessage}
                        title="Cancel editing (Esc)"
                      >
                        ✗ Cancel
                      </button>
                    </div>
                    <div className="text-xs text-muted mt-1">
                      Press Ctrl+Enter to save, Esc to cancel
                    </div>
                  </div>
                ) : (
                  <>
                    <div 
                      className="message-content" 
                      dangerouslySetInnerHTML={{ __html: formatMessage(
                        isUser && displayContent.includes(': ') ? 
                          displayContent.replace(new RegExp(`^${session.persona.name}: `), '') : 
                          displayContent
                      ) }} 
                    />
                    
                    {/* Edit, Delete, and Redo buttons - show for messages when not loading */}
                    {!loading && !isStreaming && (
                      <div className="chat-message-actions">
                        {/* Show delete button only for user messages */}
                        {isUser && (
                          <button 
                            className="btn btn-secondary btn-small delete-btn" 
                            onClick={() => deleteMessage(i)}
                            title="Delete this message and all subsequent messages"
                          >
                            🗑️
                          </button>
                        )}
                        {/* Show retry button only for the most recent user message if no assistant response follows */}
                        {isUser && i === messages.length - 1 && messages.length > 0 && (
                          <button 
                            className="btn btn-secondary btn-small retry-btn" 
                            onClick={() => handleSend(m.content)}
                            title="Retry sending this message to get an AI response"
                          >
                            🔄
                          </button>
                        )}
                        <button 
                          className="btn btn-secondary btn-small edit-btn" 
                          onClick={() => startEditingMessage(i)}
                          title="Edit this message"
                        >
                          ✏️
                        </button>
                        {/* Show redo button only for the most recent assistant message */}
                        {!isUser && i === messages.length - 1 && messages.length > 1 && messageId && (
                          <button 
                            className="btn btn-secondary btn-small redo-btn" 
                            onClick={() => generateVariant(messageId)}
                            disabled={generatingVariant === messageId}
                            title={generatingVariant === messageId ? "Generating variant..." : "Generate new variant"}
                          >
                            {generatingVariant === messageId ? '⏳' : '🔄'}
                          </button>
                        )}
                        {/* Show continue button only for the most recent assistant message */}
                        {!isUser && i === messages.length - 1 && (
                          <button 
                            className="btn btn-secondary btn-small continue-btn" 
                            onClick={continueConversation}
                            title="Continue the conversation"
                          >
                            ➡️
                          </button>
                        )}
                        
                        {/* Variant navigation for assistant messages with variants - inline with action buttons */}
                        {!isUser && messageId && shouldShowVariants && variants && variants.length > 0 && generatingVariant !== messageId && (
                          <>
                            <div className="variant-separator"></div>
                            <button 
                              className="btn btn-secondary btn-small" 
                              onClick={() => navigateVariant(messageId, 'prev')}
                              title="Previous variant"
                            >
                              ←
                            </button>
                            <span className="variant-counter">
                              {(() => {
                                // Enhanced state validation for variant counter
                                const safeCurrentIndex = currentIndex || 0;
                                const safeVariantsLength = variants?.length || 0;
                                const totalCount = safeVariantsLength + 1;
                                
                                // Don't show counter if we're currently generating variants for this message
                                if (generatingVariant === messageId) {
                                  return '...';
                                }
                                
                                // Multiple validation checks with progressive fallbacks
                                if (safeCurrentIndex < 0) {
                                  setCurrentVariantIndex(prev => {
                                    const newMap = new Map(prev);
                                    newMap.set(messageId, 0);
                                    return newMap;
                                  });
                                  return '1 / ' + totalCount;
                                }
                                
                                if (safeCurrentIndex > safeVariantsLength) {
                                  setCurrentVariantIndex(prev => {
                                    const newMap = new Map(prev);
                                    newMap.set(messageId, safeVariantsLength);
                                    return newMap;
                                  });
                                  return `${safeVariantsLength + 1} / ${totalCount}`;
                                }
                                
                                // State is consistent, show normal counter
                                const displayIndex = safeCurrentIndex + 1;
                                return `${displayIndex} / ${totalCount}`;
                              })()} 
                            </span>
                            <button 
                              className="btn btn-secondary btn-small" 
                              onClick={() => navigateVariant(messageId, 'next')}
                              title="Next variant"
                            >
                              →
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
        {/* Chat Input */}
        <div className="chat-input-container">
          <div className="flex gap-3">
            <textarea
              ref={textareaRef}
              className="form-textarea chat-input flex-1"
              value={input}
              onChange={e => {
                setInput(e.target.value);
                // Auto-resize on next frame to ensure the value is updated
                requestAnimationFrame(() => autoResizeTextarea());
              }}
              placeholder="Type your message..."
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={loading}
            />
            {isStreaming || generatingVariant !== null ? (
              <button 
                className="btn btn-danger chat-send-button" 
                onClick={stopStreaming}
                title={
                  generatingVariant !== null 
                    ? "Stop variant generation" 
                    : loading 
                      ? "Stop message continuation" 
                      : "Stop streaming"
                }
              >
                🟥
              </button>
            ) : (
              <button 
                className="btn btn-primary chat-send-button" 
                onClick={() => handleSend()} 
                disabled={loading || !input.trim()}
              >
                {loading ? '⏳' : '📤'}
              </button>
            )}
          </div>
          
          <div className="text-xs text-muted mt-2">
                       Press Enter to send, Shift+Enter for new line
          </div>
        </div>
      </div>

      {/* Summary Modal */}
      {showSummaryModal ? (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">Chat Summary</h2>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Summary Content</label>
                <textarea
                  className="form-textarea"
                  value={summaryContent}
                  onChange={(e) => setSummaryContent(e.target.value)}
                  placeholder="Enter a summary of this chat session..."
                  rows={8}
                  style={{ minHeight: '200px' }}
                />
              </div>
            </div>
            
            <div className="modal-footer">
              <div className="flex gap-3 flex-wrap mb-3">
                <button
                  className="btn btn-secondary"
                  onClick={generateSummary}
                  disabled={generatingSummary}
                  title={generatingSummary ? "Generating summary..." : "Generate AI summary of the conversation"}
                >
                  {generatingSummary ? '⏳ Generating...' : '🤖 Generate Summary'}
                </button>
                <button
                  className={`btn btn-secondary ${!canUpdateSummary() ? 'btn-disabled-muted' : ''}`}
                  onClick={updateSummary}
                  disabled={updatingSummary || !canUpdateSummary()}
                  title={
                    !session?.summary
                      ? "Generate a summary first before updating"
                      : !session?.lastSummary 
                        ? "No summary update point set. Use 'Generate Summary' first."
                        : !canUpdateSummary() 
                          ? "No new messages to update summary with" 
                          : updatingSummary 
                            ? "Updating summary..." 
                            : "Update summary with new messages since last update"
                  }
                >
                  {updatingSummary ? '⏳ Updating...' : '🔄 Update Summary'}
                </button>
              </div>
              
              <div className="flex gap-3 flex-wrap">
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowSummaryModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={saveSummary}
                  disabled={savingSummary}
                >
                  {savingSummary ? 'Saving...' : 'Save Summary'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Notes Modal - Overlay version for narrow screens */}
      {showNotesModal && !isWideScreen ? (
        <div className="modal-overlay notes-modal-overlay">
          <div className={`modal-content notes-modal`}>
            <div className="modal-header">
              <h2 className="modal-title">Chat Notes</h2>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Personal Notes</label>
                <textarea
                  className="form-textarea"
                  value={notesContent}
                  onChange={(e) => setNotesContent(e.target.value)}
                  placeholder="Write your personal notes here... These are private and never sent to the AI."
                  rows={12}
                  style={{ minHeight: '300px' }}
                />
                <div className="text-xs text-muted mt-1">
                  💡 Use this space to keep track of important details, ideas, or context as you chat.
                </div>
              </div>
            </div>
            
            <div className="modal-footer">
              <div className="flex gap-3 flex-wrap mb-3">
                {hasNotesChanges() ? (
                  <>
                    <button
                      className="btn btn-secondary"
                      onClick={cancelNotesChanges}
                    >
                      Cancel Changes
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={saveNotes}
                      disabled={savingNotes}
                    >
                      {savingNotes ? 'Saving...' : 'Save Changes'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn btn-primary"
                      onClick={() => setShowNotesModal(false)}
                    >
                      Close
                    </button>
                    <button
                      className="btn btn-secondary btn-disabled-muted"
                      disabled
                    >
                      No Changes
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Notes Modal - Sidecar version for wide screens */}
      {showNotesModal && isWideScreen ? (
        <div className="notes-modal-sidecar">
          <div className="modal-header">
            <h2 className="modal-title">Chat Notes</h2>
          </div>
          
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Personal Notes</label>
              <textarea
                className="form-textarea"
                value={notesContent}
                onChange={(e) => setNotesContent(e.target.value)}
                placeholder="Write your personal notes here... These are private and never sent to the AI."
              />
              <div className="text-xs text-muted mt-1">
                💡 Use this space to keep track of important details, ideas, or context as you chat.
              </div>
            </div>
          </div>
          
          <div className="modal-footer">
            <div className="flex gap-3 flex-wrap mb-3">
              {hasNotesChanges() ? (
                <>
                  <button
                    className="btn btn-secondary"
                    onClick={cancelNotesChanges}
                  >
                    Cancel Changes
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={saveNotes}
                    disabled={savingNotes}
                  >
                    {savingNotes ? 'Saving...' : 'Save Changes'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn btn-primary"
                    onClick={() => setShowNotesModal(false)}
                  >
                    Close
                  </button>
                  <button
                    className="btn btn-secondary btn-disabled-muted"
                    disabled
                  >
                    No Changes
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deleteMessageIndex !== null ? (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2 className="modal-title">🗑️ Delete Message</h2>
            </div>
            
            <div className="modal-body">
              {(() => {
                const messageCount = messages.length - deleteMessageIndex;
                return (
                  <div className="text-center">
                    <p className="mb-4">
                      {messageCount === 1 
                        ? 'Are you sure you want to delete this message?' 
                        : `Are you sure you want to delete this message and ${messageCount - 1} subsequent message(s)?`
                      }
                    </p>
                    <div className="text-sm text-muted mb-4">
                      <strong>⚠️ This action cannot be undone.</strong>
                    </div>
                    {messageCount > 1 && (
                      <div className="warning-box">
                        💡 Deleting this message will also remove all messages that come after it in the conversation.
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            
            <div className="modal-footer">
              <div className="flex gap-3 justify-center">
                <button
                  className="btn btn-secondary"
                  onClick={cancelDeleteMessage}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-danger"
                  onClick={confirmDeleteMessage}
                >
                  Delete {messages.length - deleteMessageIndex === 1 ? 'Message' : 'Messages'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}