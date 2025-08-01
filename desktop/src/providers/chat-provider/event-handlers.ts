// Event handler types
type DataEventHandler = (eventData: any) => void;

const handleToolCallEvent: DataEventHandler = (eventData) => {
  console.log('[ChatProvider] Tool call event:', eventData);
  // Tool events are now handled through the data- prefix
  // The UI components will process these through the message parts
};

// Event handler registry
const EVENT_HANDLERS: Record<string, DataEventHandler> = {
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
