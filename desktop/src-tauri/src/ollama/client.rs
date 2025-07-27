use crate::ollama::consts::OLLAMA_SERVER_PORT;
use futures_util::stream::{Stream, StreamExt};
use ollama_rs::generation::{
    chat::{request::ChatMessageRequest, ChatMessageResponse},
    completion::request::GenerationRequest,
};
use ollama_rs::Ollama;

#[derive(Clone)]
pub struct OllamaClient {
    pub client: Ollama,
}

impl Default for OllamaClient {
    fn default() -> Self {
        Self::new()
    }
}

impl OllamaClient {
    pub fn new() -> Self {
        Self {
            client: Ollama::new("http://127.0.0.1", OLLAMA_SERVER_PORT),
        }
    }

    pub async fn generate_title(
        &self,
        model: &str,
        full_chat_context: String,
    ) -> Result<String, String> {
        let prompt = format!(
            "Based on this conversation, generate a brief 5-6 word title that captures the main topic. Return only the title, no quotes or extra text:\n\n{full_chat_context}"
        );

        println!("Prompt: {prompt}");

        // For now, just use the basic GenerationRequest without options
        let mut request = GenerationRequest::new(model.to_string(), prompt);
        request = request.system("You are a title generator. Based on the provided conversation, generate a brief 5-6 word title that captures the main topic. Return ONLY the title with no additional text, quotes, thinking blocks, or explanations").think(false);

        match self.client.generate(request).await {
            Ok(response) => {
                println!("Response: {}", response.response);
                Ok(response.response.trim().to_string())
            }
            Err(e) => Err(format!("Failed to generate title: {e}")),
        }
    }

    pub async fn chat_stream(
        &self,
        request: ChatMessageRequest,
    ) -> Result<impl Stream<Item = Result<ChatMessageResponse, String>>, String> {
        match self.client.send_chat_messages_stream(request).await {
            Ok(stream) => Ok(futures_util::stream::unfold(stream, |mut s| async move {
                match s.next().await {
                    Some(Ok(response)) => Some((Ok(response), s)),
                    Some(Err(_)) => Some((Err("Stream error".to_string()), s)),
                    None => None,
                }
            })),
            Err(e) => Err(format!("Failed to start chat stream: {e}")),
        }
    }
}
