import { Bot, CheckCircle } from "lucide-react";

import { Badge } from "../../../../components/ui/badge";
import { Alert, AlertDescription } from "../../../../components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card";

export default function OllamaServer() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Ollama Local AI
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <CheckCircle className="h-3 w-3 mr-1" />
            Running
          </Badge>
          <span className="text-sm text-muted-foreground">
            Ollama server starts automatically with the application
          </span>
        </div>

        <Alert className="bg-blue-500/10 border-blue-500/20">
          <AlertDescription className="text-sm">
            Local AI models are now available for chat. The Ollama server runs in the background and manages itself automatically.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
