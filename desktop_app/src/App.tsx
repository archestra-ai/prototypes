import React from 'react';
import { TestChat } from './TestChat';
import { Button } from '../components/ui/button';

export function App() {
  const [serverPort, setServerPort] = React.useState(0);
  
  React.useEffect(() => {
    window.electronAPI.getServerPort().then(setServerPort);
  }, []);

  if (!serverPort) return <div>Loading...</div>;

  return (
    <div className="flex min-h-svh flex-col items-center justify-center">
      <Button>Click me</Button>
    </div>
  );
}