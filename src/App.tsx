import React from 'react';
import { TestChat } from './TestChat';

export function App() {
  const [serverPort, setServerPort] = React.useState(0);
  
  React.useEffect(() => {
    window.electronAPI.getServerPort().then(setServerPort);
  }, []);

  if (!serverPort) return <div>Loading...</div>;

  return <TestChat serverPort={serverPort} />;
}