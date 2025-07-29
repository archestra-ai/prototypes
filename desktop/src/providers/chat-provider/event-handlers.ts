import { useAgentStore } from '@/stores/agent-store';

// Event handler types
type DataEventHandler = (eventData: any) => void;

// Individual event handlers
const handleAgentStateUpdate: DataEventHandler = (eventData) => {
  console.log('[ChatProvider] Agent state update:', eventData);
  const store = useAgentStore.getState();

  if (eventData.mode) {
    // Map backend modes to frontend AgentMode
    switch (eventData.mode) {
      case 'planning':
        store.setAgentMode('planning');
        break;
      case 'executing':
        store.setAgentMode('executing');
        break;
      case 'completed':
        store.setAgentMode('completed');
        // After a short delay, transition back to idle
        setTimeout(() => {
          store.stopAgent();
        }, 2000);
        break;
      default:
        store.setAgentMode('initializing');
    }
  }

  // Update objective if provided
  if (eventData.objective) {
    useAgentStore.setState({
      currentObjective: eventData.objective,
      isAgentActive: true,
    });
  }
};

const handleReasoningUpdate: DataEventHandler = (eventData) => {
  console.log('[ChatProvider] Reasoning update:', eventData);
  const { addReasoningEntry } = useAgentStore.getState();

  if (eventData.content) {
    addReasoningEntry({
      id: Date.now().toString(),
      type: eventData.type || 'planning',
      content: eventData.content,
      confidence: 0.8, // Default confidence
      timestamp: new Date(),
    });
  }
};

const handleTaskProgressUpdate: DataEventHandler = (eventData) => {
  if (eventData?.progress) {
    console.log('[ChatProvider] Task progress update:', eventData.progress);
    const { updateProgress } = useAgentStore.getState();
    updateProgress(eventData.progress);
  }
};

const handleToolCallEvent: DataEventHandler = (eventData) => {
  console.log('[ChatProvider] Tool call event:', eventData);
  // Tool events are now handled through the data- prefix
  // The UI components will process these through the message parts
};

// Event handler registry
const EVENT_HANDLERS: Record<string, DataEventHandler> = {
  'agent-state': handleAgentStateUpdate,
  reasoning: handleReasoningUpdate,
  'task-progress': handleTaskProgressUpdate,
  'tool-call': handleToolCallEvent,
};

export function handleDataEvent(data: any) {
  // Handle custom data events with data- prefix
  if (data.type && data.type.startsWith('data-')) {
    const dataType = data.type.substring(5); // Remove 'data-' prefix
    const handler = EVENT_HANDLERS[dataType];

    if (handler) {
      handler(data.data);
    } else {
      console.warn(`[ChatProvider] Unknown data event type: ${dataType}`);
    }
  }
}
